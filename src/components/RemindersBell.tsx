import React, { useEffect, useState } from 'react';
import { Bell, AlertTriangle, Wrench, Ban, Receipt } from 'lucide-react';
import { User as UserType, Vehicle, MaintenanceInterval, AdminDoc } from '../types.js';

// [추가] "지금 확인한거 다 순차적으로 해줘"에서 마감/기한 알림 항목 - 알림 채널을 별도로
// 정하지 않아서(문자/이메일 발송 인프라가 없음) 우선 인앱 방식(상단 알림 종 버튼)으로 구현.
// 나중에 이메일/카카오 알림 등이 필요하면 여기서 계산하는 항목들을 그대로 서버 배치 작업으로
// 옮겨서 발송하면 된다.
//
// VehicleView.tsx의 "대시보드" 서브탭에 이미 보험 만기/정비 주기 알림 배너가 있지만, 그 화면에
// 직접 들어가야만 보였다. 여기서는 같은 계산 로직을 재사용해 상단 어디서든 보이는 종 아이콘 +
// 배지로 요약해서 보여주고, 클릭하면 해당 화면으로 이동시켜 준다. 회계관리 쪽(미처리 과태료,
// 미납 세금)은 관리자만 볼 수 있는 데이터라 관리자에게만 계산한다.

interface Props {
  currentUser: UserType | null;
  onNavigate: (tab: 'vehicles' | 'accounting') => void;
}

interface ReminderItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  detail: string;
  urgent: boolean; // true = 이미 지난/초과된 항목 (빨강), false = 임박(주황)
  onClick: () => void;
}

