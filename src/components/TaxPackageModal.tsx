import React, { useState } from 'react';
import { X, Mail, FileSpreadsheet, Send, CheckCircle2, AlertTriangle } from 'lucide-react';

interface Props {
  onClose: () => void;
}

// [수정] 더존 같은 회계 프로그램에 실시간으로 직접 연동하려면 기업 계약(EDI)이 필요해서
// 현실적으로 어렵다. 대신 "매달 서류를 직접 갖다주는 수고"라는 실제 문제를 해결하기 위해,
// 그 달의 모든 지출(차량비용/정비/미팅지출/업무일지 지출)과 영수증 사진을 엑셀+압축파일로
// 모아서 세무사 이메일로 바로 발송한다.
export const TaxPackageModal: React.FC<Props> = ({ onClose }) => {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [accountantEmail, setAccountantEmail] = useState<string>(() => {
    try { return localStorage.getItem('bizcard_accountant_email') || ''; } catch { return ''; }
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ count: number; totalAmount: number } | null>(null);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!accountantEmail.trim() || !accountantEmail.includes('@')) {
      setError('세무사님 이메일 주소를 정확히 입력해주세요.');
      return;
    }
    setSending(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/send-tax-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, accountantEmail: accountantEmail.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '발송에 실패했습니다.');
      try { localStorage.setItem('bizcard_accountant_email', accountantEmail.trim()); } catch {}
      setResult({ count: data.count, totalAmount: data.totalAmount });
    } catch (err: any) {
      setError(err.message || '발송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[95] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-500/20 text-emerald-700">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-800">월별 세무 자료 보내기</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {result ? (
            <div className="py-6 flex flex-col items-center gap-2 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              <p className="text-sm font-bold text-slate-800">발송 완료!</p>
              <p className="text-xs text-slate-500">
                {year}년 {month}월 지출 {result.count}건 (합계 {result.totalAmount.toLocaleString()}원)을<br />
                {accountantEmail}로 보냈어요.
              </p>
              <button onClick={onClose} className="mt-2 px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold">
                닫기
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500 leading-relaxed">
                선택한 달의 차량비용·정비·미팅지출·업무일지 지출을 <b className="text-slate-600">엑셀 정리표 + 영수증 사진</b>으로
                모아서 압축파일로 세무사님께 바로 보내드려요.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">연도</label>
                  <select
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-emerald-500"
                  >
                    {[now.getFullYear(), now.getFullYear() - 1].map((y) => (
                      <option key={y} value={y}>{y}년</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">월</label>
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:border-emerald-500"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>{m}월</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">세무사님 이메일</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="email"
                    value={accountantEmail}
                    onChange={(e) => setAccountantEmail(e.target.value)}
                    placeholder="taxaccountant@example.com"
                    className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">한번 입력하면 다음에 자동으로 기억해둬요.</p>
              </div>

              {error && (
                <div className="flex items-start gap-2 text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleSend}
                disabled={sending}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/25 transition-all active:scale-95 disabled:opacity-50"
              >
                {sending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    <span>자료 모으고 발송하는 중...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>{month}월 자료 보내기</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
