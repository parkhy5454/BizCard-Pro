import { BusinessCard } from './types.js';

// [추가] 명함이 복수 그룹에 속할 수 있게 되면서, "이 명함이 실제로 속한 그룹 id 목록"을
// 구하는 로직이 여러 화면에 반복해서 필요해졌다. 예전 데이터(groupId 단수)와 새 데이터
// (groupIds 배열)를 한 곳에서 일관되게 처리하기 위한 공용 함수로 모아둔다.
export function getContactGroupIds(contact: Pick<BusinessCard, 'groupId' | 'groupIds'>): string[] {
  if (contact.groupIds && contact.groupIds.length > 0) return contact.groupIds;
  if (contact.groupId) return [contact.groupId];
  return [];
}

// 특정 그룹에 속해있는지 여부 (필터링에 사용)
export function contactHasGroup(contact: Pick<BusinessCard, 'groupId' | 'groupIds'>, groupId: string): boolean {
  return getContactGroupIds(contact).includes(groupId);
}
