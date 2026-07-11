import React from 'react';
import { Users, MapPin, FolderTree, ArrowDownUp, PlusCircle, ScanLine, Search, Briefcase, Share2, User, LogOut, Building2, Car, ClipboardCheck } from 'lucide-react';
import { ContactGroup, Project, User as UserType } from '../types.js';

interface Props {
  activeTab: 'cards' | 'nearby' | 'groups' | 'io' | 'projects' | 'vehicles' | 'worklogs';
  setActiveTab: (tab: 'cards' | 'nearby' | 'groups' | 'io' | 'projects' | 'vehicles' | 'worklogs') => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedGroup: string;
  setSelectedGroup: (gid: string) => void;
  groups: ContactGroup[];
  onOpenScanModal: () => void;
  onOpenShareMyCardModal: () => void;
  onOpenUserDirectory: () => void;
  totalContactsCount: number;
  projectFilterStatus?: 'all' | 'opportunity' | 'progress' | 'completed' | 'failed';
  setProjectFilterStatus?: (status: 'all' | 'opportunity' | 'progress' | 'completed' | 'failed') => void;
  projects?: Project[];
  currentUser: UserType | null;
  onLogout: () => void;
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
  onOpenShareMyCardModal,
  onOpenUserDirectory,
  totalContactsCount,
  projectFilterStatus = 'all',
  setProjectFilterStatus = (_st) => {},
  projects = [],
  currentUser,
  onLogout
}) => {
  return (
    <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-slate-100 shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between py-4 md:py-0 md:h-16 gap-4">
          
          {/* 브랜드 로고 */}
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('cards')}>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/30 ring-2 ring-blue-400/40">
                <ScanLine className="w-6 h-6 text-white animate-pulse" />
              </div>
              <div>
                <h1 className="font-bold text-xl tracking-tight bg-gradient-to-r from-white via-slate-200 to-blue-400 bg-clip-text text-transparent">
                  BizCard <span className="text-blue-500 text-xs px-1.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 font-mono">AI Pro</span>
                </h1>
                <p className="text-xs text-slate-400 font-medium">스마트 명함 & CRM 네트워크</p>
              </div>
            </div>

            {/* 모바일 화면용 로그아웃 & 정보 (옵션) */}
            {currentUser && (
              <div className="flex items-center gap-2 md:hidden">
                <button
                  onClick={onLogout}
                  title="로그아웃"
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 border border-slate-700 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* 중앙 검색창 (명함 목록 뷰일 때 활성) */}
          {activeTab === 'cards' && (
            <div className="flex-1 max-w-sm relative hidden lg:block">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="이름, 회사명, 부서, 핸드폰, 메모 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all placeholder:text-slate-500"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
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
              <div className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-2xl px-3 py-1.5 text-xs text-slate-300">
                {currentUser.type === 'company' ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-pulse" />
                    <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                    <div>
                      <p className="font-bold text-slate-100 max-w-[100px] truncate">{currentUser.companyName}</p>
                      <p className="text-[9px] text-slate-500">사업자: {currentUser.businessNumber}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
                    <User className="w-3.5 h-3.5 text-emerald-400" />
                    <div>
                      <p className="font-bold text-slate-100">{currentUser.name}</p>
                      <p className="text-[9px] text-slate-500">개인 공간</p>
                    </div>
                  </div>
                )}
                
                <div className="w-[1px] h-6 bg-slate-800 mx-1 hidden sm:block" />

                <div className="hidden sm:flex flex-col text-right">
                  <span className="font-medium text-slate-400 text-[10px]">{currentUser.name} 님</span>
                  <span className="text-[9px] text-slate-600 truncate max-w-[120px]">{currentUser.email}</span>
                </div>

                <button
                  onClick={onLogout}
                  title="로그아웃"
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-rose-400 transition-colors ml-1 hidden md:block"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2">
              {/* 가입 회원 및 동료 확인 버튼 */}
              <button
                onClick={onOpenUserDirectory}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-indigo-300 font-semibold text-xs shadow transition-all active:scale-95"
              >
                <Users className="w-3.5 h-3.5 text-indigo-400" />
                <span>가입 회원 확인</span>
              </button>

              {/* 내 명함 전송/공유 버튼 */}
              <button
                onClick={onOpenShareMyCardModal}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-blue-300 font-semibold text-xs shadow transition-all active:scale-95"
              >
                <Share2 className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden sm:inline">내 명함 공유</span>
              </button>

              {/* AI 명함 스캔 등록 버튼 */}
              <button
                onClick={onOpenScanModal}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs sm:text-sm shadow-lg shadow-blue-600/30 hover:shadow-blue-600/50 transition-all active:scale-95"
              >
                <PlusCircle className="w-4 h-4" />
                <span>명함 등록</span>
              </button>
            </div>
          </div>
        </div>

        {/* 하단 탭 내비게이션 & 그룹 필터바 */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-2.5 gap-3 border-t border-slate-800/80 text-sm">
          
          <nav className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              onClick={() => setActiveTab('cards')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === 'cards'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>전체 명함</span>
              <span className="px-1.5 py-0.2 rounded-full text-xs bg-slate-800 text-slate-300 font-mono">{totalContactsCount}</span>
            </button>

            <button
              onClick={() => setActiveTab('vehicles')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === 'vehicles'
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
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
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
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
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <ClipboardCheck className="w-4 h-4 text-indigo-400" />
              <span>업무일지</span>
            </button>

            <button
              onClick={() => setActiveTab('nearby')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === 'nearby'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <MapPin className="w-4 h-4 text-rose-400 animate-bounce" />
              <span>주변 레이더 지도</span>
            </button>

            <button
              onClick={() => setActiveTab('groups')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                activeTab === 'groups'
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
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
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <ArrowDownUp className="w-4 h-4 text-emerald-400" />
              <span>가져오기 / 내보내기</span>
            </button>
          </nav>

          {/* 명함 목록 탭일 때 우측 그룹 칩 필터링 */}
          {activeTab === 'cards' && (
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
              <span className="text-xs text-slate-400 mr-1 hidden lg:inline">그룹필터:</span>
              <button
                onClick={() => setSelectedGroup('all')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                  selectedGroup === 'all'
                    ? 'bg-slate-100 text-slate-900 shadow font-bold'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
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
                      : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}

          {/* 프로젝트 탭일 때 우측 상태 칩 필터링 */}
          {activeTab === 'projects' && (
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
              <span className="text-xs text-slate-400 mr-1 hidden lg:inline font-medium">상태필터:</span>
              <button
                onClick={() => setProjectFilterStatus('all')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                  projectFilterStatus === 'all'
                    ? 'bg-slate-100 text-slate-900 shadow font-bold'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}
              >
                전체보기 ({projects.length})
              </button>
              <button
                onClick={() => setProjectFilterStatus('opportunity')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${
                  projectFilterStatus === 'opportunity'
                    ? 'bg-blue-500 text-white border-blue-400 font-bold scale-105 ring-2 ring-white/30'
                    : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-700'
                }`}
              >
                💡 기회 ({projects.filter(p => p.status === 'opportunity').length})
              </button>
              <button
                onClick={() => setProjectFilterStatus('progress')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${
                  projectFilterStatus === 'progress'
                    ? 'bg-amber-500 text-amber-950 border-amber-400 font-bold scale-105 ring-2 ring-white/30'
                    : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-700'
                }`}
              >
                ⚡ 진행 ({projects.filter(p => p.status === 'progress').length})
              </button>
              <button
                onClick={() => setProjectFilterStatus('completed')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${
                  projectFilterStatus === 'completed'
                    ? 'bg-emerald-500 text-white border-emerald-400 font-bold scale-105 ring-2 ring-white/30'
                    : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-700'
                }`}
              >
                ✅ 완료 ({projects.filter(p => p.status === 'completed').length})
              </button>
              <button
                onClick={() => setProjectFilterStatus('failed')}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap border ${
                  projectFilterStatus === 'failed'
                    ? 'bg-rose-500 text-white border-rose-400 font-bold scale-105 ring-2 ring-white/30'
                    : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-700'
                }`}
              >
                ❌ 실패 ({projects.filter(p => p.status === 'failed').length})
              </button>
            </div>
          )}

        </div>
      </div>
    </header>
  );
};
