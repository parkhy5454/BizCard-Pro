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
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '[supabaseStore] SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다. ' +
    '.env 파일을 확인해 주세요. (.env.example 참고)'
  );
}

export const supabase: SupabaseClient = createClient(
  SUPABASE_URL || 'http://127.0.0.1:54321',
  SUPABASE_SERVICE_ROLE_KEY || 'local-development-placeholder-key'
);

// [수정] 명함 사진 등을 DB(jsonb)에 base64 텍스트로 통째로 저장하지 않고,
// Supabase Storage(파일 저장 공간)에 실제 파일로 올린 뒤 그 주소(URL)만 DB에 저장하기 위한 함수.
// 사용자/명함 수가 늘어나도 DB 조회 속도가 느려지지 않도록 하기 위함.
// (사전 준비: Supabase 대시보드 → Storage에서 "card-images"라는 이름의 Public 버킷을 만들어둬야 함)
const CARD_IMAGES_BUCKET = 'card-images';

// [수정] 관리자 대시보드용: scoped_items 테이블 전체를 스코프(회사/개인)별로 집계해서
// "어느 회사가 무엇을 얼마나 등록했는지, 마지막 활동이 언제였는지"를 한 번에 계산한다.
// (테이블이 아주 커지기 전까지는, 필요한 컬럼만 가져와서 서버 메모리에서 집계하는 방식이 가장 간단하다)
export interface PlatformScopeStats {
  scopeId: string;
  itemCounts: Record<string, number>; // collection(예: contacts, projects, vehicles...) -> 개수
  totalItems: number;
  lastActivity: string | null; // 이 스코프에서 가장 최근에 저장/수정된 시각(ISO)
}

export async function getPlatformStats(): Promise<PlatformScopeStats[]> {
  if (!isSupabaseConfigured) return [];
  try {
    const { data, error } = await supabase
      .from('scoped_items')
      .select('scope_id, collection, updated_at');
    if (error) {
      console.error('getPlatformStats 조회 실패:', error);
      return [];
    }
    const byScope = new Map<string, PlatformScopeStats>();
    for (const row of (data || []) as any[]) {
      const scopeId = row.scope_id as string;
      if (!scopeId) continue;
      if (!byScope.has(scopeId)) {
        byScope.set(scopeId, { scopeId, itemCounts: {}, totalItems: 0, lastActivity: null });
      }
      const entry = byScope.get(scopeId)!;
      entry.itemCounts[row.collection] = (entry.itemCounts[row.collection] || 0) + 1;
      entry.totalItems += 1;
      if (row.updated_at && (!entry.lastActivity || row.updated_at > entry.lastActivity)) {
        entry.lastActivity = row.updated_at;
      }
    }
    return Array.from(byScope.values());
  } catch (err) {
    console.error('getPlatformStats 예외:', err);
    return [];
  }
}

export async function uploadDataUrlImage(
  scopeId: string,
  dataUrl: string,
  keyHint: string,
  category: 'cards' | 'receipts' | 'signatures' = 'cards'
): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const match = dataUrl.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
  if (!match) return null;
  const [, mime, base64Data] = match;
  const extFromMime = mime.split('/')[1] || 'jpg';
  const ext = extFromMime === 'jpeg' ? 'jpg' : extFromMime;
  const safeScopeId = scopeId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeKeyHint = keyHint.replace(/[^a-zA-Z0-9_-]/g, '_');
  // [수정] 같은 버킷 안에서 명함 사진(cards)과 영수증 사진(receipts)을 폴더로 분리해서 저장
  const filePath = `${category}/${safeScopeId}/${safeKeyHint}-${Date.now()}.${ext}`;

  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const { error } = await supabase.storage
      .from(CARD_IMAGES_BUCKET)
      .upload(filePath, buffer, { contentType: mime, upsert: true });
    if (error) {
      console.error(`uploadDataUrlImage(${filePath}) error:`, error);
      return null;
    }
    // [수정] Storage 버킷을 비공개(Private)로 바꾸면서, 공개 URL(getPublicUrl) 대신
    // "서명된 URL"(createSignedUrl)을 발급받는 방식으로 변경했다. 유효기간을 10년으로 아주 길게
    // 줘서, 기존처럼 이 URL 하나만 DB에 저장해두고 화면에서 그대로 계속 써도 되게 했다
    // (다른 화면 코드는 하나도 안 건드려도 됨). 대신 버킷 자체는 비공개라, 목록 열람이나
    // URL 패턴 추측으로는 더 이상 접근할 수 없다.
    const TEN_YEARS_IN_SECONDS = 60 * 60 * 24 * 365 * 10;
    const { data, error: signError } = await supabase.storage
      .from(CARD_IMAGES_BUCKET)
      .createSignedUrl(filePath, TEN_YEARS_IN_SECONDS);
    if (signError) {
      console.error(`uploadDataUrlImage(${filePath}) 서명 URL 발급 실패:`, signError);
      return null;
    }
    return data?.signedUrl || null;
  } catch (err) {
    console.error(`uploadDataUrlImage(${filePath}) exception:`, err);
    return null;
  }
}

