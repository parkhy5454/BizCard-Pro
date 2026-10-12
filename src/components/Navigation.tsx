import React, { useState } from 'react';
import { Users, MapPin, FolderTree, ArrowDownUp, PlusCircle, ScanLine, Search, Briefcase, Share2, User, LogOut, UserX, CreditCard, Building2, Car, ClipboardCheck, FileSignature, MessageCircleQuestion, X, Bug, Lightbulb, MessageSquare, Send, CheckCircle2, FileSpreadsheet, Printer, ChevronDown, ListChecks, FileText, Inbox, TrendingUp, Mic, Sparkles, Download, History, LayoutDashboard, Calculator, Gift, Network, Megaphone, MessagesSquare } from 'lucide-react';
import { FeedbackInboxModal } from './FeedbackInboxModal.js';
import { ReferralModal } from './ReferralModal.js';
import { RemindersBell } from './RemindersBell.js';
import { ContactGroup, Project, User as UserType } from '../types.js';
import { getTodayLocalStr } from '../dateUtils.js';
import { TabType, TAB_CONFIGS, canAccessTab, getAccessDenialReason } from '../constants/tabs.js';

interface Props {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
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
  onRequestViewReset?: () => void;
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
  onRequestViewReset = () => {}
}) => {
  const handleMainTabClick = (tab: Parameters<typeof setActiveTab>[0]) => {
    if (tab === activeTab) {
      onRequestViewReset();
    } else {
      setActiveTab(tab);
    }
  };
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isFeedbackInboxOpen, setIsFeedbackInboxOpen] = useState(false);
  const [isReferralOpen, setIsReferralOpen] = useState(false);
  const isDeveloperAccount = currentUser?.email === 'parkhy5454@gmail.com';
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);
  const canAccessBackup = currentUser?.type === 'individual' || currentUser?.role === 'admin';
  const handleDownloadBackup = async () => {
    if (!currentUser || isDownloadingBackup) return;
    setIsDownloadingBackup(true);
    try {
      const res = await fetch('/api/backup/export', { headers: { 'x-user-id': currentUser.id } });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `백업에 실패했습니다 (상태: ${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bizcard-backup-${getTodayLocalStr()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`데이터 백업에 실패했습니다.\n${err.message || '잠시 후 다시 시도해주세요.'}`);
    } finally {
      setIsDownloadingBackup(false);
    }
  };
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
    setTimeout(() => {
      setFeedbackSubmitted(false);
      setFeedbackError('');
      setFeedbackCategory('bug');
    }, 300);
  };


  return (
    <>
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 text-slate-800 pt-[env(safe-area-inset-top)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between py-4 md:py-0 md:h-16 gap-4">
          
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('cards')}>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/30 ring-2 ring-blue-400/40">
                <ScanLine className="w-6 h-6 text-white animate-pulse" />
              </div>
              <div>
                <h1 className="font-bold text-xl tracking-tight bg-gradient-to-r from-slate-900 via-indigo-700 to-blue-600 bg-clip-text text-transparent">
                  BizCard
                </h1>
                <p className="text-xs text-slate-500 font-medium">스마트 명함 & CRM</p>
              </div>
            </div>

            {currentUser && (
              <div className="flex items-center gap-2 md:hidden min-w-0 overflow-x-auto scrollbar-none">
                <button
                  onClick={onOpenGlobalSearch}
                  title="전체 검색"
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-blue-500 border border-slate-200 transition-colors shrink-0"
                >
                  <Search className="w-4 h-4" />
                </button>
                <span className="shrink-0">
                  <RemindersBell currentUser={currentUser} onNavigate={(tab) => setActiveTab(tab)} />
                </span>
                <button
                  onClick={onOpenSubscriptionModal}
                  title="구독 관리"
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-indigo-400 border border-slate-200 transition-colors shrink-0"
                >
                  <CreditCard className="w-4 h-4" />
                </button>
                {canAccessBackup && (
                  <button
                    onClick={handleDownloadBackup}
                    disabled={isDownloadingBackup}
                    title="데이터 백업"
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-emerald-500 border border-slate-200 transition-colors disabled:opacity-40 shrink-0"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={onLogout}
                  title="로그아웃"
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-rose-400 border border-slate-200 transition-colors shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                </button>
                <button
                  onClick={onOpenWithdrawModal}
                  title="회원 탈퇴"
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-rose-500 border border-slate-200 transition-colors shrink-0"
                >
                  <UserX className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

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

          <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto">
            
            {currentUser && (
              <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-2xl px-3 py-1.5 text-xs text-slate-600 shrink-0">
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
                  onClick={onOpenGlobalSearch}
                  title="전체 검색 (명함/프로젝트/차량/업무일지)"
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-blue-500 transition-colors hidden md:block"
                >
                  <Search className="w-3.5 h-3.5" />
                </button>
                <span className="hidden md:block">
                  <RemindersBell currentUser={currentUser} onNavigate={(tab) => setActiveTab(tab)} />
                </span>
                <button
                  onClick={onOpenSubscriptionModal}
                  title="구독 관리"
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-400 transition-colors hidden md:block"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                </button>
                {canAccessBackup && (
                  <button
                    onClick={handleDownloadBackup}
                    disabled={isDownloadingBackup}
                    title="데이터 백업 (전체 내려받기)"
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-emerald-500 transition-colors ml-1 hidden md:block disabled:opacity-40"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={onLogout}
                  title="로그아웃"
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-rose-400 transition-colors ml-1 hidden md:block"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onOpenWithdrawModal}
                  title="회원 탈퇴"
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-rose-500 transition-colors hidden md:block"
                >
                  <UserX className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 min-w-0 overflow-x-auto scrollbar-none">
              <button
                onClick={onOpenTaxPackage}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-semibold text-xs shadow transition-all active:scale-95 shrink-0 whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="hidden sm:inline">세무자료 발송</span>
              </button>

              <button
                onClick={onOpenUserDirectory}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-semibold text-xs shadow transition-all active:scale-95 shrink-0 whitespace-nowrap"
              >
                <Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>가입 회원 확인</span>
              </button>

              {currentUser && (
                <button
                  type="button"
                  onClick={() => setIsReferralOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-semibold text-xs shadow transition-all active:scale-95 shrink-0 whitespace-nowrap"
                >
                  <Gift className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>친구 추천</span>
                </button>
              )}

              {isDeveloperAccount && (
                <button
                  type="button"
                  onClick={() => setIsFeedbackInboxOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-semibold text-xs shadow transition-all active:scale-95 shrink-0 whitespace-nowrap"
                  title="문의함 (관리자 전용)"
                >
                  <Inbox className="w-3.5 h-3.5 shrink-0" />
                  <span>문의함</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-start py-2 gap-1.5 border-t border-slate-200 text-sm">

          <nav className="flex items-center gap-1 overflow-x-auto w-full pb-1 scrollbar-none">
            {TAB_CONFIGS.map((tabConfig) => {
              const isAuthenticated = !!currentUser;
              const isApproved = currentUser?.approvalStatus === 'approved';
              const isEmailVerified = currentUser?.emailVerified ?? false;

              const canAccess = canAccessTab(
                tabConfig.id,
                isAuthenticated,
                isApproved,
                isEmailVerified
              );

              if (!canAccess) return null;

              const IconComponent = tabConfig.icon;
              const isActive = activeTab === tabConfig.id;
              const denialReason = getAccessDenialReason(
                tabConfig.id,
                isAuthenticated,
                isApproved,
                isEmailVerified
              );

              return (
                <button
                  key={tabConfig.id}
                  onClick={() => handleMainTabClick(tabConfig.id)}
                  title={denialReason || tabConfig.description}
                  disabled={denialReason !== null}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed'
                  }`}
                >
                  <IconComponent className="w-4 h-4 text-indigo-400" />
                  <span>
                    {tabConfig.id === 'cards' ? (
                      <>
                        {tabConfig.label}
                        <span className="ml-2 px-1.5 py-0.2 rounded-full text-xs bg-slate-100 text-slate-600 font-mono">
                          {totalContactsCount}
                        </span>
                      </>
                    ) : (
                      tabConfig.label
                    )}
                  </span>
                </button>
              );
            })}
          </nav>

          {['cards', 'groups', 'io', 'nearby', 'projects'].includes(activeTab) && (
            <div className="w-full border-t border-slate-200" />
          )}

          {['cards', 'groups', 'io', 'nearby'].includes(activeTab) && (
          <div className="flex items-center gap-1.5 overflow-x-auto w-full p-1.5 bg-slate-100 border border-slate-200 rounded-xl scrollbar-none">
            <button
              onClick={onOpenScanModal}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold whitespace-nowrap bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs sm:text-sm shadow-md shadow-blue-600/25 transition-all active:scale-95"
            >
              <PlusCircle className="w-4 h-4" />
              <span>명함 등록</span>
            </button>

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

          {activeTab === 'projects' && (
            <div className="flex items-center gap-1.5 overflow-x-auto w-full p-1.5 bg-slate-100 border border-slate-200 rounded-xl scrollbar-none">
              <button
                onClick={onOpenNewProject}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold whitespace-nowrap bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs sm:text-sm shadow-md shadow-indigo-600/25 transition-all active:scale-95"
              >
                <Briefcase className="w-4 h-4" />
                <span>새 프로젝트 등록</span>
              </button>
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

              <button
                onClick={onShowProjectsListOutput}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold whitespace-nowrap text-xs sm:text-sm shadow-md transition-all active:scale-95 ${
                  projectsViewMode === 'listOutput'
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                    : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-600'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>리스트 출력</span>
              </button>

              {currentUser?.role === 'admin' && (
                <button
                  onClick={onShowProjectsPnl}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold whitespace-nowrap text-xs sm:text-sm shadow-md transition-all active:scale-95 ${
                    projectsViewMode === 'pnl'
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                      : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-600'
                  }`}
                >
                  <Calculator className="w-4 h-4" />
                  <span>원가계산서</span>
                </button>
              )}

              <button
                onClick={onShowProjectsPipeline}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-semibold whitespace-nowrap text-xs sm:text-sm shadow-md transition-all active:scale-95 ${
                  projectsViewMode === 'pipeline'
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40'
                    : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-600'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>파이프라인</span>
              </button>
            </div>
          )}

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

    {isFeedbackInboxOpen && (
      <FeedbackInboxModal currentUser={currentUser} onClose={() => setIsFeedbackInboxOpen(false)} />
    )}

    {isReferralOpen && currentUser && (
      <ReferralModal currentUser={currentUser} onClose={() => setIsReferralOpen(false)} />
    )}

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
