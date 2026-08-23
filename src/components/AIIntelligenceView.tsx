import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, Calendar, Building2, Users, TrendingUp, AlertCircle, Clock, Search, RefreshCw, Briefcase, Phone, ChevronRight, CheckCircle2, ListTodo, UserPlus, X } from 'lucide-react';
import { BusinessCard, ContactGroup, Project, User as UserType, DailyWorkLog, WeeklyWorkLog } from '../types.js';
import { getIntelExcludedGroupIds } from '../contactFilters.js';
import { getTodayLocalStr } from '../dateUtils.js';

interface Props {
  contacts: BusinessCard[];
  groups: ContactGroup[];
  projects: Project[];
  currentUser: UserType | null;
  onSelectContact?: (contact: BusinessCard) => void;
  onNavigateToProjects?: () => void;
  onOpenProject?: (projectId: string) => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// [추가] "기업 인텔리전스"/"관계·영업 인텔리전스"는 원래 외부 거래처·잠재고객을 분석하려는
// 목적인데, 명함첩에 우리 회사 직원 명함이 하나라도 등록돼 있으면(예: 명함 스캔 중 실수로,
// 또는 사내 인맥 관리 목적으로) 그 회사 자체가 분석 대상 기업 목록/랭킹에 같이 섞여
// 들어가버린다. "(주)"/"주식회사" 표기나 공백 유무 차이로도 같은 회사를 놓치지 않도록
// 정규화해서 비교한 뒤, 로그인한 사람의 소속 회사와 일치하는 명함은 두 탭의 분석
// 대상에서 제외한다.
const normalizeCompanyName = (s: string): string =>
  (s || '').trim().replace(/^(주식회사|㈜|\(주\))\s*/, '').replace(/\s*(주식회사|㈜|\(주\))$/, '').replace(/\s+/g, '').toLowerCase();

// [추가] 세 서브탭 전부 기본적으로는 DB/규칙 기반 데이터만 즉시 보여주고(AI 호출 0회),
// "정말 궁금할 때"만 이 버튼을 눌러야 그 순간 딱 한 번 Gemini를 부른다. 이미 화면에 보여준
// (계산이 끝난) 데이터를 그대로 서버에 넘겨서 "해석/조언"만 부탁하는 방식이라, 매번 처음부터
// 다시 검색·계산하는 것보다 가볍다. 탭을 열 때마다 자동으로 도는 게 절대 아니고, 사용자가
// 버튼을 누른 횟수만큼만 호출되므로 비용/할당량이 실제 사용량에 비례한다.
const AiAnalysisPanel: React.FC<{ label: string; endpoint: string; payload: any; disabled?: boolean; disabledReason?: string }> = ({ label, endpoint, payload, disabled, disabledReason }) => {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'AI 분석에 실패했습니다.');
      setAnalysis(data.analysis);
    } catch (err: any) {
      setError(err.message || 'AI 분석에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mb-1">
      {!analysis ? (
        <button
          type="button"
          onClick={handleClick}
          disabled={isLoading || disabled}
          title={disabled ? disabledReason : undefined}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold shadow-md shadow-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
        >
          {isLoading ? (
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          <span>{isLoading ? '분석 중...' : label}</span>
        </button>
      ) : (
        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI 분석 결과</span>
            <button type="button" onClick={handleClick} disabled={isLoading} className="text-[10px] text-indigo-500 hover:text-indigo-700 font-semibold flex items-center gap-1 disabled:opacity-40">
              {isLoading ? <div className="w-2.5 h-2.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />}
              다시 분석
            </button>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{analysis}</p>
        </div>
      )}
      {error && <p className="text-xs text-rose-500 mt-1.5">{error}</p>}
    </div>
  );
};

// [추가] AI Intelligence 최상위 화면. 세 서브탭(오늘의 브리핑/기업 인텔리전스/관계·영업
// 인텔리전스)을 묶는다. "오늘의 브리핑"과 "관계·영업 인텔리전스"는 이미 갖고 있는 데이터
// (명함/프로젝트/업무일지)를 규칙 기반으로 분석해서 보여주므로 AI 호출이 전혀 없고, "기업
// 인텔리전스"만 회사 캐시 테이블(company)을 조회/검색한다 — 하루 검색 할당량을 아끼기 위해
// 꼭 필요한 곳에만 AI를 쓴다.
export const AIIntelligenceView: React.FC<Props> = ({ contacts, groups, projects, currentUser, onSelectContact, onNavigateToProjects, onOpenProject }) => {
  const [activeSubTab, setActiveSubTab] = useState<'briefing' | 'company' | 'relationship'>('briefing');

  // [추가] "기업 인텔리전스"/"관계·영업 인텔리전스" 두 탭에서만 (1) 우리 회사 자신과
  // (2) [회사(company) 계정에 한해서만] "나만 보기(비공개)"로 설정된 그룹에 속한 명함
  // (교회/동창회/동호회 등 - 만든 사람 본인 것이든 남의 것이든 상관없이), (3) 은행/보증/
  // 보험/컨설팅/투자/변호사/변리사, 인증/연구소/협회 그룹에 속한 명함(자문/제휴 성격
  // 기관이라 실제 영업 대상 거래처가 아님)을 뺀 명함 목록을 쓴다. 두 탭 모두 "거래처/영업
  // 대상 기업"을 분석하려는 목적인데, 이런 그룹까지 회사 랭킹에 섞이면 분석 결과가 흐려지기
  // 때문. 개인(individual) 계정은 혼자 쓰는 계정이라 이 (2)(3) 제외 없이 모든 명함을 그대로
  // 쓴다. "오늘의 브리핑"은 원래도 내 할 일 위주라 그대로 둔다.
  const myCompanyNorm = normalizeCompanyName(currentUser?.companyName || '');
  const intelExcludedGroupIds = useMemo(() => getIntelExcludedGroupIds(groups, currentUser?.type), [groups, currentUser?.type]);
  const externalContacts = useMemo(
    () => contacts.filter((c) => {
      if (myCompanyNorm && normalizeCompanyName(c.company) === myCompanyNorm) return false;
      if ((c.groupIds || []).some((gid) => intelExcludedGroupIds.has(gid))) return false;
      return true;
    }),
    [contacts, myCompanyNorm, intelExcludedGroupIds]
  );

  const subTabs: { id: typeof activeSubTab; label: string; icon: any; desc: string }[] = [
    { id: 'briefing', label: '오늘의 브리핑', icon: Calendar, desc: '지금 내가 해야 할 일과 중요한 변화' },
    { id: 'company', label: '기업 인텔리전스', icon: Building2, desc: '회사·기관 분석' },
    { id: 'relationship', label: '관계·영업 인텔리전스', icon: Users, desc: '사람·거래처·영업기회 분석' }
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800">AI Intelligence</h2>
          <p className="text-xs text-slate-400">등록된 명함·프로젝트·업무일지를 분석해서 지금 챙겨야 할 것을 알려드립니다</p>
        </div>
      </div>

      <div className="flex gap-1.5 border-b border-slate-200 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-t-lg font-semibold text-sm whitespace-nowrap transition-all border-b-2 ${
                active ? 'text-indigo-600 border-indigo-500' : 'text-slate-400 border-transparent hover:text-slate-600'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeSubTab === 'briefing' && (
        <BriefingTab contacts={contacts} projects={projects} currentUser={currentUser} onSelectContact={onSelectContact} onNavigateToProjects={onNavigateToProjects} onOpenProject={onOpenProject} />
      )}
      {activeSubTab === 'company' && <CompanyIntelligenceTab contacts={externalContacts} onSelectContact={onSelectContact} />}
      {activeSubTab === 'relationship' && (
        <RelationshipIntelligenceTab contacts={externalContacts} projects={projects} onSelectContact={onSelectContact} onNavigateToProjects={onNavigateToProjects} />
      )}
    </div>
  );
};

// ============================================================
// 1) 오늘의 브리핑
// ============================================================
const BriefingTab: React.FC<{
  contacts: BusinessCard[];
  projects: Project[];
  currentUser: UserType | null;
  onSelectContact?: (c: BusinessCard) => void;
  onNavigateToProjects?: () => void;
  onOpenProject?: (projectId: string) => void;
}> = ({ contacts, projects, currentUser, onSelectContact, onNavigateToProjects, onOpenProject }) => {
  const [dailyLogs, setDailyLogs] = useState<DailyWorkLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    setIsLoading(true);
    fetch('/api/worklogs/daily', { headers: { 'x-user-id': currentUser.id } })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setDailyLogs(Array.isArray(data) ? data : []))
      .catch((err) => console.error('업무일지 불러오기 실패:', err))
      .finally(() => setIsLoading(false));
  }, [currentUser?.id]);

  const todayStr = getTodayLocalStr();
  const todayLogs = useMemo(() => dailyLogs.filter((l) => l.date === todayStr), [dailyLogs, todayStr]);
  const myTodayLog = useMemo(() => todayLogs.find((l) => l.author === currentUser?.name), [todayLogs, currentUser]);

  const activeProjects = useMemo(() => projects.filter((p) => p.status === 'opportunity' || p.status === 'progress'), [projects]);
  const dueTodayProjects = useMemo(() => activeProjects.filter((p) => p.dueDate === todayStr), [activeProjects, todayStr]);
  const dueSoonProjects = useMemo(() => {
    const now = Date.now();
    return activeProjects
      .filter((p) => {
        if (!p.dueDate || p.dueDate === todayStr) return false;
        const days = (new Date(p.dueDate).getTime() - now) / DAY_MS;
        return days > 0 && days <= 3;
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [activeProjects, todayStr]);
  const overdueProjects = useMemo(() => {
    const now = Date.now();
    return activeProjects.filter((p) => p.dueDate && new Date(p.dueDate).getTime() < now);
  }, [activeProjects]);

  const recentContacts = useMemo(() => {
    const cutoff = Date.now() - 3 * DAY_MS;
    return contacts
      .filter((c) => new Date(c.createdAt).getTime() >= cutoff)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [contacts]);

  const tomorrowPlans = useMemo(() => todayLogs.filter((l) => l.tasksTomorrow?.trim()), [todayLogs]);

  // [수정] 요청에 따라 "오늘 해야 할 일 / 프로젝트 / 네트워크 / 영업" 4개 카테고리로
  // 명확하게 묶었다. 계산 자체는 그대로(규칙 기반, AI 호출 없음)이고 보여주는 구조만 정리.
  // (이 두 훅은 아래 로딩 중 조기 return보다 반드시 앞에 있어야 훅 호출 순서가 매 렌더링마다
  // 일정하게 유지된다 - React 훅 규칙.)
  const recentCalls = useMemo(() => {
    const calls: { contact: BusinessCard; timestamp: string; type: string }[] = [];
    const typeLabel: Record<string, string> = { incoming: '수신', outgoing: '발신', missed: '부재중' };
    contacts.forEach((c) => {
      (c.callHistory || []).forEach((h) => calls.push({ contact: c, timestamp: h.timestamp, type: typeLabel[h.type] || '통화' }));
    });
    return calls.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 5);
  }, [contacts]);

  // [수정] "진행 중 N건"을 숫자만 보여주던 것을, 네트워크 섹션의 "최근 신규 명함"처럼
  // 실제 프로젝트 목록을 눌러서 바로 그 프로젝트로 이동할 수 있게 바꾼다.
  const inProgressProjects = useMemo(() => projects.filter((p) => p.status === 'progress'), [projects]);
  const inProgressProjectsCount = inProgressProjects.length;

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-slate-400">불러오는 중...</div>;
  }

  const hasNothing = dueTodayProjects.length === 0 && dueSoonProjects.length === 0 && overdueProjects.length === 0
    && recentContacts.length === 0 && todayLogs.length === 0 && recentCalls.length === 0;

  return (
    <div className="space-y-5">
      {/* [추가] "오늘의 브리핑 해석" - 아래에 이미 즉시 표시된(무료) 데이터를 그대로 AI에게
      넘겨서 우선순위·조언만 부탁하는 버튼. 자동으로 안 도는 순수 사용자 액션. */}
      <AiAnalysisPanel
        label="AI 오늘의 브리핑 해석"
        endpoint="/api/ai-intelligence/briefing-analysis"
        payload={{
          briefing: {
            myTodayLogWritten: !!myTodayLog,
            myTodayLogSummary: myTodayLog?.tasksToday || null,
            dueTodayProjects: dueTodayProjects.map((p) => ({ name: p.name, priority: p.priority })),
            overdueProjects: overdueProjects.map((p) => ({ name: p.name, dueDate: p.dueDate, priority: p.priority })),
            dueSoonProjects: dueSoonProjects.map((p) => ({ name: p.name, dueDate: p.dueDate, priority: p.priority })),
            recentContactsCount: recentContacts.length,
            tomorrowPlans: tomorrowPlans.map((l) => ({ author: l.author, plan: l.tasksTomorrow }))
          }
        }}
      />

      {hasNothing && (
        <div className="py-12 text-center text-sm text-slate-400">오늘 특별히 챙길 항목이 없습니다. 편안한 하루 되세요.</div>
      )}

      {/* 📋 오늘 해야 할 일 */}
      <BriefingGroup emoji="📋" title="오늘 해야 할 일">
        <div className={`p-3.5 rounded-2xl border ${myTodayLog ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center gap-2">
            {myTodayLog ? <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600" /> : <AlertCircle className="w-4.5 h-4.5 text-amber-600" />}
            <p className={`text-sm font-bold ${myTodayLog ? 'text-emerald-700' : 'text-amber-700'}`}>
              {myTodayLog ? '오늘 업무일지를 작성하셨습니다' : '오늘 업무일지를 아직 작성하지 않으셨습니다'}
            </p>
          </div>
          {myTodayLog && <p className="text-xs text-slate-500 mt-1.5 pl-6 line-clamp-2">{myTodayLog.tasksToday}</p>}
        </div>
        {tomorrowPlans.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-slate-400">내일 예정 사항 미리보기</p>
            {tomorrowPlans.map((l) => (
              <div key={l.id} className="p-2.5 rounded-xl bg-white border border-slate-100">
                <p className="text-xs font-bold text-slate-500 mb-1">{l.author}</p>
                <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-3">{l.tasksTomorrow}</p>
              </div>
            ))}
          </div>
        )}
      </BriefingGroup>

      {/* 📊 프로젝트 */}
      <BriefingGroup emoji="📊" title="프로젝트">
        {overdueProjects.length === 0 && dueSoonProjects.length === 0 && dueTodayProjects.length === 0 && inProgressProjectsCount === 0 ? (
          <p className="text-xs text-slate-400">진행 중인 프로젝트가 없습니다.</p>
        ) : (
          <>
            {overdueProjects.length > 0 && (
              <Section title={`🔴 마감 지남 ${overdueProjects.length}건`} icon={AlertCircle} tone="rose">
                {overdueProjects.slice(0, 5).map((p) => <ProjectRow key={p.id} project={p} onClick={onNavigateToProjects} />)}
              </Section>
            )}
            {dueTodayProjects.length > 0 && (
              <Section title={`🟠 오늘 마감 ${dueTodayProjects.length}건`} icon={Clock} tone="amber">
                {dueTodayProjects.map((p) => <ProjectRow key={p.id} project={p} onClick={onNavigateToProjects} />)}
              </Section>
            )}
            {dueSoonProjects.length > 0 && (
              <Section title={`🟠 3일 이내 마감 ${dueSoonProjects.length}건`} icon={Clock} tone="amber">
                {dueSoonProjects.map((p) => <ProjectRow key={p.id} project={p} onClick={onNavigateToProjects} />)}
              </Section>
            )}
            {inProgressProjects.length > 0 && (
              <Section title={`🟢 진행 중 ${inProgressProjects.length}건`} icon={CheckCircle2} tone="indigo">
                {inProgressProjects.slice(0, 8).map((p) => (
                  <ProjectRow key={p.id} project={p} onClick={() => onOpenProject?.(p.id)} />
                ))}
                {inProgressProjects.length > 8 && (
                  <button onClick={onNavigateToProjects} className="text-[11px] text-indigo-500 hover:text-indigo-700 font-semibold underline">
                    전체 {inProgressProjects.length}건 보기
                  </button>
                )}
              </Section>
            )}
          </>
        )}
      </BriefingGroup>

      {/* 📇 네트워크 */}
      <BriefingGroup emoji="📇" title="네트워크">
        {recentContacts.length === 0 && recentCalls.length === 0 ? (
          <p className="text-xs text-slate-400">최근 3일간 새로운 활동이 없습니다.</p>
        ) : (
          <>
            {recentContacts.length > 0 && (
              <Section title={`최근 3일 신규 명함 ${recentContacts.length}건`} icon={UserPlus} tone="indigo">
                {recentContacts.slice(0, 8).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onSelectContact?.(c)}
                    className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-slate-100 hover:border-indigo-200 transition-colors text-left"
                  >
                    <p className="text-sm font-bold text-slate-700 truncate">{c.name} <span className="text-xs font-normal text-slate-400">{c.company}</span></p>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </button>
                ))}
              </Section>
            )}
            {recentCalls.length > 0 && (
              <Section title="최근 통화/문자" icon={Phone} tone="indigo">
                {recentCalls.map((call, idx) => (
                  <button
                    key={idx}
                    onClick={() => onSelectContact?.(call.contact)}
                    className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-slate-100 hover:border-indigo-200 transition-colors text-left"
                  >
                    <p className="text-xs text-slate-600"><span className="font-bold text-slate-800">{call.contact.name}</span> <span className="text-slate-400">{call.contact.company}</span> · {call.type}</p>
                    <span className="text-[10px] text-slate-400 shrink-0">{new Date(call.timestamp).toLocaleDateString('ko-KR')}</span>
                  </button>
                ))}
              </Section>
            )}
          </>
        )}
      </BriefingGroup>

      {/* 💰 영업 */}
      <BriefingGroup emoji="💰" title="영업">
        {dueSoonProjects.length === 0 && dueTodayProjects.length === 0 && inProgressProjectsCount === 0 ? (
          <p className="text-xs text-slate-400">오늘 특별히 후속 연락할 영업 건이 없습니다.</p>
        ) : (
          <>
            {(dueTodayProjects.length > 0 || dueSoonProjects.length > 0) && (
              <Section title={`오늘 후속 연락 대상 ${dueTodayProjects.length + dueSoonProjects.length}건`} icon={Phone} tone="rose">
                {[...dueTodayProjects, ...dueSoonProjects].map((p) => <ProjectRow key={p.id} project={p} onClick={onNavigateToProjects} />)}
              </Section>
            )}
            {inProgressProjects.length > 0 && (
              <Section title={`진행 중인 영업 건 ${inProgressProjects.length}건`} icon={Phone} tone="indigo">
                {inProgressProjects.slice(0, 8).map((p) => (
                  <ProjectRow key={p.id} project={p} onClick={() => onOpenProject?.(p.id)} />
                ))}
                {inProgressProjects.length > 8 && (
                  <button onClick={onNavigateToProjects} className="text-[11px] text-indigo-500 hover:text-indigo-700 font-semibold underline">
                    전체 {inProgressProjects.length}건 보기
                  </button>
                )}
              </Section>
            )}
          </>
        )}
      </BriefingGroup>
    </div>
  );
};

const BriefingGroup: React.FC<{ emoji: string; title: string; children: React.ReactNode }> = ({ emoji, title, children }) => (
  <div className="space-y-2.5">
    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
      <span>{emoji}</span>
      <span>{title}</span>
    </h3>
    <div className="space-y-3 pl-1">{children}</div>
  </div>
);


const Section: React.FC<{ title: string; icon: any; tone: 'rose' | 'amber' | 'indigo'; children: React.ReactNode }> = ({ title, icon: Icon, tone, children }) => {
  const toneMap = {
    rose: 'text-rose-600 bg-rose-50 border-rose-100',
    amber: 'text-amber-600 bg-amber-50 border-amber-100',
    indigo: 'text-indigo-600 bg-indigo-50 border-indigo-100'
  };
  return (
    <div className="space-y-2">
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${toneMap[tone]}`}>
        <Icon className="w-3.5 h-3.5" />
        <span>{title}</span>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
};

const ProjectRow: React.FC<{ project: Project; onClick?: () => void }> = ({ project, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-slate-100 hover:border-indigo-200 transition-colors text-left"
  >
    <div className="min-w-0">
      <p className="text-sm font-bold text-slate-700 truncate">{project.name}</p>
      <p className="text-xs text-slate-400">{project.dueDate} · {project.priority === 'high' ? '우선순위 높음' : project.priority === 'medium' ? '우선순위 보통' : '우선순위 낮음'}</p>
    </div>
    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
  </button>
);

// ============================================================
// 2) 기업 인텔리전스
// ============================================================
interface CompanyCacheItem {
  company_name: string;
  company_name_normalized: string;
  business_number: string | null;
  industry: string | null;
  main_business: string | null;
  website: string | null;
  employees: string | null;
  sales: string | null;
  business_summary: string | null;
  source_urls: string[] | null;
  last_searched_at: string;
}

const normalizeCompanyKeyClient = (name: string) =>
  name.trim().replace(/\(주\)|주식회사|㈜/g, '').replace(/\s+/g, '').toLowerCase();

const CompanyIntelligenceTab: React.FC<{ contacts: BusinessCard[]; onSelectContact?: (c: BusinessCard) => void }> = ({ contacts, onSelectContact }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [cacheMap, setCacheMap] = useState<Record<string, CompanyCacheItem>>({});
  const [searchingKey, setSearchingKey] = useState<string | null>(null);
  const [isLoadingBatch, setIsLoadingBatch] = useState(true);

  // 명함들에서 회사 목록 추출 (중복 제거, 소속 인원수 카운트)
  const companyList = useMemo(() => {
    const map = new Map<string, { name: string; key: string; count: number }>();
    contacts.forEach((c) => {
      if (!c.company?.trim()) return;
      const key = normalizeCompanyKeyClient(c.company);
      if (!key) return;
      const existing = map.get(key);
      if (existing) existing.count += 1;
      else map.set(key, { name: c.company, key, count: 1 });
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [contacts]);

  const filteredList = useMemo(() => {
    if (!searchTerm.trim()) return companyList;
    const q = searchTerm.trim().toLowerCase();
    return companyList.filter((c) => c.name.toLowerCase().includes(q));
  }, [companyList, searchTerm]);

  useEffect(() => {
    if (companyList.length === 0) { setIsLoadingBatch(false); return; }
    setIsLoadingBatch(true);
    fetch('/api/company/intelligence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companies: companyList.map((c) => c.name) })
    })
      .then((res) => res.ok ? res.json() : { items: [] })
      .then((data) => {
        const map: Record<string, CompanyCacheItem> = {};
        (data.items || []).forEach((item: CompanyCacheItem) => { map[item.company_name_normalized] = item; });
        setCacheMap(map);
      })
      .catch((err) => console.error('기업 인텔리전스 일괄 조회 실패:', err))
      .finally(() => setIsLoadingBatch(false));
  }, [companyList.map((c) => c.key).join(',')]);

  const handleSearch = async (company: { name: string; key: string }) => {
    setSearchingKey(company.key);
    try {
      const res = await fetch('/api/company/intelligence-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: company.name })
      });
      if (res.ok) {
        const data = await res.json();
        setCacheMap((prev) => ({
          ...prev,
          [company.key]: { ...(prev[company.key] || {}), company_name: company.name, company_name_normalized: company.key, business_summary: data.companyInfo, last_searched_at: new Date().toISOString() } as CompanyCacheItem
        }));
      }
    } catch (err) {
      console.error('기업 검색 실패:', err);
    } finally {
      setSearchingKey(null);
    }
  };

  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="회사명으로 검색..."
          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-indigo-500"
        />
      </div>

      {/* [추가] "AI 기업 분석" - 이미 캐시에서 즉시 표시된(무료) 회사 정보들을 모아서 AI에게
      "어디에 집중하면 좋을지"를 종합 해석해달라고 부탁하는 버튼. 캐시된 회사가 하나도 없으면
      분석할 데이터가 없으므로 비활성화한다. */}
      <AiAnalysisPanel
        label="AI 기업 분석"
        endpoint="/api/ai-intelligence/company-analysis"
        disabled={Object.keys(cacheMap).length === 0}
        disabledReason="먼저 회사별 '검색' 버튼으로 정보를 조회해야 분석할 수 있습니다."
        payload={{
          companies: (Object.values(cacheMap) as CompanyCacheItem[]).map((c) => ({
            name: c.company_name,
            industry: c.industry,
            mainBusiness: c.main_business,
            sales: c.sales,
            employees: c.employees,
            summary: c.business_summary
          }))
        }}
      />

      {isLoadingBatch ? (
        <div className="py-16 text-center text-sm text-slate-400">불러오는 중...</div>
      ) : filteredList.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">{searchTerm ? '검색 결과가 없습니다.' : '명함에 등록된 회사가 없습니다.'}</div>
      ) : (
        <div className="border border-slate-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-left text-[11px] text-slate-500 font-bold">
                  <th className="px-3 py-2.5">회사</th>
                  <th className="px-3 py-2.5">명함</th>
                  <th className="px-3 py-2.5">업종</th>
                  <th className="px-3 py-2.5">직원수</th>
                  <th className="px-3 py-2.5">매출</th>
                  <th className="px-3 py-2.5">AI 요약</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredList.map((company) => {
                  const cached = cacheMap[company.key];
                  const isSearching = searchingKey === company.key;
                  const isExpanded = expandedKey === company.key;
                  return (
                    <React.Fragment key={company.key}>
                      <tr className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-3 py-2.5 font-bold text-slate-800 whitespace-nowrap max-w-[160px] truncate">{company.name}</td>
                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{company.count}명</td>
                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{cached?.industry || '-'}</td>
                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{cached?.employees || '-'}</td>
                        <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{cached?.sales || '-'}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {cached?.business_summary ? (
                            <button
                              type="button"
                              onClick={() => setExpandedKey(isExpanded ? null : company.key)}
                              className="text-[11px] px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 font-bold hover:bg-indigo-100"
                            >
                              {isExpanded ? '접기' : '표시'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isSearching}
                              onClick={() => handleSearch(company)}
                              className="text-[11px] px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold flex items-center gap-1 disabled:opacity-50"
                            >
                              {isSearching ? <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Search className="w-2.5 h-2.5" />}
                              검색
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && cached && (
                        <tr className="bg-indigo-50/40">
                          <td colSpan={6} className="px-3 py-3">
                            <div className="space-y-1.5">
                              <p className="text-xs text-slate-700 leading-relaxed">{cached.business_summary}</p>
                              <div className="flex items-center gap-2 flex-wrap">
                                {cached.website && (
                                  <a href={cached.website} target="_blank" rel="noreferrer" className="text-[11px] text-indigo-500 underline break-all">{cached.website}</a>
                                )}
                                <button
                                  type="button"
                                  disabled={isSearching}
                                  onClick={() => handleSearch(company)}
                                  className="text-[10px] px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-500 font-bold flex items-center gap-1 disabled:opacity-50"
                                >
                                  {isSearching ? <div className="w-2.5 h-2.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />}
                                  다시 검색
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// 3) 관계·영업 인텔리전스
// ============================================================
const RelationshipIntelligenceTab: React.FC<{
  contacts: BusinessCard[];
  projects: Project[];
  onSelectContact?: (c: BusinessCard) => void;
  onNavigateToProjects?: () => void;
}> = ({ contacts, projects, onSelectContact, onNavigateToProjects }) => {
  const PRIORITY_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 };

  // [추가] CardGrid의 "관계 인텔리전스"와 로직은 동일하되(일관성 유지), 여기 AI
  // Intelligence 탭에서 건별로 해제한 거래처는 CardGrid 쪽과 섞이지 않도록 별도의
  // localStorage 키를 쓴다. 날짜와 상관없이 "전체 되돌리기"를 누르기 전까지 계속
  // 제외되고, 해제해도 다음 순위 거래처가 그 자리를 채운다.
  const [dismissedContactIds, setDismissedContactIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('bizcard_ai_relationship_intel_dismissed_contact_ids');
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });
  const dismissContact = (contactId: string) => {
    setDismissedContactIds((prev) => {
      if (prev.includes(contactId)) return prev;
      const next = [...prev, contactId];
      try { localStorage.setItem('bizcard_ai_relationship_intel_dismissed_contact_ids', JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const resetDismissedContacts = () => {
    try { localStorage.removeItem('bizcard_ai_relationship_intel_dismissed_contact_ids'); } catch {}
    setDismissedContactIds([]);
  };

  // 파이프라인 요약
  const pipelineSummary = useMemo(() => {
    const statuses: Project['status'][] = ['opportunity', 'progress', 'completed', 'failed'];
    return statuses.map((status) => {
      const list = projects.filter((p) => p.status === status);
      const budgetSum = list.reduce((sum, p) => {
        const n = Number((p.budget || '').replace(/[^\d]/g, ''));
        return sum + (isNaN(n) ? 0 : n);
      }, 0);
      return { status, count: list.length, budgetSum };
    });
  }, [projects]);

  const statusLabel: Record<string, string> = { opportunity: '기회', progress: '진행중', completed: '완료', failed: '실패' };
  const statusTone: Record<string, string> = {
    opportunity: 'bg-amber-50 text-amber-700 border-amber-100',
    progress: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    failed: 'bg-slate-100 text-slate-500 border-slate-200'
  };

  // "지금 챙기면 좋은 거래처" - CardGrid의 관계 인텔리전스와 동일한 채점 로직(일관성 유지).
  // [추가] 연결된 활성 프로젝트 "건수"와, 0~99 범위로 보기 쉽게 정규화한 "영업점수"를 같이
  // 계산해서 화면에 숫자로 보여준다(예: "영업점수 94").
  const insights = useMemo(() => {
    const now = Date.now();
    interface Insight { contact: BusinessCard; reasonText: string; daysSince: number; urgencyLabel: '높음' | '보통'; score: number; linkedProjectCount: number; salesScore: number; }
    const list: Insight[] = [];

    contacts.forEach((c) => {
      const linkedActiveProjects = projects.filter((p) => (p.contactIds || []).includes(c.id) && (p.status === 'opportunity' || p.status === 'progress'));
      let best: Insight | null = null;

      for (const p of linkedActiveProjects) {
        const followUpDates = (p.followUps || []).map((f) => new Date(f.date || '').getTime()).filter((t) => !isNaN(t));
        const lastActivity = followUpDates.length > 0 ? Math.max(...followUpDates) : new Date(p.createdAt).getTime();
        if (isNaN(lastActivity)) continue;
        const daysSince = Math.floor((now - lastActivity) / DAY_MS);
        if (daysSince < 7) continue;
        const weight = PRIORITY_WEIGHT[p.priority] || 1;
        const score = daysSince * weight;
        if (!best || score > best.score) {
          // 영업점수 = 기본 50점 + (연결 프로젝트 수 가중치) + (우선순위 가중치) + (방치 일수, 30일 상한)
          // - 챙길수록 급한 거래처일수록 점수가 높게 나오도록 설계 (0~99 범위로 clamp)
          // 영업점수 = 기본 40점 + (연결 프로젝트 수 x6, 상한 있음) + (우선순위 가중치 x6) +
          // (방치 일수, 25일 상한) - 0~99 범위로 clamp. 챙길수록 급한 거래처일수록 높게 나온다.
          const salesScore = Math.min(99, Math.round(40 + Math.min(linkedActiveProjects.length, 6) * 6 + weight * 6 + Math.min(daysSince, 25)));
          best = {
            contact: c,
            reasonText: `"${p.name}" 프로젝트 연결 · ${p.priority === 'high' ? '우선순위 높음' : p.priority === 'medium' ? '우선순위 보통' : '우선순위 낮음'}`,
            daysSince,
            urgencyLabel: score >= 40 ? '높음' : '보통',
            score,
            linkedProjectCount: linkedActiveProjects.length,
            salesScore
          };
        }
      }

      if (!best && c.callHistory && c.callHistory.length > 0) {
        const lastCall = c.callHistory.reduce((latest, cur) => {
          const t = new Date(cur.timestamp).getTime();
          return t > latest ? t : latest;
        }, 0);
        if (lastCall) {
          const daysSince = Math.floor((now - lastCall) / DAY_MS);
          if (daysSince >= 10) {
            best = {
              contact: c,
              reasonText: '연결된 진행중 프로젝트는 없지만, 통화 기록 기준 연락이 뜸함',
              daysSince,
              urgencyLabel: daysSince >= 20 ? '높음' : '보통',
              score: daysSince,
              linkedProjectCount: 0,
              salesScore: Math.min(99, Math.round(30 + Math.min(daysSince, 60)))
            };
          }
        }
      }

      if (best) list.push(best);
    });

    return list.sort((a, b) => b.score - a.score);
  }, [contacts, projects]);

  // 건별로 해제한 거래처는 목록에서 아예 빼서, 그 자리에 다음 순위 거래처가 채워지게 한다.
  const rankedInsights = useMemo(
    () => insights.filter((i) => !dismissedContactIds.includes(i.contact.id)),
    [insights, dismissedContactIds]
  );

  // [수정] "관계가 깊은 회사"를 단순 명함 수가 아니라, 여러 신호를 합친 관계점수로 판단한다.
  // 관계점수 = 명함 수(x3) + 통화 횟수(x2) + 연결된 프로젝트 건수(x5) + 최근 접촉 가산점(30일
  // 이내 연락 있었으면 +10). 지금 확보된 데이터(명함/통화기록/프로젝트 연결) 안에서만 계산하고,
  // 데이터가 없는 항목(업무 활동량 등)은 과장하지 않기 위해 포함하지 않았다.
  const topCompanies = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, { name: string; contactCount: number; callCount: number; projectCount: number; recentContact: boolean }>();

    contacts.forEach((c) => {
      if (!c.company?.trim()) return;
      const entry = map.get(c.company) || { name: c.company, contactCount: 0, callCount: 0, projectCount: 0, recentContact: false };
      entry.contactCount += 1;
      const calls = c.callHistory || [];
      entry.callCount += calls.length;
      if (calls.some((h) => (now - new Date(h.timestamp).getTime()) / DAY_MS <= 30)) entry.recentContact = true;
      const linkedProjects = projects.filter((p) => (p.contactIds || []).includes(c.id));
      entry.projectCount += linkedProjects.length;
      map.set(c.company, entry);
    });

    return Array.from(map.values())
      .map((e) => ({
        ...e,
        relationshipScore: e.contactCount * 3 + e.callCount * 2 + e.projectCount * 5 + (e.recentContact ? 10 : 0)
      }))
      .sort((a, b) => b.relationshipScore - a.relationshipScore)
      .slice(0, 8);
  }, [contacts, projects]);

  const totalBudget = useMemo(() => pipelineSummary.reduce((sum, s) => sum + s.budgetSum, 0), [pipelineSummary]);
  const inProgressBudget = useMemo(() => pipelineSummary.find((s) => s.status === 'progress')?.budgetSum || 0, [pipelineSummary]);
  const totalCount = useMemo(() => pipelineSummary.reduce((sum, s) => sum + s.count, 0), [pipelineSummary]);

  return (
    <div className="space-y-5">
      {/* 파이프라인 요약 */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border bg-indigo-50 text-indigo-600 border-indigo-100 mb-2">
          <Briefcase className="w-3.5 h-3.5" />
          <span>영업 파이프라인 요약 (전체 {totalCount}건)</span>
        </div>
        {totalBudget > 0 && (
          <div className="flex gap-2 mb-2">
            <div className="flex-1 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[10px] text-slate-400 font-bold">전체 예상 금액</p>
              <p className="text-sm font-bold text-slate-700">{totalBudget.toLocaleString()}원</p>
            </div>
            <div className="flex-1 p-2.5 rounded-xl bg-indigo-50 border border-indigo-100">
              <p className="text-[10px] text-indigo-400 font-bold">진행 중 금액</p>
              <p className="text-sm font-bold text-indigo-700">{inProgressBudget.toLocaleString()}원</p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {pipelineSummary.map((s) => (
            <button
              key={s.status}
              onClick={onNavigateToProjects}
              className={`p-3 rounded-xl border text-left ${statusTone[s.status]}`}
            >
              <p className="text-xs font-bold">{statusLabel[s.status]}</p>
              <p className="text-lg font-bold">{s.count}건</p>
              {s.budgetSum > 0 && <p className="text-[10px] opacity-70">{s.budgetSum.toLocaleString()}원</p>}
            </button>
          ))}
        </div>
      </div>

      {/* [추가] "AI 영업전략 분석" - 위에 이미 즉시 표시된(무료) 파이프라인/거래처 데이터를
      그대로 AI에게 넘겨서 영업 전략 조언만 부탁하는 버튼. */}
      <AiAnalysisPanel
        label="AI 영업전략 분석"
        endpoint="/api/ai-intelligence/relationship-analysis"
        payload={{
          pipeline: pipelineSummary.map((s) => ({ status: statusLabel[s.status], count: s.count, budgetSum: s.budgetSum })),
          insights: rankedInsights.slice(0, 10).map((i) => ({ name: i.contact.name, company: i.contact.company, reason: i.reasonText, daysSince: i.daysSince, urgency: i.urgencyLabel, salesScore: i.salesScore })),
          topCompanies: topCompanies.map((c) => ({ name: c.name, relationshipScore: c.relationshipScore }))
        }}
      />


      {/* 지금 챙기면 좋은 거래처 */}
      <div>
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border bg-rose-50 text-rose-600 border-rose-100">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>지금 챙기면 좋은 거래처 {rankedInsights.length}곳</span>
          </div>
          {/* [추가] 건별로 해제한 거래처가 있으면, 실수로 뺐을 때 되돌릴 수 있게 안내 겸
              복구 버튼을 같이 보여준다. */}
          {dismissedContactIds.length > 0 && (
            <button
              onClick={resetDismissedContacts}
              className="text-[11px] text-indigo-400 hover:text-indigo-600 underline"
            >
              개별 해제한 거래처 {dismissedContactIds.length}곳 있음 · 전체 되돌리기
            </button>
          )}
        </div>
        {rankedInsights.length === 0 ? (
          <p className="text-xs text-slate-400 py-3">지금 특별히 챙길 거래처가 없습니다.</p>
        ) : (
          <div className="space-y-1.5">
            {rankedInsights.slice(0, 15).map((insight, idx) => (
              <div key={insight.contact.id} className="p-2.5 rounded-xl bg-white border border-slate-100 space-y-2">
                <button onClick={() => onSelectContact?.(insight.contact)} className="w-full min-w-0 text-left">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-bold text-slate-300 font-mono">{idx + 1}위</span>
                    <span className="text-sm font-bold text-slate-800">{insight.contact.name}</span>
                    <span className="text-xs text-slate-400">{insight.contact.company}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-600">영업점수 {insight.salesScore}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${insight.urgencyLabel === '높음' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                      긴급도 {insight.urgencyLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {insight.linkedProjectCount > 0 && <>연결 프로젝트 {insight.linkedProjectCount}건 · </>}
                    {insight.reasonText} · <span className="font-mono">{insight.daysSince}일째 활동 없음</span>
                  </p>
                </button>
                {/* [추가] 요청하신 [상세보기] [전화] [문자] 액션 버튼 세트. 명함에 등록된
                번호가 있을 때만 전화/문자 버튼이 뜬다. */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onSelectContact?.(insight.contact)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold"
                  >
                    상세보기
                  </button>
                  {insight.contact.phoneMobile && (
                    <>
                      <a href={`tel:${insight.contact.phoneMobile}`} className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-600 text-[11px] font-bold flex items-center gap-1">
                        <Phone className="w-3 h-3" /> 전화
                      </a>
                      <a href={`sms:${insight.contact.phoneMobile}`} className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-[11px] font-bold">
                        문자
                      </a>
                    </>
                  )}
                  {/* [추가] 이 거래처 하나만 계속 빼고 싶을 때 - 위 "전체 되돌리기" 전까지
                      이 거래처만 계속 제외된다. */}
                  <button
                    type="button"
                    onClick={() => dismissContact(insight.contact.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors ml-auto"
                    title="이 거래처는 그만 알려주기"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 관계가 깊은 회사 TOP - 명함수+통화횟수+프로젝트연결+최근접촉을 합친 관계점수 기준 */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border bg-slate-100 text-slate-600 border-slate-200 mb-2">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>관계가 깊은 회사 TOP {topCompanies.length}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {topCompanies.map((c, idx) => (
            <div key={c.name} className="p-2.5 rounded-xl bg-white border border-slate-100">
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <p className="text-xs font-bold text-slate-700 truncate">{c.name}</p>
                <span className="text-[10px] font-bold text-indigo-500 shrink-0">{c.relationshipScore}점</span>
              </div>
              <p className="text-[10px] text-slate-400">명함 {c.contactCount} · 통화 {c.callCount} · 프로젝트 {c.projectCount}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
