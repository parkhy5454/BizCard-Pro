import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Users, MapPin, FolderTree, ArrowDownUp, PlusCircle, ScanLine, Search, Briefcase, Share2, User, LogOut, UserX, CreditCard, Building2, Car, ClipboardCheck, FileSignature, MessageCircleQuestion, X, Bug, Lightbulb, MessageSquare, Send, CheckCircle2, FileSpreadsheet, Printer, ChevronDown, ListChecks, FileText, Inbox, TrendingUp, Mic, Sparkles, Download, History, LayoutDashboard, Calculator, Gift, Network, Megaphone, MessagesSquare, Radar, Upload, LayoutGrid } from 'lucide-react';
import { FeedbackInboxModal } from './FeedbackInboxModal.js';
import { ReferralModal } from './ReferralModal.js';
import { RemindersBell } from './RemindersBell.js';
import { ContactGroup, Project, User as UserType } from '../types.js';
import { downloadBackup } from '../backupDownload.js';

import { getErrorMessage } from '../errorUtils.js';
interface Props {
  activeTab: 'dashboard' | 'cards' | 'nearby' | 'groups' | 'io' | 'projects' | 'vehicles' | 'worklogs' | 'approvals' | 'management' | 'accounting' | 'audit_logs' | 'ai_intelligence' | 'org_chart' | 'announcements' | 'team_chat' | 'profile' | 'more';
  setActiveTab: (tab: 'dashboard' | 'cards' | 'nearby' | 'groups' | 'io' | 'projects' | 'vehicles' | 'worklogs' | 'approvals' | 'management' | 'accounting' | 'audit_logs' | 'ai_intelligence' | 'org_chart' | 'announcements' | 'team_chat' | 'profile' | 'more') => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedGroup: string;
  setSelectedGroup: (gid: string) => void;
  groups: ContactGroup[];
  onOpenScanModal: () => void;
  onOpenVoiceQuickAdd: () => void;
  onOpenTaxPackage: () => void;
  onOpenShareMyCardModal: () => void;
  onOpenUserDirectory: () => void;
  onOpenGlobalSearch: () => void;
  onOpenNewProject?: () => void;
  onExportProjectsExcel?: () => void;
  onOpenProjectsPrintPreview?: () => void;
  // [수정] 토글(반전) 방식 대신, 각 버튼이 정확히 어느 화면으로 갈지 명시적으로 지정하는 콜백으로 변경.
  // (기존엔 "프로젝트 리스트"를 눌러도 그냥 드롭다운만 열릴 뿐, 카드 화면으로 돌아가지 않는 문제가 있었음)
  // [수정] 카드/리스트출력/파이프라인 3가지 화면을 오가야 해서 boolean 대신 모드 문자열로 변경
  projectsViewMode?: 'cards' | 'listOutput' | 'pipeline' | 'pnl';
  onShowProjectsCardView?: () => void;
  onShowProjectsListOutput?: () => void;
  onShowProjectsPipeline?: () => void;
  onShowProjectsPnl?: () => void;
  totalContactsCount: number;
  projectFilterStatus?: 'all' | 'opportunity' | 'progress' | 'completed' | 'failed';
  setProjectFilterStatus?: (status: 'all' | 'opportunity' | 'progress' | 'completed' | 'failed') => void;
  projects?: Project[];
  currentUser: UserType | null;
  onLogout: () => void;
  onOpenWithdrawModal: () => void;
  onOpenSubscriptionModal: () => void;
  // [추가] "이미 그 화면에 있는데 상단 메인 탭을 또 눌렀을 때" 그 화면을 처음 상태로
  // 되돌리기 위한 콜백. 아이폰에서 상단 상태바를 누르면 맨 위로 스크롤되는 것처럼,
  // 지금 보고 있는 화면에서 검색어/필터/펼쳐둔 상세화면 등을 다 지우고 첫 화면으로
  // 돌아가고 싶을 때 쓴다. (다른 탭으로 이동하는 경우는 화면이 새로 그려지면서 이미
  // 초기화되므로, 이 콜백은 "같은 탭을 다시 눌렀을 때"만 필요하다.)
  onRequestViewReset?: () => void;
  // 문의/추천 모달 상태와 미읽음 건수는 App에서 관리한다 (더보기 전체 화면과 공유)
  isFeedbackOpen: boolean;
  setIsFeedbackOpen: (v: boolean) => void;
  isFeedbackInboxOpen: boolean;
  setIsFeedbackInboxOpen: (v: boolean) => void;
  isReferralOpen: boolean;
  setIsReferralOpen: (v: boolean) => void;
  unreadFeedbackCount: number;
}

