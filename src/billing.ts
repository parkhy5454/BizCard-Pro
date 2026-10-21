import crypto from 'crypto';

// [추가] 토스페이먼츠 자동결제(빌링) API 연동. 문서: https://docs.tosspayments.com/guides/v2/billing
//
// ⚠️ 실제 운영(라이브 키)에서 "자동결제(정기결제)"를 쓰려면, 토스페이먼츠와 별도의 추가 계약이
// 필요합니다. 테스트 키로는 지금 이 코드로 바로 테스트할 수 있지만, 실제 구독료를 받으려면
// 토스페이먼츠 고객센터(1544-7772, support@tosspayments.com)에 먼저 자동결제 계약을 신청하세요.
const TOSS_API_BASE = 'https://api.tosspayments.com/v1';

function tossAuthHeader(secretKey: string): string {
  return 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64');
}

// 토스에 등록할 "구매자 식별키". 이메일/순번처럼 유추 가능한 값은 절대 쓰면 안 되고
// (다른 사람이 알아내면 그 빌링키로 결제를 요청할 위험), 충분히 무작위적인 값이어야 한다.
export function generateCustomerKey(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function generateOrderId(): string {
  return crypto.randomBytes(10).toString('hex');
}

export interface IssueBillingKeyResult {
  billingKey: string;
  card?: { company?: string; number?: string };
}

// 카드 등록창(requestBillingAuth)에서 받은 authKey를, 실제 결제에 쓸 수 있는 빌링키로 교환한다.
// 발급된 빌링키는 토스 쪽에서도 다시 조회가 안 되므로, 호출한 쪽에서 즉시 안전하게 저장해야 한다.
export async function issueBillingKey(
  secretKey: string,
  authKey: string,
  customerKey: string
): Promise<IssueBillingKeyResult> {
  const res = await fetch(`${TOSS_API_BASE}/billing/authorizations/issue`, {
    method: 'POST',
    headers: {
      Authorization: tossAuthHeader(secretKey),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ authKey, customerKey })
  });
  const data: any = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || '카드 등록(빌링키 발급)에 실패했습니다.');
  }
  return data;
}

export interface ChargeBillingParams {
  customerKey: string;
  amount: number;
  orderId: string;
  orderName: string;
  customerEmail?: string;
  customerName?: string;
}

// 발급된 빌링키로 실제 청구(결제 승인)를 요청한다. 구독 주기(예: 매달)마다 이걸 호출하면 된다.
export async function chargeBilling(
  secretKey: string,
  billingKey: string,
  params: ChargeBillingParams
): Promise<any> {
  const res = await fetch(`${TOSS_API_BASE}/billing/${billingKey}`, {
    method: 'POST',
    headers: {
      Authorization: tossAuthHeader(secretKey),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });
  const data: any = await res.json();
  if (!res.ok) {
    throw new Error(data?.message || '결제 승인에 실패했습니다.');
  }
  return data;
}

// 다음 결제일 계산: 오늘로부터 정확히 한 달 뒤. (예: 1/31 구독이면 2/28로 자연스럽게 당겨짐 —
// Date 객체의 기본 동작을 그대로 이용한다.)
export function addOneMonth(from: Date): Date {
  const d = new Date(from);
  d.setMonth(d.getMonth() + 1);
  return d;
}
