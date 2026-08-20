import { BusinessCard, ContactGroup } from './types.js';

// [추가] "관계 인텔리전스"(CardGrid의 "지금 챙기면 좋은 거래처" 패널, AIIntelligenceView의
// "기업 인텔리전스"·"관계·영업 인텔리전스" 탭)에서 분석 대상으로 삼지 않을 명함을 걸러내는
// 공용 로직. 두 군데 이상에서 똑같은 기준을 써야 하므로 한 곳에 모아둔다.
//
// [수정] 이 제외 규칙은 "회사(company)" 계정에만 적용한다. 개인(individual) 계정은
// 혼자 쓰는 계정이라 "나만 보기" 그룹을 굳이 나눌 의미가 없고, 은행/보험/컨설팅 같은
// 카테고리 제외도 필요 없다는 요청이 있어서, 개인 계정은 모든 명함을 그대로 분석 대상으로
// 쓴다.
//
// 제외 대상 (회사 계정에만 적용):
// 1) "나만 보기(비공개)" 그룹에 속한 명함 - 교회/동창회/동호회 등 개인적인 인맥이라
//    영업 분석과 무관함
// 2) 은행/보증/보험/컨설팅/투자/변호사/변리사, 인증/연구소/협회 그룹에 속한 명함 - 실제
//    영업 대상 "거래처"가 아니라 자문/제휴 성격의 기관이라, "지금 챙겨야 할 거래처" 랭킹에
//    섞이면 분석이 흐려지기 때문
//
// 그룹 이름으로 매칭하기 때문에, 그룹 이름을 바꾸면 이 목록도 같이 바꿔줘야 한다.
const INTEL_EXCLUDED_GROUP_NAMES = new Set<string>([
  '은행/보증/보험/컨설팅/투자/변호사/변리사',
  '인증/연구소/협회'
]);

export function getIntelExcludedGroupIds(groups: ContactGroup[], userType?: 'individual' | 'company'): Set<string> {
  // 개인 계정은 제외 규칙을 적용하지 않는다 (모든 명함을 관계 인텔리전스에 포함).
  if (userType !== 'company') return new Set();
  return new Set(
    groups
      .filter((g) => g.isPrivate || INTEL_EXCLUDED_GROUP_NAMES.has(g.name))
      .map((g) => g.id)
  );
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
