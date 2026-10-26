import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App.js';
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


// 입력창(글자 칸)에 포커스가 가면 body에 kb-open 표시를 붙여 하단 탭을 잠시 숨긴다.
// 아이폰/안드로이드에서 키보드가 올라올 때 탭이 키보드 뒤로 밀려 가려지는 문제를 막는다.
// 체크박스·버튼 등 글자를 입력하지 않는 요소는 제외한다.
const isTypingField = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'file', 'color'].includes(type);
  }
  return false;
};
document.addEventListener('focusin', (e) => {
  if (isTypingField(e.target)) document.body.classList.add('kb-open');
});
// 입력창이 화면에서 사라질 때(탭 이동 등) 포커스 해제 신호가 안 오는 경우가 있어 탭 바가 계속 숨는 문제가 있었다.
// 화면을 누를 때마다 실제로 입력 중인 칸이 없으면 kb-open을 확실히 지운다.
document.addEventListener('pointerdown', () => {
  if (!isTypingField(document.activeElement)) document.body.classList.remove('kb-open');
}, true);
document.addEventListener('focusout', () => {
  // 한 입력창에서 다른 입력창으로 옮겨 갈 때 깜빡이지 않도록 잠깐 기다린 뒤 확인한다
  window.setTimeout(() => {
    if (!isTypingField(document.activeElement)) document.body.classList.remove('kb-open');
  }, 150);
});
