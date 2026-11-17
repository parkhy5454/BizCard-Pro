import React, { useEffect, useState } from 'react';
import { CreditCard, X, CheckCircle2, AlertTriangle, Users } from 'lucide-react';

import { getErrorMessage, getErrorField } from '../errorUtils.js';
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
  estimatedMonthlyAmount: number;
  estimatedAnnualAmount: number;
  billingPeriod: 'monthly' | 'annual';
  minimumTeamSeats: number;
  canManageBilling: boolean;
}

interface Props {
  onClose: () => void;
}

const TOSS_CLIENT_KEY = import.meta.env.VITE_TOSS_CLIENT_KEY as string | undefined;

// [추가] 구독(유료 전환) 관리 화면. 카드 등록 → 구독 시작 → (필요 시) 해지까지 여기서 처리한다.
// 카드 등록은 토스페이먼츠 결제창(SDK)을 띄워서 진행하고, 등록이 끝나면 이 페이지로
// ?authKey=...&customerKey=...를 붙여서 돌아온다(App.tsx에서 그 시점을 감지해 이 모달을 다시 연다).
const PLAN_CARDS = [
  { key: 'free', name: 'Free', price: '0원', desc: '명함 50장 · AI 명함 스캔 월 10회 · 기본 검색·연락처 관리' },
  { key: 'personal', name: '개인 Pro', price: '월 9,900원 · 연 99,000원 (10개월분, 부가세 포함)', desc: '명함 무제한 · AI 명함 스캔 월 100회 · 영수증 OCR 월 100회 · 차량 운행일지·CRM·업무일지' },
  { key: 'team', name: '팀 Business (2~900명)', price: '1인 월 10,890원 (부가세 포함, 공급가 9,900원) · 연간은 추후 제공', desc: '개인 Pro 기능 전체 · 1인당 AI 명함 스캔 월 100회 · 영수증 OCR 월 100회 · 팀 명함 공유·권한 관리' },
];

