import React, { useEffect, useState } from 'react';
import { X, Eraser, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { User } from '../types.js';

// [추가] 명함 주소(주소/보조주소/자택주소)에 스캔·OCR이나 붙여넣기 과정에서 실수로 섞여
// 들어간 "\" 문자를 찾아서 지워주는 관리자 전용 일회성 정리 도구. 실수로 잘못 지워지는
// 일이 없도록, 실제로 적용하기 전에 어떤 명함이 어떻게 바뀌는지 먼저 목록으로 보여주고
// 확인을 받은 뒤에만 서버에 반영한다(server.ts의 GET/POST /api/admin/contacts-backslash-*
// 참고).

interface FieldChange { before: string; after: string; }
interface ScanResult {
  id: string;
  name: string;
  company: string;
  changes: Record<string, FieldChange>;
}

const FIELD_LABEL: Record<string, string> = {
  address: '주소',
  address2: '보조 주소',
  homeAddress: '자택 주소'
};

interface Props {
  currentUser: User;
  onClose: () => void;
  onCleaned: (fixedCount: number) => void;
}

export const AddressBackslashCleanupModal: React.FC<Props> = ({ currentUser, onClose, onCleaned }) => {
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [items, setItems] = useState<ScanResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fixedCount, setFixedCount] = useState<number | null>(null);

  const runScan = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/contacts-backslash-scan', { headers: { 'x-user-id': currentUser.id } });
      if (!res.ok) throw new Error(`조회에 실패했습니다 (상태: ${res.status}).`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || '조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { runScan(); }, []);

  const handleApply = async () => {
    if (!confirm(`명함 ${items.length}건의 주소에서 "\\" 문자를 지웁니다. 계속할까요?`)) return;
    setApplying(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/contacts-backslash-clean', {
        method: 'POST',
        headers: { 'x-user-id': currentUser.id }
      });
      if (!res.ok) throw new Error(`정리에 실패했습니다 (상태: ${res.status}).`);
      const data = await res.json();
      setFixedCount(typeof data.fixedCount === 'number' ? data.fixedCount : 0);
      onCleaned(typeof data.fixedCount === 'number' ? data.fixedCount : 0);
    } catch (err: any) {
      setError(err.message || '정리 중 오류가 발생했습니다.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-500/20 flex items-center justify-center">
              <Eraser className="w-4 h-4 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">명함 주소 "\" 문자 정리</h2>
              <p className="text-[11px] text-slate-400">관리자 전용 · 주소/보조 주소/자택 주소에서 "\" 만 지웁니다</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {loading ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3 text-slate-400">
              <div className="w-8 h-8 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-semibold">전체 명함을 확인하는 중...</p>
            </div>
          ) : fixedCount !== null ? (
            <div className="py-10 flex flex-col items-center justify-center gap-2 text-center">
              <CheckCircle2 className="w-9 h-9 text-emerald-500" />
              <p className="text-sm font-bold text-slate-700">{fixedCount}건의 명함 주소를 정리했습니다.</p>
              <p className="text-xs text-slate-400">이제 닫으셔도 됩니다.</p>
            </div>
          ) : items.length === 0 ? (
            <div className="py-10 flex flex-col items-center justify-center gap-2 text-center text-slate-400">
              <CheckCircle2 className="w-9 h-9 text-emerald-400" />
              <p className="text-xs font-semibold">주소에 "\" 가 섞인 명함이 없습니다.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                아래 <span className="font-bold text-indigo-600">{items.length}건</span>의 명함에서 "\"를 지우면 이렇게 바뀝니다. 확인 후 아래 "적용" 버튼을 눌러주세요.
              </p>
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                    <p className="text-xs font-bold text-slate-700">{item.name} <span className="font-normal text-slate-400">· {item.company || '회사명 없음'}</span></p>
                    {(Object.entries(item.changes) as [string, FieldChange][]).map(([field, change]) => (
                      <div key={field} className="text-[11px] text-slate-500 space-y-0.5">
                        <span className="font-semibold text-slate-400">{FIELD_LABEL[field] || field}</span>
                        <p className="text-rose-500 line-through decoration-rose-300">{change.before}</p>
                        <p className="text-emerald-600">{change.after || '(빈 값)'}</p>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
          {error && (
            <p className="text-xs text-rose-500 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
            </p>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 flex items-center gap-2 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-bold text-slate-600 transition-colors"
          >
            {fixedCount !== null ? '닫기' : '취소'}
          </button>
          {fixedCount === null && items.length > 0 && (
            <button
              onClick={handleApply}
              disabled={loading || applying}
              className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {applying ? '적용 중...' : `${items.length}건 적용`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
