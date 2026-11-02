import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, CreditCard, Users } from 'lucide-react';
import { INDIVIDUAL_PLANS, TEAM_MIN_SEATS, getTeamMonthlyPerSeat, getTeamTotal, type Period } from '../subscriptionPricing.js';

// 토스 결제위젯 (구독 결제 화면). 가격은 서버가 다시 계산하므로 여기서 보여주는 금액은 안내용이다.
const WIDGET_SCRIPT_URL = 'https://js.tosspayments.com/v1/payment-widget';
const CLIENT_KEY: string | undefined = (import.meta as any).env?.VITE_TOSS_CLIENT_KEY;

declare global {
  interface Window {
    PaymentWidget?: (clientKey: string, customerKey: string) => any;
  }
}

type Current = { kind: string; period: Period; seats: number; endAt: string } | null;
type OrderInfo = { orderId: string; amount: number; orderName: string; customerKey: string; customerName: string };

function loadWidgetScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.PaymentWidget) return resolve();
    const existing = document.querySelector(`script[src="${WIDGET_SCRIPT_URL}"]`) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('결제 모듈을 불러오지 못했습니다.')));
      return;
    }
    const script = document.createElement('script');
    script.src = WIDGET_SCRIPT_URL;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('결제 모듈을 불러오지 못했습니다.'));
    document.head.appendChild(script);
  });
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

interface SubscriptionViewProps {
  currentUser: { id: string; name?: string; email?: string } | null;
  isAdmin: boolean;
  onClose: () => void;
}

