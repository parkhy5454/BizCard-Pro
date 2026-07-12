/**
 * 숫자만 입력해도 한국 전화번호 형식(하이픈 자동 삽입)으로 변환합니다.
 * 예) "01034564567" -> "010-3456-4567"
 * 예) "0212345678"  -> "02-1234-5678" (서울 지역번호)
 * 예) "031784111"   -> "031-784-111" (경기 등 3자리 지역번호, 입력 중)
 *
 * 이미 하이픈이 섞여 입력돼도 숫자만 추출해서 다시 규칙대로 조립하므로
 * 붙여넣기(paste)된 번호도 동일하게 정리됩니다.
 */
export function formatPhoneNumber(value: string): string {
  const numbers = value.replace(/[^\d]/g, '').slice(0, 11);

  if (numbers.startsWith('02')) {
    // 서울 지역번호 (02-XXX-XXXX 또는 02-XXXX-XXXX)
    if (numbers.length <= 2) return numbers;
    if (numbers.length <= 5) return `${numbers.slice(0, 2)}-${numbers.slice(2)}`;
    if (numbers.length <= 9) return `${numbers.slice(0, 2)}-${numbers.slice(2, 5)}-${numbers.slice(5)}`;
    return `${numbers.slice(0, 2)}-${numbers.slice(2, 6)}-${numbers.slice(6, 10)}`;
  }

  // 휴대폰(010 등) 및 그 외 3자리 지역번호(031/032/053 등)
  if (numbers.length <= 3) return numbers;
  if (numbers.length <= 7) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;
  if (numbers.length <= 10) return `${numbers.slice(0, 3)}-${numbers.slice(3, 6)}-${numbers.slice(6)}`;
  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
}
