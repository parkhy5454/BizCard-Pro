import React, { useState } from 'react';
import {
  ClipboardCheck, FileSignature, Network, MessagesSquare, Sparkles, Building2, TrendingUp, History,
  FileSpreadsheet, Users, Gift, CreditCard, Download, Megaphone, MessageCircleQuestion, Inbox,
  LogOut, UserX, Settings, type LucideIcon,
} from 'lucide-react';
import { User } from '../types.js';
import { downloadBackup } from '../backupDownload.js';

import { getErrorMessage } from '../errorUtils.js';
// 더보기 화면에서 메인 탭으로 바로 이동하는 목적지
export type MoreTarget =
  | 'worklogs' | 'approvals' | 'org_chart' | 'announcements' | 'team_chat'
  | 'management' | 'accounting' | 'audit_logs' | 'ai_intelligence' | 'profile';

interface Props {
  currentUser: User;
  unreadFeedbackCount: number;
  onNavigate: (tab: MoreTarget) => void;
  onOpenTaxPackage: () => void;
  onOpenUserDirectory: () => void;
  onOpenSubscriptionModal: () => void;
  onOpenWithdrawModal: () => void;
  onOpenReferral: () => void;
  onOpenFeedback: () => void;
  onOpenFeedbackInbox: () => void;
  onLogout: () => void;
}

// 아이콘 타일 색상. 항목마다 색을 달리해서 한눈에 구분되게 한다.
// (Tailwind는 클래스 이름이 소스에 그대로 있어야 빌드되므로 전부 풀어서 적는다)
type Tone = 'indigo' | 'violet' | 'fuchsia' | 'sky' | 'teal' | 'emerald' | 'blue' | 'amber' | 'orange' | 'rose' | 'slate';
const TONE: Record<Tone, string> = {
  indigo: 'bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-indigo-500/30',
  violet: 'bg-gradient-to-br from-violet-500 to-violet-700 text-white shadow-violet-500/30',
  fuchsia: 'bg-gradient-to-br from-fuchsia-500 to-pink-600 text-white shadow-fuchsia-500/30',
  sky: 'bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-sky-500/30',
  teal: 'bg-gradient-to-br from-teal-400 to-teal-600 text-white shadow-teal-500/30',
  emerald: 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-emerald-500/30',
  blue: 'bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-blue-500/30',
  amber: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-amber-500/30',
  orange: 'bg-gradient-to-br from-orange-400 to-red-500 text-white shadow-orange-500/30',
  rose: 'bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-rose-500/30',
  slate: 'bg-gradient-to-br from-slate-500 to-slate-700 text-white shadow-slate-500/30',
};

interface Item {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: Tone;
  onClick: () => void;
  hidden?: boolean;
  badge?: number;
  danger?: boolean;
  disabled?: boolean;
}

interface Section {
  title: string;
  items: Item[];
}

