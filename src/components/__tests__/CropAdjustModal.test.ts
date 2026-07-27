import { describe, it, expect } from 'vitest';
import { isValidNormalizedCorners } from '../CropAdjustModal.js';

// [수정] AI가 알려주는 "명함/영수증 네 꼭짓점 좌표"의 유효성 검사(isValidNormalizedCorners) 테스트.
// 이 함수가 잘못된 좌표를 걸러내지 못하면, 사진이 이상하게 잘리거나 앱이 깨질 수 있다.

const validQuad = {
  topLeft: { x: 0.05, y: 0.08 },
  topRight: { x: 0.95, y: 0.1 },
  bottomRight: { x: 0.93, y: 0.9 },
  bottomLeft: { x: 0.04, y: 0.88 }
};

describe('isValidNormalizedCorners', () => {
  it('정상적인 사각형 좌표는 유효하다고 판단한다', () => {
    expect(isValidNormalizedCorners(validQuad)).toBe(true);
  });

  it('꼭짓점이 하나라도 빠져있으면 무효로 판단한다', () => {
    const { bottomLeft, ...missingOne } = validQuad;
    expect(isValidNormalizedCorners(missingOne)).toBe(false);
  });

  it('null이나 undefined는 무효로 판단한다', () => {
    expect(isValidNormalizedCorners(null)).toBe(false);
    expect(isValidNormalizedCorners(undefined)).toBe(false);
  });

  it('좌표값이 숫자가 아니면 무효로 판단한다', () => {
    const bad = { ...validQuad, topLeft: { x: 'oops', y: 0.1 } };
    expect(isValidNormalizedCorners(bad)).toBe(false);
  });

  it('좌표값이 정상 범위(약 -0.05~1.05)를 크게 벗어나면 무효로 판단한다', () => {
    const bad = { ...validQuad, topRight: { x: 5, y: 0.1 } };
    expect(isValidNormalizedCorners(bad)).toBe(false);
  });

  it('네 점이 거의 한 점에 겹쳐있으면(면적이 너무 작으면) 무효로 판단한다', () => {
    const collapsed = {
      topLeft: { x: 0.5, y: 0.5 },
      topRight: { x: 0.501, y: 0.5 },
      bottomRight: { x: 0.501, y: 0.501 },
      bottomLeft: { x: 0.5, y: 0.501 }
    };
    expect(isValidNormalizedCorners(collapsed)).toBe(false);
  });
});