export const RemindersBell: React.FC<Props> = ({ currentUser, onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<ReminderItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadReminders = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const headers = { 'x-user-id': currentUser.id };
      const [vehiclesRes, intervalsRes] = await Promise.all([
        fetch('/api/vehicles', { headers }),
        fetch('/api/vehicles/intervals', { headers })
      ]);
      const vehicles: Vehicle[] = vehiclesRes.ok ? await vehiclesRes.json() : [];
      const intervals: MaintenanceInterval[] = intervalsRes.ok ? await intervalsRes.json() : [];

      const next: ReminderItem[] = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // 1. 자동차 보험 만기 임박/경과 (30일 이내 또는 이미 경과)
      for (const v of vehicles) {
        if (!v.insuranceEndDate) continue;
        try {
          const cleanDateStr = v.insuranceEndDate.replace(/\./g, '-');
          const endDate = new Date(cleanDateStr);
          if (isNaN(endDate.getTime())) continue;
          endDate.setHours(0, 0, 0, 0);
          const diffDays = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 30) continue;
          next.push({
            key: `ins-${v.id}`,
            icon: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />,
            label: `${v.modelName} (${v.plateNumber}) 보험 만기`,
            detail: diffDays < 0 ? `만기 ${Math.abs(diffDays)}일 경과` : `D-${diffDays}`,
            urgent: diffDays < 0,
            onClick: () => onNavigate('vehicles')
          });
        } catch (_) { /* 날짜 파싱 실패 시 조용히 건너뜀 */ }
      }

      // 2. 정비/소모품 점검 임박·초과 (VehicleView 대시보드와 동일한 계산 로직)
      for (const item of intervals) {
        const vehicle = vehicles.find((v) => v.id === item.vehicleId);
        const currentMileage = vehicle ? vehicle.currentMileage : 0;
        const drivenKm = Math.max(0, currentMileage - (item.lastServiceMileage || 0));
        const kmLeft = (item.intervalKm || 0) - drivenKm;

        let daysElapsed = 0;
        try {
          if (item.lastServiceDate) {
            daysElapsed = Math.max(0, Math.floor((today.getTime() - new Date(item.lastServiceDate).getTime()) / (1000 * 60 * 60 * 24)));
          }
        } catch (_) { /* noop */ }
        const daysLeft = (item.intervalDays || 0) - daysElapsed;

        const isKmExceeded = !!item.intervalKm && drivenKm >= item.intervalKm;
        const isDaysExceeded = !!item.intervalDays && daysElapsed >= item.intervalDays;
        const isAlertKm = !!item.intervalKm && kmLeft <= (item.alertKmBefore || 0);
        const isAlertDays = !!item.intervalDays && daysLeft <= (item.alertDaysBefore || 0);
        const isOverdue = isKmExceeded || isDaysExceeded;
        if (!(isOverdue || isAlertKm || isAlertDays)) continue;

        next.push({
          key: `mnt-${item.id}`,
          icon: <Wrench className="w-4 h-4 text-amber-500 shrink-0" />,
          label: `${vehicle ? `${vehicle.modelName} (${vehicle.plateNumber})` : '차량 미지정'} ${item.itemType}`,
          detail: isOverdue ? '교체 주기 초과' : '점검 임박',
          urgent: isOverdue,
          onClick: () => onNavigate('vehicles')
        });
      }

      // 3~4. 관리자 전용: 미처리 과태료 / 미납 세금 (회계관리 데이터는 관리자만 조회 가능)
      if (currentUser.role === 'admin') {
        const docsRes = await fetch('/api/admin-docs', { headers });
        if (docsRes.ok) {
          const docs: AdminDoc[] = await docsRes.json();
          const unprocessedFines = docs
            .filter((d) => d.category === 'vehicle_fine')
            .flatMap((d) => (d.vehicleFine?.entries || []).map((e) => ({ ...e, docTitle: d.title })))
            .filter((e) => !e.processedDate);
          if (unprocessedFines.length > 0) {
            next.push({
              key: 'fines-unprocessed',
              icon: <Ban className="w-4 h-4 text-rose-500 shrink-0" />,
              label: '미처리 차량 과태료',
              detail: `${unprocessedFines.length}건`,
              urgent: true,
              onClick: () => onNavigate('accounting')
            });
          }

          // [참고] 결재일자(paidDate)는 실제 스프레드시트에 "없음.", "2026.04.24완료"처럼
          // 자유 텍스트가 섞여 있어서 날짜로 파싱하지 않는다. 값이 비어 있는 경우만 "미납"으로
          // 간주하고, 텍스트가 어떤 형태로든 적혀 있으면 이미 처리된 것으로 본다(단순화된 규칙).
          const unpaidTaxes = docs
            .filter((d) => d.category === 'tax')
            .flatMap((d) => (d.taxPayment?.entries || []).map((e) => ({ ...e, docTitle: d.title })))
            .filter((e) => !e.paidDate || !e.paidDate.trim());
          if (unpaidTaxes.length > 0) {
            next.push({
              key: 'taxes-unpaid',
              icon: <Receipt className="w-4 h-4 text-rose-500 shrink-0" />,
              label: '결재일자 미기재 세금 내역',
              detail: `${unpaidTaxes.length}건`,
              urgent: true,
              onClick: () => onNavigate('accounting')
            });
          }
        }
      }

      // 급한 것(경과/미처리)이 먼저 보이도록 정렬
      next.sort((a, b) => (a.urgent === b.urgent ? 0 : a.urgent ? -1 : 1));
      setItems(next);
    } catch (_) {
      // 조용히 실패 - 알림은 부가 기능이라 에러로 화면을 막지 않는다.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReminders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  if (!currentUser) return null;

  const urgentCount = items.filter((i) => i.urgent).length;
  const badgeCount = items.length;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((v) => !v)}
        title="알림"
        className="relative p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-amber-500 border border-slate-200 transition-colors md:p-1.5 md:rounded-lg md:bg-transparent md:border-0 md:hover:bg-slate-100"
      >
        <Bell className="w-4 h-4 md:w-3.5 md:h-3.5" />
        {badgeCount > 0 && (
          <span
            className={`absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center ${
              urgentCount > 0 ? 'bg-rose-500' : 'bg-amber-500'
            }`}
          >
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 w-80 max-w-[90vw] bg-white border border-slate-200 rounded-xl shadow-2xl z-40 overflow-hidden">
            <div className="px-3.5 py-2.5 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">다가오는 일정 · 알림</span>
              {loading && <span className="text-[10px] text-slate-400">불러오는 중...</span>}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-3.5 py-6 text-center text-xs text-slate-400">
                  현재 확인이 필요한 알림이 없습니다.
                </p>
              ) : (
                items.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => { item.onClick(); setIsOpen(false); }}
                    className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left border-b border-slate-100 last:border-b-0 hover:bg-slate-50 transition-colors"
                  >
                    {item.icon}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-700 truncate">{item.label}</p>
                    </div>
                    <span
                      className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        item.urgent ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {item.detail}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
