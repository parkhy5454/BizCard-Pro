import React, { useState, useEffect } from 'react';
import {
  Wallet, Plane, Plus, Trash2, Edit2, X, Check, Clock, CheckCircle2, XCircle,
  Printer, Calendar, User as UserIcon, Briefcase, Hash
} from 'lucide-react';
import { AdvancePaymentSettlement, AdvancePaymentItem, LeaveRequest, LeaveCategory, ApprovalStatus, ApprovalStep, User } from '../types.js';
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

const LEAVE_CATEGORY_LABEL: Record<LeaveCategory, string> = {
  monthly: '월차',
  annual: '연차',
  official: '공가',
  sick: '병가',
  special_birth: '특별휴가(출산)',
  special_summer: '특별휴가(하기)',
  special_family: '특별휴가(경조)',
  special_disaster: '특별휴가(재해)',
  health: '보건',
  other: '기타'
};

const LEAVE_CATEGORY_ORDER: LeaveCategory[] = ['monthly', 'annual', 'official', 'sick', 'special_birth', 'special_summer', 'special_family', 'special_disaster', 'health', 'other'];

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function calcLeaveDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const s = new Date(startDate);
  const e = new Date(endDate);
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : 0;
}

const defaultLeaveApprovalLine = (): ApprovalStep[] => [
  { role: '기안자' }, { role: '경영지원실장' }, { role: '기술이사' }, { role: '대표이사' }
];
const defaultAdvanceApprovalLine = (): ApprovalStep[] => [
  { role: '기안자' }, { role: '경영지원팀장' }, { role: '기술이사' }, { role: '대표이사' }
];

function makeDraftNumber(existing: string[]): string {
  const prefix = todayStr().replace(/-/g, '');
  const seq = existing.filter(d => d.startsWith(prefix)).length + 1;
  return `${prefix}-${String(seq).padStart(2, '0')}`;
}

// 인쇄용 팝업 창을 열어 문서 형태로 출력
function openPrintWindow(title: string, bodyHtml: string) {
  const win = window.open('', '_blank', 'width=850,height=1000');
  if (!win) { alert('팝업이 차단되어 인쇄 창을 열 수 없습니다. 팝업 차단을 해제해 주세요.'); return; }
  win.document.write(`
    <!DOCTYPE html><html><head><meta charset="utf-8" />
    <title>${title}</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; padding: 24px; color: #111; }
      table { border-collapse: collapse; width: 100%; }
      td, th { border: 1px solid #111; padding: 8px 10px; font-size: 13px; vertical-align: middle; }
      h1 { text-align: center; font-size: 26px; text-decoration: underline; margin-bottom: 28px; }
      .approval-wrap { display: flex; justify-content: flex-end; margin-bottom: 10px; }
      .approval-table { width: auto; }
      .approval-table td, .approval-table th { text-align: center; min-width: 90px; }
      .label-cell { background: #f3f4f6; font-weight: bold; white-space: nowrap; width: 110px; }
      .center { text-align: center; }
      .right { text-align: right; }
      .footer-text { text-align: center; margin-top: 40px; font-size: 14px; }
      .footer-date { text-align: center; margin-top: 30px; font-size: 14px; }
      @media print { body { padding: 0; } }
    </style>
    </head><body>${bodyHtml}
    <script>window.onload = () => { window.print(); };</script>
    </body></html>
  `);
  win.document.close();
}

function approvalLineHtml(line: ApprovalStep[]): string {
  return `
    <div class="approval-wrap">
      <table class="approval-table">
        <tr>
          <td rowspan="2" class="label-cell">결&nbsp;&nbsp;재</td>
          ${line.map(s => `<th>${s.role}</th>`).join('')}
        </tr>
        <tr>
          ${line.map(s => `<td style="height:50px;">${s.date ? s.date + (s.name ? '<br/>' + s.name : '') : ''}</td>`).join('')}
        </tr>
      </table>
    </div>
  `;
}

