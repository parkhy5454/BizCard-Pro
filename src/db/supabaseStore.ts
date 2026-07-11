import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  BusinessCard,
  ContactGroup,
  Project,
  MyProfile,
  Vehicle,
  DrivingLog,
  VehicleExpense,
  VehicleMaintenance,
  MaintenanceInterval,
  DailyWorkLog,
  WeeklyWorkLog,
  RegisteredUser
} from '../types.js';

// 서버(신뢰된 백엔드)에서만 사용하는 클라이언트이므로 Service Role Key를 사용합니다.
// 절대 프론트엔드 번들에 노출되면 안 됩니다 (server.ts에서만 import).
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '[supabaseStore] SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다. ' +
    '.env 파일을 확인해 주세요. (.env.example 참고)'
  );
}

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY || ''
);

// ------------------------------------------------------------------
// 데이터 모델: Firestore의 scopes/{scopeId}/{collection}/{docId} 구조를
// Postgres의 scoped_items(scope_id, collection, doc_id, data jsonb) 테이블로
// 그대로 옮겨서, 기존 firebaseStore.ts와 동일한 함수 시그니처를 제공합니다.
// (supabase-schema.sql 참고)
// ------------------------------------------------------------------

function must<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

// Firestore users 컬렉션 시딩 여부 확인 후 없으면 시딩
export async function ensureUsersSeeded(initialUsers: RegisteredUser[]) {
  try {
    const { count, error: countError } = await supabase
      .from('app_users')
      .select('id', { count: 'exact', head: true });
    if (countError) throw countError;

    if (!count) {
      console.log('Seeding initial users to Supabase...');
      const rows = initialUsers.map(u => ({ id: u.id, data: u }));
      const { error } = await supabase.from('app_users').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    }
  } catch (error) {
    console.error('Error seeding users:', error);
  }
}

// 스코프가 초기화되어 있는지 확인 후, 없으면 초기 데이터를 시딩
export async function ensureScopeInitialized(scopeId: string, initialData: {
  contacts: BusinessCard[];
  projects: Project[];
  groups: ContactGroup[];
  myProfile: MyProfile;
  vehicles: Vehicle[];
  drivingLogs: DrivingLog[];
  expenses: VehicleExpense[];
  maintenances: VehicleMaintenance[];
  maintenanceIntervals: MaintenanceInterval[];
  dailyLogs: DailyWorkLog[];
  weeklyLogs: WeeklyWorkLog[];
}) {
  try {
    const { data: metaRow, error: metaError } = await supabase
      .from('scopes')
      .select('scope_id')
      .eq('scope_id', scopeId)
      .maybeSingle();
    if (metaError) throw metaError;

    if (!metaRow) {
      // 이중 안전장치: '초기화 완료' 표시가 없어도, 이 스코프에 실제 데이터가
      // 이미 하나라도 있으면 시딩을 건너뜁니다 (과거 버그로 표시가 누락된 경우
      // 재시딩이 실제 사용자 데이터를 덮어쓰는 것을 방지).
      const { count: existingCount, error: existingError } = await supabase
        .from('scoped_items')
        .select('doc_id', { count: 'exact', head: true })
        .eq('scope_id', scopeId);
      if (existingError) throw existingError;

      if (existingCount && existingCount > 0) {
        console.log(`Scope ${scopeId} already has data but no 'initialized' marker — backfilling marker without reseeding.`);
        await supabase.from('scopes').insert({ scope_id: scopeId, initialized: true });
        return;
      }

      console.log(`Seeding initial data for scope: ${scopeId}`);
      const { error: insertMetaError } = await supabase
        .from('scopes')
        .insert({ scope_id: scopeId, initialized: true });
      if (insertMetaError) throw insertMetaError;

      const bulk: { scope_id: string; collection: string; doc_id: string; data: any }[] = [];
      initialData.contacts.forEach(item => bulk.push({ scope_id: scopeId, collection: 'contacts', doc_id: item.id, data: item }));
      initialData.projects.forEach(item => bulk.push({ scope_id: scopeId, collection: 'projects', doc_id: item.id, data: item }));
      initialData.groups.forEach(item => bulk.push({ scope_id: scopeId, collection: 'groups', doc_id: item.id, data: item }));
      bulk.push({ scope_id: scopeId, collection: 'myProfile', doc_id: 'profile', data: initialData.myProfile });
      initialData.vehicles.forEach(item => bulk.push({ scope_id: scopeId, collection: 'vehicles', doc_id: item.id, data: item }));
      initialData.drivingLogs.forEach(item => bulk.push({ scope_id: scopeId, collection: 'drivingLogs', doc_id: item.id, data: item }));
      initialData.expenses.forEach(item => bulk.push({ scope_id: scopeId, collection: 'expenses', doc_id: item.id, data: item }));
      initialData.maintenances.forEach(item => bulk.push({ scope_id: scopeId, collection: 'maintenances', doc_id: item.id, data: item }));
      initialData.maintenanceIntervals.forEach(item => bulk.push({ scope_id: scopeId, collection: 'maintenanceIntervals', doc_id: item.id, data: item }));
      initialData.dailyLogs.forEach(item => bulk.push({ scope_id: scopeId, collection: 'dailyLogs', doc_id: item.id, data: item }));
      initialData.weeklyLogs.forEach(item => bulk.push({ scope_id: scopeId, collection: 'weeklyLogs', doc_id: item.id, data: item }));

      if (bulk.length) {
        const { error: bulkError } = await supabase
          .from('scoped_items')
          .upsert(bulk, { onConflict: 'scope_id,collection,doc_id', ignoreDuplicates: true });
        if (bulkError) throw bulkError;
      }
    }
  } catch (error) {
    console.error(`Error ensuring scope ${scopeId} is initialized:`, error);
  }
}

