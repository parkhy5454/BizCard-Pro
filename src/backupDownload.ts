import { getTodayLocalStr } from './dateUtils.js';

// 데이터 백업 파일 내려받기. 서버(/api/backup/export)는 x-user-id 헤더가 필요해서
// <a href>로는 받을 수 없으므로 fetch 결과를 blob으로 만들어 다운로드를 흉내낸다.
// 실패하면 예외를 던지고, 화면 쪽에서 알림을 띄운다.
export const downloadBackup = async (userId: string): Promise<void> => {
  const res = await fetch('/api/backup/export', { headers: { 'x-user-id': userId } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `백업에 실패했습니다 (상태: ${res.status}).`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bizcard-backup-${getTodayLocalStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
