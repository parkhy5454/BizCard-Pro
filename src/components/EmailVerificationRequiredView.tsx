import React, { useEffect, useState } from 'react';
import { MailCheck, LogOut, RefreshCw } from 'lucide-react';
import { User } from '../types.js';

interface Props {
  currentUser: User;
  onLogout: () => void;
  onVerified: () => void; // 인증 성공 후 currentUser를 다시 불러와 화면을 갱신하기 위한 콜백
}

// [추가] 이메일 인증을 아직 안 한 회원에게 보여주는 화면. 인증 메일의 링크
// (?verifyToken=...)를 타고 들어온 경우 여기서 자동으로 인증 처리까지 한다.
export const EmailVerificationRequiredView: React.FC<Props> = ({ currentUser, onLogout, onVerified }) => {
  const [status, setStatus] = useState<'idle' | 'verifying' | 'verified' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('verifyToken');
    if (!token) return;

    setStatus('verifying');
    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '인증에 실패했습니다.');
        setStatus('verified');
        window.history.replaceState({}, '', window.location.pathname);
        onVerified();
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.message || '인증 중 오류가 발생했습니다.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResend = async () => {
    setResending(true);
    setResendMsg('');
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentUser.email })
      });
      const data = await res.json();
      setResendMsg(data.message || '인증 메일을 다시 보내드렸습니다.');
    } catch {
      setResendMsg('메일 재전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-2xl">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5">
          <MailCheck className="w-7 h-7 text-indigo-400" />
        </div>

        {status === 'verifying' && (
          <>
            <h1 className="text-lg font-bold text-slate-800 mb-2">인증 확인 중...</h1>
            <p className="text-sm text-slate-500">잠시만 기다려주세요.</p>
          </>
        )}

        {status === 'verified' && (
          <>
            <h1 className="text-lg font-bold text-slate-800 mb-2">이메일 인증이 완료됐습니다</h1>
            <p className="text-sm text-slate-500 mb-6">잠시 후 자동으로 이동합니다.</p>
          </>
        )}

        {(status === 'idle' || status === 'error') && (
          <>
            <h1 className="text-lg font-bold text-slate-800 mb-2">이메일 인증이 필요합니다</h1>
            <p className="text-sm text-slate-500 leading-relaxed mb-2">
              <span className="text-slate-700 font-medium">{currentUser.email}</span>로 보내드린 인증 메일의 링크를 눌러주세요.
            </p>
            {status === 'error' && (
              <p className="text-xs text-rose-400 mb-4">{message}</p>
            )}
            {resendMsg && <p className="text-xs text-emerald-400 mb-4">{resendMsg}</p>}

            <button
              onClick={handleResend}
              disabled={resending}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition-colors mb-3"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
              {resending ? '전송 중...' : '인증 메일 다시 받기'}
            </button>
          </>
        )}

        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" />
          로그아웃
        </button>
      </div>
    </div>
  );
};
