/**
 * 관리자 역할 변경 스크립트 (수동 지정 버전)
 *
 * 사용법:
 * npx tsx scripts/change-admin-manual.ts [demote-email] [promote-email]
 *
 * 예시:
 * npx tsx scripts/change-admin-manual.ts test@example.com parkhy5454@gmail.com
 *
 * 기능:
 * - 첫 번째 이메일 사용자의 역할을 member로 변경
 * - 두 번째 이메일 사용자의 역할을 admin으로 변경
 */

import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
const [, , demoteEmail, promoteEmail] = process.argv;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL 환경변수가 설정되지 않았습니다.');
  process.exit(1);
}

if (!demoteEmail || !promoteEmail) {
  console.error('❌ 사용법: npx tsx scripts/change-admin-manual.ts [demote-email] [promote-email]');
  console.error('\n예시:');
  console.error('  npx tsx scripts/change-admin-manual.ts test@example.com parkhy5454@gmail.com');
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

async function changeAdminManual() {
  try {
    console.log('[마이그레이션] 시작: 관리자 역할 변경');
    console.log(`  강등: ${demoteEmail}`);
    console.log(`  승격: ${promoteEmail}\n`);

    // 모든 사용자 조회
    const result = await pool.query('SELECT id, data FROM app_users');
    const users: AppUser[] = result.rows;

    // 사용자 찾기
    const demoteUser = users.find(u =>
      u.data.email?.toLowerCase() === demoteEmail.toLowerCase()
    );
    const promoteUser = users.find(u =>
      u.data.email?.toLowerCase() === promoteEmail.toLowerCase()
    );

    if (!demoteUser) {
      console.error(`❌ 오류: ${demoteEmail} 사용자를 찾을 수 없습니다.`);
      listAllUsers(users);
      process.exit(1);
    }

    if (!promoteUser) {
      console.error(`❌ 오류: ${promoteEmail} 사용자를 찾을 수 없습니다.`);
      listAllUsers(users);
      process.exit(1);
    }

    console.log(`✅ 강등할 사용자: ${demoteUser.data.name} (${demoteUser.data.email})`);
    console.log(`   현재 역할: ${demoteUser.data.role || 'undefined'}\n`);

    console.log(`✅ 승격할 사용자: ${promoteUser.data.name} (${promoteUser.data.email})`);
    console.log(`   현재 역할: ${promoteUser.data.role || 'undefined'}\n`);

    // 같은 스코프 확인
    const demoteScope = scopeIdForUser(demoteUser.data);
    const promoteScope = scopeIdForUser(promoteUser.data);

    console.log(`강등 사용자 스코프: ${demoteScope}`);
    console.log(`승격 사용자 스코프: ${promoteScope}`);

    if (demoteScope !== promoteScope) {
      console.error('\n❌ 오류: 두 사용자가 다른 회사/스코프에 속해 있습니다.');
      console.log('같은 회사에 속한 사용자의 역할만 변경할 수 있습니다.');
      process.exit(1);
    }

    // 역할 변경
    console.log('\n[변경 진행 중...]\n');

    // 강등: member로 변경
    const updatedDemoteUser = {
      ...demoteUser.data,
      role: 'member' as const
    };
    await pool.query(
      'UPDATE app_users SET data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [JSON.stringify(updatedDemoteUser), demoteUser.id]
    );
    console.log(`✅ ${demoteUser.data.name} 역할 변경: ${demoteUser.data.role || 'undefined'} → member`);

    // 승격: admin으로 변경
    const updatedPromoteUser = {
      ...promoteUser.data,
      role: 'admin' as const,
      approvalStatus: 'approved' as const
    };
    await pool.query(
      'UPDATE app_users SET data = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [JSON.stringify(updatedPromoteUser), promoteUser.id]
    );
    console.log(`✅ ${promoteUser.data.name} 역할 변경: ${promoteUser.data.role || 'undefined'} → admin`);

    console.log('\n✅ [성공] 관리자 역할이 변경되었습니다!');
    console.log(`   - ${demoteUser.data.name} (${demoteUser.data.email}): member`);
    console.log(`   - ${promoteUser.data.name} (${promoteUser.data.email}): admin`);

    process.exit(0);
  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

function listAllUsers(users: AppUser[]) {
  console.log('\n📋 데이터베이스의 모든 사용자:');
  console.table(users.map(u => ({
    이름: u.data.name,
    이메일: u.data.email,
    유형: u.data.type,
    역할: u.data.role || 'undefined'
  })));
}

changeAdminManual();
