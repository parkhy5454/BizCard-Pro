import React, { useState } from 'react';
import { FolderTree, Plus, Trash2, Edit2, Check, X, ShieldAlert, Lock, Unlock } from 'lucide-react';
import { ContactGroup, BusinessCard, User } from '../types.js';
import { contactHasGroup } from '../groupUtils.js';

interface Props {
  groups: ContactGroup[];
  contacts: BusinessCard[];
  currentUser?: User | null;
  onCreateGroup: (g: { name: string; color: string }) => void;
  onUpdateGroup: (id: string, name: string, color: string) => void;
  onDeleteGroup: (id: string) => void;
  onTogglePrivate?: (id: string, isPrivate: boolean) => void;
}

const COLOR_PALETTES = [
  { label: '앰버 골드', cls: 'bg-amber-500 text-amber-950 border-amber-400' },
  { label: '로열 블루', cls: 'bg-blue-500 text-white border-blue-400' },
  { label: '에메랄드 그린', cls: 'bg-emerald-500 text-white border-emerald-400' },
  { label: '퍼플 바이올렛', cls: 'bg-purple-500 text-white border-purple-400' },
  { label: '로즈 레드', cls: 'bg-rose-500 text-white border-rose-400' },
  { label: '시안 테알', cls: 'bg-cyan-500 text-slate-950 border-cyan-400' },
  { label: '다크 슬레이트', cls: 'bg-slate-700 text-white border-slate-600' }
];

export const GroupModal: React.FC<Props> = ({ groups, contacts, currentUser, onCreateGroup, onUpdateGroup, onDeleteGroup, onTogglePrivate }) => {
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState(COLOR_PALETTES[0].cls);
  const [editingGid, setEditingGid] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    onCreateGroup({ name: newGroupName.trim(), color: newGroupColor });
    setNewGroupName('');
  };

  const startEdit = (g: ContactGroup) => {
    setEditingGid(g.id);
    setEditName(g.name);
    setEditColor(g.color);
  };

  const saveEdit = (id: string) => {
    if (!editName.trim()) return;
    onUpdateGroup(id, editName.trim(), editColor);
    setEditingGid(null);
  };

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-2xl space-y-8">
        
        {/* 상단 헤더 */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-50 text-amber-700 rounded-2xl border border-amber-500/20">
              <FolderTree className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">명함 그룹 생성·수정·삭제 관리</h2>
            </div>
          </div>
          <span className="text-xs font-mono bg-slate-100 text-slate-600 px-3 py-1 rounded-full">총 {groups.length}개 그룹</span>
        </div>

        {/* 새 그룹 생성 폼 */}
        <form onSubmit={handleCreate} className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
          <span className="text-xs font-bold text-blue-400 uppercase tracking-wider block font-mono">➕ 신규 명함 그룹 생성</span>
          
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              placeholder="새 그룹 이름 입력 (예: 🚀 스타트업 파트너)"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={!newGroupName.trim()}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold rounded-xl text-sm shadow transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>그룹 추가등록</span>
            </button>
          </div>

          {/* 테마 컬러 파레트 선택 */}
          <div className="flex items-center gap-2 overflow-x-auto pt-2 pb-1">
            <span className="text-xs text-slate-500 shrink-0 mr-1 font-medium">테마 색상:</span>
            {COLOR_PALETTES.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setNewGroupColor(p.cls)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-transform border whitespace-nowrap ${p.cls} ${newGroupColor === p.cls ? 'ring-2 ring-white scale-110 shadow-lg' : 'opacity-70 hover:opacity-100'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </form>

        {/* 기존 그룹 목록 (수정 / 삭제 핸들링) */}
        <div className="space-y-3">
          <span className="text-xs font-bold text-slate-500 block mb-2 font-mono uppercase">등록된 그룹 리스트 & 인원 현황</span>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groups.map((g) => {
              const count = contacts.filter((c) => contactHasGroup(c, g.id)).length;
              const isEditing = editingGid === g.id;

              return (
                <div key={g.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex flex-col justify-between space-y-3">
                  {isEditing ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 font-bold"
                      />
                      <div className="flex gap-1.5 overflow-x-auto pb-1">
                        {COLOR_PALETTES.map((p, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setEditColor(p.cls)}
                            className={`w-6 h-6 rounded-full border shrink-0 ${p.cls} ${editColor === p.cls ? 'ring-2 ring-white scale-110' : 'opacity-60'}`}
                          />
                        ))}
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingGid(null)} className="p-1.5 rounded bg-slate-100 text-slate-500 hover:text-slate-700"><X className="w-4 h-4" /></button>
                        <button onClick={() => saveEdit(g.id)} className="p-1.5 rounded bg-emerald-600 text-white"><Check className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border shadow ${g.color}`}>
                          {g.name}
                        </span>
                        <span className="text-xs font-mono bg-white text-blue-400 px-2.5 py-1 rounded-lg border border-slate-200 font-semibold">
                          명함 {count}명
                        </span>
                      </div>

                      {/* [추가] 그룹 공개 설정. 명함 하나하나에 있던 "나만 보기(비공개)"를
                      그룹 단위로도 걸 수 있게 한다. 그룹을 만든 본인만 켜고 끌 수 있고,
                      켜면 그룹 자체와 그 안에 속한 명함이 다른 사람에게 함께 숨겨진다. */}
                      {onTogglePrivate && (!g.createdByUserId || g.createdByUserId === currentUser?.id) && (
                        <button
                          type="button"
                          onClick={() => onTogglePrivate(g.id, !g.isPrivate)}
                          title={g.isPrivate ? '비공개 상태 - 눌러서 회사 전체에 공개하기' : '눌러서 나만 보기(비공개)로 전환'}
                          className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                            g.isPrivate
                              ? 'bg-amber-50 text-amber-700 border-amber-500/30 hover:bg-amber-500/20'
                              : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'
                          }`}
                        >
                          {g.isPrivate ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                          <span>{g.isPrivate ? '나만 보기 (그룹 전체 비공개)' : '회사 전체 공개'}</span>
                        </button>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs text-slate-500">
                        <span className="text-[11px] text-slate-400 truncate max-w-[60%]">ID: {g.id}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startEdit(g)}
                            className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-600 hover:text-slate-700 flex items-center gap-1 transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> 수정
                          </button>
                          
                          {groups.length > 1 && (
                            <button
                              onClick={() => {
                                if (confirm(`'${g.name}' 그룹을 삭제하시겠습니까? 소속된 명함은 기본 그룹으로 이동합니다.`)) {
                                  onDeleteGroup(g.id);
                                }
                              }}
                              className="p-1.5 rounded-lg bg-white hover:bg-rose-600 text-slate-500 hover:text-white transition-colors"
                              title="그룹 삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 보호 안내 */}
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-500">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span>그룹을 삭제해도 명함 연락처 자체는 지워지지 않고 첫 번째 그룹으로 자동 이동합니다.</span>
        </div>

      </div>
    </div>
  );
};
