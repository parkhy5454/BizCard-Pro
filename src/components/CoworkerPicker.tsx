import React, { useState } from 'react';
import { Search, X, UserPlus, Check } from 'lucide-react';

// [추가] 업무일지 캘린더 일정에 "같은 회사 동료"를 초대할 때 쓰는 다중 선택 UI.
// ContactPicker.tsx의 ContactMultiSearchSelect와 같은 형태로 만들되, 대상이 명함이 아니라
// 우리 회사에 가입된 동료(사용자 계정)라는 점만 다르다. 여기서 선택된 사람에게는 저장 시
// 서버(server.ts의 notifyNewWorkLogInvites)가 실제 알림 메일을 보낸다.

export interface Coworker {
  id: string;
  name: string;
  position?: string;
  email?: string;
}

function matchCoworker(c: Coworker, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return c.name.toLowerCase().includes(needle) || (c.position || '').toLowerCase().includes(needle);
}

interface Props {
  coworkers: Coworker[];
  value: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}

export const CoworkerMultiSearchSelect: React.FC<Props> = ({ coworkers, value, onChange, className }) => {
  const [query, setQuery] = useState('');
  const selected = coworkers.filter((c) => value.includes(c.id));
  const filtered = coworkers.filter((c) => matchCoworker(c, query)).slice(0, 80);

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
          placeholder="동료 이름, 직책으로 검색..."
          className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
        />
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[11px] font-semibold px-2 py-1 rounded-full">
              {c.name}
              <button type="button" onClick={() => toggle(c.id)} className="hover:text-rose-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="max-h-36 overflow-y-auto bg-slate-50 border border-slate-200 rounded-xl p-2 space-y-1">
        {coworkers.length === 0 ? (
          <p className="text-[11px] text-slate-400 text-center py-3">초대할 수 있는 동료가 없습니다.</p>
        ) : filtered.length === 0 ? (
          <p className="text-[11px] text-slate-400 text-center py-3">검색 결과가 없습니다.</p>
        ) : (
          filtered.map((c) => {
            const checked = value.includes(c.id);
            return (
              <label key={c.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-emerald-100 text-emerald-700 font-bold' : 'text-slate-500 hover:bg-white'}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(c.id)} className="accent-emerald-600" />
                <UserPlus className="w-3 h-3 shrink-0 opacity-60" />
                <span className="truncate">{c.name} {c.position ? <span className="opacity-60">({c.position})</span> : null}</span>
                {checked && <Check className="w-3 h-3 ml-auto shrink-0" />}
              </label>
            );
          })
        )}
        {coworkers.length > 80 && filtered.length === 80 && (
          <p className="text-[10px] text-slate-400 text-center py-1">검색어를 더 입력하면 결과가 좁혀집니다 (상위 80건만 표시 중)</p>
        )}
      </div>
    </div>
  );
};
