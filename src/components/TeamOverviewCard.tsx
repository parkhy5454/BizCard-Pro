import React, { useEffect, useState } from 'react';
import { Users } from 'lucide-react';

// 팀 관리자 전용 팀 대시보드: 좌석·구독 상태와 구성원별 이번 달 AI 사용량을 한눈에 보여준다.
// 데이터는 서버 /api/company/team-overview (관리자만 호출 가능)에서 가져온다.

interface TeamMemberRow {
  id: string;
  name: string;
  email: string;
  position: string;
  role: string;
  approvalStatus: string;
  aiCardUsed: number;
  aiReceiptUsed: number;
}

interface TeamOverview {
  month: string;
  members: TeamMemberRow[];
  seats: number;
  seatLimits: { min: number; max: number };
  subscription: {
    active: boolean;
    status: string;
    billingPeriod: 'monthly' | 'annual' | null;
    nextBillingAt: string | null;
    estimatedMonthlyAmount: number;
    estimatedAnnualAmount: number;
    freeAccess: boolean;
  };
  aiLimitPerUser: { card: number; receipt: number };
}

const statusLabel = (s: string) =>
  ({ active: '이용 중', past_due: '결제 실패', canceled: '해지됨', none: '미구독' } as Record<string, string>)[s] || s;

export const TeamOverviewCard: React.FC<{ currentUserId: string }> = ({ currentUserId }) => {
  const [data, setData] = useState<TeamOverview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch('/api/company/team-overview', { headers: { 'x-user-id': currentUserId } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: TeamOverview) => setData(d))
      .catch(() => setFailed(true));
  }, [currentUserId]);

  if (failed) return null;
  if (!data) {
    return <div className="bg-white border border-slate-200 rounded-2xl p-4 text-xs text-slate-500">팀 현황을 불러오는 중...</div>;
  }

  const { subscription: sub, members, aiLimitPerUser: lim } = data;
  const approved = members.filter((m) => m.approvalStatus !== 'pending');
  const totalCard = approved.reduce((n, m) => n + m.aiCardUsed, 0);
  const totalReceipt = approved.reduce((n, m) => n + m.aiReceiptUsed, 0);
  const nextBilling = sub.nextBillingAt ? new Date(sub.nextBillingAt).toLocaleDateString('ko-KR') : '-';

  return (
    <section className="bg-white border border-indigo-200 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
            <Users className="w-4.5 h-4.5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">팀 현황</h3>
            <p className="text-[11px] text-slate-500">관리자만 보이는 팀 요약 ({data.month})</p>
          </div>
        </div>
        <span className={`text-[11px] font-semibold px-2 py-1 rounded-lg ${sub.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
          {sub.freeAccess ? '무료 이용(운영사)' : statusLabel(sub.status)}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-slate-500">승인된 구성원</p>
          <p className="text-lg font-bold text-slate-900">{approved.length}명</p>
          <p className="text-[11px] text-slate-500">과금 좌석 {data.seats}석 (최소 {data.seatLimits.min} · 최대 {data.seatLimits.max})</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-slate-500">결제 주기</p>
          <p className="text-lg font-bold text-slate-900">{sub.billingPeriod === 'annual' ? '연간' : sub.billingPeriod === 'monthly' ? '월간' : '-'}</p>
          <p className="text-[11px] text-slate-500">다음 결제일 {nextBilling}</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-slate-500">이번 달 명함 AI</p>
          <p className="text-lg font-bold text-slate-900">{totalCard}회</p>
          <p className="text-[11px] text-slate-500">1인당 {lim.card}회</p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-slate-500">이번 달 영수증 OCR</p>
          <p className="text-lg font-bold text-slate-900">{totalReceipt}회</p>
          <p className="text-[11px] text-slate-500">1인당 {lim.receipt}회</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-3 font-semibold">이름</th>
              <th className="py-2 pr-3 font-semibold">직책</th>
              <th className="py-2 pr-3 font-semibold">권한</th>
              <th className="py-2 pr-3 font-semibold">상태</th>
              <th className="py-2 pr-3 font-semibold text-right">명함 AI</th>
              <th className="py-2 font-semibold text-right">영수증</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-slate-100">
                <td className="py-2 pr-3 text-slate-900 font-medium">{m.name}</td>
                <td className="py-2 pr-3 text-slate-600">{m.position || '-'}</td>
                <td className="py-2 pr-3 text-slate-600">{m.role === 'admin' ? '관리자' : '멤버'}</td>
                <td className="py-2 pr-3">
                  <span className={m.approvalStatus === 'pending' ? 'text-rose-600 font-semibold' : 'text-emerald-700'}>
                    {m.approvalStatus === 'pending' ? '승인 대기' : '승인됨'}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right text-slate-900">{m.aiCardUsed}/{lim.card}</td>
                <td className="py-2 text-right text-slate-900">{m.aiReceiptUsed}/{lim.receipt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
