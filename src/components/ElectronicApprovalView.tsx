import React, { useState, useEffect } from 'react';
import {
  Wallet, Plane, Plus, Trash2, Edit2, X, Check, Clock, CheckCircle2, XCircle,
  FileCheck, Calendar, User as UserIcon, Briefcase
} from 'lucide-react';
import { AdvancePaymentSettlement, AdvancePaymentItem, LeaveRequest, ApprovalStatus, User } from '../types.js';
import { formatCurrencyInput, parseCurrencyInput } from '../currencyFormat.js';

interface Props {
  currentUser: User | null;
}

const STATUS_LABEL: Record<ApprovalStatus, string> = {
  draft: '임시저장',
  pending: '결재대기',
  approved: '승인',
  rejected: '반려'
};

const STATUS_STYLE: Record<ApprovalStatus, string> = {
  draft: 'bg-slate-700/50 text-slate-300 border-slate-600/50',
  pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  rejected: 'bg-rose-500/15 text-rose-400 border-rose-500/30'
};

const StatusBadge: React.FC<{ status: ApprovalStatus }> = ({ status }) => (
  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border whitespace-nowrap ${STATUS_STYLE[status]}`}>
    {status === 'pending' && <Clock className="w-3 h-3" />}
    {status === 'approved' && <CheckCircle2 className="w-3 h-3" />}
    {status === 'rejected' && <XCircle className="w-3 h-3" />}
    {STATUS_LABEL[status]}
  </span>
);

const LEAVE_TYPE_LABEL: Record<LeaveRequest['leaveType'], string> = {
  annual: '연차',
  half_am: '반차(오전)',
  half_pm: '반차(오후)',
  sick: '병가',
  special: '경조사',
  other: '기타'
};

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function calcLeaveDays(startDate: string, endDate: string, leaveType: LeaveRequest['leaveType']): number {
  if (leaveType === 'half_am' || leaveType === 'half_pm') return 0.5;
  if (!startDate || !endDate) return 0;
  const s = new Date(startDate);
  const e = new Date(endDate);
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : 0;
}

export const ElectronicApprovalView: React.FC<Props> = ({ currentUser }) => {
  const [activeApprovalTab, setActiveApprovalTab] = useState<'advance' | 'leave'>('advance');

  const [advanceList, setAdvanceList] = useState<AdvancePaymentSettlement[]>([]);
  const [leaveList, setLeaveList] = useState<LeaveRequest[]>([]);
  const [myProfile, setMyProfile] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [editingAdvanceId, setEditingAdvanceId] = useState<string | null>(null);
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);

  // 가지급금 정산서 폼 상태
  const [apTitle, setApTitle] = useState('');
  const [apAuthor, setApAuthor] = useState('');
  const [apDepartment, setApDepartment] = useState('');
  const [apRequestDate, setApRequestDate] = useState(todayStr());
  const [apAdvanceAmount, setApAdvanceAmount] = useState<number>(0);
  const [apItems, setApItems] = useState<AdvancePaymentItem[]>([]);
  const [apMemo, setApMemo] = useState('');

  // 휴가 신청서 폼 상태
  const [lvTitle, setLvTitle] = useState('');
  const [lvAuthor, setLvAuthor] = useState('');
  const [lvDepartment, setLvDepartment] = useState('');
  const [lvType, setLvType] = useState<LeaveRequest['leaveType']>('annual');
  const [lvTypeCustom, setLvTypeCustom] = useState('');
  const [lvStartDate, setLvStartDate] = useState(todayStr());
  const [lvEndDate, setLvEndDate] = useState(todayStr());
  const [lvReason, setLvReason] = useState('');
  const [lvContact, setLvContact] = useState('');

  useEffect(() => {
    fetchAll();
    fetchMyProfile();
  }, [currentUser]);

  const fetchMyProfile = async () => {
    try {
      const res = await fetch('/api/my-profile');
      if (res.ok) setMyProfile(await res.json());
    } catch (err) {
      console.error('My profile fetch error:', err);
    }
  };

  const fetchAll = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const headers = { 'x-user-id': currentUser.id };
      const [advRes, lvRes] = await Promise.all([
        fetch('/api/approvals/advance', { headers }).then(r => r.json()),
        fetch('/api/approvals/leave', { headers }).then(r => r.json())
      ]);
      if (Array.isArray(advRes)) setAdvanceList(advRes);
      if (Array.isArray(lvRes)) setLeaveList(lvRes);
    } catch (err) {
      console.error('Approvals fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const resetAdvanceForm = () => {
    setApTitle('');
    setApAuthor(myProfile?.name || currentUser?.name || '');
    setApDepartment(myProfile?.department || '');
    setApRequestDate(todayStr());
    setApAdvanceAmount(0);
    setApItems([]);
    setApMemo('');
    setEditingAdvanceId(null);
  };

  const resetLeaveForm = () => {
    setLvTitle('');
    setLvAuthor(myProfile?.name || currentUser?.name || '');
    setLvDepartment(myProfile?.department || '');
    setLvType('annual');
    setLvTypeCustom('');
    setLvStartDate(todayStr());
    setLvEndDate(todayStr());
    setLvReason('');
    setLvContact('');
    setEditingLeaveId(null);
  };

  const openNewAdvance = () => {
    resetAdvanceForm();
    setIsAdvanceModalOpen(true);
  };

  const openEditAdvance = (doc: AdvancePaymentSettlement) => {
    setEditingAdvanceId(doc.id);
    setApTitle(doc.title);
    setApAuthor(doc.author || '');
    setApDepartment(doc.department || '');
    setApRequestDate(doc.requestDate);
    setApAdvanceAmount(doc.advanceAmount);
    setApItems(doc.items || []);
    setApMemo(doc.memo || '');
    setIsAdvanceModalOpen(true);
  };

  const openNewLeave = () => {
    resetLeaveForm();
    setIsLeaveModalOpen(true);
  };

  const openEditLeave = (doc: LeaveRequest) => {
    setEditingLeaveId(doc.id);
    setLvTitle(doc.title);
    setLvAuthor(doc.author || '');
    setLvDepartment(doc.department || '');
    setLvType(doc.leaveType);
    setLvTypeCustom(doc.leaveTypeCustom || '');
    setLvStartDate(doc.startDate);
    setLvEndDate(doc.endDate);
    setLvReason(doc.reason || '');
    setLvContact(doc.contactDuring || '');
    setIsLeaveModalOpen(true);
  };

  const addApItem = () => {
    setApItems(prev => [...prev, { id: `api-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, date: todayStr(), description: '', amount: 0 }]);
  };
  const updateApItem = (id: string, patch: Partial<AdvancePaymentItem>) => {
    setApItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  };
  const removeApItem = (id: string) => {
    setApItems(prev => prev.filter(it => it.id !== id));
  };

  const apUsedTotal = apItems.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
  const apBalance = apAdvanceAmount - apUsedTotal; // 양수: 반납할 금액, 음수: 추가 청구할 금액

  const saveAdvance = async () => {
    if (!apTitle.trim()) { alert('제목을 입력해 주세요.'); return; }
    if (!currentUser) return;
    const headers = { 'Content-Type': 'application/json', 'x-user-id': currentUser.id };
    const payload: Partial<AdvancePaymentSettlement> = {
      title: apTitle,
      author: apAuthor,
      department: apDepartment,
      requestDate: apRequestDate,
      advanceAmount: apAdvanceAmount,
      items: apItems,
      memo: apMemo
    };
    try {
      if (editingAdvanceId) {
        const res = await fetch(`/api/approvals/advance/${editingAdvanceId}`, { method: 'PUT', headers, body: JSON.stringify(payload) });
        const updated = await res.json();
        setAdvanceList(prev => prev.map(d => d.id === editingAdvanceId ? updated : d));
      } else {
        const res = await fetch('/api/approvals/advance', { method: 'POST', headers, body: JSON.stringify({ ...payload, status: 'pending' }) });
        const created = await res.json();
        setAdvanceList(prev => [created, ...prev]);
      }
      setIsAdvanceModalOpen(false);
      resetAdvanceForm();
    } catch (err) {
      console.error('Advance save error:', err);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const saveLeave = async () => {
    if (!lvTitle.trim()) { alert('제목을 입력해 주세요.'); return; }
    if (!lvStartDate || !lvEndDate) { alert('휴가 기간을 입력해 주세요.'); return; }
    if (!currentUser) return;
    const headers = { 'Content-Type': 'application/json', 'x-user-id': currentUser.id };
    const days = calcLeaveDays(lvStartDate, lvEndDate, lvType);
    const payload: Partial<LeaveRequest> = {
      title: lvTitle,
      author: lvAuthor,
      department: lvDepartment,
      leaveType: lvType,
      leaveTypeCustom: lvType === 'other' ? lvTypeCustom : undefined,
      startDate: lvStartDate,
      endDate: lvEndDate,
      days,
      reason: lvReason,
      contactDuring: lvContact
    };
    try {
      if (editingLeaveId) {
        const res = await fetch(`/api/approvals/leave/${editingLeaveId}`, { method: 'PUT', headers, body: JSON.stringify(payload) });
        const updated = await res.json();
        setLeaveList(prev => prev.map(d => d.id === editingLeaveId ? updated : d));
      } else {
        const res = await fetch('/api/approvals/leave', { method: 'POST', headers, body: JSON.stringify({ ...payload, status: 'pending' }) });
        const created = await res.json();
        setLeaveList(prev => [created, ...prev]);
      }
      setIsLeaveModalOpen(false);
      resetLeaveForm();
    } catch (err) {
      console.error('Leave save error:', err);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const deleteAdvance = async (id: string) => {
    if (!currentUser) return;
    if (!confirm('이 정산서를 삭제하시겠습니까?')) return;
    await fetch(`/api/approvals/advance/${id}`, { method: 'DELETE', headers: { 'x-user-id': currentUser.id } });
    setAdvanceList(prev => prev.filter(d => d.id !== id));
  };

  const deleteLeave = async (id: string) => {
    if (!currentUser) return;
    if (!confirm('이 휴가 신청서를 삭제하시겠습니까?')) return;
    await fetch(`/api/approvals/leave/${id}`, { method: 'DELETE', headers: { 'x-user-id': currentUser.id } });
    setLeaveList(prev => prev.filter(d => d.id !== id));
  };

  const setAdvanceStatus = async (id: string, status: ApprovalStatus) => {
    if (!currentUser) return;
    const headers = { 'Content-Type': 'application/json', 'x-user-id': currentUser.id };
    const res = await fetch(`/api/approvals/advance/${id}`, { method: 'PUT', headers, body: JSON.stringify({ status }) });
    const updated = await res.json();
    setAdvanceList(prev => prev.map(d => d.id === id ? updated : d));
  };

  const setLeaveStatus = async (id: string, status: ApprovalStatus) => {
    if (!currentUser) return;
    const headers = { 'Content-Type': 'application/json', 'x-user-id': currentUser.id };
    const res = await fetch(`/api/approvals/leave/${id}`, { method: 'PUT', headers, body: JSON.stringify({ status }) });
    const updated = await res.json();
    setLeaveList(prev => prev.map(d => d.id === id ? updated : d));
  };

  return (
    <div className="space-y-5">
      {/* 전자결재 하위 탭 */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveApprovalTab('advance')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
            activeApprovalTab === 'advance'
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>가지급금 정산서</span>
          <span className="px-1.5 py-0.2 rounded-full text-[11px] bg-slate-800 text-slate-300 font-mono">{advanceList.length}</span>
        </button>
        <button
          onClick={() => setActiveApprovalTab('leave')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
            activeApprovalTab === 'leave'
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
          }`}
        >
          <Plane className="w-4 h-4" />
          <span>휴가 신청서</span>
          <span className="px-1.5 py-0.2 rounded-full text-[11px] bg-slate-800 text-slate-300 font-mono">{leaveList.length}</span>
        </button>
      </div>

      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-400">결재 문서를 불러오는 중입니다...</p>
        </div>
      ) : activeApprovalTab === 'advance' ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={openNewAdvance}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm shadow-md shadow-blue-600/25 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>가지급금 정산서 작성</span>
            </button>
          </div>

          {advanceList.length === 0 ? (
            <div className="py-20 text-center text-slate-500 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl">
              <Wallet className="w-8 h-8 mx-auto mb-2 text-slate-700" />
              <p className="text-sm">등록된 가지급금 정산서가 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {advanceList.map(doc => {
                const used = (doc.items || []).reduce((s, it) => s + (Number(it.amount) || 0), 0);
                const balance = doc.advanceAmount - used;
                return (
                  <div key={doc.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-slate-100 truncate">{doc.title}</h3>
                          <StatusBadge status={doc.status} />
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
                          <span className="flex items-center gap-1"><UserIcon className="w-3 h-3" />{doc.author || '-'}</span>
                          <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{doc.department || '-'}</span>
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{doc.requestDate}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEditAdvance(doc)} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteAdvance(doc.id)} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs bg-slate-950/50 rounded-xl p-3">
                      <div>
                        <p className="text-slate-500">가지급 금액</p>
                        <p className="font-bold text-slate-200">{formatCurrencyInput(doc.advanceAmount)}원</p>
                      </div>
                      <div>
                        <p className="text-slate-500">사용 합계</p>
                        <p className="font-bold text-slate-200">{formatCurrencyInput(used)}원</p>
                      </div>
                      <div>
                        <p className="text-slate-500">{balance >= 0 ? '반납할 금액' : '추가 청구 금액'}</p>
                        <p className={`font-bold ${balance >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>{formatCurrencyInput(Math.abs(balance))}원</p>
                      </div>
                    </div>

                    {doc.status === 'pending' && (
                      <div className="flex items-center gap-2 pt-1">
                        <button onClick={() => setAdvanceStatus(doc.id, 'approved')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-bold border border-emerald-600/30 transition-colors">
                          <Check className="w-3.5 h-3.5" /> 승인
                        </button>
                        <button onClick={() => setAdvanceStatus(doc.id, 'rejected')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 text-xs font-bold border border-rose-600/30 transition-colors">
                          <X className="w-3.5 h-3.5" /> 반려
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={openNewLeave}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm shadow-md shadow-blue-600/25 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>휴가 신청서 작성</span>
            </button>
          </div>

          {leaveList.length === 0 ? (
            <div className="py-20 text-center text-slate-500 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl">
              <Plane className="w-8 h-8 mx-auto mb-2 text-slate-700" />
              <p className="text-sm">등록된 휴가 신청서가 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {leaveList.map(doc => (
                <div key={doc.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-100 truncate">{doc.title}</h3>
                        <StatusBadge status={doc.status} />
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                          {doc.leaveType === 'other' ? (doc.leaveTypeCustom || '기타') : LEAVE_TYPE_LABEL[doc.leaveType]}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
                        <span className="flex items-center gap-1"><UserIcon className="w-3 h-3" />{doc.author || '-'}</span>
                        <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{doc.department || '-'}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{doc.startDate} ~ {doc.endDate} ({doc.days}일)</span>
                      </div>
                      {doc.reason && <p className="text-xs text-slate-500 mt-1.5">{doc.reason}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openEditLeave(doc)} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteLeave(doc.id)} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {doc.status === 'pending' && (
                    <div className="flex items-center gap-2 pt-1">
                      <button onClick={() => setLeaveStatus(doc.id, 'approved')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-bold border border-emerald-600/30 transition-colors">
                        <Check className="w-3.5 h-3.5" /> 승인
                      </button>
                      <button onClick={() => setLeaveStatus(doc.id, 'rejected')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 text-xs font-bold border border-rose-600/30 transition-colors">
                        <X className="w-3.5 h-3.5" /> 반려
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 가지급금 정산서 작성/수정 모달 */}
      {isAdvanceModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="font-bold text-lg text-slate-100 flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-blue-400" />
                {editingAdvanceId ? '가지급금 정산서 수정' : '가지급금 정산서 작성'}
              </h2>
              <button onClick={() => setIsAdvanceModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">제목</label>
                <input type="text" placeholder="예: 8월 출장 가지급금 정산" value={apTitle} onChange={(e) => setApTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">작성자</label>
                  <input type="text" value={apAuthor} onChange={(e) => setApAuthor(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">소속 부서</label>
                  <input type="text" value={apDepartment} onChange={(e) => setApDepartment(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">정산 신청일</label>
                  <input type="date" value={apRequestDate} onChange={(e) => setApRequestDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">가지급받은 금액</label>
                  <input type="text" inputMode="numeric" placeholder="0" value={formatCurrencyInput(apAdvanceAmount)}
                    onChange={(e) => setApAdvanceAmount(parseCurrencyInput(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">사용 내역</label>
                  <button type="button" onClick={addApItem} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-bold">
                    <Plus className="w-3.5 h-3.5" /> 내역 추가
                  </button>
                </div>
                {apItems.length === 0 && (
                  <div className="text-xs text-slate-500 text-center py-4 bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                    사용 내역이 없습니다. "내역 추가"를 눌러 등록해 주세요.
                  </div>
                )}
                <div className="space-y-2">
                  {apItems.map(item => (
                    <div key={item.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-[110px_1fr_130px_36px] gap-2 items-center">
                      <input type="date" value={item.date} onChange={(e) => updateApItem(item.id, { date: e.target.value })}
                        className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <input type="text" placeholder="사용 내역 (예: 거래처 미팅 식대)" value={item.description}
                        onChange={(e) => updateApItem(item.id, { description: e.target.value })}
                        className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <input type="text" inputMode="numeric" placeholder="금액" value={formatCurrencyInput(item.amount)}
                        onChange={(e) => updateApItem(item.id, { amount: parseCurrencyInput(e.target.value) })}
                        className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <button type="button" onClick={() => removeApItem(item.id)} className="p-2 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-rose-400 justify-self-center">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs bg-slate-950/50 rounded-xl p-3">
                <div>
                  <p className="text-slate-500">가지급 금액</p>
                  <p className="font-bold text-slate-200">{formatCurrencyInput(apAdvanceAmount)}원</p>
                </div>
                <div>
                  <p className="text-slate-500">사용 합계</p>
                  <p className="font-bold text-slate-200">{formatCurrencyInput(apUsedTotal)}원</p>
                </div>
                <div>
                  <p className="text-slate-500">{apBalance >= 0 ? '반납할 금액' : '추가 청구 금액'}</p>
                  <p className={`font-bold ${apBalance >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>{formatCurrencyInput(Math.abs(apBalance))}원</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">비고</label>
                <textarea rows={2} value={apMemo} onChange={(e) => setApMemo(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm resize-none" />
              </div>
            </div>

            <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 px-6 py-4 flex items-center justify-end gap-2">
              <button onClick={() => setIsAdvanceModalOpen(false)} className="px-4 py-2.5 rounded-xl font-semibold text-sm text-slate-400 hover:bg-slate-800 transition-colors">취소</button>
              <button onClick={saveAdvance} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-600/25 transition-all active:scale-95">저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 휴가 신청서 작성/수정 모달 */}
      {isLeaveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="font-bold text-lg text-slate-100 flex items-center gap-2">
                <Plane className="w-5 h-5 text-blue-400" />
                {editingLeaveId ? '휴가 신청서 수정' : '휴가 신청서 작성'}
              </h2>
              <button onClick={() => setIsLeaveModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">제목</label>
                <input type="text" placeholder="예: 여름 휴가 신청" value={lvTitle} onChange={(e) => setLvTitle(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">작성자</label>
                  <input type="text" value={lvAuthor} onChange={(e) => setLvAuthor(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">소속 부서</label>
                  <input type="text" value={lvDepartment} onChange={(e) => setLvDepartment(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">휴가 종류</label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(LEAVE_TYPE_LABEL) as LeaveRequest['leaveType'][]).map(t => (
                    <button key={t} type="button" onClick={() => setLvType(t)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                        lvType === t ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
                      }`}>
                      {LEAVE_TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
                {lvType === 'other' && (
                  <input type="text" placeholder="휴가 종류 직접 입력" value={lvTypeCustom} onChange={(e) => setLvTypeCustom(e.target.value)}
                    className="w-full mt-2 px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">시작일</label>
                  <input type="date" value={lvStartDate} onChange={(e) => setLvStartDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">종료일</label>
                  <input type="date" value={lvEndDate} onChange={(e) => setLvEndDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
              </div>

              <div className="text-xs text-slate-400 bg-slate-950/50 rounded-xl px-4 py-2.5">
                산정된 휴가 일수: <span className="font-bold text-slate-200">{calcLeaveDays(lvStartDate, lvEndDate, lvType)}일</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">사유</label>
                <textarea rows={2} value={lvReason} onChange={(e) => setLvReason(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm resize-none" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">휴가중 비상 연락처</label>
                <input type="text" placeholder="예: 010-1234-5678" value={lvContact} onChange={(e) => setLvContact(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
              </div>
            </div>

            <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 px-6 py-4 flex items-center justify-end gap-2">
              <button onClick={() => setIsLeaveModalOpen(false)} className="px-4 py-2.5 rounded-xl font-semibold text-sm text-slate-400 hover:bg-slate-800 transition-colors">취소</button>
              <button onClick={saveLeave} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-600/25 transition-all active:scale-95">저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
