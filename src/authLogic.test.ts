import { describe, it, expect } from 'vitest';
import { scopeIdForUser, decideSignupRoleAndApproval, isEmailVerified, isSameScope, isValidEmail, validateProfileFields } from './authLogic.js';

describe('scopeIdForUser', () => {
  it('회사 계정은 사업자번호 기준 스코프를 반환한다', () => {
    expect(scopeIdForUser({ id: 'u1', type: 'company', businessNumber: '123-45-67890' }))
      .toBe('company:123-45-67890');
  });

  it('사업자번호 앞뒤 공백은 제거한다', () => {
    expect(scopeIdForUser({ id: 'u1', type: 'company', businessNumber: '  123-45-67890  ' }))
      .toBe('company:123-45-67890');
  });

  it('개인 계정은 본인 id 기준 스코프를 반환한다', () => {
    expect(scopeIdForUser({ id: 'user-abc', type: 'individual' })).toBe('individual:user-abc');
  });
});

describe('decideSignupRoleAndApproval — 회원가입 시 권한 자동 결정 (클라이언트 값 신뢰 안 함)', () => {
  it('개인 계정은 role/승인상태 개념이 없다', () => {
    expect(decideSignupRoleAndApproval('individual', false)).toEqual({ role: undefined, approvalStatus: undefined });
    expect(decideSignupRoleAndApproval('individual', true)).toEqual({ role: undefined, approvalStatus: undefined });
  });

  it('그 회사의 첫 가입자는 즉시 승인된 관리자가 된다', () => {
    expect(decideSignupRoleAndApproval('company', false)).toEqual({ role: 'admin', approvalStatus: 'approved' });
  });

  it('이미 같은 회사 사람이 있으면 승인 대기 상태의 일반 사용자가 된다', () => {
    expect(decideSignupRoleAndApproval('company', true)).toEqual({ role: 'member', approvalStatus: 'pending' });
  });
});

describe('isEmailVerified', () => {
  it('명시적으로 false일 때만 미인증으로 취급한다', () => {
    expect(isEmailVerified(false)).toBe(false);
  });

  it('true는 인증된 것으로 취급한다', () => {
    expect(isEmailVerified(true)).toBe(true);
  });

  it('undefined(이 기능 생기기 전 기존 계정)는 인증된 것으로 간주한다', () => {
    expect(isEmailVerified(undefined)).toBe(true);
  });
});

describe('isSameScope', () => {
  it('같은 사업자번호면 같은 스코프로 본다', () => {
    const a = { id: 'u1', type: 'company' as const, businessNumber: '111-11-11111' };
    const b = { id: 'u2', type: 'company' as const, businessNumber: '111-11-11111' };
    expect(isSameScope(a, b)).toBe(true);
  });

  it('사업자번호가 다르면 다른 스코프로 본다', () => {
    const a = { id: 'u1', type: 'company' as const, businessNumber: '111-11-11111' };
    const b = { id: 'u2', type: 'company' as const, businessNumber: '222-22-22222' };
    expect(isSameScope(a, b)).toBe(false);
  });

  it('회사 계정과 개인 계정은 절대 같은 스코프가 될 수 없다', () => {
    const a = { id: 'u1', type: 'company' as const, businessNumber: '111-11-11111' };
    const b = { id: 'u1', type: 'individual' as const };
    expect(isSameScope(a, b)).toBe(false);
  });
});

describe('isValidEmail — 이메일 형식 검사', () => {
  it('정상 형식은 통과한다', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
  });
  it('@나 도메인이 없으면 거부한다', () => {
    expect(isValidEmail('userexample.com')).toBe(false);
    expect(isValidEmail('user@example')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });
});

describe('validateProfileFields — 프로필 저장 입력값 검증', () => {
  it('값이 없는(undefined) 항목은 검사하지 않는다', () => {
    expect(validateProfileFields({})).toBeNull();
  });
  it('이름이 비어 있거나 공백뿐이면 거부한다', () => {
    expect(validateProfileFields({ name: '' })).not.toBeNull();
    expect(validateProfileFields({ name: '   ' })).not.toBeNull();
  });
  it('이름이 50자를 넘으면 거부한다', () => {
    expect(validateProfileFields({ name: 'a'.repeat(51) })).not.toBeNull();
    expect(validateProfileFields({ name: 'a'.repeat(50) })).toBeNull();
  });
  it('전화번호는 하이픈이 있어도 숫자 9~11자리면 통과한다', () => {
    expect(validateProfileFields({ phone: '010-1234-5678' })).toBeNull();
    expect(validateProfileFields({ phone: '02-123-4567' })).toBeNull();
  });
  it('전화번호가 너무 짧거나 길면 거부한다', () => {
    expect(validateProfileFields({ phone: '010-12' })).not.toBeNull();
    expect(validateProfileFields({ phone: '010-1234-567890' })).not.toBeNull();
  });
  it('전화번호를 비우는 것(빈 문자열)은 허용한다 — 번호 삭제 의미', () => {
    expect(validateProfileFields({ phone: '' })).toBeNull();
  });
  it('직책이 50자를 넘으면 거부한다', () => {
    expect(validateProfileFields({ position: 'b'.repeat(51) })).not.toBeNull();
  });
  it('문자열이 아닌 값은 거부한다', () => {
    expect(validateProfileFields({ name: 123 })).not.toBeNull();
    expect(validateProfileFields({ phone: 123 })).not.toBeNull();
  });
});
