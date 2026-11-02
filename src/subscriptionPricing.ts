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
export const TEAM_MIN_SEATS = 3;
export const TEAM_TIERS = [
  { minSeats: 3, maxSeats: 9, monthlyPerSeat: 2500 },
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

// 기간 중 인원 추가 금액 (일할 계산, 원 단위 내림)
// 추가되는 인원에 "추가 후 인원 구간"의 단가 + 계약 기간 할인율을 적용한다. 만료일은 바뀌지 않는다.
// 기존 인원의 단가 정산(구간이 내려갈 때의 차액)은 아직 정하지 않아 여기서는 다루지 않는다.
export function getAddSeatCharge(params: {
  seatsAdded: number;
  currentSeats: number;
  period: Period;
  remainingDays: number;
}): number {
  const { seatsAdded, currentSeats, period, remainingDays } = params;
  if (seatsAdded <= 0 || remainingDays <= 0) return 0;
  // 추가 후 전체 인원 기준의 구간 단가를 적용한다 (예: 9명 → 10명이 되면 10~29명 단가)
  const monthly = getTeamMonthlyPerSeat(currentSeats + seatsAdded);
  const effectiveMonthly = monthly * (1 - PERIOD_DISCOUNT[period]);
  return Math.floor((effectiveMonthly / 30) * remainingDays * seatsAdded);
}
