import React, { useEffect, useState } from 'react';
import { Megaphone, Pin, Pencil, Trash2, Plus, X, Check, RefreshCw } from 'lucide-react';
import { User as UserType } from '../types.js';

interface Props {
  currentUser: UserType;
}

interface AnnouncementItem {
  id: string;
  authorName: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

// [추가] 사내 공지사항/게시판. 그룹웨어(다우오피스 등)에 있던 핵심 기능인데 이 앱엔
// 없었다. 관리자만 작성/수정/삭제할 수 있고, 소속 회원은 전부 읽을 수 있다.
export const AnnouncementsView: React.FC<Props> = ({ currentUser }) => {
  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formPinned, setFormPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const isAdmin = currentUser.role === 'admin';

  const loadItems = () => {
    setLoading(true);
    setError('');
    fetch('/api/announcements', { headers: { 'x-user-id': currentUser.id } })
      .then(async (res) => {
        if (!res.ok) throw new Error('공지사항을 불러오지 못했습니다.');
        return res.json();
      })
      .then((data: AnnouncementItem[]) => setItems(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || '공지사항을 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const openNewEditor = () => {
    setEditingId(null);
    setFormTitle('');
    setFormContent('');
    setFormPinned(false);
    setFormError('');
    setIsEditorOpen(true);
  };

  const openEditEditor = (item: AnnouncementItem) => {
    setEditingId(item.id);
    setFormTitle(item.title);
    setFormContent(item.content);
    setFormPinned(item.pinned);
    setFormError('');
    setIsEditorOpen(true);
  };

  const closeEditor = () => setIsEditorOpen(false);

  const handleSave = async () => {
    if (!formTitle.trim() || !formContent.trim()) {
      setFormError('제목과 내용을 모두 입력해주세요.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const url = editingId ? `/api/announcements/${editingId}` : '/api/announcements';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
        body: JSON.stringify({ title: formTitle.trim(), content: formContent.trim(), pinned: formPinned })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장하지 못했습니다.');
      setIsEditorOpen(false);
      loadItems();
    } catch (err: any) {
      setFormError(err.message || '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 공지사항을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/announcements/${id}`, { method: 'DELETE', headers: { 'x-user-id': currentUser.id } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '삭제하지 못했습니다.');
      }
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch (err: any) {
      alert(err.message || '삭제하지 못했습니다.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-indigo-500" />
          <h2 className="text-xl font-bold text-slate-900">사내 공지사항</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadItems}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-600 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> 새로고침
          </button>
          {isAdmin && (
            <button
              onClick={openNewEditor}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> 새 공지 작성
            </button>
          )}
        </div>
      </div>

      {isEditorOpen && (
        <div className="bg-white border border-indigo-200 rounded-2xl p-4 space-y-3">
          <input
            type="text"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            placeholder="공지 제목"
            className="w-full text-sm font-bold px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-indigo-500"
          />
          <textarea
            value={formContent}
            onChange={(e) => setFormContent(e.target.value)}
            placeholder="공지 내용을 입력하세요"
            rows={5}
            className="w-full text-sm px-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:border-indigo-500 resize-none"
          />
          <label className="flex items-center gap-2 text-xs text-slate-600 font-medium cursor-pointer">
            <input type="checkbox" checked={formPinned} onChange={(e) => setFormPinned(e.target.checked)} className="rounded" />
            상단에 고정
          </label>
          {formError && <p className="text-xs text-rose-500">{formError}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> {saving ? '저장 중...' : '저장'}
            </button>
            <button
              onClick={closeEditor}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-colors"
            >
              <X className="w-3.5 h-3.5" /> 취소
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-sm text-slate-400">불러오는 중...</div>
      ) : error ? (
        <div className="text-center py-12 text-sm text-rose-500 bg-rose-50 rounded-2xl border border-dashed border-rose-200">{error}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-sm text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          등록된 공지사항이 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  {item.pinned && <Pin className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                  <h3 className="text-sm font-bold text-slate-800 truncate">{item.title}</h3>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEditEditor(item)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDelete(item.id)} className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap mt-2">{item.content}</p>
              <p className="text-[11px] text-slate-400 mt-3">{item.authorName} · {formatDateTime(item.createdAt)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
