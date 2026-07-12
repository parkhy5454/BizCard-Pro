import React, { useState } from 'react';
import { Mail, Lock, User, Briefcase, FileText, ArrowRight, Check, AlertCircle, Building2, Shield } from 'lucide-react';
import { motion } from 'motion/react';
import { User as UserType } from '../types.js';

interface Props {
  onLoginSuccess: (user: UserType) => void;
}

export const AuthView: React.FC<Props> = ({ onLoginSuccess }) => {
  const [isLogin, setIsLogin] = useState<boolean>(true);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [accountType, setAccountType] = useState<'individual' | 'company'>('individual');
  const [companyName, setCompanyName] = useState<string>('');
  const [businessNumber, setBusinessNumber] = useState<string>('');
  
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string>('');

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
            type: accountType,
            companyName: accountType === 'company' ? companyName.trim() : undefined,
            businessNumber: accountType === 'company' ? businessNumber.trim() : undefined,
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
          <p className="mt-2 text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            스마트 명함 관리, AI OCR 자동인식 및 회사 동료 협업기반 프로젝트 영업 팔로우업 통합 시스템
          </p>
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
                  className="block w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 font-medium"
                />
              </div>
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
                    <div className="flex items-start gap-2 text-[10px] text-indigo-300 leading-normal mb-1">
                      <Shield className="w-4 h-4 shrink-0 text-indigo-400 mt-0.5" />
                      <span>회사는 <span className="font-bold underline">동일한 회사명과 사업자번호</span>를 매칭하여 인증하고, 로그인한 구성원들끼리 명함첩, 프로젝트 진행 상황 및 후속 미팅 기록이 실시간 공동 트래킹됩니다.</span>
                    </div>

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
      </div>
    </div>
  );
};