// [추가] uploadDataUrlImage는 image/* 만 처리한다. 미팅 첨부파일(제안서/견적서 등)은
// PDF·PPT·엑셀·한글(hwp) 등 형식이 다양해서, 이걸 위한 범용 버전을 따로 둔다.
// 원본 파일명이 있으면 그 확장자를 그대로 쓰고(더 정확함), 없으면 MIME 타입에서 유추한다.
export async function uploadDataUrlFile(
  scopeId: string,
  dataUrl: string,
  keyHint: string,
  category: 'cards' | 'receipts' | 'attachments' = 'attachments',
  originalFileName?: string
): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  const match = dataUrl.match(/^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/);
  if (!match) return null;
  const [, mime, base64Data] = match;

  let ext = 'bin';
  if (originalFileName && originalFileName.includes('.')) {
    const fromName = originalFileName.split('.').pop() || '';
    ext = fromName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'bin';
  } else {
    const extFromMime = (mime.split('/')[1] || 'bin').split('+')[0].split(';')[0];
    ext = (extFromMime === 'jpeg' ? 'jpg' : extFromMime).replace(/[^a-z0-9]/gi, '').slice(0, 10) || 'bin';
  }

  const safeScopeId = scopeId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeKeyHint = keyHint.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filePath = `${category}/${safeScopeId}/${safeKeyHint}-${Date.now()}.${ext}`;

  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const { error } = await supabase.storage
      .from(CARD_IMAGES_BUCKET)
      .upload(filePath, buffer, { contentType: mime, upsert: true });
    if (error) {
      console.error(`uploadDataUrlFile(${filePath}) error:`, error);
      return null;
    }
    const TEN_YEARS_IN_SECONDS = 60 * 60 * 24 * 365 * 10;
    const { data, error: signError } = await supabase.storage
      .from(CARD_IMAGES_BUCKET)
      .createSignedUrl(filePath, TEN_YEARS_IN_SECONDS);
    if (signError) {
      console.error(`uploadDataUrlFile(${filePath}) 서명 URL 발급 실패:`, signError);
      return null;
    }
    return data?.signedUrl || null;
  } catch (err) {
    console.error(`uploadDataUrlFile(${filePath}) exception:`, err);
    return null;
  }
}

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
  if (!isSupabaseConfigured) return;
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
  if (!isSupabaseConfigured) return;
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
// [수정] Supabase(PostgREST)는 한 번의 조회에 기본적으로 최대 1,000행까지만 돌려준다.
// 이 함수가 그 이상을 나눠서 더 가져오는 처리 없이 그냥 한 번만 조회했기 때문에, 명함이
// 1,000건을 넘는 회사/사용자는 실제로는 다 저장돼 있는데도 화면에는 딱 1,000건까지만
// 보이는 문제가 있었다("2,100건 저장했는데 1,000건만 보임"). 이제는 1,000건씩 끊어서
// 더 가져올 데이터가 없을 때까지 반복 조회한 뒤 전부 합쳐서 반환한다.
export async function getScopedCollection<T>(scopeId: string, collectionName: string): Promise<T[]> {
  if (!isSupabaseConfigured) return [];
  const PAGE_SIZE = 1000;
  const allRows: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('scoped_items')
      .select('data')
      .eq('scope_id', scopeId)
      .eq('collection', collectionName)
      // [수정] 정렬 기준 없이 .range()로만 페이지를 나누면, Postgres가 페이지마다 다른
      // 순서로 행을 돌려줄 수 있어서 두 페이지 사이에 같은 행이 중복되거나 반대로 어떤
      // 행은 아예 빠지는 문제가 생길 수 있다. doc_id로 고정 정렬해야 페이지가 서로
      // 안 겹치는 게 보장된다.
      .order('doc_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error(`getScopedCollection(${scopeId}, ${collectionName}) error:`, error);
      break;
    }
    if (!data || data.length === 0) break;

    allRows.push(...data);
    if (data.length < PAGE_SIZE) break; // 이번 페이지가 꽉 안 찼으면 더 가져올 게 없다는 뜻
    from += PAGE_SIZE;
  }

  return allRows.map(row => row.data as T);
}

