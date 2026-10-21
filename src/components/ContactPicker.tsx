import React, { useState, useRef, useEffect } from 'react';
import { Search, X, User, Building2, Check } from 'lucide-react';
import { BusinessCard } from '../types.js';

// [추가] 명함이 몇 개 안 될 땐 괜찮았지만, 2,000건이 넘어가면 "명함 쭉 나열된 드롭다운"에서
// 원하는 사람을 스크롤로 찾는 게 사실상 불가능해진다. "연관 거래처 담당자"를 고르는 곳이
// 여러 화면에 흩어져 있어서, 검색 가능한 선택 UI를 여기 하나로 모아두고 재사용한다.

function matchContact(c: BusinessCard, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    c.name.toLowerCase().includes(needle) ||
    (c.company || '').toLowerCase().includes(needle) ||
    (c.department || '').toLowerCase().includes(needle) ||
    (c.phoneMobile || '').includes(needle)
  );
}

// ------------------------------------------------------------------
// 단일 선택: "연관 거래처 담당자 선택" 같은, 한 명만 고르는 곳에서 쓴다.
// ------------------------------------------------------------------
interface SingleProps {
  contacts: BusinessCard[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  noneLabel?: string; // "선택 없음" 항목에 쓸 문구 (기본: "연관 담당자 없음", 필터용으로 쓸 땐 "전체" 등으로 바꿀 수 있음)
  className?: string;
}

export const ContactSearchSelect: React.FC<SingleProps> = ({ contacts, value, onChange, placeholder, noneLabel, className }) => {
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

  const selected = contacts.find((c) => c.id === value);
  const filtered = contacts.filter((c) => matchContact(c, query)).slice(0, 50); // 검색해도 목록이 너무 길지 않게 상위 50건만

  return (
    <div ref={wrapRef} className={`relative ${className || ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-left hover:border-indigo-400 transition-colors"
      >
        <span className={selected ? 'text-slate-700 font-medium truncate' : 'text-slate-400 truncate'}>
          {selected ? `${selected.name} (${selected.company || '회사 미등록'})` : (placeholder || noneLabel || '연관 담당자 없음')}
        </span>
        {selected ? (
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
              placeholder="이름, 회사명, 전화번호로 검색..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); setQuery(''); }}
              className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:bg-slate-50 border-b border-slate-100"
            >
              {noneLabel || '연관 담당자 없음'}
            </button>
            {filtered.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-4">검색 결과가 없습니다.</p>
            ) : (
              filtered.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => { onChange(c.id); setOpen(false); setQuery(''); }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 flex items-center gap-2 ${c.id === value ? 'bg-indigo-50' : ''}`}
                >
                  <User className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="font-medium text-slate-700 truncate">{c.name}</span>
                  <span className="text-slate-400 truncate">· {c.company || '회사 미등록'}</span>
                  {c.id === value && <Check className="w-3 h-3 text-indigo-600 ml-auto shrink-0" />}
                </button>
              ))
            )}
            {contacts.length > 50 && filtered.length === 50 && (
              <p className="text-[10px] text-slate-400 text-center py-1.5">검색어를 더 입력하면 결과가 좁혀집니다 (상위 50건만 표시 중)</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ------------------------------------------------------------------
// 다중 선택: "연관된 명함 담당자 선택 (다중선택 가능)" 같은 곳에서 쓴다.
// ------------------------------------------------------------------
interface MultiProps {
  contacts: BusinessCard[];
  value: string[];
  onChange: (ids: string[]) => void;
  className?: string;
}

export const ContactMultiSearchSelect: React.FC<MultiProps> = ({ contacts, value, onChange, className }) => {
  const [query, setQuery] = useState('');
  const selectedContacts = contacts.filter((c) => value.includes(c.id));
  const filtered = contacts.filter((c) => matchContact(c, query)).slice(0, 80);

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
          placeholder="이름, 회사명으로 검색..."
          className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
        />
      </div>

      {selectedContacts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedContacts.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-[11px] font-semibold px-2 py-1 rounded-full">
              {c.name}
              <button type="button" onClick={() => toggle(c.id)} className="hover:text-rose-600">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="max-h-36 overflow-y-auto bg-slate-50 border border-slate-200 rounded-xl p-2 space-y-1">
        {filtered.length === 0 ? (
          <p className="text-[11px] text-slate-400 text-center py-3">검색 결과가 없습니다.</p>
        ) : (
          filtered.map((c) => {
            const checked = value.includes(c.id);
            return (
              <label key={c.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${checked ? 'bg-indigo-100 text-indigo-700 font-bold' : 'text-slate-500 hover:bg-white'}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(c.id)} className="accent-indigo-600" />
                <Building2 className="w-3 h-3 shrink-0 opacity-60" />
                <span className="truncate">{c.name} <span className="opacity-60">({c.company || '회사 미등록'})</span></span>
              </label>
            );
          })
        )}
        {contacts.length > 80 && filtered.length === 80 && (
          <p className="text-[10px] text-slate-400 text-center py-1">검색어를 더 입력하면 결과가 좁혀집니다 (상위 80건만 표시 중)</p>
        )}
      </div>
    </div>
  );
};
