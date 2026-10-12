// [신규] 탭 정보 중앙화 - 13개 탭을 한 곳에서 관리
// 새 탭 추가 시 이 파일만 수정하면 됨

import {
  Home,
  Users,
  Car,
  Briefcase,
  FileText,
  FileSignature,
  Network,
  Megaphone,
  MessagesSquare,
  Building2,
  Calculator,
  History,
  Sparkles,
  LucideIcon
} from 'lucide-react';

// [개선] TabType을 Union으로 정의해서 타입 안정성 강화
export type TabType =
  | 'dashboard'
  | 'cards'
  | 'nearby'
  | 'groups'
  | 'io'
  | 'projects'
  | 'vehicles'
  | 'worklogs'
  | 'approvals'
  | 'management'
  | 'accounting'
  | 'audit_logs'
  | 'ai_intelligence'
  | 'org_chart'
  | 'announcements'
  | 'team_chat';

interface TabConfig {
  id: TabType;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  description: string;
  requiresAuth: boolean;
  requiresApproval: boolean;
  requiresEmailVerification: boolean;
}

export const TAB_CONFIGS: TabConfig[] = [
  { id: 'dashboard', label: '홈', shortLabel: '홈', icon: Home, description: '대시보드 및 요약', requiresAuth: true, requiresApproval: false, requiresEmailVerification: false },
  { id: 'cards', label: '전체 명함', shortLabel: '명합', icon: Users, description: '명함 관리 및 검색', requiresAuth: true, requiresApproval: false, requiresEmailVerification: false },
  { id: 'nearby', label: '주변', shortLabel: '주변', icon: Car, description: '주변 위치 확인', requiresAuth: true, requiresApproval: false, requiresEmailVerification: false },
  { id: 'groups', label: '그룹', shortLabel: '그룹', icon: Users, description: '명합 그룹 관리', requiresAuth: true, requiresApproval: false, requiresEmailVerification: false },
  { id: 'io', label: '입출력', shortLabel: '입출력', icon: FileText, description: '명합 입출력', requiresAuth: true, requiresApproval: false, requiresEmailVerification: false },
  { id: 'projects', label: '프로젝트', shortLabel: '프로젝트', icon: Briefcase, description: '프로젝트 관리', requiresAuth: true, requiresApproval: true, requiresEmailVerification: true },
  { id: 'vehicles', label: '차량 관리', shortLabel: '차량', icon: Car, description: '통합 차량 관리', requiresAuth: true, requiresApproval: true, requiresEmailVerification: true },
  { id: 'worklogs', label: '업무일지', shortLabel: '업무일지', icon: FileText, description: '업무 기록 관리', requiresAuth: true, requiresApproval: true, requiresEmailVerification: true },
  { id: 'approvals', label: '전자결재', shortLabel: '결재', icon: FileSignature, description: '전자 결재 시스템', requiresAuth: true, requiresApproval: true, requiresEmailVerification: true },
  { id: 'org_chart', label: '조직도', shortLabel: '조직도', icon: Network, description: '조직 구조도', requiresAuth: true, requiresApproval: true, requiresEmailVerification: true },
  { id: 'announcements', label: '공지사항', shortLabel: '공지', icon: Megaphone, description: '사내 공지사항', requiresAuth: true, requiresApproval: true, requiresEmailVerification: true },
  { id: 'management', label: '경영지원', shortLabel: '경영지원', icon: Building2, description: '경영 지원 기능', requiresAuth: true, requiresApproval: true, requiresEmailVerification: true },
  { id: 'accounting', label: '회계관리', shortLabel: '회계', icon: Calculator, description: '회계 관리 시스템', requiresAuth: true, requiresApproval: true, requiresEmailVerification: true },
  { id: 'audit_logs', label: '활동 로그', shortLabel: '로그', icon: History, description: '시스템 활동 기록', requiresAuth: true, requiresApproval: false, requiresEmailVerification: false },
  { id: 'ai_intelligence', label: 'AI Intelligence', shortLabel: 'AI', icon: Sparkles, description: 'AI 기반 분석', requiresAuth: true, requiresApproval: false, requiresEmailVerification: false },
  { id: 'team_chat', label: '메신저', shortLabel: '메신저', icon: MessagesSquare, description: '팀 메시징', requiresAuth: true, requiresApproval: true, requiresEmailVerification: true }
];

export function getTabConfig(tabId: TabType): TabConfig {
  const config = TAB_CONFIGS.find(t => t.id === tabId);
  if (!config) throw new Error(`Unknown tab: ${tabId}`);
  return config;
}

export function canAccessTab(tabId: TabType, isAuthenticated: boolean, isApproved: boolean, isEmailVerified: boolean): boolean {
  const config = getTabConfig(tabId);
  if (config.requiresAuth && !isAuthenticated) return false;
  if (config.requiresApproval && !isApproved) return false;
  if (config.requiresEmailVerification && !isEmailVerified) return false;
  return true;
}

export function getAccessDenialReason(tabId: TabType, isAuthenticated: boolean, isApproved: boolean, isEmailVerified: boolean): string | null {
  const config = getTabConfig(tabId);
  if (config.requiresAuth && !isAuthenticated) return '로그인이 필요합니다.';
  if (config.requiresEmailVerification && !isEmailVerified) return '이메일 인증이 필요합니다.';
  if (config.requiresApproval && !isApproved) return '회사 관리자 승인이 필요합니다.';
  return null;
}

export function getAccessibleTabs(isAuthenticated: boolean, isApproved: boolean, isEmailVerified: boolean): TabConfig[] {
  return TAB_CONFIGS.filter(tab => canAccessTab(tab.id, isAuthenticated, isApproved, isEmailVerified));
}

export const TAB_IDS = TAB_CONFIGS.map(t => t.id);

export function isValidTabId(id: unknown): id is TabType {
  return typeof id === 'string' && TAB_IDS.includes(id as TabType);
}
