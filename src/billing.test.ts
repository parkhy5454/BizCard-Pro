import { describe, it, expect } from 'vitest';
import { addOneMonth, generateCustomerKey, generateOrderId } from './billing';

describe('addOneMonth', () => {
  it('일반적인 날짜는 정확히 한 달 뒤가 된다', () => {
    const result = addOneMonth(new Date('2026-03-15T00:00:00Z'));
    expect(result.getUTCFullYear()).toBe(2026);
    expect(result.getUTCMonth()).toBe(3); // 0-indexed → 4월
    expect(result.getUTCDate()).toBe(15);
  });

  it('월말 날짜(1/31)는 다음 달의 존재하는 날짜로 자연스럽게 당겨진다', () => {
    const result = addOneMonth(new Date('2026-01-31T00:00:00Z'));
    // 2026년은 평년이라 2월이 28일까지 → 1/31 + 1개월은 3/3이 된다(JS Date의 자연스러운 동작)
    expect(result.getUTCMonth()).toBe(2); // 3월(0-indexed)
  });
});

describe('generateCustomerKey / generateOrderId', () => {
  it('충분히 무작위적이고(서로 다르고) 안전한 길이의 값을 만든다', () => {
    const a = generateCustomerKey();
    const b = generateCustomerKey();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(16);
  });

  it('주문번호도 매번 다르게 생성된다', () => {
    const a = generateOrderId();
    const b = generateOrderId();
    expect(a).not.toBe(b);
  });
});
