import React, { useEffect, useMemo, useState } from 'react';
import { Users, Briefcase, Car, ClipboardList, ShieldCheck, TrendingUp, ArrowRight, FileCheck } from 'lucide-react';
import { BusinessCard, Project, User as UserType, Vehicle } from '../types.js';

// [추가] "지금 확인한거 다 순차적으로 해줘"의 마지막 두 항목(홈 대시보드/차트)을 하나의
// 화면으로 합쳤다 - 실제로 대시보드는 보통 차트를 포함하는 게 자연스럽고, 별도 화면으로
// 나누면 오히려 왔다갔다해야 해서 더 불편할 것 같았다.
//
// [설계 메모] 차트 라이브러리(recharts 등)를 새로 추가하려면 package.json/package-lock.json이
// 같이 바뀌어야 하는데, 이 프로젝트는 GitHub 웹 업로드로만 배포되고 npm install을 직접
// 돌릴 수 없는 환경이라 새 의존성 추가는 위험 부담이 크다고 판단했다. 그래서 차트는
// 외부 라이브러리 없이 순수 CSS(div 너비/높이 비율)로 직접 그렸다 - 데이터가 몇 개
// 카테고리/개월 수준이라 이 방식으로도 충분하다.

interface Props {
  currentUser: UserType;
  contacts: BusinessCard[];
  projects: Project[];
  onOpenContact: (contact: BusinessCard) => void;
  onOpenProject: (projectId: string) => void;
  onOpenGlobalSearch: () => void;
  onOpenUserDirectory: () => void;
  // [추가] "내 결재 대기" 카드를 누르면 전자결재 탭으로 바로 이동시키기 위한 콜백
  onOpenApprovals: () => void;
}

interface WorkLogLite {
  id: string;
  date?: string;
  weekStartDate?: string;
}

const STATUS_LABEL: Record<Project['status'], string> = {
  opportunity: '기회', progress: '진행', completed: '완료', failed: '실패'
};
const STATUS_COLOR: Record<Project['status'], string> = {
  opportunity: 'bg-blue-500', progress: 'bg-amber-500', completed: 'bg-emerald-500', failed: 'bg-rose-500'
};

