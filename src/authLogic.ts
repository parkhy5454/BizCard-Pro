// [추가] server.ts에 섞여있던 인증/권한 관련 "순수 로직"(DB나 네트워크 없이 입력→출력만
// 있는 함수들)을 여기로 분리했다. 이런 함수들이야말로 오늘 여러 번 고쳤던 것처럼
// "고쳤는데 다른 게 깨졌다" 사고가 나기 쉬운 지점이라, 테스트로 안전망을 둘 가치가 크다.

export interface MinimalUser {
  id: string;
  type: 'individual' | 'company';
  businessNumber?: string;
}

// 사용자가 속한 데이터 스코프(= 회사 단위 또는 개인 단위) 식별자를 계산한다.
// 회사 계정은 사업자등록번호로, 개인 계정은 본인 id로 구분한다.
export function scopeIdForUser(user: MinimalUser): string {
  if (user.type === 'company') {
    const bNum = (user.businessNumber || '').trim();
    return `company:${bNum}`;
  }
  return `individual:${user.id}`;
}

export interface SignupRoleDecision {
  role: 'admin' | 'member' | undefined;
  approvalStatus: 'approved' | 'pending' | undefined;
}

// [수정] 회원가입 시 role/approvalStatus를 결정하는 핵심 보안 로직. 클라이언트가 보낸 값은
// 절대 신뢰하지 않고(과거에 role:'admin'을 그냥 보내면 통과되던 취약점이 있었음), 오직
// "이 회사(회사명+사업자번호)에 이미 등록된 사람이 있는가"만으로 서버가 전적으로 계산한다.
// - 그 회사의 첫 가입자 → 관리자, 즉시 승인
// - 이미 누가 있으면 → 일반 사용자, 승인 대기 (관리자가 승인해야 회사 데이터 접근 가능)
// - 개인(individual) 계정은 role/approvalStatus 개념 자체가 없다(undefined)
export function decideSignupRoleAndApproval(
  type: 'individual' | 'company',
  hasExistingCompanyUser: boolean
): SignupRoleDecision {
  if (type !== 'company') {
    return { role: undefined, approvalStatus: undefined };
  }
  if (hasExistingCompanyUser) {
    return { role: 'member', approvalStatus: 'pending' };
  }
  return { role: 'admin', approvalStatus: 'approved' };
}

// 이메일 인증 여부 판단: 값이 명시적으로 false일 때만 "미인증"으로 취급한다.
// undefined(이 기능이 생기기 전에 가입한 기존 계정)는 인증된 것으로 간주해서,
// 소급 적용으로 기존 사용자들이 갑자기 로그인이 막히는 일이 없게 한다.
export function isEmailVerified(emailVerified: boolean | undefined): boolean {
  return emailVerified !== false;
}

// 같은 회사(스코프)인지 비교 — 관리자가 남의 회사 소속을 건드리지 못하게 막는 데 쓰인다.
export function isSameScope(a: MinimalUser, b: MinimalUser): boolean {
  return scopeIdForUser(a) === scopeIdForUser(b);
}

// [추가] 이메일 형식 검사 (서버 가입/이메일 변경에서 같은 기준을 쓰도록 한 곳에 모은다)
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// [추가] 프로필 저장 입력값 검증. 문제가 없으면 null, 있으면 사용자에게 보여줄 메시지를 돌려준다.
// 값이 undefined인 항목은 "바꾸지 않겠다"는 뜻이므로 검사하지 않는다.
// 회사명/사업자번호/이메일은 이 함수의 대상이 아니다 (각각 관리자 도구/이메일 인증 흐름으로 처리).
export function validateProfileFields(input: { name?: unknown; phone?: unknown; position?: unknown }): string | null {
  if (input.name !== undefined) {
    if (typeof input.name !== 'string' || input.name.trim().length === 0) return '이름을 입력해주세요.';
    if (input.name.trim().length > 50) return '이름은 50자 이하로 입력해주세요.';
  }
  if (input.phone !== undefined && input.phone !== null && input.phone !== '') {
    if (typeof input.phone !== 'string') return '전화번호 형식이 잘못되었습니다.';
    const digits = input.phone.replace(/\D/g, '');
    if (digits.length < 9 || digits.length > 11) return '전화번호 형식이 잘못되었습니다.';
  }
  if (input.position !== undefined && input.position !== null) {
    if (typeof input.position !== 'string' || input.position.trim().length > 50) return '직책은 50자 이하로 입력해주세요.';
  }
  return null;
}
