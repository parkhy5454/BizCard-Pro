/**
 * 숫자만 입력해도 천단위 콤마가 자동으로 들어가는 금액 표시용 유틸입니다.
 * 예) "1300000" -> "1,300,000"
 *
 * 입력창(value)에는 formatCurrencyInput 결과를 보여주고,
 * 실제 state에는 parseCurrencyInput으로 콤마를 뺀 순수 숫자를 저장합니다.
 */
export function formatCurrencyInput(value: string | number): string {
  const digits = String(value).replace(/[^\d]/g, '');
  if (!digits) return '';
  return new Intl.NumberFormat('ko-KR').format(Number(digits));
}

export function parseCurrencyInput(value: string): number {
  const digits = value.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}