function buildLeavePrintHtml(doc: LeaveRequest): string {
  const catLabel = doc.leaveCategory === 'other' ? (doc.leaveCategoryCustom || '기타') : LEAVE_CATEGORY_LABEL[doc.leaveCategory];
  return `
    <h1>휴가 신청서</h1>
    ${approvalLineHtml(doc.approvalLine)}
    <p>기안번호 : ${doc.draftNumber}</p>
    <table>
      <tr><td class="label-cell">소속</td><td colspan="3">${doc.department}</td><td class="label-cell">휴가자</td><td colspan="2">${doc.author}</td></tr>
      <tr><td class="label-cell">휴가구분</td><td colspan="6">${catLabel}</td></tr>
      <tr><td class="label-cell">사유</td><td colspan="6">${doc.reason || ''}</td></tr>
      <tr><td class="label-cell">기간</td><td colspan="6">${doc.startDate} ~ ${doc.endDate}${doc.startTime ? `　${doc.startTime} ~ ${doc.endTime || ''}` : ''}　${doc.annualLeaveNote ? `(${doc.annualLeaveNote})` : `(${doc.days}일)`}</td></tr>
      <tr><td class="label-cell">연락처</td><td colspan="2">집: ${doc.homeContact || ''}<br/>휴대폰: ${doc.mobileContact || ''}</td><td class="label-cell">직무대행자</td><td colspan="3">${doc.actingPerson || ''}</td></tr>
    </table>
    <p class="footer-text">위와 같이 신청하오니 승인하여 주시기 바랍니다.</p>
    <p class="footer-date">${doc.submittedDate.replace(/-/g, '. ')}</p>
  `;
}

