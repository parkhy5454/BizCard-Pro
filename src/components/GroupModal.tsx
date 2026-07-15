import React, { useState } from 'react';
import { FolderTree, Plus, Trash2, Edit2, Check, X, ShieldAlert } from 'lucide-react';
import { ContactGroup, BusinessCard } from '../types.js';

interface Props {
  groups: ContactGroup[];
  contacts: BusinessCard[];
  onCreateGroup: (g: { name: string; color: string }) => void;
  onUpdateGroup: (id: string, name: string, color: string) => void;
  onDeleteGroup: (id: string) => void;
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

export const GroupModal: React.FC<Props> = ({ groups, contacts, onCreateGroup, onUpdateGroup, onDeleteGroup }) => {
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
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl space-y-8">
        
        {/* 상단 헤더 */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 text-amber-400 rounded-2xl border border-amber-500/20">
              <FolderTree className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">명함 그룹 생성·수정·삭제 관리</h2>
            </div>
          </div>
          <span className="text-xs font-mono bg-slate-800 text-slate-300 px-3 py-1 rounded-full">총 {groups.length}개 그룹</span>
        </div>

        {/* 새 그룹 생성 폼 */}
        <form onSubmit={handleCreate} className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-4">
          <span className="text-xs font-bold text-blue-400 uppercase tracking-wider block font-mono">➕ 신규 명함 그룹 생성</span>
          
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              placeholder="새 그룹 이름 입력 (예: 🚀 스타트업 파트너)"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={!newGroupName.trim()}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-bold rounded-xl text-sm shadow transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>그룹 추가등록</span>
            </button>
          </div>

          {/* 테마 컬러 파레트 선택 */}
          <div className="flex items-center gap-2 overflow-x-auto pt-2 pb-1">
            <span className="text-xs text-slate-400 shrink-0 mr-1 font-medium">테마 색상:</span>
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
          <span className="text-xs font-bold text-slate-400 block mb-2 font-mono uppercase">등록된 그룹 리스트 & 인원 현황</span>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {groups.map((g) => {
              const count = contacts.filter((c) => c.groupId === g.id).length;
              const isEditing = editingGid === g.id;

              return (
                <div key={g.id} className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 flex flex-col justify-between space-y-3">
                  {isEditing ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white font-bold"
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
                        <button onClick={() => setEditingGid(null)} className="p-1.5 rounded bg-slate-800 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
                        <button onClick={() => saveEdit(g.id)} className="p-1.5 rounded bg-emerald-600 text-white"><Check className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border shadow ${g.color}`}>
                          {g.name}
                        </span>
                        <span className="text-xs font-mono bg-slate-900 text-blue-400 px-2.5 py-1 rounded-lg border border-slate-800 font-semibold">
                          명함 {count}명
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-900 text-xs text-slate-400">
                        <span className="text-[11px] text-slate-500 truncate max-w-[60%]">ID: {g.id}</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startEdit(g)}
                            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white flex items-center gap-1 transition-colors"
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
                              className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-600 text-slate-400 hover:text-white transition-colors"
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
        <div className="flex items-center gap-2 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-400">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span>그룹을 삭제해도 명함 연락처 자체는 지워지지 않고 첫 번째 그룹으로 자동 이동합니다.</span>
        </div>

      </div>
    </div>
  );
};
