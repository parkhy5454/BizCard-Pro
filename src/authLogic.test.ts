import { describe, it, expect } from 'vitest';
import { scopeIdForUser, decideSignupRoleAndApproval, isEmailVerified, isSameScope } from './authLogic';

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
