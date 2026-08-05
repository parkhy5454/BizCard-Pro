import React, { useState, useEffect } from 'react';
import { X, Search, Building2, User, ShieldCheck, Info, Phone, Download } from 'lucide-react';
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

  // [추가] 엑셀(CSV)로 다운로드하는 기능. 별도 라이브러리 없이 브라우저 기능만으로 동작하며,
  // 한글이 깨지지 않도록 UTF-8 BOM을 붙여서 내려준다. 엑셀에서 바로 열림.
  const downloadCsv = (filename: string, rows: (string | number)[][]) => {
    const escape = (v: string | number) => {
      const s = String(v ?? '');
      return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = rows.map(row => row.map(escape).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const memberRow = (groupLabel: string, businessNumber: string, m: UserType): (string | number)[] => [
    groupLabel,
    businessNumber,
    m.name,
    m.email,
    m.phone || '',
    m.type === 'company' ? (m.position || '') : '',
    m.type === 'company' ? (m.role === 'admin' ? '관리자' : '일반 사용자') : ''
  ];
  const CSV_HEADER = ['회사명', '사업자번호', '이름', '이메일', '전화번호', '직책', '역할'];

  // 이 회사(그룹)만 다운로드
  const exportGroupCsv = (g: DirectoryGroup) => {
    const rows: (string | number)[][] = [CSV_HEADER];
    for (const m of g.members) rows.push(memberRow(g.label, g.isIndividualGroup ? '' : (g.businessNumber || ''), m));
    downloadCsv(`${g.label}_가입회원.csv`, rows);
  };

  // 전체 다운로드 (같은 회사끼리 모아서, 회사 사이는 빈 줄로 구분)
  const exportAllCsv = () => {
    const rows: (string | number)[][] = [CSV_HEADER];
    for (const g of groups) {
      for (const m of g.members) rows.push(memberRow(g.label, g.isIndividualGroup ? '' : (g.businessNumber || ''), m));
      rows.push([]);
    }
    downloadCsv('전체_가입회원.csv', rows);
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

  // [추가] 관리자 전용: 승인 대기 중인 가입 신청을 승인/거절한다.
  const [approvalUpdatingId, setApprovalUpdatingId] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState('');
  const approveMember = async (target: UserType) => {
    setApprovalError('');
    setApprovalUpdatingId(target.id);
    try {
      const res = await fetch(`/api/auth/pending-members/${target.id}/approve`, {
        method: 'POST',
        headers: { 'x-user-id': currentUser.id }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '승인에 실패했습니다.');
      setUsers(prev => prev.map(u => (u.id === target.id ? { ...u, approvalStatus: 'approved' } : u)));
    } catch (err: any) {
      setApprovalError(err.message || '승인 중 오류가 발생했습니다.');
    } finally {
      setApprovalUpdatingId(null);
    }
  };
  const rejectMember = async (target: UserType) => {
    if (!window.confirm(`${target.name}(${target.email})님의 가입 신청을 거절할까요? 계정이 삭제되며 되돌릴 수 없습니다.`)) return;
    setApprovalError('');
    setApprovalUpdatingId(target.id);
    try {
      const res = await fetch(`/api/auth/pending-members/${target.id}/reject`, {
        method: 'POST',
        headers: { 'x-user-id': currentUser.id }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '거절에 실패했습니다.');
      setUsers(prev => prev.filter(u => u.id !== target.id));
    } catch (err: any) {
      setApprovalError(err.message || '거절 중 오류가 발생했습니다.');
    } finally {
      setApprovalUpdatingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <ShieldCheck className="w-4.5 h-4.5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">가입 회원 & 협업 디렉토리</h2>
              <p className="text-xs text-slate-500">시스템 내 가입자 현황 및 부서/회사별 데이터 연동 관계</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 안내 배너 */}
        <div className="px-5 py-3.5 bg-indigo-50 border-b border-indigo-100 text-xs text-indigo-900 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-indigo-800">👥 회사 협업 스코프 작동 원리</p>
            <p className="leading-relaxed text-slate-600">
              회원가입 시 <span className="text-slate-800 font-medium">회사 회원</span>으로 선택하고 동일한 <span className="text-indigo-700 font-semibold">회사명</span>과 <span className="text-indigo-700 font-semibold">사업자번호</span>를 등록하면 같은 회사로 묶입니다. 다만 <span className="text-rose-700 font-medium">두 번째 이후 가입자는 관리자가 승인하기 전까지 "승인 대기" 상태</span>이며, 관리자가 아래에서 승인해야 <span className="text-indigo-700 underline font-medium">명함 데이터베이스와 프로젝트, 미팅 팔로우업 기록</span>을 함께 볼 수 있습니다. 이 화면에는 <span className="text-slate-800 font-medium">본인과 같은 회사 소속 동료만</span> 표시되며, 관리자는 승인 대기자를 승인/거절하고 동료를 관리자/일반 사용자로 지정할 수 있습니다.
            </p>
          </div>
        </div>

        {/* 검색 및 필터 바 */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="이름, 이메일, 회사명, 사업자번호로 가입 회원 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 text-slate-800 text-sm pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-500 transition-all"
            />
          </div>
          <button
            type="button"
            onClick={exportAllCsv}
            disabled={groups.length === 0}
            title="회사별로 모아서 전체 엑셀 다운로드"
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-700 text-xs font-bold whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            전체 다운로드
          </button>
          {/* [추가] 가입자 명단이 아니라, 명함/프로젝트/차량 등 실제 데이터 전체를 JSON으로
          백업받는 버튼. 회사 계정은 관리자만, 개인 계정은 본인 데이터라 누구나 가능
          (서버에서도 동일하게 권한을 검사한다). */}
          <a
            href="/api/backup/export"
            title="명함/프로젝트/차량 등 전체 데이터를 JSON 파일로 백업"
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-700 text-xs font-bold whitespace-nowrap transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            데이터 백업(JSON)
          </a>
        </div>

        {roleError && (
          <div className="px-5 pt-3 text-xs text-rose-600 bg-rose-50">{roleError}</div>
        )}
        {approvalError && (
          <div className="px-5 pt-3 text-xs text-rose-600 bg-rose-50">{approvalError}</div>
        )}

        {/* 가입자 목록 영역 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
              <p className="text-sm">가입자 데이터 불러오는 중...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-rose-400 text-sm">
              <p>{error}</p>
              <button 
                onClick={fetchUsers}
                className="mt-3 px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-xs rounded-lg text-slate-600 border border-slate-200"
              >
                다시 시도
              </button>
            </div>
          ) : groups.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
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
                      isMyGroup ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    {/* 그룹(회사) 헤더 */}
                    <div className={`flex items-center justify-between px-4 py-2.5 border-b ${
                      isMyGroup ? 'border-blue-200 bg-blue-100' : 'border-slate-200 bg-slate-100'
                    }`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          g.isIndividualGroup
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-500/20'
                            : 'bg-indigo-50 text-indigo-700 border border-indigo-500/20'
                        }`}>
                          {g.isIndividualGroup ? <User className="w-3.5 h-3.5" /> : <Building2 className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                          <span className="text-sm font-bold text-slate-800">{g.label}</span>
                          {!g.isIndividualGroup && g.businessNumber && (
                            <span className="text-[10px] text-slate-400 font-mono ml-2">{g.businessNumber}</span>
                          )}
                          {isMyGroup && (
                            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-500/20">
                              내 소속
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400">{g.members.length}명</span>
                        <button
                          type="button"
                          onClick={() => exportGroupCsv(g)}
                          title="이 회사만 엑셀 다운로드"
                          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          다운로드
                        </button>
                      </div>
                    </div>

                    {/* 그룹 내 멤버 목록 */}
                    <div className="p-2.5 space-y-2">
                      {g.members.map((u) => {
                        const isMe = u.id === currentUser.id;
                        return (
                          <div key={u.id} className={`rounded-xl border p-3 ${
                            isMe ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'
                          }`}>
                            <div className="flex items-start gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                u.type === 'company'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-500/20'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-500/20'
                              }`}>
                                {u.type === 'company' ? <Building2 className="w-4 h-4" /> : <User className="w-4 h-4" />}
                              </div>
                              <div className="space-y-0.5 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-sm text-slate-800">{u.name}</span>
                                  <span className="text-xs text-slate-400 font-mono">({u.email})</span>
                                  {u.phone && (
                                    <span className="flex items-center gap-1 text-xs text-slate-500 font-mono">
                                      <Phone className="w-3 h-3 text-slate-400" />
                                      {u.phone}
                                    </span>
                                  )}
                                  {isMe && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-500/20">
                                      나 (접속중)
                                    </span>
                                  )}
                                  {u.type === 'company' && (
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                      u.role === 'admin'
                                        ? 'bg-amber-50 text-amber-700 border-amber-500/20'
                                        : 'bg-slate-100 text-slate-500 border-slate-200'
                                    }`}>
                                      {u.role === 'admin' ? '관리자' : '일반 사용자'}
                                    </span>
                                  )}
                                  {u.type === 'company' && u.approvalStatus === 'pending' && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-500/20">
                                      승인 대기
                                    </span>
                                  )}
                                </div>
                                {u.type === 'company' && u.position && (
                                  <p className="text-[11px] text-slate-400">직책: <span className="text-slate-600">{u.position}</span></p>
                                )}
                              </div>
                            </div>

                            {/* [추가] 관리자 전용: 승인 대기 중인 신청은 여기서 바로 승인/거절 */}
                            {canManageRoles && isMyGroup && !isMe && u.type === 'company' && u.approvalStatus === 'pending' && (
                              <div className="flex items-center gap-2 pt-2 mt-2 border-t border-slate-200">
                                <span className="text-[11px] text-slate-400">가입 승인:</span>
                                <button
                                  type="button"
                                  disabled={approvalUpdatingId === u.id}
                                  onClick={() => approveMember(u)}
                                  className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-500/20 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  승인
                                </button>
                                <button
                                  type="button"
                                  disabled={approvalUpdatingId === u.id}
                                  onClick={() => rejectMember(u)}
                                  className="text-[11px] px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-500/20 hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  거절
                                </button>
                                {approvalUpdatingId === u.id && <span className="text-[11px] text-slate-400">처리 중...</span>}
                              </div>
                            )}

                            {/* [추가] 관리자 전용: 같은 회사 동료의 역할(관리자/일반 사용자)을 여기서 바로 지정 (승인된 회원만) */}
                            {canManageRoles && isMyGroup && !isMe && u.type === 'company' && u.approvalStatus !== 'pending' && (
                              <div className="flex items-center gap-2 pt-2 mt-2 border-t border-slate-200">
                                <span className="text-[11px] text-slate-400">권한 지정:</span>
                                <button
                                  type="button"
                                  disabled={roleUpdatingId === u.id || u.role === 'admin'}
                                  onClick={() => changeRole(u, 'admin')}
                                  className="text-[11px] px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-500/20 hover:bg-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  관리자로 지정
                                </button>
                                <button
                                  type="button"
                                  disabled={roleUpdatingId === u.id || u.role === 'member'}
                                  onClick={() => changeRole(u, 'member')}
                                  className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  일반 사용자로 지정
                                </button>
                                {roleUpdatingId === u.id && <span className="text-[11px] text-slate-400">변경 중...</span>}
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
        <div className="p-4 bg-slate-50 border-t border-slate-200 text-center flex items-center justify-between">
          <p className="text-[11px] text-slate-400 font-mono">
            총 가입 회원: <span className="text-slate-600 font-bold">{users.length}</span>명
          </p>
          <button 
            onClick={onClose}
            className="px-5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-800 font-medium text-xs rounded-xl border border-slate-200 transition-all active:scale-95"
          >
            닫기
          </button>
        </div>

      </div>
    </div>
  );
};