// 특정 스코프의 컬렉션 전체 조회
export async function getScopedCollection<T>(scopeId: string, collectionName: string): Promise<T[]> {
  const { data, error } = await supabase
    .from('scoped_items')
    .select('data')
    .eq('scope_id', scopeId)
    .eq('collection', collectionName);
  if (error) {
    console.error(`getScopedCollection(${scopeId}, ${collectionName}) error:`, error);
    return [];
  }
  return (data || []).map(row => row.data as T);
}

export async function getScopedDoc<T>(scopeId: string, collectionName: string, docId: string): Promise<T | null> {
  const { data, error } = await supabase
    .from('scoped_items')
    .select('data')
    .eq('scope_id', scopeId)
    .eq('collection', collectionName)
    .eq('doc_id', docId)
    .maybeSingle();
  if (error) {
    console.error(`getScopedDoc(${scopeId}, ${collectionName}, ${docId}) error:`, error);
    return null;
  }
  return data ? (data.data as T) : null;
}

// 단일 문서 생성/전체 덮어쓰기 (Firestore setDoc과 동일하게 upsert)
export async function setScopedDoc<T extends { id: string }>(scopeId: string, collectionName: string, item: T): Promise<void> {
  const { error } = await supabase
    .from('scoped_items')
    .upsert(
      { scope_id: scopeId, collection: collectionName, doc_id: item.id, data: item, updated_at: new Date().toISOString() },
      { onConflict: 'scope_id,collection,doc_id' }
    );
  if (error) console.error(`setScopedDoc(${scopeId}, ${collectionName}, ${item.id}) error:`, error);
}

// 여러 문서를 한 번에 upsert (대량 가져오기 등에서 사용)
export async function setScopedDocs<T extends { id: string }>(scopeId: string, collectionName: string, items: T[]): Promise<void> {
  if (!items.length) return;
  const rows = items.map(item => ({
    scope_id: scopeId,
    collection: collectionName,
    doc_id: item.id,
    data: item,
    updated_at: new Date().toISOString()
  }));
  const { error } = await supabase.from('scoped_items').upsert(rows, { onConflict: 'scope_id,collection,doc_id' });
  if (error) console.error(`setScopedDocs(${scopeId}, ${collectionName}) error:`, error);
}

export async function setScopedProfile(scopeId: string, profile: MyProfile): Promise<void> {
  const { error } = await supabase
    .from('scoped_items')
    .upsert(
      { scope_id: scopeId, collection: 'myProfile', doc_id: 'profile', data: profile, updated_at: new Date().toISOString() },
      { onConflict: 'scope_id,collection,doc_id' }
    );
  if (error) console.error(`setScopedProfile(${scopeId}) error:`, error);
}

export async function updateScopedDoc<T>(scopeId: string, collectionName: string, docId: string, updates: Partial<T>): Promise<void> {
  // Postgres jsonb 부분 병합: 기존 데이터를 읽어 merge 후 다시 저장 (Firestore updateDoc과 동일한 동작)
  const existing = await getScopedDoc<any>(scopeId, collectionName, docId);
  const merged = { ...(existing || {}), ...updates, id: docId };
  const { error } = await supabase
    .from('scoped_items')
    .upsert(
      { scope_id: scopeId, collection: collectionName, doc_id: docId, data: merged, updated_at: new Date().toISOString() },
      { onConflict: 'scope_id,collection,doc_id' }
    );
  if (error) console.error(`updateScopedDoc(${scopeId}, ${collectionName}, ${docId}) error:`, error);
}

export async function deleteScopedDoc(scopeId: string, collectionName: string, docId: string): Promise<void> {
  const { error } = await supabase
    .from('scoped_items')
    .delete()
    .eq('scope_id', scopeId)
    .eq('collection', collectionName)
    .eq('doc_id', docId);
  if (error) console.error(`deleteScopedDoc(${scopeId}, ${collectionName}, ${docId}) error:`, error);
}

// 컬렉션 전체를 통째로 교체 (필터/일괄재계산 후 한 번에 반영할 때 사용: 예) 업무일지-차량비용 동기화)
export async function replaceScopedCollection<T extends { id: string }>(scopeId: string, collectionName: string, items: T[]): Promise<void> {
  const { error: deleteError } = await supabase
    .from('scoped_items')
    .delete()
    .eq('scope_id', scopeId)
    .eq('collection', collectionName);
  if (deleteError) {
    console.error(`replaceScopedCollection delete(${scopeId}, ${collectionName}) error:`, deleteError);
    return;
  }
  if (items.length) {
    const rows = items.map(item => ({
      scope_id: scopeId,
      collection: collectionName,
      doc_id: item.id,
      data: item,
      updated_at: new Date().toISOString()
    }));
    const { error: insertError } = await supabase.from('scoped_items').insert(rows);
    if (insertError) console.error(`replaceScopedCollection insert(${scopeId}, ${collectionName}) error:`, insertError);
  }
}

// ------------------------------------------------------------------
// 사용자(로그인 계정) 관리 — 별도 app_users 테이블 사용
// ------------------------------------------------------------------
export async function getUsers(): Promise<RegisteredUser[]> {
  const { data, error } = await supabase.from('app_users').select('data');
  if (error) {
    console.error('getUsers error:', error);
    return [];
  }
  return (data || []).map(row => row.data as RegisteredUser);
}

export async function addUser(user: RegisteredUser): Promise<void> {
  const { error } = await supabase
    .from('app_users')
    .upsert({ id: user.id, data: user }, { onConflict: 'id' });
  if (error) console.error(`addUser(${user.id}) error:`, error);
}
