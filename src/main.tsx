import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App.tsx';
import './index.css';

// ------------------------------------------------------------------
// 🚨 자동 에러 모니터링(Sentry) — 화면(브라우저)에서 나는 에러(예: 버튼 눌렀는데
// 화면이 하얗게 변하는 것 같은 문제)도 자동으로 잡아서 알림 받기 위한 설정.
// VITE_SENTRY_DSN 환경변수가 없으면 조용히 비활성화되고(로컬 개발 등), 있으면 켜진다.
// [수정] 서버(server.ts)에서 쓰는 SENTRY_DSN과는 별개의 환경변수(VITE_SENTRY_DSN)를 쓴다.
// Vite는 브라우저 코드에 "VITE_"로 시작하는 환경변수만 포함시켜주기 때문이다.
// ------------------------------------------------------------------
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1
  });
  console.log('[Sentry] 화면(프론트엔드) 에러 모니터링이 활성화되었습니다.');
} else {
  console.log('[Sentry] VITE_SENTRY_DSN 환경변수가 없어 화면 에러 모니터링이 비활성화되어 있습니다.');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* [수정] React 컴포넌트에서 처리되지 않은 에러가 나면, 앱 전체가 하얗게 변하는 대신
        "문제가 생겼어요" 안내 화면을 보여주고, 동시에 Sentry로 자동 보고한다. */}
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '16px',
          background: '#020617', color: '#e2e8f0', padding: '24px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '40px' }}>⚠️</div>
          <h2 style={{ fontSize: '18px', fontWeight: 700 }}>일시적인 문제가 발생했어요</h2>
          <p style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '360px' }}>
            방금 발생한 문제는 자동으로 개발팀에 전달되었어요. 아래 버튼을 눌러 다시 시도해주세요.
          </p>
          <button
            onClick={resetError}
            style={{
              padding: '10px 20px', borderRadius: '12px', border: 'none',
              background: '#4f46e5', color: 'white', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
            }}
          >
            다시 시도
          </button>
        </div>
      )}
    >
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>,
);

// [추가] PWA 서비스워커 등록. 이게 있어야 브라우저(특히 Android/Chrome)가 "홈 화면에
// 추가" 설치를 제안해준다. 실패해도(구형 브라우저 등) 앱 자체 동작에는 영향 없으므로
// 조용히 무시한다.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[PWA] 서비스워커 등록 실패:', err);
    });
  });
}

