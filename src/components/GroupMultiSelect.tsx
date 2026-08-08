import React, { useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { ContactGroup } from '../types.js';

interface Props {
  groups: ContactGroup[];
  value: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}

// [수정] 그룹이 몇 개 안 될 땐 전부 나열해도 괜찮았지만, 그룹이 20~30개를 넘어가면
// 화면을 뒤덮어서 오히려 원하는 그룹을 찾기 어려워졌다. 검색창을 추가해서 타이핑하면
// 걸러지게 하고, 이미 선택한 그룹은 검색어와 무관하게 위에 계속 보이게 해서 선택
// 상태를 잃어버리지 않게 한다.
export const GroupMultiSelect: React.FC<Props> = ({ groups, value, onChange, className }) => {
  const [query, setQuery] = useState('');

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  if (groups.length === 0) {
    return <p className="text-[11px] text-slate-400">등록된 그룹이 없습니다. "그룹 관리"에서 먼저 만들어주세요.</p>;
  }

  const selectedGroups = groups.filter((g) => value.includes(g.id));
  const q = query.trim().toLowerCase();
  const filteredGroups = groups.filter((g) => !value.includes(g.id) && (!q || g.name.toLowerCase().includes(q)));

  return (
    <div className={`space-y-2 ${className || ''}`}>
      {/* 이미 선택한 그룹 - 검색어와 무관하게 항상 위에 표시 */}
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
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="그룹 이름으로 검색..."
          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
        />
      </div>

      <div className="max-h-40 overflow-y-auto flex flex-wrap gap-1.5 content-start">
        {filteredGroups.length === 0 ? (
          <p className="text-[11px] text-slate-400 py-1">
            {q ? '검색 결과가 없습니다.' : '선택 가능한 그룹이 더 없습니다.'}
          </p>
        ) : (
          filteredGroups.map((g) => (
            <button
              type="button"
              key={g.id}
              onClick={() => toggle(g.id)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 transition-all"
            >
              {g.name}
            </button>
          ))
        )}
      </div>
    </div>
  );
};
