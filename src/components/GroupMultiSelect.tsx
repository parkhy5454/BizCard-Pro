import React, { useState, useRef, useEffect } from 'react';
import { Check, Search, X } from 'lucide-react';
import { ContactGroup } from '../types.js';

interface Props {
  groups: ContactGroup[];
  value: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}

// [수정] 검색 목록을 항상 펼쳐서 보여주던 방식(고정 리스트) 대신, 검색창을 누르면 그
// 아래에 드롭다운으로 목록이 뜨고, 바깥을 누르면 닫히는 방식으로 바꿨다(ContactSearchSelect와
// 동일한 동작 방식). 평소엔 검색창 한 줄만 차지해서 화면이 훨씬 깔끔하다.
export const GroupMultiSelect: React.FC<Props> = ({ groups, value, onChange, className }) => {
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

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  if (groups.length === 0) {
    return <p className="text-[11px] text-slate-400">등록된 그룹이 없습니다. "그룹 관리"에서 먼저 만들어주세요.</p>;
  }

  const selectedGroups = groups.filter((g) => value.includes(g.id));
  const q = query.trim().toLowerCase();
  const filteredGroups = groups.filter((g) => !q || g.name.toLowerCase().includes(q));

  return (
    <div ref={wrapRef} className={`space-y-2 ${className || ''}`}>
      {/* 이미 선택한 그룹 - 검색창과 별개로 항상 위에 표시 */}
      {selectedGroups.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedGroups.map((g) => (
            <button
              type="button"
              key={g.id}
              onClick={() => toggle(g.id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${g.color}`}
            >
              <Check className="w-3 h-3" />
              {g.name}
              <X className="w-3 h-3 opacity-60 ml-0.5" />
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 z-10" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="그룹 이름으로 검색..."
          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
        />

        {/* [수정] 검색창을 누르기 전엔 안 보이다가, 누르면 바로 아래에 드롭다운으로 뜬다. */}
        {open && (
          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-2xl divide-y divide-slate-100">
            {filteredGroups.length === 0 ? (
              <p className="text-[11px] text-slate-400 py-3 text-center">
                {q ? '검색 결과가 없습니다.' : '등록된 그룹이 없습니다.'}
              </p>
            ) : (
              filteredGroups.map((g) => {
                const checked = value.includes(g.id);
                return (
                  <button
                    type="button"
                    key={g.id}
                    onClick={() => toggle(g.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-left transition-colors ${checked ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${g.color.split(' ').find((c) => c.startsWith('bg-')) || 'bg-slate-300'}`} />
                    <span className="flex-1 truncate">{g.name}</span>
                    {checked && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
