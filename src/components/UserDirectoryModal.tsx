import React, { useState, useEffect } from 'react';
import { X, Search, Building2, User, ShieldCheck, Info, Phone } from 'lucide-react';
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

  // [추가] 회사별로 묶어서 보여주기 위한 그룹핑. 같은 회사명+사업자번호는 하나의 그룹으로,
  // 개인 회원은 별도로 "개인 회원" 그룹에 모은다.
  interface DirectoryGroup {
    key: string;
    label: string;
    businessNumber?: string;
    isIndividualGroup: boolean;
    members: UserType[];
  }
  const groups: DirectoryGroup[] = (() => {
    const map = new Map<string, DirectoryGroup>();
    const individualGroup: DirectoryGroup = { key: '__individual__', label: '개인 회원', isIndividualGroup: true, members: [] };
    for (const u of filteredUsers) {
      if (u.type === 'company') {
        const key = `${(u.companyName || '').trim().toLowerCase()}|${(u.businessNumber || '').trim().toLowerCase()}`;
        if (!map.has(key)) {
          map.set(key, { key, label: u.companyName || '(회사명 미상)', businessNumber: u.businessNumber, isIndividualGroup: false, members: [] });
        }
        map.get(key)!.members.push(u);
      } else {
        individualGroup.members.push(u);
      }
    }
    const companyGroups = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
    return individualGroup.members.length > 0 ? [...companyGroups, individualGroup] : companyGroups;
  })();

  const myGroupKey = currentUser.type === 'company'
    ? `${(currentUser.companyName || '').trim().toLowerCase()}|${(currentUser.businessNumber || '').trim().toLowerCase()}`
    : '__individual__';

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
          ) : groups.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              <p>검색 조건과 일치하는 회원이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => {
                const isMyGroup = g.key === myGroupKey;
                return (
                  <div
                    key={g.key}
                    className={`rounded-2xl border overflow-hidden ${
                      isMyGroup ? 'border-blue-800/50 bg-blue-950/10' : 'border-slate-800 bg-slate-950/20'
                    }`}
                  >
                    {/* 그룹(회사) 헤더 */}
                    <div className={`flex items-center justify-between px-4 py-2.5 border-b ${
                      isMyGroup ? 'border-blue-900/40 bg-blue-950/20' : 'border-slate-800/80 bg-slate-900/40'
                    }`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          g.isIndividualGroup
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                        }`}>
                          {g.isIndividualGroup ? <User className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                          <span className="text-sm font-bold text-slate-100">{g.label}</span>
                          {!g.isIndividualGroup && g.businessNumber && (
                            <span className="text-[10px] text-slate-500 font-mono ml-2">{g.businessNumber}</span>
                          )}
                          {isMyGroup && (
                            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              내 소속
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-500">{g.members.length}명</span>
                    </div>

                    {/* 그룹 내 멤버 목록 */}
                    <div className="p-2.5 space-y-2">
                      {g.members.map((u) => {
                        const isMe = u.id === currentUser.id;
                        return (
                          <div key={u.id} className={`rounded-xl border p-3 ${
                            isMe ? 'bg-blue-950/20 border-blue-800/40' : 'bg-slate-900/40 border-slate-800/60'
                          }`}>
                            <div className="flex items-start gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                u.type === 'company'
                                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              }`}>
                                {u.type === 'company' ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
                              </div>
                              <div className="space-y-0.5 flex-1">
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
                                {u.type === 'company' && u.position && (
                                  <p className="text-[11px] text-slate-500">직책: <span className="text-slate-300">{u.position}</span></p>
                                )}
                              </div>
                            </div>

                            {/* [추가] 관리자 전용: 같은 회사 동료의 역할(관리자/일반 사용자)을 여기서 바로 지정 */}
                            {canManageRoles && isMyGroup && !isMe && u.type === 'company' && (
                              <div className="flex items-center gap-2 pt-2 mt-2 border-t border-slate-800/60">
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
