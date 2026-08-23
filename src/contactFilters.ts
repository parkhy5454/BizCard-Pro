import { BusinessCard, ContactGroup } from './types.js';

// [추가] "관계 인텔리전스"(CardGrid의 "지금 챙기면 좋은 거래처" 패널, AIIntelligenceView의
// "기업 인텔리전스"·"관계·영업 인텔리전스" 탭)에서 분석 대상으로 삼지 않을 명함을 걸러내는
// 공용 로직. 두 군데 이상에서 똑같은 기준을 써야 하므로 한 곳에 모아둔다.
//
// [수정] 원래는 회사(company) 계정에 한해 "나만 보기" 그룹뿐 아니라 은행/보험/컨설팅,
// 인증/연구소/협회 그룹까지 통째로 제외했었다. 하지만 그 카테고리 제외는 전체 직원에게
// 일괄 적용되는 "전부 아니면 전무" 방식이라 유연하지 않다는 피드백이 있었고, 대신 각 직원이
// 패널에서 "이 거래처는 그만 알려줘" 식으로 건별로 직접 해제할 수 있게 되었으므로(CardGrid.tsx의
// intelDismissedContactIds, localStorage 기반) 카테고리 통째 제외는 더 이상 필요 없다.
// 이제 "나만 보기(비공개)" 그룹만 제외한다 - 이건 애초에 등록한 사람 외에는 API 단에서
// 아예 안 보이는 그룹이라(server.ts의 GET /api/contacts·/api/groups), 이 규칙을 적용해도
// "등록한 사람 본인 화면에서만" 실제로 영향을 준다 - 결과적으로 개인별로 다르게 적용된다.
export function getIntelExcludedGroupIds(groups: ContactGroup[], userType?: 'individual' | 'company'): Set<string> {
  // 개인 계정은 제외 규칙을 적용하지 않는다 (모든 명함을 관계 인텔리전스에 포함).
  if (userType !== 'company') return new Set();
  return new Set(groups.filter((g) => g.isPrivate).map((g) => g.id));
}

export function filterContactsForIntel(
  contacts: BusinessCard[],
  groups: ContactGroup[],
  userType?: 'individual' | 'company'
): BusinessCard[] {
  const excludedGroupIds = getIntelExcludedGroupIds(groups, userType);
  if (excludedGroupIds.size === 0) return contacts;
  return contacts.filter((c) => !(c.groupIds || []).some((gid) => excludedGroupIds.has(gid)));
}
