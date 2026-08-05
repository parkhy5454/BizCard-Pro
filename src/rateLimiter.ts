// [추가] server.ts 안에 로그인/가입/비밀번호찾기/인증메일재전송마다 거의 똑같은 모양의
// 레이트리밋 코드가 4번 반복돼 있었다. 하나로 합쳐서 테스트 가능하게 만든다.
// (실제 만료/정리는 하지 않고 계속 메모리에 쌓이지만, 실무에서는 주기적으로 서버가
// 재시작되거나 이 정도 규모에서는 문제 되지 않는 수준이라 지금은 단순하게 둔다.)

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec?: number;
}

interface Entry {
  count: number;
  firstAttemptAt: number;
  lockedUntil?: number;
}

export interface RateLimiterOptions {
  maxAttempts: number;
  windowMs: number;
  // 지정하면: maxAttempts에 도달했을 때 그 시점부터 lockoutMs 동안 완전히 잠근다
  // (예: 로그인 실패). 지정 안 하면: 그냥 windowMs 안에서 maxAttempts를 못 넘게만 막는다.
  lockoutMs?: number;
  now?: () => number; // 테스트에서 시간을 주입하기 위한 훅
}

export class RateLimiter {
  private attempts = new Map<string, Entry>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly lockoutMs?: number;
  private readonly now: () => number;

  constructor(options: RateLimiterOptions) {
    this.maxAttempts = options.maxAttempts;
    this.windowMs = options.windowMs;
    this.lockoutMs = options.lockoutMs;
    this.now = options.now || (() => Date.now());
  }

  check(key: string): RateLimitResult {
    const entry = this.attempts.get(key);
    if (!entry) return { allowed: true };

    const now = this.now();
    if (entry.lockedUntil && entry.lockedUntil > now) {
      return { allowed: false, retryAfterSec: Math.ceil((entry.lockedUntil - now) / 1000) };
    }
    if (now - entry.firstAttemptAt > this.windowMs) {
      this.attempts.delete(key);
      return { allowed: true };
    }
    if (!this.lockoutMs && entry.count >= this.maxAttempts) {
      return { allowed: false, retryAfterSec: Math.ceil((entry.firstAttemptAt + this.windowMs - now) / 1000) };
    }
    return { allowed: true };
  }

  // 실패(또는 시도) 1회를 기록한다. 로그인처럼 "실패만 센다"면 실패 시에만 호출하고,
  // 가입/비번찾기처럼 "요청 자체를 센다"면 매 요청마다 호출한다.
  registerAttempt(key: string): void {
    const now = this.now();
    const entry = this.attempts.get(key);
    if (!entry || now - entry.firstAttemptAt > this.windowMs) {
      this.attempts.set(key, { count: 1, firstAttemptAt: now });
      return;
    }
    entry.count += 1;
    if (this.lockoutMs && entry.count >= this.maxAttempts) {
      entry.lockedUntil = now + this.lockoutMs;
    }
  }

  // 로그인 성공처럼, 성공하면 지금까지의 실패 기록을 지워야 하는 경우에 사용.
  reset(key: string): void {
    this.attempts.delete(key);
  }
}
