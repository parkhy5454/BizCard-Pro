import React from 'react';
import { Check } from 'lucide-react';
import { ContactGroup } from '../types.js';

interface Props {
  groups: ContactGroup[];
  value: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}

// [추가] 명함 한 장이 여러 그룹에 동시에 속할 수 있게 되면서, 예전의 "그룹 하나만 고르는
// select" 대신 여러 개를 토글해서 고를 수 있는 칩(chip) 형태의 선택 UI가 필요해졌다.
// 그룹은 보통 개수가 많지 않아서(수십 개 이내), 검색창 없이 전부 나열하는 방식으로 충분하다.
export const GroupMultiSelect: React.FC<Props> = ({ groups, value, onChange, className }) => {
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };

  if (groups.length === 0) {
    return <p className="text-[11px] text-slate-400">등록된 그룹이 없습니다. "그룹 관리"에서 먼저 만들어주세요.</p>;
  }

  return (
    <div className={`flex flex-wrap gap-1.5 ${className || ''}`}>
      {groups.map((g) => {
        const checked = value.includes(g.id);
        return (
          <button
            type="button"
            key={g.id}
            onClick={() => toggle(g.id)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              checked ? g.color : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {checked && <Check className="w-3 h-3" />}
            {g.name}
          </button>
        );
      })}
    </div>
  );
};