export const SubscriptionModal: React.FC<Props> = ({ onClose }) => {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [aiUsage, setAiUsage] = useState<{ card: number; receipt: number; limits: { card: number; receipt: number } } | null>(null);
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly');
  // 무료 체험 / 이용 가능 상태 (명함 등록 가능 여부)
  const [access, setAccess] = useState<{ active: boolean; subscriptionActive: boolean; trialActive: boolean; trialEndsAt: string } | null>(null);
  useEffect(() => {
    fetch('/api/subscription/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setAccess(data))
      .catch(() => setAccess(null));
  }, []);

  const currentPlanKey = status?.plan !== 'pro' ? 'free' : (status.seats >= 2 ? 'team' : 'personal');

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
    fetch('/api/billing/ai-usage').then(r => r.ok ? r.json() : null).then(setAiUsage).catch(() => {});

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
      const data = await res.json();
      if (!res.ok || !data.customerKey) throw new Error(data.error || '고객키를 발급받지 못했습니다.');
      const { customerKey } = data;
      const tossPayments = window.TossPayments(TOSS_CLIENT_KEY);
      const origin = window.location.origin + window.location.pathname;
      await tossPayments.requestBillingAuth('카드', {
        customerKey,
        successUrl: origin,
        failUrl: origin
      });
      // 성공하면 브라우저가 successUrl(=여기)로 리다이렉트되면서 페이지가 새로 열린다.
    } catch (err: unknown) {
      if (getErrorField(err, 'code') !== 'USER_CANCEL') {
        setError(getErrorMessage(err) || '카드 등록 중 오류가 발생했습니다.');
      }
    }
  };

  // [추가] termYears: 0 = 월 구독(첫 14일 무료 체험 적용), 1 = 1년 약정(10% 할인), 3 = 3년 약정(20% 할인)
  const handleSubscribe = async () => {
    setError('');
    setProcessing(true);
    try {
      const res = await fetch('/api/billing/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '구독 시작에 실패했습니다.');
      setMessage('구독이 시작됐습니다! 이제 모든 기능을 이용하실 수 있어요.');
      await fetchStatus();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
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
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden pb-[env(safe-area-inset-bottom)] sm:pb-0">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-indigo-400" />
            <h2 className="text-lg md:text-sm font-bold text-slate-800">구독 관리</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {access && !access.subscriptionActive && (
            <div className={`mb-3 rounded-xl px-3.5 py-3 text-base md:text-xs font-semibold ${access.trialActive ? 'bg-indigo-50 text-indigo-800' : 'bg-rose-50 text-rose-700'}`}>
              {access.trialActive
                ? (() => { const d = new Date(access.trialEndsAt); return <>무료 체험 중 · {d.getMonth() + 1}.{d.getDate()}까지<br /><span className="font-normal">(체험 후 월 요금이 자동 결제됩니다)</span></>; })()
                : '무료 체험이 끝났습니다. Free 요금제로 계속 이용할 수 있습니다 (명함 50장까지).'}
            </div>
          )}
          {loading ? (
            <p className="text-base md:text-xs text-slate-400 text-center py-6">불러오는 중...</p>
          ) : !status ? (
            <p className="text-base md:text-xs text-rose-400 text-center py-6">구독 정보를 불러오지 못했습니다.</p>
          ) : !status.canManageBilling ? (
            <p className="text-base md:text-xs text-slate-500 text-center py-6">구독 관리는 회사 관리자만 할 수 있습니다.</p>
          ) : (
            <>
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between text-base md:text-xs">
                  <span className="text-slate-500">현재 플랜</span>
                  <span className={`font-bold ${status.plan === 'pro' ? 'text-indigo-600' : 'text-slate-600'}`}>
                    {status.plan === 'pro' ? (status.seats >= 2 ? 'Team Business' : 'Personal Pro') : 'Free'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-base md:text-xs">
                  <span className="text-slate-500 flex items-center gap-1"><Users className="w-3 h-3" />좌석 수</span>
                  <span className="text-slate-700">{status.seats}석</span>
                </div>
                <div className="flex items-center justify-between text-base md:text-xs">
                  <span className="text-slate-500">월 예상 금액</span>
                  <span className="text-slate-700 font-semibold">{status.estimatedMonthlyAmount.toLocaleString()}원</span>
                </div>
                {status.subscriptionStatus === 'active' && <div className="text-xs text-slate-600">결제 주기: {status.billingPeriod === 'annual' ? '연간' : '월간'}</div>}
                {status.nextBillingAt && (
                  <div className="flex items-center justify-between text-base md:text-xs">
                    <span className="text-slate-500">다음 결제일</span>
                    <span className="text-slate-700">{new Date(status.nextBillingAt).toLocaleDateString('ko-KR')}</span>
                  </div>
                )}
                {status.subscriptionStatus === 'past_due' && (
                  <div className="flex items-center gap-1.5 text-lg md:text-sm md:text-[11px] text-rose-400 pt-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    최근 자동결제가 실패했습니다. 카드를 다시 등록해주세요.
                  </div>
                )}
                {status.subscriptionStatus === 'canceled' && (
                  <div className="flex items-center gap-1.5 text-lg md:text-sm md:text-[11px] text-amber-400 pt-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    해지 처리됨 — 결제 주기가 끝나면 Free로 전환됩니다.
                  </div>
                )}
              </div>

              {aiUsage && <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">이번 달 AI 사용량 · 명함 {aiUsage.card}/{aiUsage.limits.card}회 · 영수증 {aiUsage.receipt}/{aiUsage.limits.receipt}회</div>}
              {error && <p className="text-lg md:text-sm md:text-[11px] text-rose-400">{error}</p>}
              {message && (
                <p className="text-lg md:text-sm md:text-[11px] text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />{message}
                </p>
              )}

              <div className="space-y-2">
                {!status.hasCardRegistered && (
                  <button
                    onClick={handleRegisterCard}
                    disabled={processing}
                    className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-base md:text-xs font-bold transition-colors"
                  >
                    카드 등록하기
                  </button>
                )}
                {status.hasCardRegistered && status.subscriptionStatus !== 'active' && (
                  <div className="space-y-2">
                    <div className="space-y-2">
                      {PLAN_CARDS.map((plan) => {
                        const current = currentPlanKey === plan.key;
                        return (
                          <div key={plan.key} className={`rounded-xl border p-3 text-xs ${current ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-800">{plan.name}</span>
                              {current && <span className="text-[10px] font-bold text-indigo-600">이용 중</span>}
                            </div>
                            <div className="mt-1 text-slate-700 font-semibold">{plan.price}</div>
                            <div className="mt-1 text-slate-500 leading-relaxed">{plan.desc}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-2 text-xs">
                      <button type="button" onClick={() => setPeriod('monthly')} className={`flex-1 rounded-lg border p-2 ${period === 'monthly' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200'}`}>월간</button>
                      <button type="button" onClick={() => setPeriod('annual')} className={`flex-1 rounded-lg border p-2 ${period === 'annual' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200'}`}>연간 (2개월 할인)</button>
                    </div>
                    <button
                      onClick={handleSubscribe}
                      disabled={processing}
                      className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-base md:text-xs font-bold transition-colors"
                    >
                      {processing ? '처리 중...' : period === 'annual' ? `연간 구독 시작 (${status.estimatedAnnualAmount.toLocaleString()}원 즉시 결제)` : `월 구독 시작 (월 ${status.estimatedMonthlyAmount.toLocaleString()}원${status.subscriptionStatus === 'none' ? ', 첫 가입 14일 무료체험 가능' : ''})`}
                    </button>
                  </div>
                )}
                {status.hasCardRegistered && status.subscriptionStatus === 'active' && (
                  <>
                    <button
                      onClick={handleRegisterCard}
                      disabled={processing}
                      className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 text-base md:text-xs font-bold transition-colors"
                    >
                      카드 변경하기
                    </button>
                    <button
                      onClick={handleCancel}
                      disabled={processing}
                      className="w-full py-2.5 rounded-xl bg-rose-600/10 hover:bg-rose-600/20 border border-rose-600/20 disabled:opacity-50 text-rose-400 text-base md:text-xs font-bold transition-colors"
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
