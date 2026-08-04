// [수정] Sentry의 "express 자동 계측(요청별 에러/성능 추적)"이 되려면, Sentry.init()이
// express보다 "먼저 실제로 실행"돼야 한다. 그런데 server.ts 안에서는 esbuild가 모든
// import문을 파일 맨 위로 끌어올려 require()로 바꾸기 때문에(호이스팅), server.ts 안에서
// import 순서를 아무리 바꿔도 실제 실행 순서는 바뀌지 않는다 — express가 먼저 require된다.
//
// 그래서 Sentry 초기화를 아예 "별도 파일"로 분리했다. server.ts의 맨 첫 줄에서
// 이 파일을 통째로 import하면, 이 파일의 내용(= Sentry.init() 실행까지) 전체가
// server.ts 자신의 나머지 import(express 포함)보다 먼저 완전히 끝난 뒤에 다음으로 넘어간다.
// (import한 모듈은 그 자리에서 끝까지 다 실행되고 나서야 다음 코드로 넘어가는 것이 ESM 규칙)
import 'dotenv/config';
import * as Sentry from '@sentry/node';

const SENTRY_DSN = process.env.SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.1 // 성능 추적은 10%만 샘플링 (에러 보고 자체는 100% 그대로 다 됨)
  });
  console.log('[Sentry] 에러 모니터링이 활성화되었습니다.');
} else {
  console.log('[Sentry] SENTRY_DSN 환경변수가 없어 에러 모니터링이 비활성화되어 있습니다.');
}

export { Sentry, SENTRY_DSN };
