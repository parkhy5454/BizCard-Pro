import { BusinessCard } from './types.js';

// [추가] 원래는 IOModal.tsx 안에만 있던 함수였는데, "가져오기 할 때 딱 한 번만 그려지고
// 나중에 이름 등을 수정해도 사진은 그대로 남는" 문제가 있었다. 그래서 이 함수를 공용으로
// 빼서, CardDetailModal에서 수정 저장할 때도 같은 방식으로 다시 그릴 수 있게 한다.

const ACCENT_COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

function pickAccentColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return ACCENT_COLORS[hash % ACCENT_COLORS.length];
}

// 이름/회사/연락처 정보로 정형화된 명함 이미지를 캔버스로 그려서 데이터 URL로 반환
export function generateStandardCardImage(c: BusinessCard): string {
  const canvas = document.createElement('canvas');
  const W = 1050, H = 662; // 실제 명함과 동일한 1.586 : 1 비율
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const accent = pickAccentColor(c.company || c.name || 'x');

  // 배경
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // 왼쪽 세로 악센트 바 (회사/이름에 따라 색이 달라져서 시각적으로 구분됨)
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 22, H);

  // 회사명
  if (c.company) {
    ctx.fillStyle = accent;
    ctx.font = 'bold 32px "Malgun Gothic", sans-serif';
    ctx.fillText(c.company, 68, 88);
  }

  // 성명
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 56px "Malgun Gothic", sans-serif';
  ctx.fillText(c.name || '이름없음', 68, 188);

  // 직책 · 부서
  const titleLine = [c.title, c.department].filter(Boolean).join(' · ');
  if (titleLine) {
    ctx.fillStyle = '#6b7280';
    ctx.font = '28px "Malgun Gothic", sans-serif';
    ctx.fillText(titleLine, 68, 232);
  }

  // 구분선
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(68, 300);
  ctx.lineTo(W - 60, 300);
  ctx.stroke();

  // 연락처 정보
  ctx.font = '25px "Malgun Gothic", sans-serif';
  ctx.fillStyle = '#374151';
  let y = 360;
  const lineHeight = 48;
  if (c.phoneMobile) { ctx.fillText(`M   ${c.phoneMobile}`, 68, y); y += lineHeight; }
  if (c.phoneOffice) { ctx.fillText(`T   ${c.phoneOffice}`, 68, y); y += lineHeight; }
  if (c.phoneFax) { ctx.fillText(`F   ${c.phoneFax}`, 68, y); y += lineHeight; }
  if (c.email) { ctx.fillText(`E   ${c.email}`, 68, y); y += lineHeight; }
  if (c.address) {
    ctx.font = '21px "Malgun Gothic", sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.fillText(`A   ${c.address.length > 42 ? c.address.slice(0, 42) + '…' : c.address}`, 68, y);
    y += 34;
  }
  // [수정] 주소가 없는 명함이면 y가 증가되지 않은 채로 홈페이지를 그려서, 바로 위 줄
  // (이메일 등)과 겹쳐 사실상 안 보이는 버그가 있었다. "주소가 있었을 때"와 동일한
  // 간격만큼 항상 내려가도록 고쳤다.
  if (c.website) {
    if (!c.address) y += 6; // 주소 줄이 없으면 살짝만 더 띄워서 바로 위 줄과 안 붙게 함
    ctx.font = '21px "Malgun Gothic", sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.fillText(`W   ${c.website}`, 68, y);
  }

  // 우측 하단 "가져온 연락처" 표시 (실제 명함 스캔과 구분되도록)
  ctx.font = '18px "Malgun Gothic", sans-serif';
  ctx.fillStyle = '#d1d5db';
  ctx.textAlign = 'right';
  ctx.fillText('가져온 연락처 · 사진 없음', W - 40, H - 30);
  ctx.textAlign = 'left';

  // [임시 진단용] 최신 이 파일이 실제로 배포/실행되고 있는지 명함 사진 자체에 눈에 띄게
  // 표시해서 확인하기 위함. 확인되면 제거할 예정.
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, H - 60, W, 60);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px "Malgun Gothic", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🔴 진단마커 v3 - 이 빨간 줄이 보이면 최신 코드입니다', W / 2, H - 22);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/png');
}
