import React, { useState, useEffect } from 'react';
import { X, Search, Building2, User, CheckCircle2, ShieldCheck, Info, Phone } from 'lucide-react';
import { User as UserType } from '../types.js';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserType;
}

export const UserDirectoryModal: React.FC<Props> = ({ isOpen, onClose, currentUser }) => {
  const [users, setUsers] = useState<UserType[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/users', {
        headers: { 'x-user-id': currentUser.id }
      });
      if (!res.ok) throw new Error('회원 목록을 가져오지 못했습니다.');
      const data = await res.json();
      if (Array.isArray(data)) {
        setUsers(data);
      }
    } catch (err: any) {
      setError(err.message || '오류 발생');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 필터링 적용
  const filteredUsers = users.filter(user => {
    const text = `${user.name} ${user.email} ${user.phone || ''} ${user.companyName || ''} ${user.businessNumber || ''}`.toLowerCase();
    return text.includes(searchTerm.toLowerCase());
  });

  // 동일한 스코프인지 여부 판단
  const isSameScope = (target: UserType) => {
    if (currentUser.id === target.id) return true;
    if (currentUser.type === 'company' && target.type === 'company') {
      return (
        currentUser.companyName?.trim().toLowerCase() === target.companyName?.trim().toLowerCase() &&
        currentUser.businessNumber?.trim().toLowerCase() === target.businessNumber?.trim().toLowerCase()
      );
    }
    return false;
  };

  // [추가] 관리자만 사용 가능: 같은 회사 소속 동료의 역할(관리자/일반 사용자)을 변경한다.
  const canManageRoles = currentUser.type === 'company' && currentUser.role === 'admin';
  const changeRole = async (target: UserType, newRole: 'admin' | 'member') => {
    setRoleError('');
    setRoleUpdatingId(target.id);
    try {
      const res = await fetch(`/api/auth/users/${target.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
        body: JSON.stringify({ role: newRole })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '역할 변경에 실패했습니다.');
      setUsers(prev => prev.map(u => (u.id === target.id ? { ...u, role: newRole } : u)));
    } catch (err: any) {
      setRoleError(err.message || '역할 변경 중 오류가 발생했습니다.');
    } finally {
      setRoleUpdatingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <ShieldCheck className="w-4.5 h-4.5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">가입 회원 & 협업 디렉토리</h2>
              <p className="text-xs text-slate-400">시스템 내 가입자 현황 및 부서/회사별 데이터 연동 관계</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 안내 배너 */}
        <div className="px-5 py-3.5 bg-indigo-950/30 border-b border-slate-800/60 text-xs text-indigo-300 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-indigo-200">👥 회사 협업 스코프 작동 원리</p>
            <p className="leading-relaxed text-slate-400">
              회원가입 시 <span className="text-slate-200 font-medium">회사 회원</span>으로 선택하고 동일한 <span className="text-indigo-400 font-semibold">회사명</span>과 <span className="text-indigo-400 font-semibold">사업자번호</span>를 등록한 회원들은 별도 설정 없이 <span className="text-indigo-300 underline font-medium">동일한 명함 데이터베이스와 프로젝트, 미팅 팔로우업 기록</span>을 실시간 공유하며 공동 작업할 수 있습니다. 이 화면에는 <span className="text-slate-200 font-medium">본인과 같은 회사 소속 동료만</span> 표시되며, 관리자는 동료를 관리자/일반 사용자로 바로 지정할 수 있습니다.
            </p>
          </div>
        </div>

        {/* 검색 및 필터 바 */}
        <div className="p-4 bg-slate-950/20 border-b border-slate-800/60">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="이름, 이메일, 회사명, 사업자번호로 가입 회원 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 text-slate-100 text-sm pl-9 pr-4 py-2.5 rounded-xl border border-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-500 transition-all"
            />
          </div>
        </div>

        {roleError && (
          <div className="px-5 pt-3 text-xs text-rose-400 bg-rose-500/5">{roleError}</div>
        )}

        {/* 가입자 목록 영역 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
              <p className="text-sm">가입자 데이터 불러오는 중...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-rose-400 text-sm">
              <p>{error}</p>
              <button 
                onClick={fetchUsers}
                className="mt-3 px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs rounded-lg text-slate-300 border border-slate-700"
              >
                다시 시도
              </button>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              <p>검색 조건과 일치하는 회원이 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {filteredUsers.map((u) => {
                const isMe = u.id === currentUser.id;
                const coWorker = isSameScope(u);

                return (
                  <div key={u.id}>
                  <div 
                    className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition-all ${
                      isMe 
                        ? 'bg-blue-950/20 border-blue-800/50 shadow-md ring-1 ring-blue-500/20' 
                        : coWorker
                          ? 'bg-indigo-950/20 border-indigo-800/40'
                          : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-800/30'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* 타입 아이콘 */}
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        u.type === 'company' 
                          ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' 
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}>
                        {u.type === 'company' ? <Building2 className="w-4.5 h-4.5" /> : <User className="w-4.5 h-4.5" />}
                      </div>

                      {/* 정보 */}
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-slate-100">{u.name}</span>
                          <span className="text-xs text-slate-500 font-mono">({u.email})</span>
                          {u.phone && (
                            <span className="flex items-center gap-1 text-xs text-slate-400 font-mono">
                              <Phone className="w-3 h-3 text-slate-500" />
                              {u.phone}
                            </span>
                          )}

                          {isMe && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              나 (접속중)
                            </span>
                          )}

                          {u.type === 'company' && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                              u.role === 'admin'
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}>
                              {u.role === 'admin' ? '관리자' : '일반 사용자'}
                            </span>
                          )}
                        </div>

                        {u.type === 'company' ? (
                          <div className="text-xs text-slate-400 flex flex-col gap-0.5">
                            <p className="font-medium text-slate-300">
                              회사명: <span className="text-indigo-300">{u.companyName}</span>
                              {u.position && <span className="text-slate-500"> · 직책: <span className="text-slate-300">{u.position}</span></span>}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              사업자등록번호: {u.businessNumber}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-emerald-400/80 font-medium">개인 회원 (독립 공간)</p>
                        )}
                      </div>
                    </div>

                    {/* 소속 상태 레이블 */}
                    <div className="mt-3 sm:mt-0 flex items-center justify-end">
                      {isMe ? (
                        <div className="flex items-center gap-1 text-xs text-blue-400 font-medium bg-blue-500/5 px-2.5 py-1 rounded-lg border border-blue-500/10">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>현재 본인 공간</span>
                        </div>
                      ) : coWorker ? (
                        <div className="flex items-center gap-1 text-xs text-indigo-400 font-bold bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20 shadow-sm animate-pulse">
                          <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                          <span>협업 동료 (데이터 자동 연동)</span>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 bg-slate-950/40 px-2.5 py-1 rounded-lg border border-slate-850">
                          독립된 격리 공간
                        </div>
                      )}
                    </div>
                  </div>

                  {/* [추가] 관리자 전용: 같은 회사 동료의 역할(관리자/일반 사용자)을 여기서 바로 지정 */}
                  {canManageRoles && coWorker && !isMe && u.type === 'company' && (
                    <div className="flex items-center gap-2 px-4 pb-3 -mt-1">
                      <span className="text-[11px] text-slate-500">권한 지정:</span>
                      <button
                        type="button"
                        disabled={roleUpdatingId === u.id || u.role === 'admin'}
                        onClick={() => changeRole(u, 'admin')}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        관리자로 지정
                      </button>
                      <button
                        type="button"
                        disabled={roleUpdatingId === u.id || u.role === 'member'}
                        onClick={() => changeRole(u, 'member')}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        일반 사용자로 지정
                      </button>
                      {roleUpdatingId === u.id && <span className="text-[11px] text-slate-500">변경 중...</span>}
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="p-4 bg-slate-950/40 border-t border-slate-800 text-center flex items-center justify-between">
          <p className="text-[11px] text-slate-500 font-mono">
            총 가입 회원: <span className="text-slate-300 font-bold">{users.length}</span>명
          </p>
          <button 
            onClick={onClose}
            className="px-5 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-slate-100 font-medium text-xs rounded-xl border border-slate-700 transition-all active:scale-95"
          >
            닫기
          </button>
        </div>

      </div>
    </div>
  );
};