export const MoreMenuView: React.FC<Props> = ({
  currentUser,
  unreadFeedbackCount,
  onNavigate,
  onOpenTaxPackage,
  onOpenUserDirectory,
  onOpenSubscriptionModal,
  onOpenWithdrawModal,
  onOpenReferral,
  onOpenFeedback,
  onOpenFeedbackInbox,
  onLogout,
}) => {
  const [isBackingUp, setIsBackingUp] = useState(false);

  const isCompany = currentUser.type === 'company';
  const isAdmin = currentUser.role === 'admin';
  const isDeveloper = currentUser.email === 'parkhy5454@gmail.com';
  const canBackup = currentUser.type === 'individual' || isAdmin;

  const handleBackup = async () => {
    if (isBackingUp) return;
    setIsBackingUp(true);
    try {
      await downloadBackup(currentUser.id);
    } catch (err: unknown) {
      alert(`데이터 백업에 실패했습니다.\n${getErrorMessage(err) || '잠시 후 다시 시도해주세요.'}`);
    } finally {
      setIsBackingUp(false);
    }
  };

  const sections: Section[] = [
    {
      title: '업무',
      items: [
        { key: 'worklogs', label: '업무일지', icon: ClipboardCheck, tone: 'indigo', onClick: () => onNavigate('worklogs') },
        { key: 'approvals', label: '전자결재', icon: FileSignature, tone: 'violet', onClick: () => onNavigate('approvals') },
        { key: 'org_chart', label: '조직도', icon: Network, tone: 'sky', hidden: !isCompany, onClick: () => onNavigate('org_chart') },
        { key: 'team_chat', label: '사내 메신저', icon: MessagesSquare, tone: 'teal', hidden: !isCompany, onClick: () => onNavigate('team_chat') },
        { key: 'ai', label: 'AI Intelligence', icon: Sparkles, tone: 'fuchsia', onClick: () => onNavigate('ai_intelligence') },
      ],
    },
    {
      title: '관리',
      items: [
        { key: 'management', label: '경영지원', icon: Building2, tone: 'blue', hidden: !isAdmin, onClick: () => onNavigate('management') },
        { key: 'accounting', label: '회계관리', icon: TrendingUp, tone: 'emerald', hidden: !isAdmin, onClick: () => onNavigate('accounting') },
        { key: 'audit_logs', label: '활동 로그', icon: History, tone: 'slate', hidden: !isAdmin, onClick: () => onNavigate('audit_logs') },
        { key: 'tax', label: '세무자료 발송', icon: FileSpreadsheet, tone: 'emerald', onClick: onOpenTaxPackage },
        { key: 'users', label: '가입 회원 확인', icon: Users, tone: 'indigo', onClick: onOpenUserDirectory },
      ],
    },
    {
      title: '혜택 · 구독',
      items: [
        { key: 'referral', label: '친구 추천', icon: Gift, tone: 'amber', onClick: onOpenReferral },
        { key: 'subscription', label: '구독 관리', icon: CreditCard, tone: 'blue', onClick: onOpenSubscriptionModal },
      ],
    },
    {
      title: '안내 · 지원',
      items: [
        { key: 'announcements', label: '공지사항', icon: Megaphone, tone: 'orange', hidden: !isCompany, onClick: () => onNavigate('announcements') },
        { key: 'feedback', label: '문의하기', icon: MessageCircleQuestion, tone: 'sky', onClick: onOpenFeedback },
        { key: 'inbox', label: '문의함', icon: Inbox, tone: 'rose', hidden: !isDeveloper, badge: unreadFeedbackCount, onClick: onOpenFeedbackInbox },
      ],
    },
    {
      title: '계정',
      items: [
        { key: 'backup', label: isBackingUp ? '백업 중...' : '데이터 백업', icon: Download, tone: 'teal', hidden: !canBackup, disabled: isBackingUp, onClick: handleBackup },
        { key: 'logout', label: '로그아웃', icon: LogOut, tone: 'slate', onClick: onLogout },
        { key: 'withdraw', label: '회원 탈퇴', icon: UserX, tone: 'rose', danger: true, onClick: onOpenWithdrawModal },
      ],
    },
  ];

  const initial = (currentUser.name || '?').charAt(0);
  const companyLine = isCompany
    ? [currentUser.companyName, currentUser.position].filter(Boolean).join(' · ')
    : '개인 회원';

  return (
    <div className="max-w-2xl mx-auto pb-6">
      {/* 내 정보 카드: 프로필 설정으로 가는 입구 */}
      <div className="rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 text-white p-5 shadow-md flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-white/20 ring-2 ring-white/40 flex items-center justify-center text-xl font-bold shrink-0">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold truncate">{currentUser.name || '회원'}님</p>
          <p className="text-sm text-white/80 truncate">{companyLine}</p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('profile')}
          aria-label="프로필 설정"
          className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0 transition-colors"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {sections.map((section) => {
        const visible = section.items.filter((item) => !item.hidden);
        if (visible.length === 0) return null;
        return (
          <section key={section.title}>
            <h2 className="px-1 pt-6 pb-2 text-sm font-bold text-indigo-600">{section.title}</h2>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 grid grid-cols-4 gap-x-2 gap-y-5">
              {visible.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={item.onClick}
                    disabled={item.disabled}
                    className="flex flex-col items-center gap-1.5 min-w-0 rounded-xl py-1 hover:bg-slate-50 active:bg-slate-100 transition-colors disabled:opacity-60"
                  >
                    <span className={`relative w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${TONE[item.tone]}`}>
                      <Icon className="w-5 h-5" strokeWidth={2.25} />
                      {!!item.badge && item.badge > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                          {item.badge > 9 ? '9+' : item.badge}
                        </span>
                      )}
                    </span>
                    <span className={`w-full text-center text-xs font-semibold leading-tight break-keep ${item.danger ? 'text-rose-600' : 'text-slate-800'}`}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
};
