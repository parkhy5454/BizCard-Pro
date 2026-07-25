import React, { useState, useEffect } from 'react';
import { X, Bug, Lightbulb, MessageSquare, RefreshCw, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { FeedbackItem, User } from '../types.js';

interface Props {
  currentUser?: User | null;
  onClose: () => void;
}

const CATEGORY_META: Record<FeedbackItem['category'], { label: string; icon: React.ReactNode; color: string }> = {
  bug: { label: '버그 신고', icon: <Bug className="w-3.5 h-3.5" />, color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
  feature: { label: '기능 제안', icon: <Lightbulb className="w-3.5 h-3.5" />, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  other: { label: '기타 문의', icon: <MessageSquare className="w-3.5 h-3.5" />, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' }
};

const STATUS_META: Record<FeedbackItem['status'], { label: string; color: string }> = {
  new: { label: '신규', color: 'text-rose-300 bg-rose-500/10 border-rose-500/30' },
  in_progress: { label: '처리중', color: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  resolved: { label: '완료', color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' }
};

export const FeedbackInboxModal: React.FC<Props> = ({ currentUser, onClose }) => {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<'all' | FeedbackItem['status']>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchFeedback = async () => {
    setLoading(true);
    try {
      const headers: any = {};
      if (currentUser) headers['x-user-id'] = currentUser.id;
      const res = await fetch('/api/feedback', { headers });
      const data = await res.json();
      if (Array.isArray(data)) setItems(data);
    } catch (err) {
      console.error('문의 목록 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateStatus = async (id: string, status: FeedbackItem['status']) => {
    setUpdatingId(id);
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      if (currentUser) headers['x-user-id'] = currentUser.id;
      const res = await fetch(`/api/feedback/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        const updated = await res.json();
        setItems((prev) => prev.map((it) => (it.id === id ? updated : it)));
      }
    } catch (err) {
      console.error('문의 상태 변경 실패:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${y}.${m}.${day} ${h}:${min}`;
    } catch {
      return iso;
    }
  };

  const filtered = items.filter((it) => statusFilter === 'all' || it.status === statusFilter);
  const counts = {
    all: items.length,
    new: items.filter((it) => it.status === 'new').length,
    in_progress: items.filter((it) => it.status === 'in_progress').length,
    resolved: items.filter((it) => it.status === 'resolved').length
  };

  return (
    <div className="fixed inset-0 z-[90] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[88vh] bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-100">문의함</h2>
            <p className="text-xs text-slate-500 mt-0.5">앱 전체에서 접수된 문의를 모아 확인합니다.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchFeedback}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
              title="새로고침"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto shrink-0">
          {([
            ['all', '전체'],
            ['new', '신규'],
            ['in_progress', '처리중'],
            ['resolved', '완료']
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                statusFilter === key
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
              }`}
            >
              {label} ({counts[key]})
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="py-16 flex flex-col items-center gap-2 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-xs">문의 목록 불러오는 중...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-xs">해당하는 문의가 없습니다.</div>
          ) : (
            filtered.map((item) => {
              const cat = CATEGORY_META[item.category] || CATEGORY_META.other;
              const status = STATUS_META[item.status] || STATUS_META.new;
              return (
                <div key={item.id} className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cat.color}`}>
                        {cat.icon}
                        {cat.label}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(item.createdAt)}
                    </span>
                  </div>

                  <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-900/60 p-3 rounded-xl border border-slate-800/60">
                    {item.content}
                  </p>

                  <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] text-slate-500">
                    <span>
                      {item.authorName || '알 수 없음'}
                      {item.companyName ? ` · ${item.companyName}` : ' · 개인 계정'}
                      {item.pageContext ? ` · ${item.pageContext} 화면` : ''}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {(['new', 'in_progress', 'resolved'] as const).map((s) => (
                        <button
                          key={s}
                          disabled={updatingId === item.id || item.status === s}
                          onClick={() => updateStatus(item.id, s)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors disabled:opacity-40 ${
                            item.status === s
                              ? STATUS_META[s].color
                              : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {STATUS_META[s].label}
                        </button>
                      ))}
                      {item.status === 'resolved' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
