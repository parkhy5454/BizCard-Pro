import React, { useState, useRef, useEffect } from 'react';
import { Search, Check } from 'lucide-react';
import { BusinessCard } from '../types.js';

interface Props {
  contacts: BusinessCard[];
  isAdded: (contact: BusinessCard) => boolean;
  onToggle: (contact: BusinessCard) => void;
  placeholder?: string;
  className?: string;
}

// [추가] "미팅 참여자"를 예전엔 직접 텍스트로 치는 칸 + 전체 명함을 <select>로 쭉 나열해서
// 고르는 칸, 두 개가 따로 있었다. 명함이 몇 천 건이면 <select> 목록에서 원하는 사람을
// 찾기 힘들었고, 텍스트 칸은 명함 검색/직접입력 칸과 역할이 겹쳤다. 이 컴포넌트 하나로
// "검색해서 클릭 → 추가되고, 계속 열려있어서 바로 이어서 여러 명 추가" 흐름을 만든다.
export const AttendeeContactSearchAdd: React.FC<Props> = ({ contacts, isAdded, onToggle, placeholder, className }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  // [수정] 예전엔 검색어가 비어있어도(포커스만 줘도) 전체 명함 중 최대 50건을 그대로 목록에
  // 보여줬다. 그런데 한 명 추가한 뒤 검색어를 자동으로 비우게 만들면서, 필터링된 1~2건짜리
  // 짧은 목록이 갑자기 50건짜리 긴 목록으로 확 바뀌는 리플로우가 매번 발생했다. 이 순간
  // 방금 클릭한 화면 위치에 다른 항목(혹은 같은 항목)이 걸리면서, 사용자가 "반응이 없다"고
  // 느껴 한 번 더 클릭 → 방금 추가한 사람이 다시 토글되어 빠지는 버그로 이어졌다.
  // 이제 검색어를 최소 1글자 이상 입력했을 때만 목록을 보여줘서, 추가 후 검색어가 비워지면
  // 목록 자체가 사라지고 다음 검색을 시작하기 전까지는 리플로우가 일어나지 않게 한다.
  const showList = open && q.length > 0;
  const filtered = q ? contacts.filter((c) => c.name.toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q)).slice(0, 50) : [];

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 z-10" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder || '이름 또는 회사명으로 검색해서 여러 명 추가...'}
          className={`w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-700 placeholder:text-slate-400 outline-none focus:border-indigo-500 font-medium ${className || ''}`}
        />
      </div>

      {showList && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-2xl divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <p className="text-[11px] text-slate-400 text-center py-4">검색 결과가 없습니다.</p>
          ) : (
            filtered.map((c) => {
              const added = isAdded(c);
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => {
                    onToggle(c);
                    // 추가/제거 후 검색어를 비워서, 목록이 사라지고(위 showList 조건) 다음
                    // 이름을 바로 이어서 타이핑할 수 있게 한다. 포커스는 인풋에 유지.
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${added ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <span className="flex-1 truncate">{c.name} <span className="text-slate-400 font-normal">· {c.company}</span></span>
                  {added && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