export const SubscriptionView: React.FC<SubscriptionViewProps> = ({ currentUser, isAdmin, onClose }) => {
  const [current, setCurrent] = useState<Current>(null);
  const [kind, setKind] = useState<'individual' | 'team'>('individual');
  const [period, setPeriod] = useState<Period>(3);
  const [seats, setSeats] = useState<number>(TEAM_MIN_SEATS);
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const widgetRef = useRef<any>(null);
  const [widgetReady, setWidgetReady] = useState(false);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(currentUser ? { 'x-user-id': currentUser.id } : {}),
  };

  useEffect(() => {
    fetch('/api/subscription', { headers: { 'x-user-id': currentUser?.id || '' } })
      .then((res) => res.json())
      .then((data) => setCurrent(data || null))
      .catch(() => setCurrent(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  // 주문이 만들어지면 결제 수단 영역을 그린다.
  useEffect(() => {
    if (!order) return;
    let cancelled = false;
    setWidgetReady(false);
    (async () => {
      try {
        if (!CLIENT_KEY) throw new Error('결제 설정(VITE_TOSS_CLIENT_KEY)이 없습니다. 관리자에게 문의해 주세요.');
        await loadWidgetScript();
        if (cancelled || !window.PaymentWidget) return;
        const widget = window.PaymentWidget(CLIENT_KEY, order.customerKey);
        widgetRef.current = widget;
        // 결제 수단·약관 영역이 모두 그려진 뒤에만 결제 버튼을 활성화한다.
        await Promise.all([
          widget.renderPaymentMethods('#toss-payment-method', { value: order.amount }),
          widget.renderAgreement('#toss-agreement'),
        ]);
        if (!cancelled) setWidgetReady(true);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || '결제 화면을 준비하지 못했습니다.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order]);

  const expectedPrice =
    kind === 'individual'
      ? INDIVIDUAL_PLANS[period].price
      : seats >= TEAM_MIN_SEATS
        ? getTeamTotal(seats, period)
        : 0;

  const startOrder = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/subscription/order', {
        method: 'POST',
        headers,
        body: JSON.stringify({ kind, period, seats }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '주문을 만들지 못했습니다.');
      setOrder(data);
    } catch (err: any) {
      setError(err?.message || '주문을 만들지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (!order || !widgetRef.current || !widgetReady) return;
    setError('');
    try {
      await widgetRef.current.requestPayment({
        orderId: order.orderId,
        orderName: order.orderName,
        customerName: order.customerName,
        customerEmail: currentUser?.email,
        successUrl: `${window.location.origin}/?subscription=success`,
        failUrl: `${window.location.origin}/?subscription=fail`,
      });
    } catch (err: any) {
      setError(err?.message || '결제 요청에 실패했습니다.');
    }
  };

  const activeUntil = current && new Date(current.endAt) > new Date() ? new Date(current.endAt) : null;
  const tierMonthly = kind === 'team' && seats >= TEAM_MIN_SEATS ? getTeamMonthlyPerSeat(seats) : null;

  const periodButton = (p: Period, label: string) => (
    <button
      type="button"
      onClick={() => setPeriod(p)}
      className={`flex-1 rounded-xl border px-3 py-2 text-sm font-bold transition-colors ${
        period === p ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">구독 · 결제</h2>
        <button type="button" onClick={onClose} className="text-sm font-semibold text-slate-500 hover:text-slate-700">
          닫기
        </button>
      </div>

      {/* 현재 이용 상태 */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
        {activeUntil ? (
          <p className="flex items-center gap-2 text-emerald-700 font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            이용 중 · {activeUntil.toLocaleDateString('ko-KR')}까지
          </p>
        ) : (
          <p className="text-slate-500">현재 이용 중인 구독이 없습니다.</p>
        )}
      </div>

      {order ? (
        /* 결제 단계 */
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
            <p className="font-bold text-slate-900">{order.orderName}</p>
            <p className="mt-1 text-slate-600">결제 금액 {won(order.amount)} (부가세 포함)</p>
          </div>
          <div id="toss-payment-method" />
          <div id="toss-agreement" />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setOrder(null);
                setError('');
              }}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600"
            >
              다시 선택
            </button>
            <button
              type="button"
              onClick={pay}
              disabled={!widgetReady}
              className="flex-1 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {widgetReady ? `${won(order.amount)} 결제하기` : '결제 화면 준비 중...'}
            </button>
          </div>
        </div>
      ) : (
        /* 상품 선택 단계 */
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setKind('individual')}
              className={`rounded-2xl border p-4 text-left ${kind === 'individual' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white'}`}
            >
              <CreditCard className="w-5 h-5 text-indigo-600" />
              <p className="mt-2 font-bold text-slate-900">개인</p>
              <p className="text-xs text-slate-500">본인 1명이 사용</p>
            </button>
            <button
              type="button"
              onClick={() => isAdmin && setKind('team')}
              disabled={!isAdmin}
              className={`rounded-2xl border p-4 text-left ${kind === 'team' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white'} ${!isAdmin ? 'opacity-50' : ''}`}
            >
              <Users className="w-5 h-5 text-indigo-600" />
              <p className="mt-2 font-bold text-slate-900">팀(회사)</p>
              <p className="text-xs text-slate-500">{isAdmin ? '관리자만 결제 가능' : '관리자만 결제할 수 있습니다'}</p>
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-bold text-slate-700">이용 기간</p>
            <div className="flex gap-2">
              {periodButton(3, '3개월')}
              {periodButton(6, '6개월 (10%)')}
              {periodButton(12, '12개월 (25%)')}
            </div>
            {period === 12 && (
              <p className="text-xs font-semibold text-indigo-600">1년 선결제 시 3개월 대비 25% 할인</p>
            )}
          </div>

          {kind === 'team' && (
            <div className="space-y-2">
              <p className="text-sm font-bold text-slate-700">인원 (최소 {TEAM_MIN_SEATS}명)</p>
              <input
                type="number"
                min={TEAM_MIN_SEATS}
                value={seats}
                onChange={(e) => setSeats(Math.max(0, Number(e.target.value) || 0))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
              {tierMonthly !== null && (
                <p className="text-xs text-slate-500">인원당 월 {won(tierMonthly)} 기준</p>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
            <p className="text-slate-500">결제 금액 (부가세 포함)</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900">{expectedPrice > 0 ? won(expectedPrice) : '-'}</p>
          </div>

          {error && <p className="text-sm text-rose-600">{error}</p>}

          <button
            type="button"
            onClick={startOrder}
            disabled={busy || expectedPrice <= 0 || (kind === 'team' && !isAdmin)}
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? '준비 중...' : '결제 진행'}
          </button>
        </div>
      )}
    </div>
  );
};
