/**
 * 날짜 입력칸의 "오늘 날짜" 기본값을 계산할 때 쓰는 공용 유틸입니다.
 *
 * [주의] `new Date().toISOString().split('T')[0]`는 항상 UTC(세계 표준시) 기준
 * 날짜를 반환합니다. 한국(UTC+9)에서는 자정부터 오전 9시 사이에는 UTC 날짜가
 * 아직 전날이라서, 이 방식으로 "오늘 날짜"를 채우면 새벽~오전 시간대에 항상
 * 하루 전 날짜가 채워지는 문제가 있었습니다(운행기록 신규 작성 등에서 발견됨).
 * 아래 함수들은 브라우저의 로컬(사용자 위치 기준) 날짜로 계산해서 이 문제를 막습니다.
 */

// 지금 이 순간의 로컬 날짜를 'YYYY-MM-DD'로 반환합니다.
export function getTodayLocalStr(): string {
  return dateToLocalStr(new Date());
}

// 임의의 Date 객체를 로컬 기준 'YYYY-MM-DD'로 변환합니다.
export function dateToLocalStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
