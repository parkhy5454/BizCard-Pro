// 구독 상품 가격 (원 단위). 최종 운영안 기준.
//  - 개인 Pro: 월 9,900원 / 연간 99,000원(10개월분) — 부가세 포함 판매가
//  - 팀 Business: 1인 월 공급가 9,900원 / 연간 99,000원 — 부가세 별도 (결제액 = 공급가 × 1.1)
//  - 팀은 2~900명, 1팀 최대 900명 (월 결제 1,000만 원 이하 보장)

export const TEAM_MIN_SEATS = 2;
export const TEAM_MAX_SEATS = 900;
export const VAT_RATE = 0.1;

export const INDIVIDUAL_MONTHLY_PRICE = 9900;
export const INDIVIDUAL_ANNUAL_PRICE = 99000;
export const TEAM_MONTHLY_SUPPLY_PER_SEAT = 9900;
export const TEAM_ANNUAL_SUPPLY_PER_SEAT = 99000;

// 팀 1인 결제액(부가세 포함)
export function getTeamMonthlyPerSeat(seats: number): number {
  assertTeamSeats(seats);
  return Math.round(TEAM_MONTHLY_SUPPLY_PER_SEAT * (1 + VAT_RATE));
}
export function getTeamAnnualPerSeat(seats: number): number {
  assertTeamSeats(seats);
  return Math.round(TEAM_ANNUAL_SUPPLY_PER_SEAT * (1 + VAT_RATE));
}

function assertTeamSeats(seats: number) {
  if (!Number.isInteger(seats) || seats < TEAM_MIN_SEATS) {
    throw new Error(`팀 상품은 최소 ${TEAM_MIN_SEATS}명 이상이어야 합니다.`);
  }
  if (seats > TEAM_MAX_SEATS) {
    throw new Error(`팀 상품은 1팀 최대 ${TEAM_MAX_SEATS}명까지 신청할 수 있습니다.`);
  }
}

// 정기결제(월 자동결제) 금액 (부가세 포함)
export function getMonthlyBillingAmount(seats: number): number {
  if (seats <= 1) return INDIVIDUAL_MONTHLY_PRICE;
  return getTeamMonthlyPerSeat(seats) * seats;
}

// 연간 선결제 금액 (10개월분, 부가세 포함)
export function getAnnualBillingAmount(seats: number): number {
  if (seats <= 1) return INDIVIDUAL_ANNUAL_PRICE;
  return getTeamAnnualPerSeat(seats) * seats;
}

// 크레딧 정산 (정책: 음수 차액은 환불하지 않고 크레딧으로 적립, 다음 결제·인원 추가 때 차감)
// charge: 다음 결제 금액 / credit: 현재 보유 크레딧
export function settleWithCredit(charge: number, credit: number): { payable: number; credit: number } {
  if (charge < 0) {
    return { payable: 0, credit: credit + -charge };
  }
  const used = Math.min(credit, charge);
  return { payable: charge - used, credit: credit - used };
}
