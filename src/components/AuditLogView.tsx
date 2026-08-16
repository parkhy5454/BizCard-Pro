import React, { useEffect, useState } from 'react';
import { History, ShieldAlert, RefreshCw, Search } from 'lucide-react';
import { User } from '../types.js';

interface Props {
  currentUser: User | null;
}

// [추가] 서버(getAuditLogs)에는 이미 민감한 작업(권한 변경, 결제, 가입 승인/거절, 회원 탈퇴,
// 데이터 백업 등)이 기록되고 있었는데 이걸 보여주는 화면이 없었다. Supabase 원본 테이블을
// 그대로 select('*')해서 내려주기 때문에 snake_case 컬럼 그대로 온다.
interface AuditLogEntry {
  id: number | string;
  scope_id: string;
  actor_user_id: string;
  actor_email?: string;
  action: string;
  target_user_id?: string;
  target_email?: string;
  detail?: Record<string, unknown> | null;
  created_at: string;
}

// [추가] action 문자열은 서버 코드에 흩어져 있는 값 그대로라(예: "role_change") 사람이
// 읽기 좋은 한국어 라벨로 바꿔서 보여준다. 새 액션이 추가돼도 여기 없으면 원본 문자열을
// 그대로 보여주므로 화면이 깨지지는 않는다.
const ACTION_LABELS: Record<string, string> = {
  role_change: '권한 변경',
  company_name_normalized: '회사명 정리',
  data_backup_export: '데이터 백업 다운로드',
  account_withdraw: '회원 탈퇴',
  billing_card_registered: '결제 카드 등록',
  subscription_started: '구독 시작',
  subscription_canceled: '구독 해지',
  subscription_renewed: '구독 갱신',
  subscription_payment_failed: '구독 결제 실패',
  subscription_downgraded_to_free: '무료 플랜으로 전환',
  member_approve: '가입 승인',
  member_reject: '가입 거절',
  member_remove: '팀에서 제거'
};

const ACTION_COLORS: Record<string, string> = {
  role_change: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  account_withdraw: 'bg-rose-50 text-rose-700 border-rose-200',
  member_reject: 'bg-rose-50 text-rose-700 border-rose-200',
  member_remove: 'bg-rose-50 text-rose-700 border-rose-200',
  subscription_payment_failed: 'bg-rose-50 text-rose-700 border-rose-200',
  member_approve: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  subscription_started: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  subscription_renewed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  data_backup_export: 'bg-slate-50 text-slate-700 border-slate-200'
};

// [추가] detail은 액션마다 모양이 다른 자유 형식 JSON이라, 자주 나오는 몇 가지는 사람이
//읽기 좋은 한 줄로 풀어서 보여주고, 나머지는 원본 JSON을 작게 보여준다.
function formatDetail(action: string, detail?: Record<string, unknown> | null): string | null {
  if (!detail || Object.keys(detail).length === 0) return null;
  try {
    if (action === 'role_change' && 'from' in detail && 'to' in detail) {
      return `${detail.from} → ${detail.to}`;
    }
    if (action === 'company_name_normalized') {
      return `사업자번호 ${detail.businessNumber} → "${detail.canonicalName}"로 통일 (${detail.updatedCount}건)`;
    }
    if (action === 'account_withdraw' && 'type' in detail) {
      return `탈퇴 유형: ${detail.type}`;
    }
    if (action === 'member_remove' && 'role' in detail) {
      return `이전 역할: ${detail.role === 'admin' ? '관리자' : detail.role === 'member' ? '일반 사용자' : '알 수 없음'}`;
    }
    if ((action === 'subscription_started' || action === 'subscription_renewed') && 'seats' in detail) {
      return `좌석 ${detail.seats}개 · ${Number(detail.amount || 0).toLocaleString()}원`;
    }
    return JSON.stringify(detail);
  } catch {
    return null;
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export const AuditLogView: React.FC<Props> = ({ currentUser }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const loadLogs = () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    fetch('/api/auth/audit-logs', { headers: { 'x-user-id': currentUser.id } })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `불러오기에 실패했습니다 (상태: ${res.status}).`);
        }
        return res.json();
      })
      .then((data: AuditLogEntry[]) => setLogs(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || '활동 로그를 불러오지 못했습니다.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const availableActions: string[] = Array.from(new Set<string>(logs.map((l) => l.action))).sort();

  const filteredLogs = logs
    .filter((l) => actionFilter === 'all' || l.action === actionFilter)
    .filter((l) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return (l.actor_email || '').toLowerCase().includes(q) || (l.target_email || '').toLowerCase().includes(q);
    });

  return (
    <div className="max-w-4xl mx-auto py-6 px-4 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-indigo-500" />
          <h2 className="text-xl font-bold text-slate-900">활동 로그</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-amber-50 text-amber-700 border border-amber-500/30 px-2.5 py-1 rounded-full font-semibold">관리자 전용</span>
          <button
            onClick={loadLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-600 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> 새로고침
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        권한 변경, 가입 승인/거절, 회원 탈퇴, 구독/결제, 데이터 백업 등 민감한 작업 기록만 남습니다. 명함/프로젝트 등 일상적인 데이터 입력은 여기 기록되지 않습니다.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="이메일로 검색"
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-500"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-500"
        >
          <option value="all">전체 종류</option>
          {availableActions.map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a] || a}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-sm text-slate-400">불러오는 중...</div>
      ) : error ? (
        <div className="text-center py-12 text-sm text-rose-500 bg-rose-50 rounded-2xl border border-dashed border-rose-200 flex flex-col items-center gap-2">
          <ShieldAlert className="w-5 h-5" />
          {error}
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="text-center py-16 text-sm text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          기록된 활동이 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {filteredLogs.map((log) => {
            const label = ACTION_LABELS[log.action] || log.action;
            const colorClass = ACTION_COLORS[log.action] || 'bg-slate-50 text-slate-600 border-slate-200';
            const detailText = formatDetail(log.action, log.detail);
            return (
              <div key={log.id} className="bg-white border border-slate-200 rounded-2xl p-3.5 flex items-start gap-3">
                <span className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-lg border ${colorClass}`}>{label}</span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm text-slate-700">
                    <b className="text-slate-900">{log.actor_email || '알 수 없음'}</b>
                    {log.target_email && log.target_email !== log.actor_email && (
                      <> → <b className="text-slate-900">{log.target_email}</b></>
                    )}
                  </p>
                  {detailText && <p className="text-xs text-slate-500">{detailText}</p>}
                </div>
                <span className="shrink-0 text-[11px] text-slate-400 font-mono whitespace-nowrap">{formatDateTime(log.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
