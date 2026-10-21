/**
 * 관리자 역할 변경 스크립트
 *
 * 사용법:
 * npx tsx scripts/change-admin.ts
 *
 * 기능:
 * - "테스트" 사용자의 역할을 member로 변경
 * - "박현용" 사용자의 역할을 admin으로 변경
 * - 같은 회사(스코프)에 속한 경우에만 변경
 */

import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL 환경변수가 설정되지 않았습니다.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

interface AppUser {
  id: string;
  data: {
    id: string;
    email: string;
    name: string;
    type: 'individual' | 'company';
    businessNumber?: string;
    role?: 'admin' | 'member';
    approvalStatus?: 'approved' | 'pending';
    [key: string]: any;
  };
}

function scopeIdForUser(user: AppUser['data']): string {
  if (user.type === 'company') {
    const bNum = (user.businessNumber || '').trim();
    return `company:${bNum}`;
  }
  return `individual:${user.id}`;
}

async function changeAdmin() {
  try {
    console.log('[마이그레이션] 시작: 관리자 역할 변경 (테스트 → 박현용)');

    // 모든 사용자 조회
    const result = await pool.query('SELECT id, data FROM app_users');
    const users: AppUser[] = result.rows;

    // 테스트 사용자와 박현용 사용자 찾기
    const testUser = users.find(u =>
      u.data.name?.includes('테스트') ||
      u.data.email?.toLowerCase().includes('test') ||
      (u.data.email?.startsWith('test@') && !u.data.email?.includes('parkhy'))
    );
    const targetUser = users.find(u =>
      u.data.name?.includes('박현용') ||
      u.data.email?.includes('parkhy') ||
      u.data.email?.includes('hyunyong')
    );

    if (!testUser) {
      console.warn('⚠️  테스트 사용자를 찾을 수 없습니다.');
    } else {
      console.log(`✅ 테스트 사용자 찾음: ${testUser.data.name} (${testUser.data.email})`);
      console.log(`   현재 역할: ${testUser.data.role || 'undefined'}`);
    }

    if (!targetUser) {
      console.warn('⚠️  박현용 사용자를 찾을 수 없습니다.');
    } else {
      console.log(`✅ 박현용 사용자 찾음: ${targetUser.data.name} (${targetUser.data.email})`);
      console.log(`   현재 역할: ${targetUser.data.role || 'undefined'}`);
    }

    if (!testUser || !targetUser) {
      console.log('\n💡 사용자를 찾을 수 없습니다. 데이터베이스의 모든 사용자 목록:');
      console.table(users.map(u => ({
        id: u.id,
        name: u.data.name,
        email: u.data.email,
        type: u.data.type,
        role: u.data.role
      })));
      process.exit(1);
    }

    // 같은 스코프 확인
    const testScope = scopeIdForUser(testUser.data);
    const targetScope = scopeIdForUser(targetUser.data);

    console.log(`\n테스트 사용자 스코프: ${testScope}`);
    console.log(`박현용 사용자 스코프: ${targetScope}`);

    if (testScope !== targetScope) {
      console.error('❌ 오류: 두 사용자가 다른 회사/스코프에 속해 있습니다.');
      console.log('같은 회사에 속한 사용자의 역할만 변경할 수 있습니다.');
      process.exit(1);
    }

    // 역할 변경
    console.log('\n[변경 진행 중...]');

    // 테스트 사용자 역할을 member로 변경
    const updatedTestUser = {
      ...testUser.data,
      role: 'member' as const
    };
    await pool.query(
      'UPDATE app_users SET data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [JSON.stringify(updatedTestUser), testUser.id]
    );
    console.log(`✅ ${testUser.data.name} 역할 변경됨: ${testUser.data.role} → member`);

    // 박현용 사용자 역할을 admin으로 변경
    const updatedTargetUser = {
      ...targetUser.data,
      role: 'admin' as const,
      approvalStatus: 'approved' as const
    };
    await pool.query(
      'UPDATE app_users SET data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [JSON.stringify(updatedTargetUser), targetUser.id]
    );
    console.log(`✅ ${targetUser.data.name} 역할 변경됨: ${targetUser.data.role} → admin`);

    console.log('\n✅ [성공] 관리자 역할이 변경되었습니다!');
    console.log(`   - 테스트 (${testUser.data.email}): member`);
    console.log(`   - 박현용 (${targetUser.data.email}): admin`);

    process.exit(0);
  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

changeAdmin();
