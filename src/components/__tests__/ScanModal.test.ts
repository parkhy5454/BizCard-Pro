import { describe, it, expect } from 'vitest';
import { findDuplicateContact } from '../ScanModal.js';
import { BusinessCard } from '../../types.js';

// [수정] 명함 중복 감지 로직(findDuplicateContact) 테스트.
// 이 함수는 "이름+회사가 같거나, 핸드폰 번호가 같으면 같은 사람"으로 판단해서
// 중복 등록을 막아주는 핵심 로직이라, 여기가 깨지면 사용자가 눈치채기 어려운 채로
// 중복 명함이 계속 쌓이거나, 반대로 서로 다른 사람이 같은 사람으로 잘못 합쳐질 수 있다.

const makeExisting = (overrides: Partial<BusinessCard> = {}): BusinessCard => ({
  id: 'c-1',
  name: '홍길동',
  company: '테스트회사',
  department: '',
  title: '',
  phoneMobile: '010-1234-5678',
  phoneOffice: '',
  phoneFax: '',
  email: '',
  address: '',
  groupId: 'g-1',
  createdAt: new Date().toISOString(),
  callHistory: [],
  ...overrides
});

describe('findDuplicateContact', () => {
  it('핸드폰 번호가 같으면 이름/회사가 달라도 중복으로 감지한다', () => {
    const existing = [makeExisting({ name: '홍길동', company: 'A회사' })];
    const candidate = { name: '홍길동(오타)', company: 'B회사', phoneMobile: '010-1234-5678' };
    expect(findDuplicateContact(candidate, existing)).not.toBeNull();
  });

  it('이름+회사가 같으면(공백/대소문자 차이 무시) 중복으로 감지한다', () => {
    const existing = [makeExisting({ name: '홍길동', company: '테스트회사', phoneMobile: '010-0000-0000' })];
    const candidate = { name: ' 홍 길동 ', company: '테스트회사', phoneMobile: '010-9999-9999' };
    expect(findDuplicateContact(candidate, existing)).not.toBeNull();
  });

  it('이름/회사/전화번호가 전부 다르면 중복으로 감지하지 않는다', () => {
    const existing = [makeExisting()];
    const candidate = { name: '김철수', company: '다른회사', phoneMobile: '010-5555-5555' };
    expect(findDuplicateContact(candidate, existing)).toBeNull();
  });

  it('전화번호가 9자리 미만이면(오인식 등) 전화번호만으로는 중복 판정하지 않는다', () => {
    const existing = [makeExisting({ name: '홍길동', company: 'A회사', phoneMobile: '1234' })];
    const candidate = { name: '완전다른사람', company: '완전다른회사', phoneMobile: '1234' };
    expect(findDuplicateContact(candidate, existing)).toBeNull();
  });

  it('이름과 전화번호가 아예 없는 후보는 null을 반환한다', () => {
    const existing = [makeExisting()];
    expect(findDuplicateContact({}, existing)).toBeNull();
  });

  it('회사명 없이 이름만 같으면 중복으로 판정하지 않는다(동명이인 오탐 방지)', () => {
    const existing = [makeExisting({ name: '홍길동', company: 'A회사', phoneMobile: '010-1111-1111' })];
    const candidate = { name: '홍길동', company: '', phoneMobile: '010-2222-2222' };
    expect(findDuplicateContact(candidate, existing)).toBeNull();
  });
});
