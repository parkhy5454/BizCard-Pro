import React, { useState, useRef, useEffect } from 'react';
import { Search, X, Briefcase, Check } from 'lucide-react';
import { Project } from '../types.js';

// [추가] 프로젝트가 늘어나면서 "연동 프로젝트"를 고르는 곳(운행기록/비용/정비/업무일지 등)에서
// 순수 <select>나 정렬 안 된 목록을 스크롤로 훑어야 해서 원하는 프로젝트를 찾기 힘들다는
// 피드백이 있었다. 명함 담당자 선택에 이미 쓰고 있던 검색형 선택 UI(ContactPicker.tsx)와
// 동일한 패턴을 프로젝트에도 적용한다: 이름 가나다순 정렬 + 검색어로 실시간 필터링.

function matchProject(p: Project, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    p.name.toLowerCase().includes(needle) ||
    (p.endCustomer || '').toLowerCase().includes(needle)
  );
}

// 이름 기준 가나다순 정렬 (한글 로케일 명시)
function sortByName(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
}

// ------------------------------------------------------------------
// 단일 선택: "연동 프로젝트" 하나만 고르는 운행기록/비용/정비 등록·수정 화면에서 쓴다.
// 기존 코드가 프로젝트 "이름 문자열"을 그대로 저장하는 방식이라(id가 아님), 값도
// 이름 문자열로 주고받는다 - 기존 데이터/서버 API와 호환을 그대로 유지하기 위함.
// ------------------------------------------------------------------
interface SingleProps {
  projects: Project[];
  value: string;
  onChange: (name: string) => void;
  noneLabel?: string; // "연동 안함" 항목 문구
  allowCustom?: boolean; // true면 "직접 입력(커스텀)" 항목을 추가로 보여준다(선택 시 onChange('직접 입력') 호출)
  className?: string;
}

export const ProjectSearchSelect: React.FC<SingleProps> = ({ projects, value, onChange, noneLabel, allowCustom, className }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const matchedProject = projects.find((p) => p.name === value);
  // 커스텀(직접 입력) 상태: value가 있는데 어떤 프로젝트 이름과도 일치하지 않는 경우
  const isCustomValue = allowCustom && !!value && !matchedProject;
  const sorted = sortByName(projects);
  const filtered = sorted.filter((p) => matchProject(p, query)).slice(0, 80);

  const displayText = matchedProject
    ? matchedProject.name
    : isCustomValue
    ? value
    : '';

  return (
    <div ref={wrapRef} className={`relative ${className || ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-left hover:border-indigo-400 transition-colors"
      >
        <span className={displayText ? 'text-slate-700 font-medium truncate' : 'text-slate-400 truncate'}>
          {displayText || (noneLabel || '프로젝트 연동 안함 (없음)')}
        </span>
        {displayText ? (
          <span
            onClick={(e) => { e.stopPropagation(); onChange(''); setQuery(''); }}
            className="text-slate-400 hover:text-rose-500 shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        ) : (
          <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-slate-200">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="프로젝트명, 최종고객명으로 검색..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
              className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:bg-slate-50 border-b border-slate-100"
            >
              {noneLabel || '프로젝트 연동 안함 (없음)'}
            </button>
            {allowCustom && (
              <button
                type="button"
                onClick={() => { onChange('직접 입력'); setOpen(false); setQuery(''); }}
                className="w-full text-left px-3 py-2 text-xs text-indigo-500 hover:bg-indigo-50 border-b border-slate-100 font-medium"
              >
                직접 입력 (커스텀)
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-4">검색 결과가 없습니다.</p>
            ) : (
              filtered.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => { onChange(p.name); setOpen(false); setQuery(''); }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 flex items-center gap-2 ${p.name === value ? 'bg-indigo-50' : ''}`}
                >
                  <Briefcase className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="font-medium text-slate-700 truncate">{p.name}</span>
                  {p.endCustomer && <span className="text-slate-400 truncate">· {p.endCustomer}</span>}
                  {p.name === value && <Check className="w-3 h-3 text-indigo-600 ml-auto shrink-0" />}
                </button>
              ))
            )}
            {projects.length > 80 && filtered.length === 80 && (
              <p className="text-[10px] text-slate-400 text-center py-1.5">검색어를 더 입력하면 결과가 좁혀집니다 (상위 80건만 표시 중)</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ------------------------------------------------------------------
// 다중 선택: "연관 프로젝트 연결" 같은, 여러 프로젝트를 함께 연결하는 곳에서 쓴다.
// (업무일지의 projectIds처럼 id 배열로 저장하는 곳과 맞춰 값도 id 배열로 주고받는다.)
// ------------------------------------------------------------------
interface MultiProps {
  projects: Project[];
  value: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}

export const ProjectMultiSearchSelect: React.FC<MultiProps> = ({ projects, value, onChange, className }) => {
  const [query, setQuery] = useState('');
  const selectedProjects = projects.filter((p) => value.includes(p.id));
  const sorted = sortByName(projects);
  const filtered = sorted.filter((p) => matchProject(p, query)).slice(0, 80);

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  return (
    <div className={`space-y-1.5 ${className || ''}`}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="프로젝트명, 최종고객명으로 검색..."
          className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
        />
      </div>

      {selectedProjects.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedProjects.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-[11px] font-semibold px-2 py-1 rounded-full">
              {p.name}
              <button type="button" onClick={() => toggle(p.id)} className="hover:text-rose-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="max-h-36 overflow-y-auto bg-slate-50 border border-slate-200 rounded-xl p-2 space-y-1">
        {projects.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-2">등록된 프로젝트가 없습니다.</p>
        ) : filtered.length === 0 ? (
          <p className="text-[11px] text-slate-400 text-center py-3">검색 결과가 없습니다.</p>
        ) : (
          filtered.map((p) => {
            const checked = value.includes(p.id);
            return (
              <label key={p.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-slate-500 hover:bg-white'}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} className="accent-indigo-600" />
                <Briefcase className="w-3 h-3 shrink-0 opacity-60" />
                <span className="truncate">{p.name}{p.endCustomer ? <span className="opacity-60"> ({p.endCustomer})</span> : null}</span>
              </label>
            );
          })
        )}
        {projects.length > 80 && filtered.length === 80 && (
          <p className="text-[10px] text-slate-400 text-center py-1">검색어를 더 입력하면 결과가 좁혀집니다 (상위 80건만 표시 중)</p>
        )}
      </div>
    </div>
  );
};
