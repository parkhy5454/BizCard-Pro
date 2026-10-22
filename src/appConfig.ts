// 앱의 공개 주소를 한 곳에서 관리한다. 주소를 바꿀 때는 이 파일만 고치면 된다.
// (서버는 환경변수 APP_BASE_URL을 우선 쓰고, 이 값은 클라이언트의 공유 문구·링크에 쓰인다)
export const APP_PUBLIC_URL = 'https://app.bizcardai.kr';

// 카카오 공유에 쓰는 썸네일 이미지 (public/ 폴더의 파일을 앱 주소에서 바로 제공)
export const APP_SHARE_THUMB_URL = `${APP_PUBLIC_URL}/kakao-share-thumb.png`;
