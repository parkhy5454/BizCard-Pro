import { Pool } from 'pg';
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

const DATABASE_URL = process.env.DATABASE_URL;
export const isNeonConfigured = Boolean(DATABASE_URL);

if (!DATABASE_URL) {
  console.warn('[neonStore] DATABASE_URL 환경변수가 설정되지 않았습니다.');
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 데이터베이스 초기화 (테이블 생성)
export async function initializeDatabase() {
  if (!isNeonConfigured) return;

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS scopes (
        scope_id TEXT PRIMARY KEY,
        initialized BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS scoped_items (
        scope_id TEXT NOT NULL,
        collection TEXT NOT NULL,
        doc_id TEXT NOT NULL,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (scope_id, collection, doc_id)
      );

      CREATE TABLE IF NOT EXISTS app_sessions (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        scope_id TEXT NOT NULL,
        actor_user_id TEXT NOT NULL,
        actor_email TEXT,
        action TEXT NOT NULL,
        target_user_id TEXT,
        target_email TEXT,
        detail JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS referrals (
        id SERIAL PRIMARY KEY,
        referrer_user_id TEXT NOT NULL,
        referee_user_id TEXT NOT NULL,
        referee_email TEXT,
        referee_name TEXT,
        status TEXT DEFAULT 'pending',
        rewarded_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_scoped_items_scope ON scoped_items(scope_id);
      CREATE INDEX IF NOT EXISTS idx_scoped_items_collection ON scoped_items(collection);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_scope ON audit_logs(scope_id);
    `);
    console.log('[neonStore] 데이터베이스 초기화 완료');
  } catch (error) {
    console.error('[neonStore] 데이터베이스 초기화 실패:', error);
  }
}

// 파일 업로드 (임시로 경로만 반환 - 실제 파일 저장소 연동 필요)
export async function uploadDataUrlImage(
  scopeId: string,
  dataUrl: string,
  keyHint: string,
  category: 'cards' | 'receipts' | 'signatures' | 'branding' = 'cards'
): Promise<string | null> {
  // 임시 구현: 데이터 URL을 그대로 반환
  // 실제로는 S3, Cloudinary, 또는 다른 스토리지 서비스 사용 필요
  console.warn('[neonStore] uploadDataUrlImage: 실제 파일 저장소 미구현 - 데이터 URL 반환');
  return dataUrl.substring(0, 1000); // 임시: 앞 1000자만 반환
}

export async function uploadDataUrlFile(
  scopeId: string,
  dataUrl: string,
  keyHint: string,
  category: 'cards' | 'receipts' | 'attachments' = 'attachments',
  originalFileName?: string
): Promise<string | null> {
  console.warn('[neonStore] uploadDataUrlFile: 실제 파일 저장소 미구현 - 데이터 URL 반환');
  return dataUrl.substring(0, 1000); // 임시: 앞 1000자만 반환
}

// 스코프 초기화
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
  if (!isNeonConfigured) return;
  try {
    const { rows } = await pool.query(
      'SELECT scope_id FROM scopes WHERE scope_id = $1',
      [scopeId]
    );

    if (!rows.length) {
      await pool.query(
        'INSERT INTO scopes (scope_id, initialized) VALUES ($1, $2)',
        [scopeId, true]
      );

      const bulk = [];
      initialData.contacts.forEach(item => bulk.push([scopeId, 'contacts', item.id, item]));
      initialData.projects.forEach(item => bulk.push([scopeId, 'projects', item.id, item]));
      initialData.groups.forEach(item => bulk.push([scopeId, 'groups', item.id, item]));
      bulk.push([scopeId, 'myProfile', 'profile', initialData.myProfile]);
      initialData.vehicles.forEach(item => bulk.push([scopeId, 'vehicles', item.id, item]));
      initialData.drivingLogs.forEach(item => bulk.push([scopeId, 'drivingLogs', item.id, item]));
      initialData.expenses.forEach(item => bulk.push([scopeId, 'expenses', item.id, item]));
      initialData.maintenances.forEach(item => bulk.push([scopeId, 'maintenances', item.id, item]));
      initialData.maintenanceIntervals.forEach(item => bulk.push([scopeId, 'maintenanceIntervals', item.id, item]));
      initialData.dailyLogs.forEach(item => bulk.push([scopeId, 'dailyLogs', item.id, item]));
      initialData.weeklyLogs.forEach(item => bulk.push([scopeId, 'weeklyLogs', item.id, item]));

      for (const [scope_id, collection, doc_id, data] of bulk) {
        await pool.query(
          'INSERT INTO scoped_items (scope_id, collection, doc_id, data) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
          [scope_id, collection, doc_id, JSON.stringify(data)]
        );
      }
    }
  } catch (error) {
    console.error(`ensureScopeInitialized(${scopeId}) 실패:`, error);
  }
}

export async function ensureUsersSeeded(initialUsers: RegisteredUser[]) {
  if (!isNeonConfigured) return;
  try {
    const { rows } = await pool.query('SELECT COUNT(*) as count FROM app_users');
    if (rows[0].count === 0) {
      console.log('Seeding initial users to Neon...');
      for (const user of initialUsers) {
        await pool.query(
          'INSERT INTO app_users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2',
          [user.id, JSON.stringify(user)]
        );
      }
    }
  } catch (error) {
    console.error('ensureUsersSeeded 실패:', error);
  }
}

export async function getScopedCollection<T>(scopeId: string, collectionName: string): Promise<T[]> {
  if (!isNeonConfigured) return [];
  try {
    const { rows } = await pool.query(
      'SELECT data FROM scoped_items WHERE scope_id = $1 AND collection = $2 ORDER BY doc_id ASC',
      [scopeId, collectionName]
    );
    return rows.map(row => row.data as T);
  } catch (error) {
    console.error(`getScopedCollection(${scopeId}, ${collectionName}) 실패:`, error);
    return [];
  }
}

export async function getScopedDoc<T>(scopeId: string, collectionName: string, docId: string): Promise<T | null> {
  if (!isNeonConfigured) return null;
  try {
    const { rows } = await pool.query(
      'SELECT data FROM scoped_items WHERE scope_id = $1 AND collection = $2 AND doc_id = $3',
      [scopeId, collectionName, docId]
    );
    return rows.length ? (rows[0].data as T) : null;
  } catch (error) {
    console.error(`getScopedDoc(${scopeId}, ${collectionName}, ${docId}) 실패:`, error);
    return null;
  }
}

export async function setScopedDoc<T extends { id: string }>(scopeId: string, collectionName: string, item: T): Promise<boolean> {
  if (!isNeonConfigured) return true;
  try {
    // scoped_items에 저장 (기존 호환성)
    await pool.query(
      'INSERT INTO scoped_items (scope_id, collection, doc_id, data) VALUES ($1, $2, $3, $4) ON CONFLICT (scope_id, collection, doc_id) DO UPDATE SET data = $4, updated_at = CURRENT_TIMESTAMP',
      [scopeId, collectionName, item.id, JSON.stringify(item)]
    );

    // 동시에 app_users.data에도 업데이트
    try {
      const { rows } = await pool.query('SELECT data FROM app_users WHERE id = $1', [scopeId]);
      if (rows.length > 0) {
        let userData = rows[0].data || {};
        if (typeof userData === 'string') {
          userData = JSON.parse(userData);
        }

        if (!userData[collectionName]) {
          userData[collectionName] = [];
        }

        if (Array.isArray(userData[collectionName])) {
          const idx = userData[collectionName].findIndex(i => i.id === item.id);
          if (idx >= 0) {
            userData[collectionName][idx] = item;
          } else {
            userData[collectionName].push(item);
          }
        } else {
          userData[collectionName] = item;
        }

        await pool.query(
          'UPDATE app_users SET data = $1 WHERE id = $2',
          [JSON.stringify(userData), scopeId]
        );
      }
    } catch (syncError) {
      console.warn(`app_users.data 동기화 실패 (${scopeId}, ${collectionName}):`, syncError);
      // 동기화 실패해도 scoped_items에는 저장됐으므로 true 반환
    }

    return true;
  } catch (error) {
    console.error(`setScopedDoc(${scopeId}, ${collectionName}, ${item.id}) 실패:`, error);
    return false;
  }
}

export async function setScopedDocs<T extends { id: string }>(scopeId: string, collectionName: string, items: T[]): Promise<boolean> {
  if (!isNeonConfigured) return true;
  if (!items.length) return true;
  try {
    // scoped_items에 모두 저장
    for (const item of items) {
      await pool.query(
        'INSERT INTO scoped_items (scope_id, collection, doc_id, data) VALUES ($1, $2, $3, $4) ON CONFLICT (scope_id, collection, doc_id) DO UPDATE SET data = $4, updated_at = CURRENT_TIMESTAMP',
        [scopeId, collectionName, item.id, JSON.stringify(item)]
      );
    }

    // 동시에 app_users.data에도 모두 업데이트
    try {
      const { rows } = await pool.query('SELECT data FROM app_users WHERE id = $1', [scopeId]);
      if (rows.length > 0) {
        let userData = rows[0].data || {};
        if (typeof userData === 'string') {
          userData = JSON.parse(userData);
        }

        userData[collectionName] = items;

        await pool.query(
          'UPDATE app_users SET data = $1 WHERE id = $2',
          [JSON.stringify(userData), scopeId]
        );
      }
    } catch (syncError) {
      console.warn(`app_users.data 동기화 실패 (${scopeId}, ${collectionName}):`, syncError);
    }

    return true;
  } catch (error) {
    console.error(`setScopedDocs(${scopeId}, ${collectionName}) 실패:`, error);
    return false;
  }
}

export async function setScopedProfile(scopeId: string, profile: MyProfile): Promise<boolean> {
  if (!isNeonConfigured) return true;
  return setScopedDoc(scopeId, 'myProfile', { ...profile, id: 'profile' } as any);
}

export async function updateScopedDoc<T>(scopeId: string, collectionName: string, docId: string, updates: Partial<T>): Promise<void> {
  if (!isNeonConfigured) return;
  try {
    const existing = await getScopedDoc<any>(scopeId, collectionName, docId);
    const merged = { ...(existing || {}), ...updates, id: docId };
    await setScopedDoc(scopeId, collectionName, merged);
  } catch (error) {
    console.error(`updateScopedDoc(${scopeId}, ${collectionName}, ${docId}) 실패:`, error);
  }
}

export async function deleteScopedDoc(scopeId: string, collectionName: string, docId: string): Promise<void> {
  if (!isNeonConfigured) return;
  try {
    // scoped_items에서 삭제
    await pool.query(
      'DELETE FROM scoped_items WHERE scope_id = $1 AND collection = $2 AND doc_id = $3',
      [scopeId, collectionName, docId]
    );

    // app_users.data에서도 제거
    try {
      const { rows } = await pool.query('SELECT data FROM app_users WHERE id = $1', [scopeId]);
      if (rows.length > 0) {
        let userData = rows[0].data || {};
        if (typeof userData === 'string') {
          userData = JSON.parse(userData);
        }

        if (Array.isArray(userData[collectionName])) {
          userData[collectionName] = userData[collectionName].filter(i => i.id !== docId);
        }

        await pool.query(
          'UPDATE app_users SET data = $1 WHERE id = $2',
          [JSON.stringify(userData), scopeId]
        );
      }
    } catch (syncError) {
      console.warn(`app_users.data 동기화 실패 (${scopeId}, ${collectionName}):`, syncError);
    }
  } catch (error) {
    console.error(`deleteScopedDoc(${scopeId}, ${collectionName}, ${docId}) 실패:`, error);
  }
}

export async function replaceScopedCollection<T extends { id: string }>(scopeId: string, collectionName: string, items: T[]): Promise<void> {
  if (!isNeonConfigured) return;
  try {
    if (items.length === 0) {
      await pool.query('DELETE FROM scoped_items WHERE scope_id = $1 AND collection = $2', [scopeId, collectionName]);
    } else {
      const ids = items.map(item => item.id);
      const placeholders = ids.map((_, i) => `$${i + 3}`).join(',');
      await pool.query(
        `DELETE FROM scoped_items WHERE scope_id = $1 AND collection = $2 AND doc_id NOT IN (${placeholders})`,
        [scopeId, collectionName, ...ids]
      );

      for (const item of items) {
        await pool.query(
          'INSERT INTO scoped_items (scope_id, collection, doc_id, data) VALUES ($1, $2, $3, $4) ON CONFLICT (scope_id, collection, doc_id) DO UPDATE SET data = $4',
          [scopeId, collectionName, item.id, JSON.stringify(item)]
        );
      }
    }

    // app_users.data에도 동기화
    try {
      const { rows } = await pool.query('SELECT data FROM app_users WHERE id = $1', [scopeId]);
      if (rows.length > 0) {
        let userData = rows[0].data || {};
        if (typeof userData === 'string') {
          userData = JSON.parse(userData);
        }

        userData[collectionName] = items;

        await pool.query(
          'UPDATE app_users SET data = $1 WHERE id = $2',
          [JSON.stringify(userData), scopeId]
        );
      }
    } catch (syncError) {
      console.warn(`app_users.data 동기화 실패 (${scopeId}, ${collectionName}):`, syncError);
    }
  } catch (error) {
    console.error(`replaceScopedCollection(${scopeId}, ${collectionName}) 실패:`, error);
  }
}

export async function findProfileByShareSlug(slug: string): Promise<{ scopeId: string; profile: MyProfile } | null> {
  if (!isNeonConfigured) return null;
  try {
    const { rows } = await pool.query(
      "SELECT scope_id, data FROM scoped_items WHERE collection = 'myProfile' AND data->>'shareSlug' = $1",
      [slug]
    );
    if (rows.length) {
      return { scopeId: rows[0].scope_id as string, profile: rows[0].data as MyProfile };
    }
    return null;
  } catch (error) {
    console.error(`findProfileByShareSlug(${slug}) 실패:`, error);
    return null;
  }
}

// 사용자 관리
export async function getUsers(): Promise<RegisteredUser[]> {
  if (!isNeonConfigured) return [];
  try {
    const { rows } = await pool.query('SELECT id, data FROM app_users ORDER BY id ASC');
    // 각 사용자의 scoped_items 데이터를 data JSONB에 병합
    const users: RegisteredUser[] = [];
    for (const row of rows) {
      let user = row.data as RegisteredUser;
      if (!user) user = { id: row.id } as RegisteredUser;

      // scoped_items에서 사용자의 모든 데이터를 로드해서 user 객체에 병합
      try {
        const { rows: scopedRows } = await pool.query(
          'SELECT collection, doc_id, data FROM scoped_items WHERE scope_id = $1',
          [row.id]
        );

        for (const scopedRow of scopedRows) {
          const collection = scopedRow.collection;
          const data = scopedRow.data;

          if (!user[collection as keyof RegisteredUser]) {
            user[collection as keyof RegisteredUser] = [] as any;
          }

          if (Array.isArray(user[collection as keyof RegisteredUser])) {
            // 중복 확인 후 추가
            const arr = user[collection as keyof RegisteredUser] as any[];
            if (!arr.find(item => item.id === data.id)) {
              arr.push(data);
            }
          } else if (collection === 'myProfile') {
            user[collection as keyof RegisteredUser] = data;
          }
        }
      } catch (scopedError) {
        console.warn(`scoped_items 로드 실패 for user ${row.id}:`, scopedError);
      }

      users.push(user);
    }
    return users;
  } catch (error) {
    console.error('getUsers 실패:', error);
    return [];
  }
}

export async function addUser(user: RegisteredUser): Promise<boolean> {
  if (!isNeonConfigured) return true;
  try {
    await pool.query(
      'INSERT INTO app_users (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2',
      [user.id, JSON.stringify(user)]
    );
    return true;
  } catch (error) {
    console.error(`addUser(${user.id}) 실패:`, error);
    return false;
  }
}

export async function updateUserData(userId: string, user: RegisteredUser): Promise<boolean> {
  if (!isNeonConfigured) return true;
  try {
    await pool.query(
      'UPDATE app_users SET data = $1 WHERE id = $2',
      [JSON.stringify(user), userId]
    );
    return true;
  } catch (error) {
    console.error(`updateUserData(${userId}) 실패:`, error);
    return false;
  }
}

export async function deleteUser(userId: string): Promise<void> {
  if (!isNeonConfigured) return;
  try {
    await pool.query('DELETE FROM app_users WHERE id = $1', [userId]);
  } catch (error) {
    console.error(`deleteUser(${userId}) 실패:`, error);
  }
}

export async function deleteScopeCompletely(scopeId: string): Promise<void> {
  if (!isNeonConfigured) return;
  try {
    await pool.query('DELETE FROM scoped_items WHERE scope_id = $1', [scopeId]);
    await pool.query('DELETE FROM scopes WHERE scope_id = $1', [scopeId]);
  } catch (error) {
    console.error(`deleteScopeCompletely(${scopeId}) 실패:`, error);
  }
}

// 세션 관리
export async function saveSession(token: string, userId: string, expiresAt: number): Promise<void> {
  if (!isNeonConfigured) return;
  try {
    await pool.query(
      'INSERT INTO app_sessions (token, user_id, expires_at) VALUES ($1, $2, $3) ON CONFLICT (token) DO UPDATE SET user_id = $2, expires_at = $3',
      [token, userId, new Date(expiresAt)]
    );
  } catch (error) {
    console.error(`saveSession 실패:`, error);
  }
}

export async function loadSession(token: string): Promise<{ token: string; userId: string; expiresAt: number } | null> {
  if (!isNeonConfigured) return null;
  try {
    const { rows } = await pool.query(
      'SELECT token, user_id, expires_at FROM app_sessions WHERE token = $1',
      [token]
    );
    if (rows.length) {
      return { token: rows[0].token, userId: rows[0].user_id, expiresAt: new Date(rows[0].expires_at).getTime() };
    }
    return null;
  } catch (error) {
    console.error(`loadSession 실패:`, error);
    return null;
  }
}

export async function deleteSession(token: string): Promise<void> {
  if (!isNeonConfigured) return;
  try {
    await pool.query('DELETE FROM app_sessions WHERE token = $1', [token]);
  } catch (error) {
    console.error(`deleteSession 실패:`, error);
  }
}

export async function deleteAllSessionsForUser(userId: string): Promise<void> {
  if (!isNeonConfigured) return;
  try {
    await pool.query('DELETE FROM app_sessions WHERE user_id = $1', [userId]);
  } catch (error) {
    console.error(`deleteAllSessionsForUser 실패:`, error);
  }
}

// 비밀번호 재설정 토큰
export async function savePasswordResetToken(token: string, userId: string, expiresAt: number): Promise<void> {
  if (!isNeonConfigured) return;
  try {
    await pool.query(
      'INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES ($1, $2, $3) ON CONFLICT (token) DO UPDATE SET user_id = $2, expires_at = $3',
      [token, userId, new Date(expiresAt)]
    );
  } catch (error) {
    console.error(`savePasswordResetToken 실패:`, error);
  }
}

export async function loadPasswordResetToken(token: string): Promise<{ token: string; userId: string; expiresAt: number } | null> {
  if (!isNeonConfigured) return null;
  try {
    const { rows } = await pool.query(
      'SELECT token, user_id, expires_at FROM password_reset_tokens WHERE token = $1',
      [token]
    );
    if (rows.length) {
      return { token: rows[0].token, userId: rows[0].user_id, expiresAt: new Date(rows[0].expires_at).getTime() };
    }
    return null;
  } catch (error) {
    console.error(`loadPasswordResetToken 실패:`, error);
    return null;
  }
}

export async function deletePasswordResetToken(token: string): Promise<void> {
  if (!isNeonConfigured) return;
  try {
    await pool.query('DELETE FROM password_reset_tokens WHERE token = $1', [token]);
  } catch (error) {
    console.error(`deletePasswordResetToken 실패:`, error);
  }
}

export async function deleteAllPasswordResetTokensForUser(userId: string): Promise<void> {
  if (!isNeonConfigured) return;
  try {
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
  } catch (error) {
    console.error(`deleteAllPasswordResetTokensForUser 실패:`, error);
  }
}

// 감사 로그
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
  if (!isNeonConfigured) return;
  try {
    await pool.query(
      'INSERT INTO audit_logs (scope_id, actor_user_id, actor_email, action, target_user_id, target_email, detail) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [entry.scopeId, entry.actorUserId, entry.actorEmail || null, entry.action, entry.targetUserId || null, entry.targetEmail || null, entry.detail ? JSON.stringify(entry.detail) : null]
    );
  } catch (error) {
    console.error('logAudit 실패:', error);
  }
}

export async function getAuditLogs(scopeId: string, limit = 200): Promise<any[]> {
  if (!isNeonConfigured) return [];
  try {
    const { rows } = await pool.query(
      'SELECT * FROM audit_logs WHERE scope_id = $1 ORDER BY created_at DESC LIMIT $2',
      [scopeId, limit]
    );
    return rows;
  } catch (error) {
    console.error(`getAuditLogs(${scopeId}) 실패:`, error);
    return [];
  }
}

// 친구 추천
export async function createReferral(opts: { referrerUserId: string; refereeUserId: string; refereeEmail?: string; refereeName?: string; }): Promise<void> {
  if (!isNeonConfigured) return;
  try {
    await pool.query(
      'INSERT INTO referrals (referrer_user_id, referee_user_id, referee_email, referee_name, status) VALUES ($1, $2, $3, $4, $5)',
      [opts.referrerUserId, opts.refereeUserId, opts.refereeEmail || null, opts.refereeName || null, 'pending']
    );
  } catch (error) {
    console.error('createReferral 실패:', error);
  }
}

export async function markReferralRewarded(refereeUserId: string): Promise<void> {
  if (!isNeonConfigured) return;
  try {
    await pool.query(
      'UPDATE referrals SET status = $1, rewarded_at = CURRENT_TIMESTAMP WHERE referee_user_id = $2',
      ['rewarded', refereeUserId]
    );
  } catch (error) {
    console.error(`markReferralRewarded(${refereeUserId}) 실패:`, error);
  }
}

export async function getReferralsForUser(referrerUserId: string): Promise<any[]> {
  if (!isNeonConfigured) return [];
  try {
    const { rows } = await pool.query(
      'SELECT * FROM referrals WHERE referrer_user_id = $1 ORDER BY created_at DESC',
      [referrerUserId]
    );
    return rows;
  } catch (error) {
    console.error(`getReferralsForUser(${referrerUserId}) 실패:`, error);
    return [];
  }
}

export async function getPlatformStats(): Promise<any[]> {
  if (!isNeonConfigured) return [];
  try {
    const { rows } = await pool.query(
      'SELECT scope_id, collection, COUNT(*) as count FROM scoped_items GROUP BY scope_id, collection'
    );
    return rows;
  } catch (error) {
    console.error('getPlatformStats 실패:', error);
    return [];
  }
}
