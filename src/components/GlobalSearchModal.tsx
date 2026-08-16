import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, User as UserIcon, Briefcase, Car, ClipboardList } from 'lucide-react';
import { BusinessCard, Project, User as UserType, Vehicle } from '../types.js';

// [추가] "지금 확인한거 다 순차적으로 해줘"의 마지막 항목인 전역 검색. 명함/프로젝트는
// App.tsx가 이미 들고 있는 상태를 그대로 재사용하고(중복 요청 없음), 차량/업무일지는
// App.tsx에 로드돼 있지 않아서 이 모달이 열릴 때 직접 fetch한다.
//
// [범위 안내] 명함은 클릭 시 상세 모달까지 바로 열리고, 프로젝트는 목록에서 해당 카드가
// 펼쳐진 채로 스크롤까지 이동한다. 차량/업무일지는 아직 "특정 항목으로 바로 이동"하는
// 구조가 없어서(각 화면이 자체 상태로만 관리) 우선 해당 탭으로 이동만 시킨다 - 나중에
// 필요하면 프로젝트와 같은 방식으로 딥링크를 추가하면 된다. 관리자 전용 회계 서류/전자결재는
// 이번 1차 범위에서 제외했다(권한 체크가 더 복잡해서 별도로 다루는 게 안전하다고 판단).

interface WorkLogHit {
  id: string;
  kind: 'daily' | 'weekly';
  title: string;
  author?: string;
  department?: string;
  date?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserType;
  contacts: BusinessCard[];
  projects: Project[];
  onOpenContact: (contact: BusinessCard) => void;
  onOpenProject: (projectId: string) => void;
  onOpenVehicles: () => void;
  onOpenWorkLogs: () => void;
}

type ResultItem =
  | { type: 'contact'; key: string; title: string; subtitle: string; data: BusinessCard }
  | { type: 'project'; key: string; title: string; subtitle: string; data: Project }
  | { type: 'vehicle'; key: string; title: string; subtitle: string; data: Vehicle }
  | { type: 'worklog'; key: string; title: string; subtitle: string; data: WorkLogHit };