export const Navigation: React.FC<Props> = ({
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  selectedGroup,
  setSelectedGroup,
  groups,
  onOpenScanModal,
  onOpenVoiceQuickAdd,
  onOpenTaxPackage,
  onOpenShareMyCardModal,
  onOpenUserDirectory,
  onOpenGlobalSearch,
  onOpenNewProject = () => {},
  onExportProjectsExcel = () => {},
  onOpenProjectsPrintPreview = () => {},
  projectsViewMode = 'cards',
  onShowProjectsCardView = () => {},
  onShowProjectsListOutput = () => {},
  onShowProjectsPipeline = () => {},
  onShowProjectsPnl = () => {},
  totalContactsCount,
  projectFilterStatus = 'all',
  setProjectFilterStatus = (_st) => {},
  projects = [],
  currentUser,
  onLogout,
  onOpenWithdrawModal,
  onOpenSubscriptionModal,
  onRequestViewReset = () => {},
  isFeedbackOpen,
  setIsFeedbackOpen,
  isFeedbackInboxOpen,
  setIsFeedbackInboxOpen,
  isReferralOpen,
  setIsReferralOpen,
  unreadFeedbackCount,
}) => {
  // [추가] 상단 메인 탭 버튼 클릭 공용 처리. 이미 그 탭에 있으면(같은 탭을 또 누른 경우)
  // setActiveTab만으로는 값이 안 바뀌어서 리액트가 리렌더를 건너뛰고 아무 반응이 없다 -
  // 이 경우엔 onRequestViewReset을 호출해서 지금 화면을 처음 상태로 되돌린다. 다른 탭이면
  // 기존처럼 그냥 탭을 전환한다(전환되면서 화면이 새로 그려져 이미 초기화됨).
  const handleMainTabClick = useCallback((tab: Parameters<typeof setActiveTab>[0]) => {
    if (tab === activeTab) {
      onRequestViewReset();
    } else {
      setActiveTab(tab);
    }
  }, [activeTab, onRequestViewReset, setActiveTab]);
  // [수정] 명함뿐 아니라 앱 전체 어디서나 접수 가능한 "문의하기" 기능 상태
  // [수정] 관리자(개발자)용 "문의함" 화면 열림 상태. 이 화면은 회사 구분 없이 앱 전체 문의가
  // 다 모이는 화면이라, 아무나 보면 안 되고 개발자 계정에서만 보이게 제한한다.
  // [추가] 친구 추천 모달 열림 상태
  // [추가] 상단 우측 계정(아바타) 메뉴 열림 상태 + 바깥을 누르면 닫기
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isAccountMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) setIsAccountMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isAccountMenuOpen]);
  // [추가] 데이터 백업 - 서버(/api/backup/export)는 이미 있었는데 어디서도 눌러볼 방법이
  // 없었다. 서버 쪽 권한 규칙과 똑같이(개인 계정은 항상 본인 데이터를, 회사 계정은
  // 관리자만) 내려받을 수 있게 버튼을 노출한다. 커스텀 헤더(x-user-id)가 필요해서 그냥
  // <a href>로는 안 되고, fetch로 받은 내용을 blob으로 만들어 다운로드를 흉내낸다.
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);
  const canAccessBackup = currentUser?.type === 'individual' || currentUser?.role === 'admin';
  const handleDownloadBackup = async () => {
    if (!currentUser || isDownloadingBackup) return;
    setIsDownloadingBackup(true);
    try {
      await downloadBackup(currentUser.id);
    } catch (err: unknown) {
      alert(`데이터 백업에 실패했습니다.\n${getErrorMessage(err) || '잠시 후 다시 시도해주세요.'}`);
    } finally {
      setIsDownloadingBackup(false);
    }
  };
  // [수정] "프로젝트 리스트" 드롭다운(엑셀/PDF 출력) 열림 상태
  const [isProjectListMenuOpen, setIsProjectListMenuOpen] = useState(false);
  // [추가] 더블클릭 방지 - 마지막 클릭 시간 기록 및 글로벌 락
  const lastProjectClickRef = useRef<number>(0);
  const isProcessingProjectRef = useRef(false);
  const globalProcessingRef = useRef(false); // 전체 버튼 클릭 락

  const handleProjectTabClick = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    // 글로벌 또는 개별 처리 중이면 무시
    if (globalProcessingRef.current || isProcessingProjectRef.current) return;

    const now = Date.now();
    if (now - lastProjectClickRef.current < 350) return; // 350ms 이내 클릭 무시

    // 처리 중으로 표시
    globalProcessingRef.current = true;
    isProcessingProjectRef.current = true;
    lastProjectClickRef.current = now;

    handleMainTabClick('projects');

    // 처리 완료 표시
    setTimeout(() => {
      isProcessingProjectRef.current = false;
      globalProcessingRef.current = false;
    }, 150);
  };

  const [feedbackCategory, setFeedbackCategory] = useState<'bug' | 'feature' | 'other'>('bug');
  const [feedbackContent, setFeedbackContent] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackError, setFeedbackError] = useState('');

  const submitFeedback = async () => {
    if (!feedbackContent.trim()) {
      setFeedbackError('문의 내용을 입력해주세요.');
      return;
    }
    setFeedbackSubmitting(true);
    setFeedbackError('');
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (currentUser) headers['x-user-id'] = currentUser.id;
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers,
        body: JSON.stringify({ category: feedbackCategory, content: feedbackContent.trim(), pageContext: activeTab })
      });
      if (!res.ok) throw new Error('문의 접수에 실패했습니다.');
      setFeedbackSubmitted(true);
      setFeedbackContent('');
    } catch (err) {
      console.error('Feedback submit error:', err);
      setFeedbackError('문의 접수 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const closeFeedbackModal = () => {
    setIsFeedbackOpen(false);
    // 팝업 닫고 나서 애니메이션 등이 자연스럽게 끝나도록 살짝 뒤에 상태 초기화
    setTimeout(() => {
      setFeedbackSubmitted(false);
      setFeedbackError('');
      setFeedbackCategory('bug');
    }, 300);
  };


  return (
    <>
    {/* [수정] index.html에 viewport-fit=cover + apple-mobile-web-app-status-bar-style=
    black-translucent가 설정돼 있어서, 아이폰에서 홈 화면에 추가해 앱처럼 실행하면 상태
    표시줄(시계/신호/배터리)이 투명해지면서 이 헤더 위에 그대로 겹쳐 보였다("BizCard" 로고
    글자와 시계가 겹치는 등). pt-[env(safe-area-inset-top)]으로 노치/상태 표시줄 높이만큼
    헤더 안쪽에 여백을 줘서, 그 아래로 실제 로고/버튼들이 밀려나게 한다. 노치가 없는
    기기(대부분의 안드로이드, PC 브라우저)에서는 env() 값이 0이라 아무 변화가 없다. */}
    {/* [수정] shadow-xl이 헤더 아래쪽에 위는 진하고 아래로 갈수록 옅어지는 회색 그림자를
    만들어서, 실선 구분선(border-b)이 있는데도 그 아래가 회색 그라데이션처럼 보인다는
    지적이 있었다. 실선 구분선만으로 충분히 구분되므로 그림자를 없애고 그 아래 영역이
    바로 깔끔한 흰색이 되도록 한다. */}
    <header className="shrink-0 sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 text-slate-800 pt-[env(safe-area-inset-top)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* [수정] 상단 바는 모든 화면 크기에서 한 줄: 로고 / (데스크톱 명함 검색) / 전체검색·알림·계정.
        회사 배너와 계정 기능(구독·백업·로그아웃·탈퇴)은 우측 계정(아바타) 메뉴로 모았다. */}
        <div className="flex items-center justify-between gap-3 h-16">
          <div className="flex items-center gap-3 cursor-pointer min-w-0 shrink-0" onClick={() => setActiveTab('cards')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/30 ring-2 ring-blue-400/40 shrink-0">
              <ScanLine className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-xl tracking-tight bg-gradient-to-r from-slate-900 via-indigo-700 to-blue-600 bg-clip-text text-transparent">
                BizCard
              </h1>
              {/* 부제목은 모바일에서 숨겨 한 줄을 지킨다 */}
              <p className="hidden sm:block text-xs text-slate-500 font-medium">스마트 명함 & CRM</p>
            </div>
          </div>

          {/* 데스크톱 명함 검색창 (명함 목록에서만 표시, 기존과 동일) */}
          {activeTab === 'cards' && (
            <div className="flex-1 max-w-sm relative hidden lg:block">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="이름, 회사명, 부서, 핸드폰, 메모 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-100 border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-800"
                >
                  지우기
                </button>
              )}
            </div>
          )}

          {currentUser && (
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <button
                onClick={onOpenGlobalSearch}
                title="전체 검색 (명함/프로젝트/차량/업무일지)"
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-blue-500 border border-slate-200 transition-colors"
              >
                <Search className="w-4 h-4" />
              </button>

              <RemindersBell currentUser={currentUser} onNavigate={(tab) => setActiveTab(tab)} />

              {/* 계정 아바타 → 계정 메뉴 (회사 정보 / 프로필 / 구독 / 백업 / 로그아웃 / 탈퇴) */}
              <div className="relative" ref={accountMenuRef}>
                <button
                  onClick={() => setIsAccountMenuOpen((v) => !v)}
                  title="내 계정"
                  aria-expanded={isAccountMenuOpen}
                  className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-blue-500 text-white font-bold text-sm flex items-center justify-center shadow ring-2 ring-indigo-200 hover:ring-indigo-300 transition-all active:scale-95"
                >
                  {(currentUser.name || '?').charAt(0)}
                </button>

                {isAccountMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-72 max-w-[90vw] bg-white border border-slate-200 rounded-xl shadow-2xl z-40 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                      <p className="text-sm font-bold text-slate-800 truncate">{currentUser.name} 님</p>
                      <p className="text-xs text-slate-500 truncate">{currentUser.email}</p>
                      {currentUser.type === 'company' ? (
                        <div className="mt-2 text-xs text-slate-700 space-y-0.5">
                          <p className="flex items-center gap-1.5 min-w-0">
                            <Building2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span className="font-semibold truncate">{currentUser.companyName}</span>
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            사업자: {currentUser.businessNumber}
                            {currentUser.role ? ` · ${currentUser.role === 'admin' ? '관리자' : '구성원'}` : ''}
                            {currentUser.position ? ` · ${currentUser.position}` : ''}
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-slate-700 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-emerald-400" />
                          개인 공간
                        </p>
                      )}
                    </div>

                    <button
                      onClick={() => { handleMainTabClick('profile'); setIsAccountMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50 transition-all whitespace-nowrap text-slate-700"
                    >
                      <User className="w-4 h-4 text-indigo-500" />
                      <span>프로필 설정</span>
                    </button>

                    <button
                      onClick={() => { onOpenSubscriptionModal(); setIsAccountMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50 transition-all whitespace-nowrap text-slate-700"
                    >
                      <CreditCard className="w-4 h-4 text-indigo-400" />
                      <span>구독 관리</span>
                    </button>

                    {currentUser && (
                      <button
                        onClick={() => { setIsAccountMenuOpen(false); setIsReferralOpen(true); }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50 transition-all whitespace-nowrap text-slate-700"
                      >
                        <Gift className="w-4 h-4 text-amber-600" />
                        <span>친구 추천</span>
                      </button>
                    )}

                    {canAccessBackup && (
                      <button
                        onClick={() => { setIsAccountMenuOpen(false); handleDownloadBackup(); }}
                        disabled={isDownloadingBackup}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50 transition-all whitespace-nowrap text-slate-700 disabled:opacity-40"
                      >
                        <Download className="w-4 h-4 text-emerald-500" />
                        <span>{isDownloadingBackup ? '백업 중...' : '데이터 백업'}</span>
                      </button>
                    )}

                    <div className="border-t border-slate-200" />

                    <button
                      onClick={() => { setIsAccountMenuOpen(false); onLogout(); }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50 transition-all whitespace-nowrap text-slate-700"
                    >
                      <LogOut className="w-4 h-4 text-slate-500" />
                      <span>로그아웃</span>
                    </button>

                    <button
                      onClick={() => { setIsAccountMenuOpen(false); onOpenWithdrawModal(); }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-rose-50 transition-all whitespace-nowrap text-rose-600"
                    >
                      <UserX className="w-4 h-4" />
                      <span>회원 탈퇴</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>

    {/* [추가] 프로젝트 탭일 때 상단에 고정되는 뷰 모드 탭 (카드/리스트/파이프라인/원가계산서) */}
    {activeTab === 'projects' && (
      <div className="shrink-0 relative z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* 1. 뷰 모드 탭 섹션 */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full py-3 scrollbar-none border-b border-slate-100">
            {/* 새 프로젝트 등록 버튼 */}
            <button
              onClick={onOpenNewProject}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold whitespace-nowrap bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs sm:text-sm shadow-md shadow-indigo-600/25 transition-all active:scale-95 shrink-0"
            >
              <Briefcase className="w-4 h-4" />
              <span>새 프로젝트 등록</span>
            </button>

            {/* 프로젝트 리스트 탭 (드롭다운 포함) */}
            <div className="relative flex items-stretch rounded-lg overflow-hidden border border-slate-200 shrink-0">
              <button
                onClick={onShowProjectsCardView}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 font-semibold whitespace-nowrap text-xs sm:text-sm transition-all active:scale-95 ${
                  projectsViewMode === 'cards'
                    ? 'bg-blue-600/20 text-blue-400'
                    : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700'
                }`}
              >
                <ListChecks className="w-4 h-4 text-indigo-400" />
                <span>프로젝트 리스트</span>
              </button>
              <button
                onClick={() => setIsProjectListMenuOpen((v) => !v)}
                className="flex items-center px-2 bg-slate-100 hover:bg-slate-200 border-l border-slate-200 transition-colors"
                title="엑셀/PDF 다운로드"
              >
                <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isProjectListMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isProjectListMenuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setIsProjectListMenuOpen(false)} />
                  <div className="absolute left-0 top-full mt-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-2xl z-40 overflow-hidden">
                    <button
                      onClick={() => { onExportProjectsExcel(); setIsProjectListMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                    >
                      <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                      <span>엑셀 다운로드</span>
                    </button>
                    <button
                      onClick={() => { onOpenProjectsPrintPreview(); setIsProjectListMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors border-t border-slate-200"
                    >
                      <Printer className="w-4 h-4 text-indigo-400" />
                      <span>PDF 인쇄 / 다운로드</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* 리스트 출력 탭 */}
            <button
              onClick={onShowProjectsListOutput}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold whitespace-nowrap text-xs sm:text-sm shadow-md transition-all active:scale-95 shrink-0 ${
                projectsViewMode === 'listOutput'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                  : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-600'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>리스트 출력</span>
            </button>

            {/* 원가계산서 (관리자만) */}
            {currentUser?.role === 'admin' && (
              <button
                onClick={onShowProjectsPnl}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold whitespace-nowrap text-xs sm:text-sm shadow-md transition-all active:scale-95 shrink-0 ${
                  projectsViewMode === 'pnl'
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                    : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-600'
                }`}
              >
                <Calculator className="w-4 h-4" />
                <span>원가계산서</span>
              </button>
            )}

            {/* 파이프라인 탭 */}
            <button
              onClick={onShowProjectsPipeline}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold whitespace-nowrap text-xs sm:text-sm shadow-md transition-all active:scale-95 shrink-0 ${
                projectsViewMode === 'pipeline'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                  : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-600'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span>파이프라인</span>
            </button>
          </div>

          {/* 2. 프로젝트 상태 필터 칩 섹션 */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full py-3 scrollbar-none">
            <span className="text-xs text-slate-500 mr-1 hidden lg:inline font-medium">상태필터:</span>
            <button
              onClick={() => setProjectFilterStatus('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                projectFilterStatus === 'all'
                  ? 'bg-slate-100 text-slate-900 shadow font-bold'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
              }`}
            >
              전체보기 ({projects.length})
            </button>
            <button
              onClick={() => setProjectFilterStatus('opportunity')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${
                projectFilterStatus === 'opportunity'
                  ? 'bg-blue-500 text-white border-blue-400 font-bold scale-105 ring-2 ring-white/30'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
              }`}
            >
              💡 기회 ({projects.filter(p => p.status === 'opportunity').length})
            </button>
            <button
              onClick={() => setProjectFilterStatus('progress')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${
                projectFilterStatus === 'progress'
                  ? 'bg-amber-500 text-amber-950 border-amber-400 font-bold scale-105 ring-2 ring-white/30'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
              }`}
            >
              ⚡ 진행 ({projects.filter(p => p.status === 'progress').length})
            </button>
            <button
              onClick={() => setProjectFilterStatus('completed')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${
                projectFilterStatus === 'completed'
                  ? 'bg-emerald-500 text-white border-emerald-400 font-bold scale-105 ring-2 ring-white/30'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
              }`}
            >
              ✅ 완료 ({projects.filter(p => p.status === 'completed').length})
            </button>
            <button
              onClick={() => setProjectFilterStatus('failed')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${
                projectFilterStatus === 'failed'
                  ? 'bg-rose-500 text-white border-rose-400 font-bold scale-105 ring-2 ring-white/30'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
              }`}
            >
              ❌ 실패 ({projects.filter(p => p.status === 'failed').length})
            </button>
          </div>
        </div>
      </div>
    )}

    {/* [추가] 명함 탭일 때 상단에 고정되는 액션 버튼 및 그룹 필터 */}
    {activeTab === 'cards' && (
      <div className="shrink-0 relative z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* 1. 액션 버튼 섹션 */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full py-3 scrollbar-none border-b border-slate-100">
            {/* 명함 등록 */}
            <button
              onClick={onOpenScanModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold whitespace-nowrap bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm shadow-md shadow-blue-600/25 transition-all active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>명함 등록</span>
            </button>

            {/* 음성 입력 */}
            <button
              onClick={onOpenVoiceQuickAdd}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold whitespace-nowrap bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs sm:text-sm shadow-md shadow-indigo-600/25 transition-all active:scale-95"
            >
              <Mic className="w-4 h-4" />
              <span>음성 입력</span>
            </button>

            {/* 가져오기·내보내기 */}
            <button
              onClick={() => setActiveTab('io')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all active:scale-95 ${
                activeTab === 'io'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                  : 'bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>가져오기·내보내기</span>
            </button>

            {/* 내 명함 공유 */}
            <button
              onClick={onOpenShareMyCardModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium whitespace-nowrap bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 transition-all active:scale-95"
            >
              <Share2 className="w-4 h-4 text-blue-600" />
              <span>내 명함 공유</span>
            </button>

            {/* 주변 레이더 지도 */}
            <button
              onClick={() => setActiveTab('nearby')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === 'nearby'
                  ? 'text-indigo-600 font-bold'
                  : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-600'
              }`}
            >
              <Radar className="w-4 h-4" />
              <span>주변 레이더 지도</span>
            </button>
          </div>

          {/* 2. 그룹 필터 칩 섹션 */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full py-3 scrollbar-none">
            <span className="text-xs text-slate-500 mr-1 hidden lg:inline font-medium">그룹:</span>
            <button
              onClick={() => setSelectedGroup('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                selectedGroup === 'all'
                  ? 'bg-slate-100 text-slate-900 shadow font-bold'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
              }`}
            >
              전체보기
            </button>
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => setSelectedGroup(g.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${
                  selectedGroup === g.id
                    ? `${g.color} ring-2 ring-white/30 font-bold scale-105`
                    : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {g.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    )}

        {/* [수정] 하단 고정 탭 - 상위 5개만 표시: 홈 / 명함 / 차량관리 / 프로젝트 / 더보기 */}
        <div data-app-tabbar className="fixed bottom-0 w-full flex flex-col items-center pt-2 gap-1.5 border-t border-slate-200 text-sm bg-white z-50" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}>

          <div className="flex items-end w-full pb-1.5 px-3 gap-1">
          <nav className="grid grid-cols-5 gap-1 flex-1 min-w-0">
            {/* 1. 홈 */}
            <button
              onClick={() => handleMainTabClick('dashboard')}
              className={`flex flex-col items-center justify-center gap-1.5 py-2 rounded-lg font-medium transition-all whitespace-nowrap min-w-0 ${
                activeTab === 'dashboard'
                  ? 'text-indigo-600 font-bold'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              <LayoutDashboard className="w-5 h-5 text-blue-400" />
              <span className="text-[11px] leading-none">홈</span>
            </button>

            {/* 2. 명함 */}
            <button
              onClick={() => handleMainTabClick('cards')}
              className={`flex flex-col items-center justify-center gap-1.5 py-2 rounded-lg font-medium transition-all whitespace-nowrap min-w-0 ${
                activeTab === 'cards'
                  ? 'text-indigo-600 font-bold'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Users className="w-5 h-5" />
              <span className="text-[11px] leading-none">명함</span>
            </button>

            {/* 3. 차량관리 */}
            <button
              onClick={() => handleMainTabClick('vehicles')}
              className={`flex flex-col items-center justify-center gap-1.5 py-2 rounded-lg font-medium transition-all whitespace-nowrap min-w-0 ${
                activeTab === 'vehicles'
                  ? 'text-indigo-600 font-bold'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Car className="w-5 h-5 text-indigo-400" />
              <span className="text-[11px] leading-none">차량</span>
            </button>

            {/* 4. 프로젝트 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                handleProjectTabClick();
              }}
              className={`flex flex-col items-center justify-center gap-1.5 py-2 rounded-lg font-medium transition-all whitespace-nowrap min-w-0 ${
                activeTab === 'projects'
                  ? 'text-indigo-600 font-bold'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Briefcase className="w-5 h-5 text-indigo-400" />
              <span className="text-[11px] leading-none">프로젝트</span>
            </button>

            {/* 5. 더보기 - 드롭다운이 아니라 전체 화면 탭으로 연다 (앱의 '내 정보' 탭과 같은 방식) */}
            <button
              onClick={() => handleMainTabClick('more')}
              className={`relative flex flex-col items-center justify-center gap-1.5 py-2 rounded-lg font-medium transition-all whitespace-nowrap min-w-0 ${
                activeTab === 'more'
                  ? 'text-indigo-600 font-bold'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              <LayoutGrid className="w-5 h-5 text-violet-500" />
              <span className="text-[11px] leading-none">더보기</span>
              {/* 미읽음 문의가 있으면 점으로 알려준다 (개발자 계정 전용) */}
              {unreadFeedbackCount > 0 && (
                <span className="absolute top-1 right-[calc(50%-14px)] w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
              )}
            </button>

          </nav>
          </div>

          {/* [추가] 상위 탭(홈/전체 명함/···/AI Intelligence)과 그 아래 하위 액션 버튼 줄이
          똑같은 알약형 버튼 스타일이라 구분이 잘 안 된다는 지적이 있었다. 하위 줄이 있는
          탭에서만 얇은 구분선을 하나 그어서, 상위 탭과 하위 버튼 줄이 서로 다른 영역임을
          명확히 나눈다. */}
          {['groups', 'io', 'nearby', 'projects'].includes(activeTab) && (
            <div className="w-full border-t border-slate-200" />
          )}

          {/* 그룹관리 / 가져오기·내보내기 / 내 명함 공유 / 주변 레이더 (명함은 상단으로 이동, 나머지 탭에서만 노출) */}
          {['groups', 'io', 'nearby'].includes(activeTab) && (
          <div className="flex items-center gap-1.5 overflow-x-auto w-full p-1.5 bg-slate-100 border border-slate-200 rounded-xl scrollbar-none">
            <button
              onClick={onOpenScanModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold whitespace-nowrap bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm shadow-md shadow-blue-600/25 transition-all active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>명함 등록</span>
            </button>

            {/* [수정] 전시회처럼 손이 바쁠 때, 음성만으로 이름/회사를 빠르게 기록하는 버튼 */}
            <button
              onClick={onOpenVoiceQuickAdd}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold whitespace-nowrap bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 text-rose-700 text-xs sm:text-sm transition-all active:scale-95"
            >
              <Mic className="w-4 h-4 text-rose-600" />
              <span>음성 등록</span>
            </button>

            <button
              onClick={() => setActiveTab('groups')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === 'groups'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
              }`}
            >
              <FolderTree className="w-4 h-4 text-amber-400" />
              <span>그룹 관리</span>
            </button>

            <button
              onClick={() => setActiveTab('io')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === 'io'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
              }`}
            >
              <ArrowDownUp className="w-4 h-4 text-emerald-400" />
              <span>가져오기 / 내보내기</span>
            </button>

            <button
              onClick={onOpenShareMyCardModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium whitespace-nowrap bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 transition-all active:scale-95"
            >
              <Share2 className="w-4 h-4 text-blue-600" />
              <span>내 명함 공유</span>
            </button>

            <button
              onClick={() => setActiveTab('nearby')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === 'nearby'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
              }`}
            >
              <MapPin className="w-4 h-4 text-rose-400 animate-bounce" />
              <span>주변 레이더 지도</span>
            </button>
          </div>
          )}

          {/* 그룹 칩 필터링 (명함은 상단으로 이동) */}
          {['groups', 'io', 'nearby'].includes(activeTab) && (
            <div className="flex items-center gap-1.5 overflow-x-auto w-full">
              <span className="text-xs text-slate-500 mr-1 hidden lg:inline">그룹:</span>
              <button
                onClick={() => setSelectedGroup('all')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                  selectedGroup === 'all'
                    ? 'bg-slate-100 text-slate-900 shadow font-bold'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                }`}
              >
                전체보기
              </button>
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGroup(g.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${
                    selectedGroup === g.id
                      ? `${g.color} ring-2 ring-white/30 font-bold scale-105`
                      : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}

        </div>

    {isFeedbackInboxOpen && (
      <FeedbackInboxModal currentUser={currentUser} onClose={() => setIsFeedbackInboxOpen(false)} />
    )}

    {isReferralOpen && currentUser && (
      <ReferralModal currentUser={currentUser} onClose={() => setIsReferralOpen(false)} />
    )}

    {/* [수정] 문의하기는 이제 하단 탭의 "더보기" 드롭다운에 통합됨 */}

    {isFeedbackOpen && (
      <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="w-full sm:max-w-md bg-white border border-slate-200 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <MessageCircleQuestion className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-800">문의하기</h3>
            </div>
            <button onClick={closeFeedbackModal} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {feedbackSubmitted ? (
            <div className="p-8 flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
              </div>
              <p className="text-sm font-bold text-slate-800">문의가 접수되었습니다!</p>
              <p className="text-xs text-slate-500 leading-relaxed">빠른 시일 내에 확인하고 반영하도록 하겠습니다.<br />소중한 의견 감사합니다.</p>
              <button
                onClick={closeFeedbackModal}
                className="mt-2 px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
              >
                닫기
              </button>
            </div>
          ) : (
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-2">문의 종류</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setFeedbackCategory('bug')}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-semibold transition-all ${feedbackCategory === 'bug' ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200'}`}
                  >
                    <Bug className="w-4 h-4" />
                    버그 신고
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedbackCategory('feature')}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-semibold transition-all ${feedbackCategory === 'feature' ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200'}`}
                  >
                    <Lightbulb className="w-4 h-4" />
                    기능 제안
                  </button>
                  <button
                    type="button"
                    onClick={() => setFeedbackCategory('other')}
                    className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-semibold transition-all ${feedbackCategory === 'other' ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200'}`}
                  >
                    <MessageSquare className="w-4 h-4" />
                    기타 문의
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-2">내용</label>
                <textarea
                  rows={5}
                  value={feedbackContent}
                  onChange={(e) => setFeedbackContent(e.target.value)}
                  placeholder="어떤 화면에서, 무슨 문제가 있었는지 또는 어떤 기능이 있으면 좋을지 자유롭게 적어주세요."
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl p-3 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              {feedbackError && (
                <p className="text-xs text-rose-400">{feedbackError}</p>
              )}

              <button
                type="button"
                onClick={submitFeedback}
                disabled={feedbackSubmitting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/25 transition-all active:scale-95 disabled:opacity-50"
              >
                {feedbackSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    <span>접수 중...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>문의 제출하기</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    )}
    </>
  );
};
