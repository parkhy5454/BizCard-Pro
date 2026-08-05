import { describe, it, expect } from 'vitest';
import { RateLimiter } from './rateLimiter';

// 테스트 안에서 시간을 마음대로 움직이기 위해 가짜 시계를 주입한다.
function fakeClock(startAt = 0) {
  let now = startAt;
  return { advance: (ms: number) => { now += ms; }, now: () => now };
}

describe('RateLimiter — 잠금(lockout) 모드 (로그인처럼 "실패만" 세는 경우)', () => {
  it('maxAttempts에 도달하기 전까지는 계속 허용한다', () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ maxAttempts: 5, windowMs: 60_000, lockoutMs: 60_000, now: clock.now });
    for (let i = 0; i < 4; i++) {
      expect(limiter.check('a').allowed).toBe(true);
      limiter.registerAttempt('a');
    }
  });

  it('maxAttempts번째 실패 이후로는 잠긴다', () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ maxAttempts: 5, windowMs: 60_000, lockoutMs: 60_000, now: clock.now });
    for (let i = 0; i < 5; i++) limiter.registerAttempt('a');
    const result = limiter.check('a');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSec).toBeGreaterThan(0);
  });

  it('잠금 시간이 지나면 다시 허용된다', () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ maxAttempts: 5, windowMs: 60_000, lockoutMs: 10_000, now: clock.now });
    for (let i = 0; i < 5; i++) limiter.registerAttempt('a');
    expect(limiter.check('a').allowed).toBe(false);
    clock.advance(10_001);
    expect(limiter.check('a').allowed).toBe(true);
  });

  it('reset()을 호출하면(로그인 성공 등) 즉시 다시 허용된다', () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ maxAttempts: 5, windowMs: 60_000, lockoutMs: 60_000, now: clock.now });
    for (let i = 0; i < 5; i++) limiter.registerAttempt('a');
    expect(limiter.check('a').allowed).toBe(false);
    limiter.reset('a');
    expect(limiter.check('a').allowed).toBe(true);
  });

  it('키(예: 이메일+IP)가 다르면 서로 영향을 주지 않는다', () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ maxAttempts: 5, windowMs: 60_000, lockoutMs: 60_000, now: clock.now });
    for (let i = 0; i < 5; i++) limiter.registerAttempt('userA::ip1');
    expect(limiter.check('userA::ip1').allowed).toBe(false);
    expect(limiter.check('userB::ip1').allowed).toBe(true);
  });
});

describe('RateLimiter — 단순 횟수 제한 모드 (가입/비번찾기처럼 "요청 자체"를 세는 경우)', () => {
  it('windowMs 안에서 maxAttempts를 넘기면 막는다', () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ maxAttempts: 3, windowMs: 60_000, now: clock.now });
    limiter.registerAttempt('ip1');
    limiter.registerAttempt('ip1');
    limiter.registerAttempt('ip1');
    expect(limiter.check('ip1').allowed).toBe(false);
  });

  it('시간 창(window)이 지나면 카운트가 초기화된다', () => {
    const clock = fakeClock();
    const limiter = new RateLimiter({ maxAttempts: 3, windowMs: 60_000, now: clock.now });
    limiter.registerAttempt('ip1');
    limiter.registerAttempt('ip1');
    limiter.registerAttempt('ip1');
    expect(limiter.check('ip1').allowed).toBe(false);
    clock.advance(60_001);
    expect(limiter.check('ip1').allowed).toBe(true);
  });
});
