import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { User } from '../types.js';

interface Props {
  currentUser: User;
  onClose: () => void;
  onWithdrawn: () => void; // 탈퇴 성공 후 부모가 로그아웃 상태로 정리하기 위한 콜백
}

// [추가] 개인정보처리방침에 "탈퇴 요청 시 지체 없이 파기한다"고 써놓고 실제 탈퇴 기능이
// 없던 문제를 메꾸는 화면. 비밀번호 재확인 + "탈퇴" 직접 입력까지 받아서 실수/탈취된
// 세션으로 인한 사고를 막는다.
export const WithdrawAccountModal: React.FC<Props> = ({ currentUser, onClose, onWithdrawn }) => {
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isCompany = currentUser.type === 'company';
  const canSubmit = password.length > 0 && confirmText === '탈퇴' && !submitting;

  const handleWithdraw = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/auth/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '탈퇴 처리 중 오류가 발생했습니다.');
      onWithdrawn();
    } catch (err: any) {
      setError(err.message || '탈퇴 처리 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <h2 className="text-sm font-bold text-slate-800">회원 탈퇴</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-xs text-slate-500 leading-relaxed bg-rose-500/5 border border-rose-500/20 rounded-xl p-3">
            {isCompany ? (
              <>
                탈퇴하면 <b className="text-rose-600">이 계정으로의 로그인만 완전히 삭제</b>됩니다.
                같은 회사 동료들이 공유 중인 명함·프로젝트 등의 데이터는 그대로 남습니다.
                (본인이 유일한 관리자이고 다른 동료가 남아있다면, 먼저 다른 관리자를 지정해야
                탈퇴할 수 있습니다.)
              </>
            ) : (
              <>
                탈퇴하면 <b className="text-rose-600">명함, 프로젝트, 차량기록 등 이 계정의 모든 데이터가
                즉시 영구적으로 삭제</b>되며 복구할 수 없습니다.
              </>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">비밀번호 확인</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="현재 비밀번호"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">
              계속하려면 <span className="text-rose-400 font-bold">탈퇴</span>를 입력하세요
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="탈퇴"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-rose-500 focus:border-rose-500"
            />
          </div>

          {error && <p className="text-[11px] text-rose-400">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleWithdraw}
              disabled={!canSubmit}
              className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors"
            >
              {submitting ? '처리 중...' : '탈퇴하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