export const GlobalSearchModal: React.FC<Props> = ({
  isOpen, onClose, currentUser, contacts, projects,
  onOpenContact, onOpenProject, onOpenVehicles, onOpenWorkLogs
}) => {
  const [query, setQuery] = useState('');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [workLogs, setWorkLogs] = useState<WorkLogHit[]>([]);
  const [loadingExtra, setLoadingExtra] = useState(false);

  // 모달이 열릴 때만 차량/업무일지를 불러온다 (명함/프로젝트는 이미 부모가 들고 있음).
  useEffect(() => {
    if (!isOpen || !currentUser) return;
    setLoadingExtra(true);
    const headers = { 'x-user-id': currentUser.id };
    Promise.all([
      fetch('/api/vehicles', { headers }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch('/api/worklogs/daily', { headers }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch('/api/worklogs/weekly', { headers }).then((r) => (r.ok ? r.json() : [])).catch(() => [])
    ]).then(([v, daily, weekly]) => {
      setVehicles(Array.isArray(v) ? v : []);
      const dailyHits: WorkLogHit[] = (Array.isArray(daily) ? daily : []).map((l: any) => ({
        id: l.id, kind: 'daily', title: l.title || '(제목 없음)', author: l.author, department: l.department, date: l.date
      }));
      const weeklyHits: WorkLogHit[] = (Array.isArray(weekly) ? weekly : []).map((l: any) => ({
        id: l.id, kind: 'weekly', title: l.title || '(제목 없음)', author: l.author, department: l.department, date: l.weekStartDate || l.date
      }));
      setWorkLogs([...dailyHits, ...weeklyHits]);
    }).finally(() => setLoadingExtra(false));
  }, [isOpen, currentUser?.id]);

  useEffect(() => {
    if (!isOpen) setQuery('');
  }, [isOpen]);

  const results: ResultItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: ResultItem[] = [];

    for (const c of contacts) {
      const text = `${c.name} ${c.company || ''} ${c.department || ''} ${c.title || ''} ${c.phoneMobile || ''} ${c.phoneOffice || ''} ${c.memo || ''}`.toLowerCase();
      if (text.includes(q)) {
        out.push({ type: 'contact', key: `c-${c.id}`, title: c.name, subtitle: [c.company, c.department, c.title].filter(Boolean).join(' · ') || '명함', data: c });
      }
    }
    for (const p of projects) {
      const text = `${p.name} ${p.developer || ''} ${p.contractor || ''} ${p.architect || ''} ${p.description || ''}`.toLowerCase();
      if (text.includes(q)) {
        out.push({ type: 'project', key: `p-${p.id}`, title: p.name, subtitle: [p.developer, p.contractor].filter(Boolean).join(' · ') || '프로젝트', data: p });
      }
    }
    for (const v of vehicles) {
      const text = `${v.modelName} ${v.plateNumber} ${v.owner || ''}`.toLowerCase();
      if (text.includes(q)) {
        out.push({ type: 'vehicle', key: `v-${v.id}`, title: `${v.modelName} (${v.plateNumber})`, subtitle: v.owner ? `담당자: ${v.owner}` : '차량', data: v });
      }
    }
    for (const w of workLogs) {
      const text = `${w.title} ${w.author || ''} ${w.department || ''}`.toLowerCase();
      if (text.includes(q)) {
        out.push({
          type: 'worklog', key: `w-${w.kind}-${w.id}`, title: w.title,
          subtitle: [w.kind === 'daily' ? '일일업무일지' : '주간업무일지', w.author, w.date].filter(Boolean).join(' · '),
          data: w
        });
      }
    }
    // 명함 > 프로젝트 > 차량 > 업무일지 순으로, 각 안에서는 최대 20건까지만 보여준다
    // (검색어가 너무 짧으면 결과가 폭발적으로 늘어날 수 있어서 화면이 무거워지는 걸 막는다).
    const byType = (t: ResultItem['type']) => out.filter((r) => r.type === t).slice(0, 20);
    return [...byType('contact'), ...byType('project'), ...byType('vehicle'), ...byType('worklog')];
  }, [query, contacts, projects, vehicles, workLogs]);

  if (!isOpen) return null;

  const iconFor = (t: ResultItem['type']) => {
    if (t === 'contact') return <UserIcon className="w-4 h-4 text-emerald-500 shrink-0" />;
    if (t === 'project') return <Briefcase className="w-4 h-4 text-indigo-500 shrink-0" />;
    if (t === 'vehicle') return <Car className="w-4 h-4 text-blue-500 shrink-0" />;
    return <ClipboardList className="w-4 h-4 text-amber-500 shrink-0" />;
  };

  const handleSelect = (r: ResultItem) => {
    if (r.type === 'contact') onOpenContact(r.data as BusinessCard);
    else if (r.type === 'project') onOpenProject((r.data as Project).id);
    else if (r.type === 'vehicle') onOpenVehicles();
    else onOpenWorkLogs();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[70vh]">
        <div className="flex items-center gap-2 p-4 border-b border-slate-200">
          <Search className="w-4.5 h-4.5 text-slate-400 shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="명함, 프로젝트, 차량, 업무일지 통합 검색..."
            className="flex-1 text-sm outline-none placeholder:text-slate-400"
          />
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!query.trim() ? (
            <p className="px-5 py-10 text-center text-xs text-slate-400">
              검색어를 입력하면 명함 · 프로젝트 · 차량 · 업무일지를 한 번에 찾아드립니다.
              {loadingExtra && <><br />(차량/업무일지 불러오는 중...)</>}
            </p>
          ) : results.length === 0 ? (
            <p className="px-5 py-10 text-center text-xs text-slate-400">"{query}"에 대한 검색 결과가 없습니다.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {results.map((r) => (
                <button
                  key={r.key}
                  onClick={() => handleSelect(r)}
                  className="w-full flex items-start gap-2.5 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                >
                  {iconFor(r.type)}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">{r.title}</p>
                    <p className="text-[11px] text-slate-400 truncate">{r.subtitle}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
