import React, { useState, useEffect, useMemo } from 'react';
import { Sparkles, Calendar, Building2, Users, TrendingUp, AlertCircle, Clock, Search, RefreshCw, Briefcase, Phone, ChevronRight, CheckCircle2, ListTodo, UserPlus } from 'lucide-react';
import { BusinessCard, ContactGroup, Project, User as UserType, DailyWorkLog, WeeklyWorkLog } from '../types.js';

interface Props {
  contacts: BusinessCard[];
  groups: ContactGroup[];
  projects: Project[];
  currentUser: UserType | null;
  onSelectContact?: (contact: BusinessCard) => void;
  onNavigateToProjects?: () => void;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// [추가] AI Intelligence 최상위 화면. 세 서브탭(오늘의 브리핑/기업 인텔리전스/관계·영업
// 인텔리전스)을 묶는다. "오늘의 브리핑"과 "관계·영업 인텔리전스"는 이미 갖고 있는 데이터
// (명함/프로젝트/업무일지)를 규칙 기반으로 분석해서 보여주므로 AI 호출이 전혀 없고, "기업
// 인텔리전스"만 회사 캐시 테이블(company)을 조회/검색한다 — 하루 검색 할당량을 아끼기 위해
// 꼭 필요한 곳에만 AI를 쓴다.
export const AIIntelligenceView: React.FC<Props> = ({ contacts, groups, projects, currentUser, onSelectContact, onNavigateToProjects }) => {
  const [activeSubTab, setActiveSubTab] = useState<'briefing' | 'company' | 'relationship'>('briefing');

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
        <BriefingTab contacts={contacts} projects={projects} currentUser={currentUser} onSelectContact={onSelectContact} onNavigateToProjects={onNavigateToProjects} />
      )}
      {activeSubTab === 'company' && <CompanyIntelligenceTab contacts={contacts} onSelectContact={onSelectContact} />}
      {activeSubTab === 'relationship' && (
        <RelationshipIntelligenceTab contacts={contacts} projects={projects} onSelectContact={onSelectContact} onNavigateToProjects={onNavigateToProjects} />
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
}> = ({ contacts, projects, currentUser, onSelectContact, onNavigateToProjects }) => {
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

  const todayStr = new Date().toISOString().split('T')[0];
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

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-slate-400">불러오는 중...</div>;
  }

  const hasNothing = dueTodayProjects.length === 0 && dueSoonProjects.length === 0 && overdueProjects.length === 0 && recentContacts.length === 0 && todayLogs.length === 0;

  return (
    <div className="space-y-4">
      {/* 오늘 내 업무일지 작성 여부 */}
      <div className={`p-4 rounded-2xl border ${myTodayLog ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-center gap-2">
          {myTodayLog ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-amber-600" />}
          <p className={`text-sm font-bold ${myTodayLog ? 'text-emerald-700' : 'text-amber-700'}`}>
            {myTodayLog ? '오늘 업무일지를 작성하셨습니다' : '오늘 업무일지를 아직 작성하지 않으셨습니다'}
          </p>
        </div>
        {myTodayLog && (
          <p className="text-xs text-slate-500 mt-1.5 pl-7 line-clamp-2">{myTodayLog.tasksToday}</p>
        )}
      </div>

      {hasNothing && (
        <div className="py-12 text-center text-sm text-slate-400">오늘 특별히 챙길 항목이 없습니다. 편안한 하루 되세요.</div>
      )}

      {/* 오늘 마감 */}
      {dueTodayProjects.length > 0 && (
        <Section title={`오늘 마감인 프로젝트 ${dueTodayProjects.length}건`} icon={Clock} tone="rose">
          {dueTodayProjects.map((p) => (
            <ProjectRow key={p.id} project={p} onClick={onNavigateToProjects} />
          ))}
        </Section>
      )}

      {/* 마감 지남 */}
      {overdueProjects.length > 0 && (
        <Section title={`마감이 지난 진행 중 프로젝트 ${overdueProjects.length}건`} icon={AlertCircle} tone="rose">
          {overdueProjects.slice(0, 5).map((p) => (
            <ProjectRow key={p.id} project={p} onClick={onNavigateToProjects} />
          ))}
        </Section>
      )}

      {/* 마감 임박 (3일 이내) */}
      {dueSoonProjects.length > 0 && (
        <Section title={`마감 임박 (3일 이내) ${dueSoonProjects.length}건`} icon={Clock} tone="amber">
          {dueSoonProjects.map((p) => (
            <ProjectRow key={p.id} project={p} onClick={onNavigateToProjects} />
          ))}
        </Section>
      )}

      {/* 최근 등록된 명함 */}
      {recentContacts.length > 0 && (
        <Section title={`최근 3일 내 새로 등록된 명함 ${recentContacts.length}건`} icon={UserPlus} tone="indigo">
          {recentContacts.slice(0, 8).map((c) => (
            <button
              key={c.id}
              onClick={() => onSelectContact?.(c)}
              className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-slate-100 hover:border-indigo-200 transition-colors text-left"
            >
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-700 truncate">{c.name} <span className="text-xs font-normal text-slate-400">{c.company}</span></p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
            </button>
          ))}
        </Section>
      )}

      {/* 오늘 작성된 업무일지들의 "명일 예정 사항" 모아보기 */}
      {tomorrowPlans.length > 0 && (
        <Section title="내일 예정 사항 미리보기" icon={ListTodo} tone="indigo">
          {tomorrowPlans.map((l) => (
            <div key={l.id} className="p-2.5 rounded-xl bg-white border border-slate-100">
              <p className="text-xs font-bold text-slate-500 mb-1">{l.author}</p>
              <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-3">{l.tasksTomorrow}</p>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
};

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
    fetch('/api/company/intelligence-batch', {
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
      const res = await fetch('/api/company/search-summary', {
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

      {isLoadingBatch ? (
        <div className="py-16 text-center text-sm text-slate-400">불러오는 중...</div>
      ) : filteredList.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">{searchTerm ? '검색 결과가 없습니다.' : '명함에 등록된 회사가 없습니다.'}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredList.map((company) => {
            const cached = cacheMap[company.key];
            const isSearching = searchingKey === company.key;
            return (
              <div key={company.key} className="p-3.5 rounded-2xl border border-slate-200 bg-white space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{company.name}</p>
                    <p className="text-[11px] text-slate-400">소속 명함 {company.count}건</p>
                  </div>
                  <button
                    type="button"
                    disabled={isSearching}
                    onClick={() => handleSearch(company)}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] flex items-center gap-1 disabled:opacity-50"
                  >
                    {isSearching ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                    <span>{cached ? '다시 검색' : '검색'}</span>
                  </button>
                </div>

                {cached ? (
                  <div className="space-y-1.5 pt-1 border-t border-slate-100">
                    {(cached.industry || cached.main_business) && (
                      <p className="text-xs text-slate-500">
                        {cached.industry && <span className="font-semibold text-slate-600">{cached.industry}</span>}
                        {cached.industry && cached.main_business && ' · '}
                        {cached.main_business}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {cached.sales && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold">매출 {cached.sales}</span>
                      )}
                      {cached.employees && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">직원 {cached.employees}</span>
                      )}
                    </div>
                    {cached.business_summary && (
                      <p className="text-xs text-slate-600 leading-relaxed">{cached.business_summary}</p>
                    )}
                    {cached.website && (
                      <a href={cached.website} target="_blank" rel="noreferrer" className="text-[11px] text-indigo-500 underline break-all">{cached.website}</a>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-100">아직 조회되지 않았습니다. 검색 버튼을 눌러보세요.</p>
                )}
              </div>
            );
          })}
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

  // "지금 챙기면 좋은 거래처" - CardGrid의 관계 인텔리전스와 동일한 채점 로직(일관성 유지)
  const insights = useMemo(() => {
    const now = Date.now();
    interface Insight { contact: BusinessCard; reasonText: string; daysSince: number; urgencyLabel: '높음' | '보통'; score: number; }
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
          best = {
            contact: c,
            reasonText: `"${p.name}" 프로젝트 연결 · ${p.priority === 'high' ? '우선순위 높음' : p.priority === 'medium' ? '우선순위 보통' : '우선순위 낮음'}`,
            daysSince,
            urgencyLabel: score >= 40 ? '높음' : '보통',
            score
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
            best = { contact: c, reasonText: '연결된 진행중 프로젝트는 없지만, 통화 기록 기준 연락이 뜸함', daysSince, urgencyLabel: daysSince >= 20 ? '높음' : '보통', score: daysSince };
          }
        }
      }

      if (best) list.push(best);
    });

    return list.sort((a, b) => b.score - a.score);
  }, [contacts, projects]);

  // 회사별 연락처 수 TOP
  const topCompanies = useMemo(() => {
    const map = new Map<string, number>();
    contacts.forEach((c) => {
      if (!c.company?.trim()) return;
      map.set(c.company, (map.get(c.company) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [contacts]);

  return (
    <div className="space-y-5">
      {/* 파이프라인 요약 */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border bg-indigo-50 text-indigo-600 border-indigo-100 mb-2">
          <Briefcase className="w-3.5 h-3.5" />
          <span>영업 파이프라인 요약</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {pipelineSummary.map((s) => (
            <button
              key={s.status}
              onClick={onNavigateToProjects}
              className={`p-3 rounded-xl border text-left ${statusTone[s.status]}`}
            >
              <p className="text-xs font-bold">{statusLabel[s.status]}</p>
              <p className="text-lg font-bold">{s.count}건</p>
              {s.budgetSum > 0 && <p className="text-[10px] opacity-70">예산 합계 {s.budgetSum.toLocaleString()}원</p>}
            </button>
          ))}
        </div>
      </div>

      {/* 지금 챙기면 좋은 거래처 */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border bg-rose-50 text-rose-600 border-rose-100 mb-2">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>지금 챙기면 좋은 거래처 {insights.length}곳</span>
        </div>
        {insights.length === 0 ? (
          <p className="text-xs text-slate-400 py-3">지금 특별히 챙길 거래처가 없습니다.</p>
        ) : (
          <div className="space-y-1.5">
            {insights.slice(0, 15).map((insight) => (
              <div key={insight.contact.id} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white border border-slate-100">
                <button onClick={() => onSelectContact?.(insight.contact)} className="min-w-0 text-left flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-800">{insight.contact.name}</span>
                    <span className="text-xs text-slate-400">{insight.contact.company}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${insight.urgencyLabel === '높음' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                      긴급도 {insight.urgencyLabel}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{insight.reasonText} · <span className="font-mono">{insight.daysSince}일째 활동 없음</span></p>
                </button>
                {insight.contact.phoneMobile && (
                  <a href={`tel:${insight.contact.phoneMobile}`} className="shrink-0 p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100">
                    <Phone className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 회사별 연락처 수 TOP */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border bg-slate-100 text-slate-600 border-slate-200 mb-2">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>관계가 깊은 회사 TOP {topCompanies.length}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {topCompanies.map((c) => (
            <div key={c.name} className="p-2.5 rounded-xl bg-white border border-slate-100">
              <p className="text-xs font-bold text-slate-700 truncate">{c.name}</p>
              <p className="text-[11px] text-slate-400">명함 {c.count}건</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