function buildAdvancePrintHtml(doc: AdvancePaymentSettlement): string {
  const total = doc.items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  return `
    <h1>가지급금 정산서</h1>
    ${approvalLineHtml(doc.approvalLine)}
    <table style="margin-bottom:16px;">
      <tr><td class="label-cell">회사명</td><td colspan="3">${doc.companyName}</td></tr>
      <tr><td class="label-cell">기간</td><td colspan="3">${doc.periodStart} ~ ${doc.periodEnd}</td></tr>
      <tr><td class="label-cell">부서</td><td colspan="3">${doc.department}</td></tr>
      <tr><td class="label-cell">작성자</td><td colspan="3">${doc.author}</td></tr>
      <tr><td class="label-cell">기안일</td><td colspan="3">${doc.draftDate}</td></tr>
    </table>
    <table>
      <tr>
        <th>Date(날짜)</th><th>Project(프로젝트명)</th><th>Description(내용)</th>
        <th>Expenses(금액/원)</th><th>Account(계정과목)</th><th>Company name(상호)</th><th>Remark(비고)</th>
      </tr>
      ${doc.items.map(it => `
        <tr>
          <td class="center">${it.date}</td><td>${it.project || ''}</td><td>${it.description}</td>
          <td class="right">${it.amount.toLocaleString('ko-KR')}</td><td class="center">${it.account || ''}</td><td class="center">${it.companyName || ''}</td><td>${it.remark || ''}</td>
        </tr>
      `).join('')}
      <tr><td colspan="3" class="center label-cell">총 합계</td><td class="right label-cell">${total.toLocaleString('ko-KR')}</td><td colspan="3"></td></tr>
    </table>
  `;
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
  const [apCompanyName, setApCompanyName] = useState('');
  const [apPeriodStart, setApPeriodStart] = useState(todayStr());
  const [apPeriodEnd, setApPeriodEnd] = useState(todayStr());
  const [apDepartment, setApDepartment] = useState('');
  const [apAuthor, setApAuthor] = useState('');
  const [apDraftDate, setApDraftDate] = useState(todayStr());
  const [apItems, setApItems] = useState<AdvancePaymentItem[]>([]);
  const [apApprovalLine, setApApprovalLine] = useState<ApprovalStep[]>(defaultAdvanceApprovalLine());

  // 휴가 신청서 폼 상태
  const [lvDraftNumber, setLvDraftNumber] = useState('');
  const [lvDepartment, setLvDepartment] = useState('');
  const [lvAuthor, setLvAuthor] = useState('');
  const [lvCategory, setLvCategory] = useState<LeaveCategory>('annual');
  const [lvCategoryCustom, setLvCategoryCustom] = useState('');
  const [lvReason, setLvReason] = useState('');
  const [lvStartDate, setLvStartDate] = useState(todayStr());
  const [lvEndDate, setLvEndDate] = useState(todayStr());
  const [lvStartTime, setLvStartTime] = useState('');
  const [lvEndTime, setLvEndTime] = useState('');
  const [lvAnnualNote, setLvAnnualNote] = useState('');
  const [lvHomeContact, setLvHomeContact] = useState('');
  const [lvMobileContact, setLvMobileContact] = useState('');
  const [lvActingPerson, setLvActingPerson] = useState('');
  const [lvSubmittedDate, setLvSubmittedDate] = useState(todayStr());
  const [lvApprovalLine, setLvApprovalLine] = useState<ApprovalStep[]>(defaultLeaveApprovalLine());

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
    setApCompanyName(myProfile?.company || '');
    setApPeriodStart(todayStr());
    setApPeriodEnd(todayStr());
    setApDepartment(myProfile?.department || '');
    setApAuthor(myProfile?.name || currentUser?.name || '');
    setApDraftDate(todayStr());
    setApItems([]);
    setApApprovalLine(defaultAdvanceApprovalLine());
    setEditingAdvanceId(null);
  };

  const resetLeaveForm = () => {
    setLvDraftNumber(makeDraftNumber(leaveList.map(l => l.draftNumber || '')));
    setLvDepartment(myProfile?.department || '');
    setLvAuthor(myProfile?.name || currentUser?.name || '');
    setLvCategory('annual');
    setLvCategoryCustom('');
    setLvReason('');
    setLvStartDate(todayStr());
    setLvEndDate(todayStr());
    setLvStartTime('');
    setLvEndTime('');
    setLvAnnualNote('');
    setLvHomeContact('');
    setLvMobileContact(myProfile?.phoneMobile || '');
    setLvActingPerson('');
    setLvSubmittedDate(todayStr());
    setLvApprovalLine(defaultLeaveApprovalLine());
    setEditingLeaveId(null);
  };

  const openNewAdvance = () => { resetAdvanceForm(); setIsAdvanceModalOpen(true); };

  const openEditAdvance = (doc: AdvancePaymentSettlement) => {
    setEditingAdvanceId(doc.id);
    setApCompanyName(doc.companyName);
    setApPeriodStart(doc.periodStart);
    setApPeriodEnd(doc.periodEnd);
    setApDepartment(doc.department);
    setApAuthor(doc.author);
    setApDraftDate(doc.draftDate);
    setApItems(doc.items || []);
    setApApprovalLine(doc.approvalLine && doc.approvalLine.length ? doc.approvalLine : defaultAdvanceApprovalLine());
    setIsAdvanceModalOpen(true);
  };

  const openNewLeave = () => { resetLeaveForm(); setIsLeaveModalOpen(true); };

  const openEditLeave = (doc: LeaveRequest) => {
    setEditingLeaveId(doc.id);
    setLvDraftNumber(doc.draftNumber);
    setLvDepartment(doc.department);
    setLvAuthor(doc.author);
    setLvCategory(doc.leaveCategory);
    setLvCategoryCustom(doc.leaveCategoryCustom || '');
    setLvReason(doc.reason || '');
    setLvStartDate(doc.startDate);
    setLvEndDate(doc.endDate);
    setLvStartTime(doc.startTime || '');
    setLvEndTime(doc.endTime || '');
    setLvAnnualNote(doc.annualLeaveNote || '');
    setLvHomeContact(doc.homeContact || '');
    setLvMobileContact(doc.mobileContact || '');
    setLvActingPerson(doc.actingPerson || '');
    setLvSubmittedDate(doc.submittedDate);
    setLvApprovalLine(doc.approvalLine && doc.approvalLine.length ? doc.approvalLine : defaultLeaveApprovalLine());
    setIsLeaveModalOpen(true);
  };

  const addApItem = () => {
    setApItems(prev => [...prev, { id: `api-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, date: todayStr(), project: '', description: '', amount: 0, account: '', companyName: '', remark: '' }]);
  };
  const updateApItem = (id: string, patch: Partial<AdvancePaymentItem>) => {
    setApItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  };
  const removeApItem = (id: string) => {
    setApItems(prev => prev.filter(it => it.id !== id));
  };
  const apTotal = apItems.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

  const saveAdvance = async () => {
    if (!apCompanyName.trim()) { alert('회사명을 입력해 주세요.'); return; }
    if (!currentUser) return;
    const headers = { 'Content-Type': 'application/json', 'x-user-id': currentUser.id };
    const payload: Partial<AdvancePaymentSettlement> = {
      companyName: apCompanyName, periodStart: apPeriodStart, periodEnd: apPeriodEnd,
      department: apDepartment, author: apAuthor, draftDate: apDraftDate,
      items: apItems, approvalLine: apApprovalLine
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
    if (!lvAuthor.trim()) { alert('휴가자를 입력해 주세요.'); return; }
    if (!lvStartDate || !lvEndDate) { alert('휴가 기간을 입력해 주세요.'); return; }
    if (!currentUser) return;
    const headers = { 'Content-Type': 'application/json', 'x-user-id': currentUser.id };
    const days = calcLeaveDays(lvStartDate, lvEndDate);
    const payload: Partial<LeaveRequest> = {
      draftNumber: lvDraftNumber, department: lvDepartment, author: lvAuthor,
      leaveCategory: lvCategory, leaveCategoryCustom: lvCategory === 'other' ? lvCategoryCustom : undefined,
      reason: lvReason, startDate: lvStartDate, endDate: lvEndDate,
      startTime: lvStartTime || undefined, endTime: lvEndTime || undefined,
      days, annualLeaveNote: lvAnnualNote || undefined,
      homeContact: lvHomeContact, mobileContact: lvMobileContact,
      actingPerson: lvActingPerson, submittedDate: lvSubmittedDate, approvalLine: lvApprovalLine
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

  // 결재선의 다음 미결 단계에 오늘 날짜로 승인 처리 (모든 단계가 끝나면 문서 상태를 승인으로 전환)
  const advanceNextApprovalStep = async (kind: 'advance' | 'leave', id: string) => {
    if (!currentUser) return;
    const list: any[] = kind === 'advance' ? advanceList : leaveList;
    const doc = list.find((d: any) => d.id === id);
    if (!doc) return;
    const line: ApprovalStep[] = [...doc.approvalLine];
    const idx = line.findIndex(s => !s.date);
    if (idx === -1) return;
    line[idx] = { ...line[idx], date: todayStr() };
    const allDone = line.every(s => !!s.date);
    const headers = { 'Content-Type': 'application/json', 'x-user-id': currentUser.id };
    const body = JSON.stringify({ approvalLine: line, status: allDone ? 'approved' : 'pending' });
    if (kind === 'advance') {
      const res = await fetch(`/api/approvals/advance/${id}`, { method: 'PUT', headers, body });
      const updated = await res.json();
      setAdvanceList(prev => prev.map(d => d.id === id ? updated : d));
    } else {
      const res = await fetch(`/api/approvals/leave/${id}`, { method: 'PUT', headers, body });
      const updated = await res.json();
      setLeaveList(prev => prev.map(d => d.id === id ? updated : d));
    }
  };

  const rejectDoc = async (kind: 'advance' | 'leave', id: string) => {
    if (!currentUser) return;
    const memo = prompt('반려 사유를 입력해 주세요.') || '';
    const headers = { 'Content-Type': 'application/json', 'x-user-id': currentUser.id };
    const body = JSON.stringify({ status: 'rejected', approverMemo: memo });
    if (kind === 'advance') {
      const res = await fetch(`/api/approvals/advance/${id}`, { method: 'PUT', headers, body });
      const updated = await res.json();
      setAdvanceList(prev => prev.map(d => d.id === id ? updated : d));
    } else {
      const res = await fetch(`/api/approvals/leave/${id}`, { method: 'PUT', headers, body });
      const updated = await res.json();
      setLeaveList(prev => prev.map(d => d.id === id ? updated : d));
    }
  };

  const ApprovalLineMini: React.FC<{ line: ApprovalStep[] }> = ({ line }) => (
    <div className="flex items-center gap-1 flex-wrap">
      {line.map((s, i) => (
        <span key={i} className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${s.date ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
          {s.role}{s.date ? ` ✓ ${s.date}` : ''}
        </span>
      ))}
    </div>
  );

  const ApprovalLineEditor: React.FC<{ line: ApprovalStep[]; setLine: (v: ApprovalStep[]) => void }> = ({ line, setLine }) => (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-slate-300">결재선</label>
      <div className="grid grid-cols-4 gap-2">
        {line.map((step, idx) => (
          <input key={idx} type="text" value={step.role} placeholder={`결재${idx + 1}`}
            onChange={(e) => setLine(line.map((s, i) => i === idx ? { ...s, role: e.target.value } : s))}
            className="px-2 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* 전자결재 하위 탭 */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveApprovalTab('advance')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
            activeApprovalTab === 'advance' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>가지급금 정산서</span>
          <span className="px-1.5 py-0.2 rounded-full text-[11px] bg-slate-800 text-slate-300 font-mono">{advanceList.length}</span>
        </button>
        <button
          onClick={() => setActiveApprovalTab('leave')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
            activeApprovalTab === 'leave' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
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
            <button onClick={openNewAdvance} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm shadow-md shadow-blue-600/25 transition-all active:scale-95">
              <Plus className="w-4 h-4" /><span>가지급금 정산서 작성</span>
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
                const total = (doc.items || []).reduce((s, it) => s + (Number(it.amount) || 0), 0);
                return (
                  <div key={doc.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-slate-100 truncate">{doc.companyName} 가지급금 정산서</h3>
                          <StatusBadge status={doc.status} />
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                          <span className="flex items-center gap-1"><UserIcon className="w-3 h-3" />{doc.author}</span>
                          <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{doc.department}</span>
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{doc.periodStart} ~ {doc.periodEnd}</span>
                        </div>
                        <ApprovalLineMini line={doc.approvalLine} />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openPrintWindow('가지급금 정산서', buildAdvancePrintHtml(doc))} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition-colors" title="인쇄">
                          <Printer className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEditAdvance(doc)} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-blue-400 transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteAdvance(doc.id)} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-rose-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="text-xs bg-slate-950/50 rounded-xl p-3 flex items-center justify-between">
                      <span className="text-slate-500">정산 항목 {doc.items.length}건</span>
                      <span className="font-bold text-slate-200">총 합계 {formatCurrencyInput(total)}원</span>
                    </div>

                    {doc.status === 'pending' && (
                      <div className="flex items-center gap-2 pt-1">
                        <button onClick={() => advanceNextApprovalStep('advance', doc.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-bold border border-emerald-600/30 transition-colors">
                          <Check className="w-3.5 h-3.5" /> 다음 결재 승인
                        </button>
                        <button onClick={() => rejectDoc('advance', doc.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 text-xs font-bold border border-rose-600/30 transition-colors">
                          <X className="w-3.5 h-3.5" /> 반려
                        </button>
                      </div>
                    )}
                    {doc.status === 'rejected' && doc.approverMemo && (
                      <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">반려 사유: {doc.approverMemo}</p>
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
            <button onClick={openNewLeave} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm shadow-md shadow-blue-600/25 transition-all active:scale-95">
              <Plus className="w-4 h-4" /><span>휴가 신청서 작성</span>
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
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-100 truncate">{doc.author}님 휴가 신청서</h3>
                        <StatusBadge status={doc.status} />
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                          {doc.leaveCategory === 'other' ? (doc.leaveCategoryCustom || '기타') : LEAVE_CATEGORY_LABEL[doc.leaveCategory]}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{doc.draftNumber}</span>
                        <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{doc.department}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{doc.startDate} ~ {doc.endDate}{doc.startTime ? ` (${doc.startTime}~${doc.endTime || ''})` : ''} · {doc.days}일</span>
                      </div>
                      {doc.reason && <p className="text-xs text-slate-500">{doc.reason}</p>}
                      <ApprovalLineMini line={doc.approvalLine} />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => openPrintWindow('휴가 신청서', buildLeavePrintHtml(doc))} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition-colors" title="인쇄">
                        <Printer className="w-4 h-4" />
                      </button>
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
                      <button onClick={() => advanceNextApprovalStep('leave', doc.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-bold border border-emerald-600/30 transition-colors">
                        <Check className="w-3.5 h-3.5" /> 다음 결재 승인
                      </button>
                      <button onClick={() => rejectDoc('leave', doc.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 text-xs font-bold border border-rose-600/30 transition-colors">
                        <X className="w-3.5 h-3.5" /> 반려
                      </button>
                    </div>
                  )}
                  {doc.status === 'rejected' && doc.approverMemo && (
                    <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">반려 사유: {doc.approverMemo}</p>
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
                <Wallet className="w-5 h-5 text-blue-400" />
                {editingAdvanceId ? '가지급금 정산서 수정' : '가지급금 정산서 작성'}
              </h2>
              <button onClick={() => setIsAdvanceModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-4">
              <ApprovalLineEditor line={apApprovalLine} setLine={setApApprovalLine} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">회사명</label>
                  <input type="text" value={apCompanyName} onChange={(e) => setApCompanyName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">기안일</label>
                  <input type="date" value={apDraftDate} onChange={(e) => setApDraftDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">부서</label>
                  <input type="text" value={apDepartment} onChange={(e) => setApDepartment(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">작성자</label>
                  <input type="text" value={apAuthor} onChange={(e) => setApAuthor(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">기간 시작</label>
                  <input type="date" value={apPeriodStart} onChange={(e) => setApPeriodStart(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">기간 종료</label>
                  <input type="date" value={apPeriodEnd} onChange={(e) => setApPeriodEnd(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">정산 내역</label>
                  <button type="button" onClick={addApItem} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-bold">
                    <Plus className="w-3.5 h-3.5" /> 내역 추가
                  </button>
                </div>
                {apItems.length === 0 && (
                  <div className="text-xs text-slate-500 text-center py-4 bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                    정산 내역이 없습니다. "내역 추가"를 눌러 등록해 주세요.
                  </div>
                )}
                <div className="space-y-2">
                  {apItems.map(item => (
                    <div key={item.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <input type="date" value={item.date} onChange={(e) => updateApItem(item.id, { date: e.target.value })}
                          className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <input type="text" placeholder="프로젝트명" value={item.project} onChange={(e) => updateApItem(item.id, { project: e.target.value })}
                          className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <input type="text" placeholder="계정과목" value={item.account} onChange={(e) => updateApItem(item.id, { account: e.target.value })}
                          className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <input type="text" placeholder="상호" value={item.companyName} onChange={(e) => updateApItem(item.id, { companyName: e.target.value })}
                          className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px_1fr_36px] gap-2 items-center">
                        <input type="text" placeholder="내용" value={item.description} onChange={(e) => updateApItem(item.id, { description: e.target.value })}
                          className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <input type="text" inputMode="numeric" placeholder="금액" value={formatCurrencyInput(item.amount)}
                          onChange={(e) => updateApItem(item.id, { amount: parseCurrencyInput(e.target.value) })}
                          className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <input type="text" placeholder="비고" value={item.remark} onChange={(e) => updateApItem(item.id, { remark: e.target.value })}
                          className="px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <button type="button" onClick={() => removeApItem(item.id)} className="p-2 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-rose-400 justify-self-center">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-950/50 rounded-xl p-3 text-right text-sm">
                <span className="text-slate-500 mr-2">총 합계</span>
                <span className="font-bold text-slate-100">{formatCurrencyInput(apTotal)}원</span>
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
              <button onClick={() => setIsLeaveModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-4">
              <ApprovalLineEditor line={lvApprovalLine} setLine={setLvApprovalLine} />

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">기안번호</label>
                <input type="text" value={lvDraftNumber} onChange={(e) => setLvDraftNumber(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm font-mono" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">소속</label>
                  <input type="text" value={lvDepartment} onChange={(e) => setLvDepartment(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">휴가자</label>
                  <input type="text" value={lvAuthor} onChange={(e) => setLvAuthor(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">휴가 구분</label>
                <div className="flex flex-wrap gap-2">
                  {LEAVE_CATEGORY_ORDER.map(c => (
                    <button key={c} type="button" onClick={() => setLvCategory(c)}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${lvCategory === c ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'}`}>
                      {LEAVE_CATEGORY_LABEL[c]}
                    </button>
                  ))}
                </div>
                {lvCategory === 'other' && (
                  <input type="text" placeholder="휴가 구분 직접 입력" value={lvCategoryCustom} onChange={(e) => setLvCategoryCustom(e.target.value)}
                    className="w-full mt-2 px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">사유</label>
                <textarea rows={2} value={lvReason} onChange={(e) => setLvReason(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm resize-none" />
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
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">시작 시간 (반차 등, 선택)</label>
                  <input type="time" value={lvStartTime} onChange={(e) => setLvStartTime(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">종료 시간 (선택)</label>
                  <input type="time" value={lvEndTime} onChange={(e) => setLvEndTime(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
              </div>

              <div className="text-xs text-slate-400 bg-slate-950/50 rounded-xl px-4 py-2.5">
                산정된 휴가 일수: <span className="font-bold text-slate-200">{calcLeaveDays(lvStartDate, lvEndDate)}일</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">연차 사용/잔여 표기 (선택, 예: 5일/20일)</label>
                <input type="text" placeholder="5일/20일" value={lvAnnualNote} onChange={(e) => setLvAnnualNote(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">자택 연락처</label>
                  <input type="text" value={lvHomeContact} onChange={(e) => setLvHomeContact(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">휴대폰</label>
                  <input type="text" value={lvMobileContact} onChange={(e) => setLvMobileContact(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">직무 대행자</label>
                  <input type="text" value={lvActingPerson} onChange={(e) => setLvActingPerson(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">신청일</label>
                  <input type="date" value={lvSubmittedDate} onChange={(e) => setLvSubmittedDate(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
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
