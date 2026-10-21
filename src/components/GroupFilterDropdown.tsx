import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { ContactGroup } from '../types.js';

interface Props {
  groups: ContactGroup[];
  selectedGroup: string; // 'all' 또는 group id
  setSelectedGroup: (id: string) => void;
}

// [추가] 그룹 필터 칩을 옆으로 계속 늘어놓던 방식은, 그룹이 많아지면(수십 개) 다 보려고
// 계속 스크롤해야 해서 불편했다. 버튼 하나로 열고, 검색해서 원하는 그룹을 바로 고르는
// 드롭다운으로 바꿨다.
export const GroupFilterDropdown: React.FC<Props> = ({ groups, selectedGroup, setSelectedGroup }) => {
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

  const currentGroup = groups.find((g) => g.id === selectedGroup);
  const q = query.trim().toLowerCase();
  const filteredGroups = groups.filter((g) => !q || g.name.toLowerCase().includes(q));

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap ${
          currentGroup ? currentGroup.color : selectedGroup === 'all' ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-slate-100 border-slate-200 text-slate-600'
        }`}
      >
        <span>그룹: {currentGroup ? currentGroup.name : '전체보기'}</span>
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-64 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-2 border-b border-slate-200">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="그룹 이름으로 검색..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <button
              type="button"
              onClick={() => { setSelectedGroup('all'); setOpen(false); setQuery(''); }}
              className={`w-full text-left px-3 py-2 text-xs font-semibold hover:bg-slate-50 border-b border-slate-100 ${selectedGroup === 'all' ? 'bg-slate-100 text-slate-900' : 'text-slate-500'}`}
            >
              전체보기
            </button>
            {filteredGroups.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-4">검색 결과가 없습니다.</p>
            ) : (
              filteredGroups.map((g) => (
                <button
                  type="button"
                  key={g.id}
                  onClick={() => { setSelectedGroup(g.id); setOpen(false); setQuery(''); }}
                  className={`w-full text-left px-3 py-2 text-xs font-semibold hover:bg-slate-50 flex items-center gap-2 ${selectedGroup === g.id ? 'bg-slate-100' : ''}`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${g.color.split(' ').find((c) => c.startsWith('bg-')) || 'bg-slate-300'}`} />
                  {g.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
