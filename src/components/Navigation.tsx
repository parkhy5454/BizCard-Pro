import React, { useState } from 'react';
import { Users, MapPin, FolderTree, ArrowDownUp, PlusCircle, ScanLine, Search, Briefcase, Share2, User, LogOut, UserX, CreditCard, Building2, Car, ClipboardCheck, FileSignature, MessageCircleQuestion, X, Bug, Lightbulb, MessageSquare, Send, CheckCircle2, FileSpreadsheet, Printer, ChevronDown, ListChecks, FileText, Inbox, TrendingUp, Mic } from 'lucide-react';
import { FeedbackInboxModal } from './FeedbackInboxModal.js';
import { ContactGroup, Project, User as UserType } from '../types.js';

interface Props {
  activeTab: 'cards' | 'nearby' | 'groups' | 'io' | 'projects' | 'vehicles' | 'worklogs' | 'approvals';
  setActiveTab: (tab: 'cards' | 'nearby' | 'groups' | 'io' | 'projects' | 'vehicles' | 'worklogs' | 'approvals') => void;
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
  onOpenNewProject?: () => void;
  onExportProjectsExcel?: () => void;
  onOpenProjectsPrintPreview?: () => void;
  // [수정] 토글(반전) 방식 대신, 각 버튼이 정확히 어느 화면으로 갈지 명시적으로 지정하는 콜백으로 변경.
  // (기존엔 "프로젝트 리스트"를 눌러도 그냥 드롭다운만 열릴 뿐, 카드 화면으로 돌아가지 않는 문제가 있었음)
  // [수정] 카드/리스트출력/파이프라인 3가지 화면을 오가야 해서 boolean 대신 모드 문자열로 변경
  projectsViewMode?: 'cards' | 'listOutput' | 'pipeline';
  onShowProjectsCardView?: () => void;
  onShowProjectsListOutput?: () => void;
  onShowProjectsPipeline?: () => void;
  totalContactsCount: number;
  projectFilterStatus?: 'all' | 'opportunity' | 'progress' | 'completed' | 'failed';
  setProjectFilterStatus?: (status: 'all' | 'opportunity' | 'progress' | 'completed' | 'failed') => void;
  projects?: Project[];
  currentUser: UserType | null;
  onLogout: () => void;
  onOpenWithdrawModal: () => void;
  onOpenSubscriptionModal: () => void;
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
  onOpenNewProject = () => {},
  onExportProjectsExcel = () => {},
  onOpenProjectsPrintPreview = () => {},
  projectsViewMode = 'cards',
  onShowProjectsCardView = () => {},
  onShowProjectsListOutput = () => {},
  onShowProjectsPipeline = () => {},
  totalContactsCount,
  projectFilterStatus = 'all',
  setProjectFilterStatus = (_st) => {},
  projects = [],
  currentUser,
  onLogout,
  onOpenWithdrawModal,
  onOpenSubscriptionModal
}) => {
  // [수정] 명함뿐 아니라 앱 전체 어디서나 접수 가능한 "문의하기" 기능 상태
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  // [수정] 관리자(개발자)용 "문의함" 화면 열림 상태. 이 화면은 회사 구분 없이 앱 전체 문의가
  // 다 모이는 화면이라, 아무나 보면 안 되고 개발자 계정에서만 보이게 제한한다.
  const [isFeedbackInboxOpen, setIsFeedbackInboxOpen] = useState(false);
  const isDeveloperAccount = currentUser?.email === 'parkhy5454@gmail.com';
  // [수정] "프로젝트 리스트" 드롭다운(엑셀/PDF 출력) 열림 상태
  const [isProjectListMenuOpen, setIsProjectListMenuOpen] = useState(false);
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
      const headers: any = { 'Content-Type': 'application/json' };
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
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 text-slate-800 shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between py-4 md:py-0 md:h-16 gap-4">
          
          {/* 브랜드 로고 */}
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('cards')}>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/30 ring-2 ring-blue-400/40">
                <ScanLine className="w-6 h-6 text-white animate-pulse" />
              </div>
              <div>
                <h1 className="font-bold text-xl tracking-tight bg-gradient-to-r from-slate-900 via-indigo-700 to-blue-600 bg-clip-text text-transparent">
                  BizCard <span className="text-blue-500 text-xs px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 font-mono">AI Pro</span>
                </h1>
                <p className="text-xs text-slate-500 font-medium">스마트 명함 & CRM 네트워크</p>
              </div>
            </div>

            {/* 모바일 화면용 로그아웃 & 정보 (옵션) */}
            {currentUser && (
              <div className="flex items-center gap-2 md:hidden">
                <button
                  onClick={onOpenSubscriptionModal}
                  title="구독 관리"
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-indigo-400 border border-slate-200 transition-colors"
                >
                  <CreditCard className="w-4 h-4" />
                </button>
                <button
                  onClick={onLogout}
                  title="로그아웃"
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-rose-400 border border-slate-200 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
                <button
                  onClick={onOpenWithdrawModal}
                  title="회원 탈퇴"
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-rose-500 border border-slate-200 transition-colors"
                >
                  <UserX className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* 중앙 검색창 (명함 목록 뷰일 때 활성) */}
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

          {/* 주요 액션 및 내비게이션 버튼 & 사용자 프로필 */}
          <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto">
            
            {/* 사용자 공간 상태 배너 */}
            {currentUser && (
              <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-2xl px-3 py-1.5 text-xs text-slate-600">
                {currentUser.type === 'company' ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-pulse" />
                    <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                    <div>
                      <p className="font-bold text-slate-800 max-w-[100px] truncate">{currentUser.companyName}</p>
                      <p className="text-[9px] text-slate-400">사업자: {currentUser.businessNumber}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
                    <User className="w-3.5 h-3.5 text-emerald-400" />
                    <div>
                      <p className="font-bold text-slate-800">{currentUser.name}</p>
                      <p className="text-[9px] text-slate-400">개인 공간</p>
                    </div>
                  </div>
                )}
                
                <div className="w-[1px] h-6 bg-slate-100 mx-1 hidden sm:block" />

                <div className="hidden sm:flex flex-col text-right">
                  <span className="font-medium text-slate-500 text-[10px]">{currentUser.name} 님</span>
                  <span className="text-[9px] text-slate-400 truncate max-w-[120px]">{currentUser.email}</span>
                </div>

                <button
                  onClick={onOpenSubscriptionModal}
                  title="구독 관리"
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-400 transition-colors hidden md:block"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onLogout}
                  title="로그아웃"
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-rose-400 transition-colors ml-1 hidden md:block"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
                {/* [추가] 회원 탈퇴 — 자주 누를 일이 없는 파괴적 작업이라 로그아웃보다 눈에 덜 띄게,
                하지만 접근은 가능하게 둔다. */}
                <button
                  onClick={onOpenWithdrawModal}
                  title="회원 탈퇴"
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-rose-500 transition-colors hidden md:block"
                >
                  <UserX className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              {/* [수정] 그 달의 모든 지출/영수증을 세무사에게 이메일로 바로 보내는 버튼 (전체 화면에서 접근 가능) */}
              <button
                onClick={onOpenTaxPackage}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-semibold text-xs shadow transition-all active:scale-95"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden sm:inline">세무자료 발송</span>
              </button>

              {/* 가입 회원 및 동료 확인 버튼 */}
              <button
                onClick={onOpenUserDirectory}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-semibold text-xs shadow transition-all active:scale-95"
              >
                <Users className="w-3.5 h-3.5 text-indigo-600" />
                <span>가입 회원 확인</span>
              </button>
            </div>
          </div>
        </div>

        {/* 하단 탭 내비게이션 & 그룹 필터바 (항상 세로로 쌓이도록: 탭 → 그룹 필터가 바로 아래) */}
        <div className="flex flex-col items-start py-2 gap-1.5 border-t border-slate-200 text-sm">
          
          <nav className="flex items-center gap-1 overflow-x-auto w-full pb-1 scrollbar-none">
            <button
              onClick={() => setActiveTab('cards')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === 'cards'
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>전체 명함</span>
              <span className="px-1.5 py-0.2 rounded-full text-xs bg-slate-100 text-slate-600 font-mono">{totalContactsCount}</span>
            </button>

            <button
              onClick={() => setActiveTab('vehicles')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === 'vehicles'
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Car className="w-4 h-4 text-indigo-400" />
              <span>통합 차량 관리</span>
            </button>

            <button
              onClick={() => setActiveTab('projects')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === 'projects'
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Briefcase className="w-4 h-4 text-indigo-400" />
              <span>프로젝트</span>
            </button>

            <button
              onClick={() => setActiveTab('worklogs')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === 'worklogs'
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              <ClipboardCheck className="w-4 h-4 text-indigo-400" />
              <span>업무일지</span>
            </button>

            <button
              onClick={() => setActiveTab('approvals')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === 'approvals'
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              <FileSignature className="w-4 h-4 text-indigo-400" />
              <span>전자결재</span>
            </button>
          </nav>

          {/* 명함 등록 / 그룹관리 / 가져오기·내보내기 / 내 명함 공유 / 주변 레이더 (전체 명함과 이 줄에서 이동하는 탭들에서 계속 노출) */}
          {['cards', 'groups', 'io', 'nearby'].includes(activeTab) && (
          <div className="flex items-center gap-1.5 overflow-x-auto w-full pb-1 scrollbar-none">
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
              <span>음성으로 빠르게 등록</span>
            </button>

            <button
              onClick={() => setActiveTab('groups')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === 'groups'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
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
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
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
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              <MapPin className="w-4 h-4 text-rose-400 animate-bounce" />
              <span>주변 레이더 지도</span>
            </button>
          </div>
          )}

          {/* 명함 목록 탭일 때 우측 그룹 칩 필터링 */}
          {['cards', 'groups', 'io', 'nearby'].includes(activeTab) && (
            <div className="flex items-center gap-1.5 overflow-x-auto w-full">
              <span className="text-xs text-slate-500 mr-1 hidden lg:inline">그룹필터:</span>
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

          {/* 프로젝트 탭일 때: 새 프로젝트 등록 버튼 (상태필터 위) */}
          {activeTab === 'projects' && (
            <div className="flex items-center gap-1.5 overflow-x-auto w-full pb-1 scrollbar-none">
              <button
                onClick={onOpenNewProject}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold whitespace-nowrap bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs sm:text-sm shadow-md shadow-indigo-600/25 transition-all active:scale-95"
              >
                <Briefcase className="w-4 h-4" />
                <span>새 프로젝트 등록</span>
              </button>
              {/* [수정] "프로젝트 리스트": 이제 눌렀을 때 카드 화면으로 돌아가는 진짜 탭 역할을 한다.
                  엑셀/PDF 다운로드는 오른쪽의 작은 화살표(▼)를 따로 눌러야 열리도록 분리했다. */}
              <div className="relative flex items-stretch rounded-lg overflow-hidden border border-slate-200">
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
                    {/* 바깥 영역을 누르면 닫히도록 하는 투명 오버레이 */}
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

              {/* [수정] "리스트 출력" 탭: 누르면 카드 목록 대신 화면에 표 형태로 전체 프로젝트가 보이고,
                  그 화면 안에서 바로 엑셀/PDF로 출력할 수 있다. "프로젝트 리스트"를 누르면 다시 카드로 돌아간다. */}
              <button
                onClick={onShowProjectsListOutput}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold whitespace-nowrap text-xs sm:text-sm shadow-md transition-all active:scale-95 ${
                  projectsViewMode === 'listOutput'
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                    : 'bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>리스트 출력</span>
              </button>

              {/* [수정] "파이프라인" 탭: 영업 깔때기(기회→진행→완료/실패)와 핵심 지표를 한눈에 보는 대시보드 */}
              <button
                onClick={onShowProjectsPipeline}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold whitespace-nowrap text-xs sm:text-sm shadow-md transition-all active:scale-95 ${
                  projectsViewMode === 'pipeline'
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                    : 'bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>파이프라인</span>
              </button>
            </div>
          )}

          {/* 프로젝트 탭일 때 우측 상태 칩 필터링 */}
          {activeTab === 'projects' && (
            <div className="flex items-center gap-1.5 overflow-x-auto w-full">
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
          )}

        </div>
      </div>
    </header>

    {/* [수정] 개발자(운영자) 계정에서만 보이는 "문의함" 버튼. 회사 전체를 통틀어 모이는 데이터라
        일반 사용자에게는 노출하지 않는다. 이메일 알림이 SMTP 연결 문제로 불안정할 수 있어,
        앱 안에서 직접 확인할 수 있는 화면을 별도로 마련했다. */}
    {isDeveloperAccount && (
      <button
        type="button"
        onClick={() => setIsFeedbackInboxOpen(true)}
        className="fixed bottom-24 right-5 z-40 w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 shadow-xl flex items-center justify-center transition-all active:scale-95"
        title="문의함 (관리자 전용)"
      >
        <Inbox className="w-5 h-5" />
      </button>
    )}

    {isFeedbackInboxOpen && (
      <FeedbackInboxModal currentUser={currentUser} onClose={() => setIsFeedbackInboxOpen(false)} />
    )}

    {/* [수정] 명함뿐 아니라 앱 전체 어디서나 접수 가능한 플로팅 "문의하기" 버튼.
        Navigation은 모든 탭에서 공통으로 항상 렌더링되므로, 여기에 두면 어느 화면에 있든 계속 떠 있다. */}
    <button
      type="button"
      onClick={() => setIsFeedbackOpen(true)}
      className="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-gradient-to-tr from-indigo-600 to-blue-500 hover:from-indigo-500 hover:to-blue-400 text-white shadow-2xl shadow-indigo-600/40 flex items-center justify-center transition-all active:scale-95"
      title="문의하기"
    >
      <MessageCircleQuestion className="w-6 h-6" />
    </button>

    {isFeedbackOpen && (
      <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
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
