import React, { useEffect, useState } from 'react';
import { CreditCard, X, CheckCircle2, AlertTriangle, Users } from 'lucide-react';

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => any;
  }
}

interface BillingStatus {
  plan: 'free' | 'pro';
  subscriptionStatus: 'none' | 'active' | 'past_due' | 'canceled';
  nextBillingAt: string | null;
  hasCardRegistered: boolean;
  seats: number;
  pricePerSeat: number;
  estimatedMonthlyAmount: number;
  canManageBilling: boolean;
}

interface Props {
  onClose: () => void;
}

const TOSS_CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY as string | undefined;

// [추가] 구독(유료 전환) 관리 화면. 카드 등록 → 구독 시작 → (필요 시) 해지까지 여기서 처리한다.
// 카드 등록은 토스페이먼츠 결제창(SDK)을 띄워서 진행하고, 등록이 끝나면 이 페이지로
// ?authKey=...&customerKey=...를 붙여서 돌아온다(App.tsx에서 그 시점을 감지해 이 모달을 다시 연다).
export const SubscriptionModal: React.FC<Props> = ({ onClose }) => {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/billing/status');
      const data = await res.json();
      if (res.ok) setStatus(data);
    } catch {
      setError('구독 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // 토스 카드 등록창에서 돌아온 직후라면(?authKey=...) 자동으로 빌링키 발급을 마무리한다.
    const params = new URLSearchParams(window.location.search);
    const authKey = params.get('authKey');
    if (authKey) {
      window.history.replaceState({}, '', window.location.pathname);
      setProcessing(true);
      fetch('/api/billing/register-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authKey })
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || '카드 등록에 실패했습니다.');
          setMessage('카드 등록이 완료됐습니다. 구독을 시작해주세요.');
          await fetchStatus();
        })
        .catch((err) => setError(err.message))
        .finally(() => setProcessing(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRegisterCard = async () => {
    setError('');
    if (!TOSS_CLIENT_KEY) {
      setError('결제 기능이 아직 설정되지 않았습니다 (관리자에게 문의해주세요).');
      return;
    }
    if (!window.TossPayments) {
      setError('결제 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.');
      return;
    }
    try {
      const res = await fetch('/api/billing/customer-key');
      const { customerKey } = await res.json();
      const tossPayments = window.TossPayments(TOSS_CLIENT_KEY);
      const origin = window.location.origin + window.location.pathname;
      await tossPayments.requestBillingAuth('카드', {
        customerKey,
        successUrl: origin,
        failUrl: origin
      });
      // 성공하면 브라우저가 successUrl(=여기)로 리다이렉트되면서 페이지가 새로 열린다.
    } catch (err: any) {
      if (err?.code !== 'USER_CANCEL') {
        setError(err?.message || '카드 등록 중 오류가 발생했습니다.');
      }
    }
  };

  const handleSubscribe = async () => {
    setError('');
    setProcessing(true);
    try {
      const res = await fetch('/api/billing/subscribe', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '구독 시작에 실패했습니다.');
      setMessage('구독이 시작됐습니다! 이제 모든 기능을 이용하실 수 있어요.');
      await fetchStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('정말 구독을 해지하시겠어요? 이미 결제된 이번 주기까지는 계속 이용하실 수 있습니다.')) return;
    setError('');
    setProcessing(true);
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '해지에 실패했습니다.');
      setMessage(data.message || '구독이 해지되었습니다.');
      await fetchStatus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-bold text-slate-800">구독 관리</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <p className="text-xs text-slate-400 text-center py-6">불러오는 중...</p>
          ) : !status ? (
            <p className="text-xs text-rose-400 text-center py-6">구독 정보를 불러오지 못했습니다.</p>
          ) : !status.canManageBilling ? (
            <p className="text-xs text-slate-500 text-center py-6">구독 관리는 회사 관리자만 할 수 있습니다.</p>
          ) : (
            <>
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">현재 플랜</span>
                  <span className={`font-bold ${status.plan === 'pro' ? 'text-indigo-600' : 'text-slate-600'}`}>
                    {status.plan === 'pro' ? 'Pro' : 'Free'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 flex items-center gap-1"><Users className="w-3 h-3" />좌석 수</span>
                  <span className="text-slate-700">{status.seats}석</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">월 예상 금액</span>
                  <span className="text-slate-700 font-semibold">{status.estimatedMonthlyAmount.toLocaleString()}원</span>
                </div>
                {status.nextBillingAt && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">다음 결제일</span>
                    <span className="text-slate-700">{new Date(status.nextBillingAt).toLocaleDateString('ko-KR')}</span>
                  </div>
                )}
                {status.subscriptionStatus === 'past_due' && (
                  <div className="flex items-center gap-1.5 text-[11px] text-rose-400 pt-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    최근 자동결제가 실패했습니다. 카드를 다시 등록해주세요.
                  </div>
                )}
                {status.subscriptionStatus === 'canceled' && (
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-400 pt-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    해지 처리됨 — 결제 주기가 끝나면 Free로 전환됩니다.
                  </div>
                )}
              </div>

              {error && <p className="text-[11px] text-rose-400">{error}</p>}
              {message && (
                <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />{message}
                </p>
              )}

              <div className="space-y-2">
                {!status.hasCardRegistered && (
                  <button
                    onClick={handleRegisterCard}
                    disabled={processing}
                    className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-bold transition-colors"
                  >
                    카드 등록하기
                  </button>
                )}
                {status.hasCardRegistered && status.subscriptionStatus !== 'active' && (
                  <button
                    onClick={handleSubscribe}
                    disabled={processing}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition-colors"
                  >
                    {processing ? '처리 중...' : `구독 시작 (월 ${status.estimatedMonthlyAmount.toLocaleString()}원)`}
                  </button>
                )}
                {status.hasCardRegistered && status.subscriptionStatus === 'active' && (
                  <>
                    <button
                      onClick={handleRegisterCard}
                      disabled={processing}
                      className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 text-xs font-bold transition-colors"
                    >
                      카드 변경하기
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={processing}
                      className="w-full py-2.5 rounded-xl bg-rose-600/10 hover:bg-rose-600/20 border border-rose-600/20 disabled:opacity-50 text-rose-400 text-xs font-bold transition-colors"
                    >
                      구독 해지
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