export async function getScopedDoc<T>(scopeId: string, collectionName: string, docId: string): Promise<T | null> {
  if (!isSupabaseConfigured) return null;
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
// [수정] 예전엔 반환값이 없어서(void), 이 함수를 부르는 쪽에서는 DB 저장이 실제로 성공했는지
// 확인할 방법이 없었다. 에러가 나도 서버 콘솔에만 로그를 남기고 조용히 넘어갔기 때문에,
// 클라이언트는 "저장 성공" 응답을 그대로 받아서 사용자에게 아무 문제 없이 저장된 것처럼
// 보였다 — 실제로는 메모리 캐시에만 반영되고 DB에는 안 남아서, 서버가 재시작되면 방금
// 수정한 내용(예: 재스캔한 명함 사진)이 조용히 사라지는 문제가 있었다. 이제 성공 여부를
// boolean으로 돌려줘서, 중요한 저장 경로(명함 등록/수정 등)에서 실패를 감지해 사용자에게
// 알릴 수 있게 한다. 기존 호출부들은 반환값을 안 써도 그대로 동작한다(하위 호환).
export async function setScopedDoc<T extends { id: string }>(scopeId: string, collectionName: string, item: T): Promise<boolean> {
  if (!isSupabaseConfigured) return true;
  const { error } = await supabase
    .from('scoped_items')
    .upsert(
      { scope_id: scopeId, collection: collectionName, doc_id: item.id, data: item, updated_at: new Date().toISOString() },
      { onConflict: 'scope_id,collection,doc_id' }
    );
  if (error) {
    console.error(`setScopedDoc(${scopeId}, ${collectionName}, ${item.id}) error:`, error);
    return false;
  }
  return true;
}

// 여러 문서를 한 번에 upsert (대량 가져오기 등에서 사용)
export async function setScopedDocs<T extends { id: string }>(scopeId: string, collectionName: string, items: T[]): Promise<void> {
  if (!isSupabaseConfigured) return;
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
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from('scoped_items')
    .upsert(
      { scope_id: scopeId, collection: 'myProfile', doc_id: 'profile', data: profile, updated_at: new Date().toISOString() },
      { onConflict: 'scope_id,collection,doc_id' }
    );
  if (error) console.error(`setScopedProfile(${scopeId}) error:`, error);
}

// [수정] 공유 랜딩 페이지(/s/:slug)용: scope_id를 몰라도 shareSlug만으로
// 전체 스코프를 통틀어 해당하는 myProfile 문서를 찾는다.
// Postgres jsonb 컬럼의 특정 키(data->>shareSlug)를 기준으로 필터링한다.
export async function findProfileByShareSlug(slug: string): Promise<{ scopeId: string; profile: MyProfile } | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('scoped_items')
    .select('scope_id, data')
    .eq('collection', 'myProfile')
    .eq('data->>shareSlug', slug)
    .maybeSingle();
  if (error) {
    console.error(`findProfileByShareSlug(${slug}) error:`, error);
    return null;
  }
  if (!data) return null;
  return { scopeId: data.scope_id as string, profile: data.data as MyProfile };
}

export async function updateScopedDoc<T>(scopeId: string, collectionName: string, docId: string, updates: Partial<T>): Promise<void> {
  if (!isSupabaseConfigured) return;
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
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from('scoped_items')
    .delete()
    .eq('scope_id', scopeId)
    .eq('collection', collectionName)
    .eq('doc_id', docId);
  if (error) console.error(`deleteScopedDoc(${scopeId}, ${collectionName}, ${docId}) error:`, error);
}

