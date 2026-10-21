// [추가] 명함(BusinessCard) 1건을 vCard(.vcf) 텍스트/파일로 만드는 공용 유틸.
// 캠카드의 "아이폰에 저장" 버튼과 동일하게, 명함을 앱에 저장할 때뿐 아니라 아이폰(iOS)
// 연락처 앱에도 한 번의 클릭으로 저장할 수 있게 하기 위한 기능이다.
//
// 예전에는 CardDetailModal.tsx 안에 이미 비슷한 vCard 생성 함수가 있었는데(명함 "전달하기"
// 기능에서 Web Share API로 vCard 파일을 함께 보낼 때 씀), 사진이 base64로 남아있는 경우만
// 처리하고 있어서 - 명함 사진이 Storage URL로 옮겨간 뒤로는(대부분의 경우) PHOTO 필드가
// 통째로 비어버리는 문제가 있었다. ShareMyCardModal.tsx(내 명함 공유)에서는 이미 두 경우
// 모두 처리하고 있었어서, 이 파일로 로직을 하나로 합쳐 CardDetailModal.tsx/CardGrid.tsx가
// 함께 쓰게 한다.
import { BusinessCard } from './types.js';

export function generateContactVCardText(contact: BusinessCard): string {
  let photoLine = '';
  if (contact.frontImage) {
    const base64Match = contact.frontImage.match(/^data:image\/(\w+);base64,(.+)$/);
    if (base64Match) {
      const [, imgType, base64Data] = base64Match;
      const vcardImgType = imgType.toLowerCase() === 'jpg' ? 'JPEG' : imgType.toUpperCase();
      photoLine = `PHOTO;ENCODING=b;TYPE=${vcardImgType}:${base64Data}`;
    } else if (/^https?:\/\//i.test(contact.frontImage)) {
      photoLine = `PHOTO;VALUE=URI:${contact.frontImage}`;
    }
  }
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${contact.name}`,
    `N:${contact.name};;;;`,
    `ORG:${contact.company || ''};${contact.department || ''}`,
    `TITLE:${contact.title || ''}`,
    contact.phoneMobile ? `TEL;TYPE=CELL:${contact.phoneMobile}` : '',
    contact.phoneOffice ? `TEL;TYPE=WORK:${contact.phoneOffice}` : '',
    contact.phoneFax ? `TEL;TYPE=FAX:${contact.phoneFax}` : '',
    contact.email ? `EMAIL;TYPE=PREF,INTERNET:${contact.email}` : '',
    contact.address ? `ADR;TYPE=WORK:;;${contact.address};;;;` : '',
    contact.website ? `URL:${contact.website.startsWith('http') ? contact.website : `https://${contact.website}`}` : '',
    contact.memo ? `NOTE:${contact.memo}` : '',
    photoLine,
    'END:VCARD'
  ].filter(Boolean).join('\r\n');
}

// 명함 1건을 .vcf 파일로 바로 다운로드한다. 아이폰(iOS Safari)에서는 이 파일을 받으면
// "연락처에 추가" 미리보기 화면이 바로 뜨고, 안드로이드/PC에서도 기본 연락처 앱이나 vCard를
// 지원하는 프로그램으로 바로 열린다 - 캠카드의 "아이폰에 저장" 버튼과 동일한 동작.
// (내보내기 등 다른 다운로드 기능과 동일하게 Blob + 임시 <a> 클릭 방식을 쓴다.)
export function downloadContactVCard(contact: BusinessCard): void {
  const vcardText = generateContactVCardText(contact);
  const blob = new Blob([vcardText], { type: 'text/vcard;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(contact.name || '명함').trim()}.vcf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
