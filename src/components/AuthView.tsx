import React, { useState, useEffect } from 'react';
import { Mail, Lock, User, Briefcase, FileText, ArrowRight, Check, AlertCircle, Building2, KeyRound, Phone } from 'lucide-react';
import { motion } from 'motion/react';
import { User as UserType } from '../types.js';
import { formatPhoneNumber } from '../phoneFormat.js';
import { LegalModal } from './LegalModal.js';

interface Props {
  onLoginSuccess: (user: UserType) => void;
}

export const AuthView: React.FC<Props> = ({ onLoginSuccess }) => {
  const [isLogin, setIsLogin] = useState<boolean>(true);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [name, setName] = useState<string>('');
  // [수정] 운영 현황에서 가입자 연락처를 확인할 수 있도록 핸드폰 번호도 받는다 (선택 입력)
  const [phone, setPhone] = useState<string>('');
  const [accountType, setAccountType] = useState<'individual' | 'company'>('individual');
  const [companyName, setCompanyName] = useState<string>('');
  const [businessNumber, setBusinessNumber] = useState<string>('');
  const [position, setPosition] = useState<string>('');

  // 비밀번호 찾기 / 재설정 화면 상태
  const [screen, setScreen] = useState<'auth' | 'forgot' | 'reset'>('auth');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [forgotEmail, setForgotEmail] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState<string>('');

  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>('');
  // [수정] 이용약관/개인정보처리방침 모달
  const [legalTab, setLegalTab] = useState<'terms' | 'privacy' | null>(null);

  // 이메일로 받은 재설정 링크(?resetToken=...)로 들어온 경우, 새 비밀번호 설정 화면을 바로 띄운다.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('resetToken');
    if (token) {
      setResetToken(token);
      setScreen('reset');
    }
  }, []);

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!forgotEmail.trim()) {
      setError('이메일을 입력해주세요.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '요청 처리 중 오류가 발생했습니다.');
      setSuccessMsg(data.message || '입력하신 이메일로 안내를 보내드렸습니다.');
    } catch (err: any) {
      setError(err.message || '요청 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    if (!newPassword || newPassword.length < 8) {
      setError('비밀번호는 8자 이상 입력해주세요.');
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setError('비밀번호가 서로 일치하지 않습니다.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '비밀번호 변경 중 오류가 발생했습니다.');

      // URL의 ?resetToken= 파라미터를 지우고 로그인 화면으로 복귀
      window.history.replaceState({}, '', window.location.pathname);
      setScreen('auth');
      setIsLogin(true);
      setResetToken(null);
      setNewPassword('');
      setNewPasswordConfirm('');
      setSuccessMsg('비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.');
    } catch (err: any) {
      setError(err.message || '비밀번호 변경 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 사업자번호 하이픈 자동 포맷팅 (123-45-67890 형식)
  const handleBusinessNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    let formatted = raw;
    if (raw.length > 3 && raw.length <= 5) {
      formatted = `${raw.slice(0, 3)}-${raw.slice(3)}`;
    } else if (raw.length > 5) {
      formatted = `${raw.slice(0, 3)}-${raw.slice(3, 5)}-${raw.slice(5, 10)}`;
    }
    setBusinessNumber(formatted);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!email.trim() || !password.trim()) {
      setError('이메일과 비밀번호를 입력해주세요.');
      return;
    }

    if (!isLogin) {
      if (!name.trim()) {
        setError('이름을 입력해주세요.');
        return;
      }
      if (accountType === 'company') {
        if (!companyName.trim()) {
          setError('회사명을 입력해주세요.');
          return;
        }
        if (!businessNumber.trim() || businessNumber.replace(/[^0-9]/g, '').length < 10) {
          setError('올바른 사업자등록번호(10자리)를 입력해주세요.');
          return;
        }
      }
    }

    setLoading(true);

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup';
      const payload = isLogin 
        ? { email, password }
        : {
            email,
            password,
            name,
            phone: phone.trim() || undefined,
            type: accountType,
            companyName: accountType === 'company' ? companyName.trim() : undefined,
            businessNumber: accountType === 'company' ? businessNumber.trim() : undefined,
            position: accountType === 'company' ? position.trim() : undefined,
            // role은 보내지 않는다: 서버가 같은 회사의 최초 가입자면 자동으로 admin,
            // 이미 소속 사용자가 있으면 자동으로 member로 지정한다.
          };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '인증에 실패했습니다.');
      }

      if (isLogin) {
        // 로그인 성공 시 로컬스토리지 저장 및 메인 앱 진입
        localStorage.setItem('bizcard_user', JSON.stringify(data.user));
        onLoginSuccess(data.user);
      } else {
        // 회원가입 성공 시 로그인으로 자동 전환하거나 안내 메시지 표시 후 로그인 처리
        setSuccessMsg('회원가입이 완료되었습니다! 가입하신 이메일로 로그인 해주세요.');
        setIsLogin(true);
        setPassword('');
      }
    } catch (err: any) {
      setError(err.message || '인증 요청 중 에러가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (screen === 'forgot') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-4">
          <div className="flex justify-center">
            <div className="h-14 w-14 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/20 border border-indigo-400/20">
              <KeyRound className="w-8 h-8 text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">비밀번호 찾기</h2>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-lg">
          <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl py-8 px-4 shadow-2xl rounded-3xl sm:px-10">
            {error && (
              <div className="mb-4 p-3 bg-red-950/40 border border-red-500/30 rounded-xl flex items-center gap-2.5 text-xs text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="font-semibold">{error}</span>
              </div>
            )}
            {successMsg && (
              <div className="mb-4 p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl flex items-center gap-2.5 text-xs text-emerald-400">
                <Check className="w-4 h-4 shrink-0" />
                <span className="font-semibold">{successMsg}</span>
              </div>
            )}
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">가입하신 이메일 주소를 입력하시면, 비밀번호 재설정 링크를 보내드립니다.</p>
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="가입한 이메일 주소"
                  className="block w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl shadow-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors disabled:opacity-50"
              >
                {loading ? '전송 중...' : '재설정 링크 받기'} <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => { setScreen('auth'); setError(''); setSuccessMsg(''); }}
                className="w-full text-center text-xs text-slate-400 hover:text-slate-200 font-medium"
              >
                로그인으로 돌아가기
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (screen === 'reset') {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
        <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-4">
          <div className="flex justify-center">
            <div className="h-14 w-14 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/20 border border-indigo-400/20">
              <KeyRound className="w-8 h-8 text-white" />
            </div>
          </div>
          <h2 className="text-2xl font-extrabold text-white tracking-tight">새 비밀번호 설정</h2>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-lg">
          <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl py-8 px-4 shadow-2xl rounded-3xl sm:px-10">
            {error && (
              <div className="mb-4 p-3 bg-red-950/40 border border-red-500/30 rounded-xl flex items-center gap-2.5 text-xs text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="font-semibold">{error}</span>
              </div>
            )}
            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="새 비밀번호 (4자 이상)"
                  className="block w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  type="password"
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  placeholder="새 비밀번호 확인"
                  className="block w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-3 px-4 rounded-xl shadow-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors disabled:opacity-50"
              >
                {loading ? '변경 중...' : '비밀번호 변경하기'} <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-4">
        {/* 로고 */}
        <div className="flex justify-center">
          <div className="h-14 w-14 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/20 border border-indigo-400/20">
            <Building2 className="w-8 h-8 text-white" />
          </div>
        </div>
        <div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">BizCard Pro AI</h2>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-slate-900/60 border border-slate-800/80 backdrop-blur-xl py-8 px-4 shadow-2xl rounded-3xl sm:px-10 relative overflow-hidden">
          {/* 장식용 그래디언트 백 */}
          <div className="absolute top-0 left-1/4 right-1/4 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-80" />

          {/* 탭 전환 */}
          <div className="flex border-b border-slate-800 pb-5 mb-6">
            <button
              onClick={() => {
                setIsLogin(true);
                setError('');
                setSuccessMsg('');
              }}
              className={`flex-1 text-center pb-2.5 text-sm font-bold transition-all relative ${isLogin ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              로그인
              {isLogin && (
                <motion.div layoutId="authTab" className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-500" />
              )}
            </button>
            <button
              onClick={() => {
                setIsLogin(false);
                setError('');
                setSuccessMsg('');
              }}
              className={`flex-1 text-center pb-2.5 text-sm font-bold transition-all relative ${!isLogin ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
            >
              회원가입
              {!isLogin && (
                <motion.div layoutId="authTab" className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-500" />
              )}
            </button>
          </div>

          {/* 에러 및 성공 안내 배너 */}
          {error && (
            <div className="mb-4 p-3 bg-red-950/40 border border-red-500/30 rounded-xl flex items-center gap-2.5 text-xs text-red-400 animate-fadeIn">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-semibold">{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl flex items-center gap-2.5 text-xs text-emerald-400 animate-fadeIn">
              <Check className="w-4 h-4 shrink-0" />
              <span className="font-semibold">{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 회원가입 시: 이름 입력 */}
            {!isLogin && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-1.5"
              >
                <label className="block text-xs font-bold text-slate-300">이름</label>
                <div className="relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-4 w-4 text-slate-500" />
                  </div>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="홍길동"
                    className="block w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 font-medium"
                  />
                </div>
              </motion.div>
            )}

            {/* 회원가입 시: 핸드폰 번호 입력 (선택) */}
            {!isLogin && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-1.5"
              >
                <label className="block text-xs font-bold text-slate-300">핸드폰 번호 <span className="text-slate-500 font-normal">(선택)</span></label>
                <div className="relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Phone className="h-4 w-4 text-slate-500" />
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                    placeholder="010-0000-0000"
                    className="block w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 font-medium font-mono"
                  />
                </div>
              </motion.div>
            )}

            {/* 공통: 이메일 입력 */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">이메일 주소</label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="block w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 font-medium"
                />
              </div>
            </div>

            {/* 공통: 비밀번호 입력 */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">비밀번호</label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-slate-500" />
                </div>
                <input
                  type="password"
                  name="password"
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={isLogin ? undefined : 8}
                  className="block w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 font-medium"
                />
              </div>
              {/* [수정] 서버가 8자 미만 비밀번호를 거부하므로, 가입 화면에서 미리 안내해 제출 후 오류로 놀라지 않게 함 */}
              {!isLogin && (
                <p className="mt-1 text-[11px] text-slate-500">비밀번호는 8자 이상 입력해주세요.</p>
              )}
              {isLogin && (
                <button
                  type="button"
                  onClick={() => { setScreen('forgot'); setForgotEmail(email); setError(''); setSuccessMsg(''); }}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold"
                >
                  비밀번호를 잊으셨나요?
                </button>
              )}
            </div>

            {/* 회원가입 시: 계정 종류 선택 (개인 vs 회사) */}
            {!isLogin && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-3 pt-2"
              >
                <label className="block text-xs font-bold text-slate-300">계정 유형</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAccountType('individual')}
                    className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between h-24 transition-all ${accountType === 'individual' ? 'bg-indigo-950/20 border-indigo-500 text-indigo-300 shadow' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                  >
                    <User className={`w-5 h-5 ${accountType === 'individual' ? 'text-indigo-400' : 'text-slate-500'}`} />
                    <div>
                      <p className="text-xs font-bold text-slate-200">개인 회원</p>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">독립적인 내 개인 명함첩 관리</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAccountType('company')}
                    className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between h-24 transition-all ${accountType === 'company' ? 'bg-indigo-950/20 border-indigo-500 text-indigo-300 shadow animate-pulse' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'}`}
                  >
                    <Building2 className={`w-5 h-5 ${accountType === 'company' ? 'text-indigo-400 animate-bounce' : 'text-slate-500'}`} />
                    <div>
                      <p className="text-xs font-bold text-slate-200">회사/사업자 공동 회원</p>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">동일 회사 구성원 간 자동 DB 공유</p>
                    </div>
                  </button>
                </div>

                {/* 회사용 상세 입력 필드 */}
                {accountType === 'company' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="p-4 bg-slate-950 border border-indigo-500/10 rounded-2xl space-y-3.5 mt-2"
                  >
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold text-slate-400">공식 회사명</label>
                      <div className="relative rounded-xl shadow-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Building2 className="h-3.5 w-3.5 text-slate-500" />
                        </div>
                        <input
                          type="text"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          placeholder="예: (주)대한상사"
                          className="block w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold text-slate-400">사업자등록번호 (10자리)</label>
                      <div className="relative rounded-xl shadow-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <FileText className="h-3.5 w-3.5 text-slate-500" />
                        </div>
                        <input
                          type="text"
                          maxLength={12}
                          value={businessNumber}
                          onChange={handleBusinessNumberChange}
                          placeholder="123-45-67890"
                          className="block w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold text-slate-400">직책 (선택, 예: 대표이사·기술이사·경영지원실장)</label>
                      <div className="relative rounded-xl shadow-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Briefcase className="h-3.5 w-3.5 text-slate-500" />
                        </div>
                        <input
                          type="text"
                          value={position}
                          onChange={(e) => setPosition(e.target.value)}
                          placeholder="예: 대표이사"
                          className="block w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <p className="mt-1 text-[10px] text-slate-500">전자결재 결재라인과 이름을 매칭해 결재 요청 메일을 보내는 데 쓰입니다.</p>
                      </div>
                    </div>

                  </motion.div>
                )}
              </motion.div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : isLogin ? (
                  <>
                    <span>비즈니스 공간으로 로그인</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                ) : (
                  '비즈니스 계정 무료 생성하기'
                )}
              </button>
            </div>
          </form>
        </div>

        {/* [수정] 회원가입/로그인 화면에서도 이용약관·개인정보처리방침을 확인할 수 있도록 링크 추가 */}
        <div className="text-center pt-1">
          <p className="text-[11px] text-slate-600">
            계속 진행하면{' '}
            <button type="button" onClick={() => setLegalTab('terms')} className="underline underline-offset-2 hover:text-slate-400 transition-colors">이용약관</button>
            {' '}및{' '}
            <button type="button" onClick={() => setLegalTab('privacy')} className="underline underline-offset-2 hover:text-slate-400 transition-colors">개인정보처리방침</button>
            에 동의하는 것으로 간주됩니다.
          </p>
        </div>
      </div>

      {legalTab && <LegalModal initialTab={legalTab} onClose={() => setLegalTab(null)} />}
    </div>
  );
};