// 컬렉션 전체를 통째로 교체 (필터/일괄재계산 후 한 번에 반영할 때 사용: 예) 업무일지-차량비용 동기화)
// [수정] 예전엔 "그 스코프+컬렉션의 모든 행을 삭제한 다음, 새 목록을 통째로 insert"하는
// 방식이었다. 그런데 같은 컬렉션(예: expenses)에 대해 거의 동시에 두 번 호출되면(예:
// 사용자가 두 번 연속 저장을 누르거나, 서로 다른 요청이 겹치면), 한쪽이 delete를 마치고
// insert하는 사이에 다른 쪽도 자기 목록을 insert하려다가 "이미 존재하는 doc_id"에
// 걸려서 23505(duplicate key) 에러로 죽는 경우가 있었다.
// insert 대신 upsert(onConflict)를 쓰면, 이미 같은 doc_id의 행이 있어도 에러 없이
// 최신 값으로 덮어써서 이 크래시 자체가 나지 않는다. 그리고 "완전히 삭제된 항목"만
// 별도로 지워서(새 목록에 없는 doc_id만 delete), 저장 도중 겹치는 창(delete~insert
// 사이 시간)을 최소화한다.
export async function replaceScopedCollection<T extends { id: string }>(scopeId: string, collectionName: string, items: T[]): Promise<void> {
  if (!isSupabaseConfigured) return;

  if (items.length === 0) {
    // 새 목록이 완전히 비었으면 그 스코프+컬렉션의 기존 행을 전부 지운다.
    const { error: deleteError } = await supabase
      .from('scoped_items')
      .delete()
      .eq('scope_id', scopeId)
      .eq('collection', collectionName);
    if (deleteError) console.error(`replaceScopedCollection delete-all(${scopeId}, ${collectionName}) error:`, deleteError);
    return;
  }

  // 새 목록에 없는(=삭제된) 기존 항목만 지운다. 살아있는 항목은 지웠다가 다시 넣지
  // 않고 upsert로 그 자리에서 갱신하므로, delete~insert 사이에 다른 요청이 끼어들
  // 여지가 줄어든다.
  const currentIds = items.map((item) => item.id);
  const { error: deleteError } = await supabase
    .from('scoped_items')
    .delete()
    .eq('scope_id', scopeId)
    .eq('collection', collectionName)
    .not('doc_id', 'in', `(${currentIds.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(',')})`);
  if (deleteError) {
    console.error(`replaceScopedCollection delete-stale(${scopeId}, ${collectionName}) error:`, deleteError);
    return;
  }

  const rows = items.map(item => ({
    scope_id: scopeId,
    collection: collectionName,
    doc_id: item.id,
    data: item,
    updated_at: new Date().toISOString()
  }));
  const { error: upsertError } = await supabase
    .from('scoped_items')
    .upsert(rows, { onConflict: 'scope_id,collection,doc_id' });
  if (upsertError) console.error(`replaceScopedCollection upsert(${scopeId}, ${collectionName}) error:`, upsertError);
}

// ------------------------------------------------------------------
// 사용자(로그인 계정) 관리 — 별도 app_users 테이블 사용
// ------------------------------------------------------------------
// [수정] 명함(getScopedCollection)과 같은 이유로, 가입 회원이 1,000명을 넘으면 그 이후
// 가입한 사람들이 서버 시작 시 메모리에 안 올라와서 로그인 자체가 안 되는 심각한 문제로
// 이어질 수 있었다. 여기도 1,000건씩 끊어서 전부 가져오도록 고친다.
export async function getUsers(): Promise<RegisteredUser[]> {
  if (!isSupabaseConfigured) return [];
  const PAGE_SIZE = 1000;
  const allRows: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('app_users')
      .select('data')
      // [수정] 위와 같은 이유로 정렬 기준을 고정해서 페이지 간 중복/누락을 방지한다.
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('getUsers error:', error);
      break;
    }
    if (!data || data.length === 0) break;

    allRows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allRows.map(row => row.data as RegisteredUser);
}

export async function addUser(user: RegisteredUser): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from('app_users')
    .upsert({ id: user.id, data: user }, { onConflict: 'id' });
  if (error) console.error(`addUser(${user.id}) error:`, error);
}