export const DashboardView: React.FC<Props> = ({
  currentUser, contacts, projects, onOpenContact, onOpenProject, onOpenGlobalSearch, onOpenUserDirectory, onOpenApprovals
}) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [dailyLogs, setDailyLogs] = useState<WorkLogLite[]>([]);
  const [weeklyLogs, setWeeklyLogs] = useState<WorkLogLite[]>([]);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  // [추가] "내 결재 대기" 카드용 - 다른 직원 것까지 다 보이는 명함/프로젝트와 달리, 이건
  // 로그인한 사람의 직책이 결재선의 다음 미결 단계와 일치하는 문서 개수만 서버에서
  // 걸러서 내려준다(관리자든 일반 직원이든, 결재선에 자기 직책이 있으면 누구나 대상).
  const [myPendingApprovalCount, setMyPendingApprovalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    setLoading(true);
    const headers = { 'x-user-id': currentUser.id };
    const requests: Promise<any>[] = [
      fetch('/api/vehicles', { headers }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch('/api/worklogs/daily', { headers }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch('/api/worklogs/weekly', { headers }).then((r) => (r.ok ? r.json() : [])).catch(() => [])
    ];
    Promise.all(requests).then(([v, daily, weekly]) => {
      setVehicles(Array.isArray(v) ? v : []);
      setDailyLogs(Array.isArray(daily) ? daily : []);
      setWeeklyLogs(Array.isArray(weekly) ? weekly : []);
    }).finally(() => setLoading(false));

    if (currentUser.role === 'admin') {
      fetch('/api/auth/pending-members', { headers })
        .then((r) => (r.ok ? r.json() : []))
        .then((list) => setPendingCount(Array.isArray(list) ? list.length : 0))
        .catch(() => setPendingCount(null));
    } else {
      setPendingCount(null);
    }

    fetch('/api/approvals/pending-count', { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setMyPendingApprovalCount(data && typeof data.count === 'number' ? data.count : null))
      .catch(() => setMyPendingApprovalCount(null));
  }, [currentUser?.id]);

  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const contactsThisMonth = useMemo(
    () => contacts.filter((c) => (c.createdAt || '').startsWith(thisMonthKey)).length,
    [contacts, thisMonthKey]
  );
  const workLogsThisMonthCount = useMemo(() => {
    const dailyCount = dailyLogs.filter((l) => (l.date || '').startsWith(thisMonthKey)).length;
    const weeklyCount = weeklyLogs.filter((l) => (l.weekStartDate || l.date || '').startsWith(thisMonthKey)).length;
    return dailyCount + weeklyCount;
  }, [dailyLogs, weeklyLogs, thisMonthKey]);

  const statusCounts = useMemo(() => {
    const counts: Record<Project['status'], number> = { opportunity: 0, progress: 0, completed: 0, failed: 0 };
    for (const p of projects) counts[p.status]++;
    return counts;
  }, [projects]);
  const statusTotal = projects.length || 1;

  // 최근 6개월 신규 명함 등록 추이
  const monthlyTrend = useMemo(() => {
    const months: { key: string; label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({ key, label: `${d.getMonth() + 1}월`, count: 0 });
    }
    for (const c of contacts) {
      const key = (c.createdAt || '').slice(0, 7);
      const bucket = months.find((m) => m.key === key);
      if (bucket) bucket.count++;
    }
    return months;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts]);
  const maxTrendCount = Math.max(1, ...monthlyTrend.map((m) => m.count));

  const recentContacts = useMemo(
    () => [...contacts].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5),
    [contacts]
  );
  const recentProjects = useMemo(
    () => [...projects].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 5),
    [projects]
  );

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">홈 대시보드</h2>
          <p className="text-xs text-slate-400 mt-0.5">{currentUser.name}님, 오늘도 좋은 하루 되세요.</p>
        </div>
        <button
          onClick={onOpenGlobalSearch}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-bold text-slate-600 transition-colors"
        >
          전체 검색 열기
        </button>
      </div>

      {/* 핵심 지표 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-blue-600 p-5 rounded-2xl flex items-center justify-between shadow-md">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-white/80">등록된 명함</span>
            <p className="text-2xl font-bold text-white">{contacts.length.toLocaleString()}건</p>
            <p className="text-[11px] text-white/70">이번 달 +{contactsThisMonth}건</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-white">
            <Users className="w-5.5 h-5.5" />
          </div>
        </div>

        <div className="bg-amber-500 p-5 rounded-2xl flex items-center justify-between shadow-md">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-white/80">진행 중 프로젝트</span>
            <p className="text-2xl font-bold text-white">{statusCounts.progress.toLocaleString()}건</p>
            <p className="text-[11px] text-white/70">기회 {statusCounts.opportunity}건 · 완료 {statusCounts.completed}건</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-white">
            <Briefcase className="w-5.5 h-5.5" />
          </div>
        </div>

        <div className="bg-indigo-600 p-5 rounded-2xl flex items-center justify-between shadow-md">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-white/80">등록된 차량</span>
            <p className="text-2xl font-bold text-white">{loading ? '-' : `${vehicles.length.toLocaleString()}대`}</p>
            <p className="text-[11px] text-white/70">통합 차량 관리에서 상세 확인</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-white">
            <Car className="w-5.5 h-5.5" />
          </div>
        </div>

        {currentUser.role === 'admin' && pendingCount !== null ? (
          <button
            onClick={onOpenUserDirectory}
            className="bg-rose-500 p-5 rounded-2xl flex items-center justify-between shadow-md text-left hover:brightness-95 transition-all"
          >
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-white/80">승인 대기 인원</span>
              <p className="text-2xl font-bold text-white">{pendingCount.toLocaleString()}명</p>
              <p className="text-[11px] text-white/70 flex items-center gap-1">팀 관리에서 승인 <ArrowRight className="w-3 h-3" /></p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-white">
              <ShieldCheck className="w-5.5 h-5.5" />
            </div>
          </button>
        ) : (
          <div className="bg-emerald-500 p-5 rounded-2xl flex items-center justify-between shadow-md">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-white/80">이번 달 업무일지</span>
              <p className="text-2xl font-bold text-white">{loading ? '-' : `${workLogsThisMonthCount.toLocaleString()}건`}</p>
              <p className="text-[11px] text-white/70">일일 + 주간 업무일지 합계</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-white">
              <ClipboardList className="w-5.5 h-5.5" />
            </div>
          </div>
        )}

        {/* [추가] 내 결재 대기 - 명함/프로젝트처럼 회사 전체가 같이 보는 숫자가 아니라,
        로그인한 사람의 직책이 결재선의 다음 미결 단계와 일치하는 문서만 골라 센 개수.
        직책이 결재선 어디에도 없으면(결재자가 아닌 직원, 개인 계정 등) 카드 자체를 숨긴다. */}
        {myPendingApprovalCount !== null && (
          <button
            onClick={onOpenApprovals}
            className="bg-teal-600 p-5 rounded-2xl flex items-center justify-between shadow-md text-left hover:brightness-95 transition-all"
          >
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-white/80">내 결재 대기</span>
              <p className="text-2xl font-bold text-white">{myPendingApprovalCount.toLocaleString()}건</p>
              <p className="text-[11px] text-white/70 flex items-center gap-1">전자결재에서 확인 <ArrowRight className="w-3 h-3" /></p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-white">
              <FileCheck className="w-5.5 h-5.5" />
            </div>
          </button>
        )}
      </div>

      {/* 차트 영역 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 프로젝트 상태 분포 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-indigo-400" /> 프로젝트 상태 분포
          </h3>
          {projects.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">등록된 프로젝트가 없습니다.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex w-full h-3 rounded-full overflow-hidden bg-slate-100">
                {(Object.keys(STATUS_LABEL) as Project['status'][]).map((st) => (
                  statusCounts[st] > 0 && (
                    <div
                      key={st}
                      className={STATUS_COLOR[st]}
                      style={{ width: `${(statusCounts[st] / statusTotal) * 100}%` }}
                      title={`${STATUS_LABEL[st]} ${statusCounts[st]}건`}
                    />
                  )
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(STATUS_LABEL) as Project['status'][]).map((st) => (
                  <div key={st} className="flex items-center gap-2 text-xs text-slate-600">
                    <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLOR[st]}`} />
                    <span>{STATUS_LABEL[st]}</span>
                    <span className="ml-auto font-mono text-slate-400">{statusCounts[st]}건</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 최근 6개월 명함 등록 추이 */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-400" /> 최근 6개월 명함 등록 추이
          </h3>
          <div className="flex items-end justify-between gap-2 h-32">
            {monthlyTrend.map((m) => (
              <div key={m.key} className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-[10px] text-slate-400 font-mono">{m.count}</span>
                <div
                  className="w-full max-w-[28px] bg-blue-500 rounded-t-md transition-all"
                  style={{ height: `${Math.max(4, (m.count / maxTrendCount) * 96)}px` }}
                />
                <span className="text-[10px] text-slate-500">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 최근 활동 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="text-sm font-bold text-slate-700">최근 등록된 명함</h3>
          </div>
          {recentContacts.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">등록된 명함이 없습니다.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentContacts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onOpenContact(c)}
                  className="w-full flex items-center justify-between px-5 py-2.5 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{c.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{c.company || '-'}</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
            <h3 className="text-sm font-bold text-slate-700">최근 등록된 프로젝트</h3>
          </div>
          {recentProjects.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">등록된 프로젝트가 없습니다.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onOpenProject(p.id)}
                  className="w-full flex items-center justify-between px-5 py-2.5 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{p.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{STATUS_LABEL[p.status]}</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
