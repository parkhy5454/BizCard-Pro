import { BusinessCard, MyProfile } from './types.js';

// [추가] 명함 사진은 실제로는 Supabase Storage의 길고 복잡한 서명 URL(토큰 포함)에
// 저장돼 있다. 이 URL을 <img src>에 그대로 쓰면, 사진을 길게 눌렀을 때 뜨는
// "저장/공유/복사" 메뉴 위에 저 긴 URL이 그대로 노출돼서 지저분해 보였다. 대신 우리
// 서버의 짧고 깔끔한 주소로 접근하게 하고, 서버가 실제 Supabase 주소로 리다이렉트해준다.
// - base64(data:) 상태거나 아직 값이 없으면, 프록시를 거칠 이유가 없으니 그대로 반환한다
//   (프록시는 "이미 저장된 실제 URL"이 있을 때만 의미가 있다).
export function getContactImageProxyUrl(contact: Pick<BusinessCard, 'id' | 'frontImage' | 'backImage'>, side: 'front' | 'back'): string | undefined {
  const raw = side === 'front' ? contact.frontImage : contact.backImage;
  if (!raw || raw.startsWith('data:')) return raw;
  return `/api/img/contacts/${contact.id}/${side}`;
}

export function getMyProfileImageProxyUrl(profile: Pick<MyProfile, 'frontImage' | 'backImage'> | null | undefined, side: 'front' | 'back'): string | undefined {
  if (!profile) return undefined;
  const raw = side === 'front' ? profile.frontImage : profile.backImage;
  if (!raw || raw.startsWith('data:')) return raw;
  return `/api/img/my-profile/${side}`;
}