// [추가] 회사 가입 승인 거절 시 계정 자체를 삭제하기 위한 함수.
export async function deleteUser(userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('app_users').delete().eq('id', userId);
  if (error) console.error(`deleteUser(${userId}) error:`, error);
}

// [추가] 회원 탈퇴 시, 개인(individual) 계정은 그 스코프가 곧 "그 사람 데이터 전부"이므로
// 명함/프로젝트/차량기록 등 scoped_items에 있는 모든 데이터와 scopes 메타 행까지 완전히
// 지운다. 개인정보처리방침에 "탈퇴 시 지체 없이 파기한다"고 명시했으므로, 실제로 지운다.
// 회사(company) 계정에는 절대 쓰면 안 된다 — 같은 회사 동료들의 공유 데이터까지 같이
// 지워지기 때문이다 (회사 계정 탈퇴는 계정만 지우고 회사 데이터는 남겨둔다).
export async function deleteScopeCompletely(scopeId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error: itemsError } = await supabase.from('scoped_items').delete().eq('scope_id', scopeId);
  if (itemsError) console.error(`deleteScopeCompletely(${scopeId}) scoped_items error:`, itemsError);
  const { error: scopeError } = await supabase.from('scopes').delete().eq('scope_id', scopeId);
  if (scopeError) console.error(`deleteScopeCompletely(${scopeId}) scopes error:`, scopeError);
}

// ------------------------------------------------------------------
// 로그인 세션 영구 저장 — 서버 재시작(배포 플랫폼의 cold start 등)에도 로그인이
// 끊기지 않도록 세션을 메모리가 아니라 여기 DB에 둔다.
// ------------------------------------------------------------------
export interface StoredSession {
  token: string;
  userId: string;
  expiresAt: number; // epoch ms
}

export async function saveSession(token: string, userId: string, expiresAt: number): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('app_sessions').upsert(
    { token, user_id: userId, expires_at: new Date(expiresAt).toISOString() },
    { onConflict: 'token' }
  );
  if (error) console.error(`saveSession(${token.slice(0, 8)}...) error:`, error);
}

export async function loadSession(token: string): Promise<StoredSession | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('app_sessions')
    .select('token, user_id, expires_at')
    .eq('token', token)
    .maybeSingle();
  if (error) {
    console.error(`loadSession(${token.slice(0, 8)}...) error:`, error);
    return null;
  }
  if (!data) return null;
  return { token: data.token, userId: data.user_id, expiresAt: new Date(data.expires_at).getTime() };
}

export async function deleteSession(token: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('app_sessions').delete().eq('token', token);
  if (error) console.error(`deleteSession(${token.slice(0, 8)}...) error:`, error);
}

export async function deleteAllSessionsForUser(userId: string): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('app_sessions').delete().eq('user_id', userId);
  if (error) console.error(`deleteAllSessionsForUser(${userId}) error:`, error);
}

// ------------------------------------------------------------------
// 관리자 작업 감사 로그 — 역할 변경, 회사 가입 승인/거절처럼 민감한 관리자 작업을
// 기록해서 나중에 "누가 언제 무엇을 했는지" 추적할 수 있게 한다.
// ------------------------------------------------------------------
export interface AuditLogEntry {
  scopeId: string;
  actorUserId: string;
  actorEmail?: string;
  action: string;
  targetUserId?: string;
  targetEmail?: string;
  detail?: Record<string, unknown>;
}

export async function logAudit(entry: AuditLogEntry): Promise<void> {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('audit_logs').insert({
    scope_id: entry.scopeId,
    actor_user_id: entry.actorUserId,
    actor_email: entry.actorEmail || null,
    action: entry.action,
    target_user_id: entry.targetUserId || null,
    target_email: entry.targetEmail || null,
    detail: entry.detail || null
  });
  // 감사 로그 기록 실패가 실제 작업(예: 역할 변경) 자체를 막으면 안 되므로, 실패해도
  // 에러만 남기고 넘어간다.
  if (error) console.error('logAudit error:', error);
}

export async function getAuditLogs(scopeId: string, limit = 200): Promise<any[]> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('scope_id', scopeId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error(`getAuditLogs(${scopeId}) error:`, error);
    return [];
  }
  return data || [];
}
