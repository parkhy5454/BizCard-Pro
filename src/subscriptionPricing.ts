// 구독 상품 가격 계산 (부가세 포함 가격, 원 단위)
// 기준: 개인 상품 + 팀 상품(인원 구간별 단가 · 전체 인원 적용) + 기간 중 인원 추가 일할 계산

export type Period = 3 | 6 | 12;

// 개인 상품 (1인)
export const INDIVIDUAL_PLANS: Record<Period, { name: string; price: number }> = {
  3: { name: '베이직', price: 9900 },
  6: { name: '스탠다드', price: 17800 },
  12: { name: '프리미엄', price: 29700 },
};

// 팀 상품: 인원당 월 단가 (전체 인원에 구간 단가 적용)
export const TEAM_MIN_SEATS = 2;
export const TEAM_TIERS = [
  { minSeats: 2, maxSeats: 9, monthlyPerSeat: 2500 },
  { minSeats: 10, maxSeats: 29, monthlyPerSeat: 2200 },
  { minSeats: 30, maxSeats: Infinity, monthlyPerSeat: 2000 },
] as const;

// 기간별 할인율
export const PERIOD_DISCOUNT: Record<Period, number> = { 3: 0, 6: 0.1, 12: 0.25 };

export function getTeamMonthlyPerSeat(seats: number): number {
  const tier = TEAM_TIERS.find((t) => seats >= t.minSeats && seats <= t.maxSeats);
  if (!tier) throw new Error(`팀 상품은 최소 ${TEAM_MIN_SEATS}명 이상이어야 합니다.`);
  return tier.monthlyPerSeat;
}

// 인원당 할인 적용 후 금액 (기간 전체)
export function getTeamPerSeatTotal(seats: number, period: Period): number {
  const monthly = getTeamMonthlyPerSeat(seats);
  return Math.floor(monthly * period * (1 - PERIOD_DISCOUNT[period]));
}

// 팀 상품 총액
export function getTeamTotal(seats: number, period: Period): number {
  return getTeamPerSeatTotal(seats, period) * seats;
}

// 기간 중 인원 추가 시 정산 금액 (남은 기간 일할 계산, 원 단위 내림)
// 추가 후 전체 인원에 새 구간 단가를 적용한다.
//  - 양수: 추가로 결제할 금액 (예: 같은 구간 안에서 인원 추가)
//  - 음수: 구간이 내려가면서 생긴 차액 (기존 인원 포함) — 환불 또는 크레딧 처리 필요
// 만료일은 바뀌지 않는다.
export function getAddSeatAdjustment(params: {
  seatsAdded: number;
  currentSeats: number;
  period: Period;
  remainingDays: number;
}): number {
  const { seatsAdded, currentSeats, period, remainingDays } = params;
  if (seatsAdded <= 0 || remainingDays <= 0) return 0;
  const discount = 1 - PERIOD_DISCOUNT[period];
  const newSeats = currentSeats + seatsAdded;
  const oldMonthlyTotal = getTeamMonthlyPerSeat(currentSeats) * currentSeats * discount;
  const newMonthlyTotal = getTeamMonthlyPerSeat(newSeats) * newSeats * discount;
  const diffMonthly = Math.round((newMonthlyTotal - oldMonthlyTotal) * 100) / 100;
  return Math.floor((diffMonthly * remainingDays) / 30);
}

// 크레딧 정산 (정책: 음수 차액은 환불하지 않고 크레딧으로 적립, 다음 결제·인원 추가 때 차감)
// charge: getAddSeatAdjustment 결과 또는 다음 결제 금액 / credit: 현재 보유 크레딧
export function settleWithCredit(charge: number, credit: number): { payable: number; credit: number } {
  if (charge < 0) {
    return { payable: 0, credit: credit + -charge };
  }
  const used = Math.min(credit, charge);
  return { payable: charge - used, credit: credit - used };
}
