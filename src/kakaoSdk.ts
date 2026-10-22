// 카카오 JavaScript SDK를 필요할 때 한 번만 불러오는 공용 로더.
// 여러 화면(친구 추천, 명함 공유)이 같은 코드를 나눠 쓰도록 한 곳에 모았다.

const KAKAO_JS_KEY = 'cb1b045b76bfb5a7d4deaf6985b50a2a';

// 카카오 SDK가 window.Kakao에 붙여 주는 객체 중 우리가 쓰는 부분만 정의한다
export interface KakaoSdk {
  isInitialized(): boolean;
  init(appKey: string): void;
  Share: { sendDefault(options: Record<string, unknown>): void };
}

interface KakaoWindow extends Window {
  Kakao?: KakaoSdk;
  __kakaoSdkLoadingPromise?: Promise<void>;
}

// SDK가 준비될 때까지 기다린다. 이미 준비되어 있으면 바로 끝난다.
export const loadKakaoSdk = (): Promise<void> => {
  const w = window as KakaoWindow;
  if (w.Kakao && w.Kakao.isInitialized && w.Kakao.isInitialized()) return Promise.resolve();
  if (w.__kakaoSdkLoadingPromise) return w.__kakaoSdkLoadingPromise;
  w.__kakaoSdkLoadingPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      try {
        if (!w.Kakao) throw new Error('카카오 SDK 초기화에 실패했습니다.');
        if (!w.Kakao.isInitialized()) w.Kakao.init(KAKAO_JS_KEY);
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    script.onerror = () => reject(new Error('카카오 SDK 로드 실패'));
    document.body.appendChild(script);
  });
  return w.__kakaoSdkLoadingPromise;
};

// 공유 메시지를 보낼 때 쓰는 SDK 객체를 가져온다 (로드가 끝난 뒤에 호출)
export const getKakaoSdk = (): KakaoSdk => {
  const w = window as KakaoWindow;
  if (!w.Kakao) throw new Error('카카오 SDK가 준비되지 않았습니다.');
  return w.Kakao;
};
