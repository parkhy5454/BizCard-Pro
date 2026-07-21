import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Wallet, Plane, Plus, Trash2, Edit2, X, Check, Clock, CheckCircle2, XCircle,
  Printer, Calendar, User as UserIcon, Briefcase, Hash, FileSpreadsheet, Eye,
  Download, ClipboardList, Car, Wrench, ChevronDown
} from 'lucide-react';
import { AdvancePaymentSettlement, AdvancePaymentItem, LeaveRequest, LeaveCategory, LeaveSpecialType, LeaveAnnualType, ApprovalStatus, ApprovalStep, User } from '../types.js';
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
  special: '특별휴가',
  health: '보건',
  other: '기타'
};

const LEAVE_CATEGORY_ORDER: LeaveCategory[] = ['monthly', 'annual', 'official', 'sick', 'special', 'health', 'other'];

const SPECIAL_TYPE_LABEL: Record<LeaveSpecialType, string> = {
  birth: '출산', summer: '하기', family: '경조', disaster: '재해', custom: '직접입력'
};
const SPECIAL_TYPE_ORDER: LeaveSpecialType[] = ['birth', 'summer', 'family', 'disaster', 'custom'];

const ANNUAL_TYPE_LABEL: Record<LeaveAnnualType, string> = {
  full: '년차(1일)', half: '반차(4시간)', quarter: '반반차(2시간)'
};
const ANNUAL_TYPE_ORDER: LeaveAnnualType[] = ['full', 'half', 'quarter'];
const ANNUAL_TYPE_MULTIPLIER: Record<LeaveAnnualType, number> = { full: 1, half: 0.5, quarter: 0.25 };
const ANNUAL_TYPE_HOURS: Record<LeaveAnnualType, number> = { full: 0, half: 4, quarter: 2 };

// 목록/뱃지 등에 보여줄 휴가구분 표시 텍스트 (특별휴가는 세부종류까지 함께 표기)
function leaveCategoryDisplay(doc: LeaveRequest): string {
  if (doc.leaveCategory === 'special') {
    const sub = doc.specialType === 'custom' ? (doc.specialTypeCustom || '직접입력') : SPECIAL_TYPE_LABEL[doc.specialType || 'birth'];
    return `특별휴가(${sub})`;
  }
  if (doc.leaveCategory === 'annual' && doc.annualType && doc.annualType !== 'full') {
    return `연차(${ANNUAL_TYPE_LABEL[doc.annualType]})`;
  }
  if (doc.leaveCategory === 'other') return doc.leaveCategoryCustom || '기타';
  return LEAVE_CATEGORY_LABEL[doc.leaveCategory];
}

// "기간" 칸에 표시할 연차 누적 문구를 저장된 문자열에 의존하지 않고, 볼 때마다 전체 휴가 목록에서
// 새로 계산한다 (저장 당시 스냅샷이 아니라 항상 최신 값을 보여주기 위함).
function computeAnnualLeaveLabel(doc: LeaveRequest, allLeave: LeaveRequest[]): string {
  if (!doc.totalAnnualDays) {
    return doc.annualLeaveNote || `${doc.days}일`;
  }
  const year = (doc.startDate || '').slice(0, 4);
  const normalizedAuthor = (doc.author || '').trim().toLowerCase();
  // 같은 해에 이 사람이 신청한 휴가 중, 이 문서와 같은 날짜이거나 그보다 이전인 것까지만 누적한다
  // (전체 합계가 아니라, 그 시점까지의 누적 사용량을 보여주기 위함). 날짜가 같으면 작성 시각으로 순서를 정한다.
  const cumulative = allLeave
    .filter(d => {
      if ((d.author || '').trim().toLowerCase() !== normalizedAuthor) return false;
      if ((d.startDate || '').slice(0, 4) !== year) return false;
      if (d.status === 'rejected') return false;
      const dDate = d.startDate || '';
      const docDate = doc.startDate || '';
      if (dDate !== docDate) return dDate < docDate;
      // 같은 날짜에 시작하는 건들은 작성 시각(먼저 만든 것부터) 순서로 판단
      return (d.createdAt || '') <= (doc.createdAt || '');
    })
    .reduce((sum, d) => sum + (d.days || 0), 0);
  const rounded = Math.round(cumulative * 100) / 100;
  const remaining = Math.round((doc.totalAnnualDays - rounded) * 100) / 100;
  return `${rounded}일/총${doc.totalAnnualDays}일, 잔여 ${remaining}일`;
}

// 업무일지/차량운행일지에서 가져올 수 있는 비용 한 건을 표현하는 공통 형태
interface ImportableExpenseRow {
  id: string;           // 원본 항목 고유 ID (선택 상태 추적용)
  date: string;
  project: string;
  description: string;
  amount: number;
  account: string;       // 계정과목(카테고리) 라벨
  companyName: string;    // 상호
  remark: string;
  payMethodLabel: string; // 결제수단 라벨(개인카드/현금 등)
}

const WORKLOG_EXPENSE_LABEL: Record<string, string> = {
  breakfast: '조식', lunch: '중식', dinner: '석식', drinks: '음료',
  fuel: '주유비', parking: '주차비', proxy: '대리운전비', purchase: '물품구입', custom: '기타'
};
const VEHICLE_EXPENSE_LABEL: Record<string, string> = {
  fuel: '주유비', toll: '통행료', parking: '주차비', maintenance: '정비비',
  tax_insurance: '세금/보험', other: '기타', agency_drive: '대리운전비',
  beverage: '음료', meal: '식대', supplies: '물품구입', custom: '기타'
};

// 년/월/일을 각각 따로 입력하고, 자리수가 채워지면 자동으로 다음 칸(월→일)으로 커서가 넘어가는 날짜 입력.
// 데이터 형태는 기존과 동일하게 'YYYY-MM-DD' 문자열을 그대로 주고받는다.

const YMDInput: React.FC<{ value: string; onChange: (v: string) => void; className?: string }> = ({ value, onChange, className }) => {
  const initial = value ? value.split('-') : ['', '', ''];
  const [y, setY] = useState(initial[0] || '');
  const [m, setM] = useState(initial[1] || '');
  const [d, setD] = useState(initial[2] || '');
  const yRef = React.useRef<HTMLInputElement>(null);
  const mRef = React.useRef<HTMLInputElement>(null);
  const dRef = React.useRef<HTMLInputElement>(null);
  // 포커스가 들어오기 직전 값을 기억해뒀다가, 아무것도 입력하지 않고 포커스가 빠져나가면 원래 값으로 되돌린다
  const yPrev = React.useRef('');
  const mPrev = React.useRef('');
  const dPrev = React.useRef('');

  // 부모가 값을 외부에서 바꿔 넣을 때(예: 수정 모달을 열 때)만 내부 표시값을 새로 맞춘다.
  useEffect(() => {
    const p = value ? value.split('-') : ['', '', ''];
    setY(p[0] || ''); setM(p[1] || ''); setD(p[2] || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (ny: string, nm: string, nd: string) => {
    if (ny.length === 4 && nm.length > 0 && nd.length > 0) {
      onChange(`${ny}-${nm.padStart(2, '0')}-${nd.padStart(2, '0')}`);
    }
  };

  const inputCls = "px-1.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className={`flex items-center gap-1 ${className || ''}`}>
      <input
        ref={yRef} type="text" inputMode="numeric" placeholder="YYYY" value={y}
        autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} name="ymd-year-field"
        // 포커스가 들어오면 일단 비워서, 커서 위치나 브라우저별 select() 동작에 상관없이
        // 항상 빈 칸에 새로 입력하는 것처럼 동작하게 한다 (기존 "0"이 남아있던 문제의 근본 원인).
        onFocus={(e) => { yPrev.current = y; e.currentTarget.value = ''; setY(''); }}
        onBlur={() => { if (y === '') setY(yPrev.current); }}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 4);
          setY(v);
          if (v.length === 4) mRef.current?.focus();
          emit(v, m, d);
        }}
        className={`${inputCls} w-14`}
      />
      <span className="text-slate-500 text-xs">년</span>
      <input
        ref={mRef} type="text" inputMode="numeric" placeholder="MM" value={m}
        autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} name="ymd-month-field"
        onFocus={(e) => { mPrev.current = m; e.currentTarget.value = ''; setM(''); }}
        onBlur={() => { if (m === '') setM(mPrev.current); }}
        onKeyDown={(e) => { if (e.key === 'Backspace' && m === '') yRef.current?.focus(); }}
        onChange={(e) => {
          let v = e.target.value.replace(/\D/g, '').slice(0, 2);
          if (v.length === 2 && Number(v) > 12) v = '12';
          setM(v);
          if (v.length === 2) dRef.current?.focus();
          emit(y, v, d);
        }}
        className={`${inputCls} w-10`}
      />
      <span className="text-slate-500 text-xs">월</span>
      <input
        ref={dRef} type="text" inputMode="numeric" placeholder="DD" value={d}
        autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} name="ymd-day-field"
        onFocus={(e) => { dPrev.current = d; e.currentTarget.value = ''; setD(''); }}
        onBlur={() => { if (d === '') setD(dPrev.current); }}
        onKeyDown={(e) => { if (e.key === 'Backspace' && d === '') mRef.current?.focus(); }}
        onChange={(e) => {
          let v = e.target.value.replace(/\D/g, '').slice(0, 2);
          if (v.length === 2 && Number(v) > 31) v = '31';
          setD(v);
          emit(y, m, v);
        }}
        className={`${inputCls} w-10`}
      />
      <span className="text-slate-500 text-xs">일</span>
    </div>
  );
};

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

// 'YYYY-MM-DD' -> 'YYYY년 MM월 DD일'
function formatKoreanDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [y, m, d] = parts;
  return `${y}년 ${m}월 ${d}일`;
}

function formatKoreanPeriod(start: string, end: string): string {
  if (!start && !end) return '';
  return `${formatKoreanDate(start)} ~ ${formatKoreanDate(end)}`;
}

// 숫자만 입력해도 한국 전화번호 형식(02-XXXX-XXXX / 010-XXXX-XXXX 등)으로 자동으로 하이픈이 붙는 유틸
function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.startsWith('02')) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 4)}-${digits.slice(-4)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

// 반차(4시간)/반반차(2시간) 선택 시, 시작 시간을 입력하면 종료 시간을 자동으로 계산하기 위한 유틸
// 반차(4시간)/반반차(2시간) 선택 시, 시작 시간을 입력하면 종료 시간을 자동으로 계산하기 위한 유틸.
// 점심시간(12:00~13:00)은 근무 시간에서 제외하고, 순수 업무 시간(09:00~12:00, 13:00~18:00)만 적산한다.
const LUNCH_START_MIN = 12 * 60;   // 12:00
const LUNCH_END_MIN = 13 * 60;     // 13:00

function addHoursToTime(time: string, hours: number): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';

  let current = h * 60 + m;
  let remaining = Math.round(hours * 60);

  // 시작 시각이 점심시간 한복판이면 점심이 끝난 시각부터 적산 시작
  if (current >= LUNCH_START_MIN && current < LUNCH_END_MIN) {
    current = LUNCH_END_MIN;
  }

  // 점심시간 전이라면, 점심 전까지 쓸 수 있는 시간만큼 먼저 채우고 모자라면 점심을 건너뛴다
  if (current < LUNCH_START_MIN) {
    const availableBeforeLunch = LUNCH_START_MIN - current;
    if (remaining <= availableBeforeLunch) {
      current += remaining;
      remaining = 0;
    } else {
      remaining -= availableBeforeLunch;
      current = LUNCH_END_MIN;
    }
  }

  current += remaining;
  current = ((current % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(current / 60)).padStart(2, '0');
  const mm = String(current % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

// 전체 연차 일수는 매번 새로 입력하지 않도록, 휴가자 이름 기준으로 브라우저에 저장해두고 재사용한다
function getStoredTotalAnnualDays(author: string): number {
  try {
    const v = localStorage.getItem(`leave_total_annual_days:${author || 'default'}`);
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : 15;
  } catch {
    return 15;
  }
}
function setStoredTotalAnnualDays(author: string, days: number) {
  try {
    localStorage.setItem(`leave_total_annual_days:${author || 'default'}`, String(days));
  } catch {
    // localStorage 접근 불가 환경은 조용히 무시
  }
}

function calcLeaveDays(startDate: string, endDate: string, multiplier: number = 1): number {
  if (!startDate || !endDate) return 0;
  const s = new Date(startDate);
  const e = new Date(endDate);
  const calendarDays = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (calendarDays <= 0) return 0;
  // 반차/반반차처럼 소수 단위가 되는 경우 부동소수점 오차를 피하기 위해 반올림
  return Math.round(calendarDays * multiplier * 100) / 100;
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

export const ElectronicApprovalView: React.FC<Props> = ({ currentUser }) => {
  const [activeApprovalTab, setActiveApprovalTab] = useState<'advance' | 'leave'>('advance');

  const [advanceList, setAdvanceList] = useState<AdvancePaymentSettlement[]>([]);
  const [leaveList, setLeaveList] = useState<LeaveRequest[]>([]);
  const [myProfile, setMyProfile] = useState<any>(null);
  const [companyPositions, setCompanyPositions] = useState<string[]>([]);
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

  // 업무일지/차량운행일지 비용 가져오기
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importTab, setImportTab] = useState<'worklog' | 'vehicle' | 'maintenance'>('worklog');
  const [importWorklogRows, setImportWorklogRows] = useState<ImportableExpenseRow[]>([]);
  const [importVehicleRows, setImportVehicleRows] = useState<ImportableExpenseRow[]>([]);
  const [importMaintenanceRows, setImportMaintenanceRows] = useState<ImportableExpenseRow[]>([]);
  const [importSelectedIds, setImportSelectedIds] = useState<Set<string>>(new Set());
  const [importLoading, setImportLoading] = useState(false);
  const [importProjectFilter, setImportProjectFilter] = useState<string>('all');

  // 항목별 "프로젝트명" 칸을 클릭하면 개인카드/현금 사용 내역 중에서 골라 그 줄을 채울 수 있게 하는 선택기
  const [itemPickerForId, setItemPickerForId] = useState<string | null>(null);
  const [itemPickerRows, setItemPickerRows] = useState<ImportableExpenseRow[]>([]);
  const [itemPickerLoading, setItemPickerLoading] = useState(false);

  // 가지급금 정산서 화면 출력(미리보기) - 주간업무일지/차량운행일지와 동일하게 화면에 그대로 보여준 뒤 엑셀/PDF로 출력
  const [previewAdvanceId, setPreviewAdvanceId] = useState<string | null>(null);
  // 휴가 신청서 화면 출력(미리보기)
  const [previewLeaveId, setPreviewLeaveId] = useState<string | null>(null);

  // 휴가 신청서 폼 상태
  const [lvDraftNumber, setLvDraftNumber] = useState('');
  const [lvDepartment, setLvDepartment] = useState('');
  const [lvAuthor, setLvAuthor] = useState('');
  const [lvCategory, setLvCategory] = useState<LeaveCategory>('annual');
  const [lvCategoryCustom, setLvCategoryCustom] = useState('');
  const [lvSpecialType, setLvSpecialType] = useState<LeaveSpecialType>('birth');
  const [lvSpecialTypeCustom, setLvSpecialTypeCustom] = useState('');
  const [lvSpecialDropdownOpen, setLvSpecialDropdownOpen] = useState(false);
  const [lvAnnualType, setLvAnnualType] = useState<LeaveAnnualType>('full');
  const [lvAnnualDropdownOpen, setLvAnnualDropdownOpen] = useState(false);
  const [lvReason, setLvReason] = useState('');
  const [lvStartDate, setLvStartDate] = useState(todayStr());
  const [lvEndDate, setLvEndDate] = useState(todayStr());
  const [lvStartTime, setLvStartTime] = useState('');
  const [lvEndTime, setLvEndTime] = useState('');
  const [lvAnnualNote, setLvAnnualNote] = useState('');
  const [lvTotalAnnualDays, setLvTotalAnnualDays] = useState<number>(15);
  const [lvHomeContact, setLvHomeContact] = useState('');
  const [lvMobileContact, setLvMobileContact] = useState('');
  const [lvActingPerson, setLvActingPerson] = useState('');
  const [lvSubmittedDate, setLvSubmittedDate] = useState(todayStr());
  const [lvApprovalLine, setLvApprovalLine] = useState<ApprovalStep[]>(defaultLeaveApprovalLine());

  useEffect(() => {
    fetchAll();
    fetchMyProfile();
    fetchCompanyPositions();
  }, [currentUser]);

  // 총 연차 일수가 입력되어 있으면, 휴가 구분과 무관하게 같은 해에 그 사람이 이미 사용한 휴가일수
  // (현재 작성 중인 문서 제외) + 이번 신청 일수를 더해 "누적 12/20일" 형태로 자동 계산해 표시한다.
  useEffect(() => {
    const totalDays = lvTotalAnnualDays || 0;
    if (!totalDays) return;
    const currentDays = calcLeaveDays(lvStartDate, lvEndDate, lvCategory === 'annual' ? ANNUAL_TYPE_MULTIPLIER[lvAnnualType] : 1);
    const year = (lvStartDate || todayStr()).slice(0, 4);
    const normalizedAuthor = (lvAuthor || '').trim().toLowerCase();
    const priorUsed = leaveList
      .filter(d =>
        d.id !== editingLeaveId &&
        (d.author || '').trim().toLowerCase() === normalizedAuthor &&
        (d.startDate || '').slice(0, 4) === year &&
        d.status !== 'rejected' &&
        (d.startDate || '') <= (lvStartDate || '')
      )
      .reduce((sum, d) => sum + (d.days || 0), 0);
    const cumulative = Math.round((priorUsed + currentDays) * 100) / 100;
    const remaining = Math.round((totalDays - cumulative) * 100) / 100;
    setLvAnnualNote(`${cumulative}일/총${totalDays}일, 잔여 ${remaining}일`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lvCategory, lvStartDate, lvEndDate, lvAnnualType, lvTotalAnnualDays, lvAuthor, leaveList, editingLeaveId]);

  const fetchMyProfile = async () => {
    try {
      const res = await fetch('/api/my-profile');
      if (res.ok) setMyProfile(await res.json());
    } catch (err) {
      console.error('My profile fetch error:', err);
    }
  };

  // 결재선 입력 시 자동완성 후보로 쓸, 같은 회사 소속 가입자들의 직책 목록
  // (오타로 결재 요청 이메일이 매칭 실패하는 걸 줄이기 위한 힌트일 뿐, 강제 선택은 아님)
  const fetchCompanyPositions = async () => {
    try {
      const res = await fetch('/api/auth/users');
      if (!res.ok) return;
      const allUsers = await res.json();
      const mine = currentUser;
      if (!mine || mine.type !== 'company') return;
      const positions = allUsers
        .filter((u: any) =>
          u.type === 'company' &&
          (u.companyName || '').trim() === (mine.companyName || '').trim() &&
          (u.businessNumber || '').trim() === (mine.businessNumber || '').trim() &&
          u.position
        )
        .map((u: any) => u.position as string);
      setCompanyPositions(Array.from(new Set(positions)));
    } catch (err) {
      console.error('Company positions fetch error:', err);
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const headers = currentUser ? { 'x-user-id': currentUser.id } : undefined;
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
    setItemPickerForId(null);
  };

  const resetLeaveForm = () => {
    setLvDraftNumber(makeDraftNumber(leaveList.map(l => l.draftNumber || '')));
    setLvDepartment(myProfile?.department || '');
    const resolvedAuthor = myProfile?.name || currentUser?.name || '';
    setLvAuthor(resolvedAuthor);
    setLvCategory('annual');
    setLvCategoryCustom('');
    setLvSpecialType('birth');
    setLvSpecialTypeCustom('');
    setLvSpecialDropdownOpen(false);
    setLvAnnualType('full');
    setLvAnnualDropdownOpen(false);
    setLvReason('');
    setLvStartDate(todayStr());
    setLvEndDate(todayStr());
    setLvStartTime('');
    setLvEndTime('');
    setLvAnnualNote('');
    setLvTotalAnnualDays(getStoredTotalAnnualDays(resolvedAuthor));
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
    setLvSpecialType(doc.specialType || 'birth');
    setLvSpecialTypeCustom(doc.specialTypeCustom || '');
    setLvAnnualType(doc.annualType || 'full');
    setLvReason(doc.reason || '');
    setLvStartDate(doc.startDate);
    setLvEndDate(doc.endDate);
    setLvStartTime(doc.startTime || '');
    setLvEndTime(doc.endTime || '');
    setLvAnnualNote(doc.annualLeaveNote || '');
    setLvTotalAnnualDays(doc.totalAnnualDays ?? getStoredTotalAnnualDays(doc.author));
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

  // 업무일지(일일) / 차량운행 비용 목록을 불러와 가져오기 후보로 준비
  // 업무일지/차량운행일지에서 개인카드·현금으로 결제한 항목을 불러온다 (가져오기 모달, 항목별 프로젝트명 선택 두 곳에서 공용으로 사용)
  const fetchImportableRows = async (): Promise<{ worklogRows: ImportableExpenseRow[]; vehicleRows: ImportableExpenseRow[]; maintenanceRows: ImportableExpenseRow[] }> => {
    const headers = currentUser ? { 'x-user-id': currentUser.id } : undefined;
    const [dailyLogs, projects, vehicleExpenses, maintenances] = await Promise.all([
      fetch('/api/worklogs/daily', { headers }).then(r => r.json()).catch(() => []),
      fetch('/api/projects', { headers }).then(r => r.json()).catch(() => []),
      fetch('/api/vehicles/expenses', { headers }).then(r => r.json()).catch(() => []),
      fetch('/api/vehicles/maintenances', { headers }).then(r => r.json()).catch(() => [])
    ]);

    const projectNameById: Record<string, string> = {};
    if (Array.isArray(projects)) {
      projects.forEach((p: any) => { projectNameById[p.id] = p.name || p.title || ''; });
    }

    const worklogRows: ImportableExpenseRow[] = [];
    if (Array.isArray(dailyLogs)) {
      dailyLogs.forEach((log: any) => {
        const projectLabel = (log.projectIds || []).map((pid: string) => projectNameById[pid]).filter(Boolean).join(', ');
        (log.expenses || [])
          .filter((exp: any) => exp.payMethod === 'personal_card' || exp.payMethod === 'cash_personal')
          .forEach((exp: any) => {
            worklogRows.push({
              id: `wl-${exp.id}`,
              date: log.date,
              project: projectLabel,
              description: exp.memo || WORKLOG_EXPENSE_LABEL[exp.category] || exp.categoryCustom || '',
              amount: exp.amount || 0,
              account: exp.categoryCustom || WORKLOG_EXPENSE_LABEL[exp.category] || '',
              companyName: '',
              remark: '업무일지',
              payMethodLabel: exp.payMethod === 'cash_personal' ? '개인현금' : '개인카드'
            });
          });
      });
    }

    const vehicleRows: ImportableExpenseRow[] = [];
    if (Array.isArray(vehicleExpenses)) {
      vehicleExpenses
        .filter((exp: any) => exp.payMethod === 'personal_card' || exp.payMethod === 'cash')
        .forEach((exp: any) => {
          vehicleRows.push({
            id: `veh-${exp.id}`,
            date: exp.date,
            project: exp.projectName || '',
            description: exp.memo || VEHICLE_EXPENSE_LABEL[exp.category] || exp.categoryCustom || '',
            amount: exp.amount || 0,
            account: exp.categoryCustom || VEHICLE_EXPENSE_LABEL[exp.category] || '',
            companyName: exp.merchantName || '',
            remark: '차량 비용관리',
            payMethodLabel: exp.payMethod === 'cash' ? '현금' : '개인카드'
          });
        });
    }

    const maintenanceRows: ImportableExpenseRow[] = [];
    if (Array.isArray(maintenances)) {
      maintenances
        .filter((m: any) => m.payMethod === 'personal_card' || m.payMethod === 'cash')
        .forEach((m: any) => {
          maintenanceRows.push({
            id: `maint-${m.id}`,
            date: m.date,
            project: '',
            description: m.title || '정비',
            amount: m.cost || 0,
            account: '정비비',
            companyName: m.shopName || '',
            remark: '정비일지',
            payMethodLabel: m.payMethod === 'cash' ? '현금' : '개인카드'
          });
        });
    }

    worklogRows.sort((a, b) => (a.date < b.date ? 1 : -1));
    vehicleRows.sort((a, b) => (a.date < b.date ? 1 : -1));
    maintenanceRows.sort((a, b) => (a.date < b.date ? 1 : -1));
    return { worklogRows, vehicleRows, maintenanceRows };
  };

  const openImportModal = async () => {
    setIsImportModalOpen(true);
    setImportSelectedIds(new Set());
    setImportProjectFilter('all');
    setImportLoading(true);
    try {
      const { worklogRows, vehicleRows, maintenanceRows } = await fetchImportableRows();
      setImportWorklogRows(worklogRows);
      setImportVehicleRows(vehicleRows);
      setImportMaintenanceRows(maintenanceRows);
    } catch (err) {
      console.error('Import fetch error:', err);
    } finally {
      setImportLoading(false);
    }
  };

  // 항목의 "프로젝트명" 칸을 클릭했을 때 개인카드/현금 사용 내역 선택기를 연다
  const openItemPicker = async (itemId: string) => {
    setItemPickerForId(itemId);
    if (itemPickerRows.length === 0) {
      setItemPickerLoading(true);
      try {
        const { worklogRows, vehicleRows, maintenanceRows } = await fetchImportableRows();
        setItemPickerRows([...worklogRows, ...vehicleRows, ...maintenanceRows]);
      } catch (err) {
        console.error('Item picker fetch error:', err);
      } finally {
        setItemPickerLoading(false);
      }
    }
  };

  const applyItemPicker = (itemId: string, row: ImportableExpenseRow) => {
    updateApItem(itemId, {
      date: row.date, project: row.project, description: row.description,
      amount: row.amount, account: row.account, companyName: row.companyName, remark: row.remark
    });
    setItemPickerForId(null);
  };

  const toggleImportSelect = (id: string) => {
    setImportSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const applyImportedItems = () => {
    const all = [...importWorklogRows, ...importVehicleRows, ...importMaintenanceRows];
    const picked = all.filter(r => importSelectedIds.has(r.id));
    const newItems: AdvancePaymentItem[] = picked.map(r => ({
      id: `api-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: r.date, project: r.project, description: r.description,
      amount: r.amount, account: r.account, companyName: r.companyName, remark: r.remark
    }));
    setApItems(prev => [...prev, ...newItems]);
    setIsImportModalOpen(false);
  };

  // 화면에 보이는 가지급금 정산서 양식 그대로 엑셀(.xls)로 다운로드
  const downloadAdvanceToExcel = (doc: AdvancePaymentSettlement) => {
    const esc = (str: any): string => (str === null || str === undefined ? '' : String(str))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
    const cellBorder = 'border: 0.5pt solid #000000;';
    const grayBg = 'background-color: #f3f4f6;';
    const baseFont = "font-family: 'Malgun Gothic', Arial; font-size: 10pt;";
    const items = doc.items || [];
    const approvalLine = doc.approvalLine || [];
    const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);

    // 엑셀은 한 시트 안에서 열(A, B, C...)마다 폭이 하나로 고정된다. 정보표/결재표/항목표를 각각 다른
    // 열 개수의 별도 테이블로 나누면, 엑셀이 이걸 합칠 때 서로 다른 열 폭 요구가 충돌해서 결재표가
    // 항목표만큼 오른쪽까지 안 뻗어나가는 문제가 생긴다. 그래서 전체를 하나의 테이블 + 하나의 열
    // 구성(colgroup)으로 통일하고, colspan/rowspan으로 필요한 자리를 만든다.
    const COLS = [10, 22, 20, 10, 12, 12, 14]; // 7개 열, 합계 100% (Date/Project/Description/Expenses/Account/Company/Remark와 동일한 열)
    const colgroup = `<colgroup>${COLS.map(w => `<col style="width:${w}%;" />`).join('')}</colgroup>`;

    const roleCell = (role: string) => `<th style="${cellBorder} ${grayBg} text-align:center;">${esc(role)}</th>`;
    const dateCell = (d?: string) => `<td style="${cellBorder} text-align:center; height:32px;">${esc(d || '')}</td>`;

    const topHtml = `
      <table style="border-collapse: collapse; width:100%; border:1.5pt solid #000; ${baseFont} table-layout: fixed;" cellpadding="4">
        ${colgroup}
        <tr>
          <td style="${cellBorder} ${grayBg} font-weight:bold;">회사명</td>
          <td style="${cellBorder}">${esc(doc.companyName)}</td>
          <td rowspan="2" style="${cellBorder} ${grayBg} font-weight:bold; text-align:center;">결&nbsp;&nbsp;재</td>
          ${approvalLine.map(s => roleCell(s.role)).join('')}
        </tr>
        <tr>
          <td style="${cellBorder} ${grayBg} font-weight:bold;">기간</td>
          <td style="${cellBorder}">${esc(formatKoreanPeriod(doc.periodStart, doc.periodEnd))}</td>
          ${approvalLine.map(s => dateCell(s.date)).join('')}
        </tr>
        <tr>
          <td style="${cellBorder} ${grayBg} font-weight:bold;">부서</td>
          <td style="${cellBorder}" colspan="${COLS.length - 1}">${esc(doc.department)}</td>
        </tr>
        <tr>
          <td style="${cellBorder} ${grayBg} font-weight:bold;">작성자</td>
          <td style="${cellBorder}" colspan="${COLS.length - 1}">${esc(doc.author)}</td>
        </tr>
        <tr>
          <td style="${cellBorder} ${grayBg} font-weight:bold;">기안일</td>
          <td style="${cellBorder}" colspan="${COLS.length - 1}">${esc(formatKoreanDate(doc.draftDate))}</td>
        </tr>
      </table>`;

    const itemRows = items.map(it => `
      <tr>
        <td style="${cellBorder} text-align:center; ${baseFont}">${esc(it.date)}</td>
        <td style="${cellBorder} text-align:center; ${baseFont}">${esc(it.project)}</td>
        <td style="${cellBorder} text-align:left; padding-left:5px; ${baseFont}">${esc(it.description)}</td>
        <td style="${cellBorder} text-align:right; padding-right:5px; ${baseFont}">${it.amount.toLocaleString()}</td>
        <td style="${cellBorder} text-align:center; ${baseFont}">${esc(it.account)}</td>
        <td style="${cellBorder} text-align:center; ${baseFont}">${esc(it.companyName)}</td>
        <td style="${cellBorder} text-align:left; padding-left:5px; ${baseFont}">${esc(it.remark)}</td>
      </tr>`).join('');

    // 항목이 적어도 실제 전표처럼 밑에 빈 줄(테두리 있는 빈 칸)을 채워서 A4 한 장을 꽉 채운다
    const ITEMS_MIN_ROWS = 15;
    const blankRowHtml = `
      <tr>
        <td style="${cellBorder}">&nbsp;</td><td style="${cellBorder}">&nbsp;</td><td style="${cellBorder}">&nbsp;</td>
        <td style="${cellBorder}">&nbsp;</td><td style="${cellBorder}">&nbsp;</td><td style="${cellBorder}">&nbsp;</td><td style="${cellBorder}">&nbsp;</td>
      </tr>`;
    const blankRowsHtml = Array(Math.max(0, ITEMS_MIN_ROWS - items.length)).fill(blankRowHtml).join('');

    const th2 = (en: string, ko: string) => `<th style="${cellBorder} ${grayBg} text-align:center;">${en}<br/><span style="font-weight:normal; font-size:8pt;">(${ko})</span></th>`;

    const itemsTableHtml = `
      <table style="border-collapse: collapse; width:100%; border:1.5pt solid #000; ${baseFont} margin-top:14px; table-layout: fixed;" cellpadding="4">
        ${colgroup}
        <tr style="${grayBg}">
          ${th2('Date', '날짜')}${th2('Project', '프로젝트명')}
          ${th2('Description', '내용')}${th2('Expenses', '금액/원')}
          ${th2('Account', '계정과목')}${th2('Company name', '상호')}
          ${th2('Remark', '비고')}
        </tr>
        ${itemRows}
        ${blankRowsHtml}
        <tr style="${grayBg} font-weight:bold;">
          <td colspan="3" style="${cellBorder} text-align:center;">총 합계</td>
          <td style="${cellBorder} text-align:right; padding-right:5px;">${total.toLocaleString()}</td>
          <td colspan="3" style="${cellBorder}"></td>
        </tr>
      </table>`;

    const fullHtml = `
      <table style="border-collapse: collapse; width: 190mm; height: 265mm;"><tr>
      <td style="border: 2px solid #000000; box-sizing: border-box; padding: 8mm; mso-padding-alt: 23pt 23pt 23pt 23pt; vertical-align: top;">
      <div style="text-align:center; margin-bottom:16px;">
        <span style="font-size:18pt; font-weight:bold; border-bottom: 3px double #000000; padding-bottom:4px;">가지급금 정산서</span>
      </div>
      ${topHtml}
      ${itemsTableHtml}
      </td>
      </tr></table>
    `;

    const excelContent = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8">
      <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
      <x:Name>가지급금정산서</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
      </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
      </head><body>${fullHtml}</body></html>
    `;

    const blob = new Blob([excelContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `가지급금정산서_${doc.periodStart || todayStr()}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrintAdvance = () => { window.print(); };

  // 인쇄 전용 정적 렌더러: #print-root 포털에 렌더링되어 화면 미리보기와 별개로 단독 인쇄됨
  const renderPrintableAdvance = (doc: AdvancePaymentSettlement | undefined) => {
    if (!doc) return null;
    const items = doc.items || [];
    const approvalLine = doc.approvalLine || [];
    const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
    const cellStyle: React.CSSProperties = { border: '0.5pt solid #000', padding: '6px 8px', verticalAlign: 'middle' };
    const grayStyle: React.CSSProperties = { ...cellStyle, backgroundColor: '#f3f4f6', fontWeight: 700 };
    return (
      <div style={{ width: '210mm', boxSizing: 'border-box', margin: '0 auto', padding: '8mm', color: 'black', fontFamily: "'Malgun Gothic', Arial, sans-serif", fontSize: 11, border: '2px solid #000', background: 'white' }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 22, fontWeight: 800, borderBottom: '3px double #000', paddingBottom: 4 }}>가지급금 정산서</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 14 }}>
          <table style={{ borderCollapse: 'collapse', width: '55%' }}>
            <tbody>
              <tr><td style={{ ...grayStyle, width: '28%' }}>회사명</td><td style={cellStyle}>{doc.companyName}</td></tr>
              <tr><td style={grayStyle}>기간</td><td style={cellStyle}>{formatKoreanPeriod(doc.periodStart, doc.periodEnd)}</td></tr>
              <tr><td style={grayStyle}>부서</td><td style={cellStyle}>{doc.department}</td></tr>
              <tr><td style={grayStyle}>작성자</td><td style={cellStyle}>{doc.author}</td></tr>
              <tr><td style={grayStyle}>기안일</td><td style={cellStyle}>{formatKoreanDate(doc.draftDate)}</td></tr>
            </tbody>
          </table>
          <table style={{ borderCollapse: 'collapse', flexShrink: 0 }}>
            <tbody>
              <tr>
                <td rowSpan={2} style={{ ...grayStyle, textAlign: 'center', width: 60 }}>결&nbsp;&nbsp;재</td>
                {approvalLine.map((s, i) => <th key={i} style={{ ...grayStyle, textAlign: 'center', width: 90 }}>{s.role}</th>)}
              </tr>
              <tr>
                {approvalLine.map((s, i) => <td key={i} style={{ ...cellStyle, textAlign: 'center', height: 40 }}>{s.date || ''}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
        <table style={{ borderCollapse: 'collapse', width: '100%', border: '1.5pt solid #000' }}>
          <thead>
            <tr>
              {[['Date', '날짜'], ['Project', '프로젝트명'], ['Description', '내용'], ['Expenses', '금액/원'], ['Account', '계정과목'], ['Company name', '상호'], ['Remark', '비고']].map(([en, ko]) => (
                <th key={en} style={{ ...grayStyle, textAlign: 'center' }}>
                  <div>{en}</div>
                  <div style={{ fontWeight: 400, fontSize: 9 }}>({ko})</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map(it => (
              <tr key={it.id}>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{it.date}</td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{it.project}</td>
                <td style={{ ...cellStyle, textAlign: 'left' }}>{it.description}</td>
                <td style={{ ...cellStyle, textAlign: 'right' }}>{it.amount.toLocaleString()}</td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{it.account}</td>
                <td style={{ ...cellStyle, textAlign: 'center' }}>{it.companyName}</td>
                <td style={{ ...cellStyle, textAlign: 'left' }}>{it.remark}</td>
              </tr>
            ))}
            {Array.from({ length: Math.max(0, 15 - items.length) }).map((_, i) => (
              <tr key={`blank-${i}`}>
                <td style={cellStyle}>&nbsp;</td><td style={cellStyle}>&nbsp;</td><td style={cellStyle}>&nbsp;</td>
                <td style={cellStyle}>&nbsp;</td><td style={cellStyle}>&nbsp;</td><td style={cellStyle}>&nbsp;</td><td style={cellStyle}>&nbsp;</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...grayStyle, textAlign: 'center' }} colSpan={3}>총 합계</td>
              <td style={{ ...grayStyle, textAlign: 'right' }}>{total.toLocaleString()}</td>
              <td style={cellStyle} colSpan={3}></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  const handlePrintLeave = () => { window.print(); };

  // 화면에 보이는 휴가 신청서 양식 그대로 엑셀(.xls)로 다운로드
  const downloadLeaveToExcel = (doc: LeaveRequest) => {
    const esc = (str: any): string => (str === null || str === undefined ? '' : String(str))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
    const cellBorder = 'border: 0.5pt solid #000000;';
    const grayBg = 'background-color: #f3f4f6;';
    const baseFont = "font-family: 'Malgun Gothic', Arial; font-size: 10pt;";
    const approvalLine = doc.approvalLine || [];

    const approvalHtml = `
      <table style="border-collapse: collapse; width:100%; table-layout:fixed; ${baseFont}" cellpadding="4">
        <tr>
          <td rowspan="2" style="${cellBorder} ${grayBg} font-weight:bold; text-align:center; width:15%;">결&nbsp;&nbsp;재</td>
          ${approvalLine.map(s => `<th style="${cellBorder} ${grayBg} text-align:center; width:${Math.floor(85 / Math.max(approvalLine.length, 1))}%;">${esc(s.role)}</th>`).join('')}
        </tr>
        <tr>
          ${approvalLine.map(s => `<td style="${cellBorder} text-align:center; height:40px;">${esc(s.date || '')}</td>`).join('')}
        </tr>
      </table>`;

    // 엑셀은 flexbox를 지원하지 않으므로 바깥 테이블로 감싸 결재표를 오른쪽 정렬한다
    const approvalRowHtml = `
      <table style="border-collapse: collapse; width:100%; table-layout:fixed;"><tr>
        <td style="border:none; width:55%;"></td>
        <td style="border:none; vertical-align:top; text-align:right; width:45%;">${approvalHtml}</td>
      </tr></table>`;

    const markCell = (cat: string, extra?: string) => {
      const selected = doc.leaveCategory === cat;
      const bg = selected ? 'background-color: #fde68a;' : '';
      const content = selected ? `●${extra ? `<br/><span style="font-weight:normal;font-size:8pt;">(${esc(extra)})</span>` : ''}` : '';
      return `<td style="${cellBorder} text-align:center; font-weight:bold; ${bg}">${content}</td>`;
    };
    const markSpecial = (t: string) => (doc.leaveCategory === 'special' && doc.specialType === t) ? 'background-color: #fde68a; font-weight:bold;' : '';
    const annualExtra = doc.leaveCategory === 'annual' && doc.annualType && doc.annualType !== 'full' ? ANNUAL_TYPE_LABEL[doc.annualType] : undefined;
    const otherExtra = doc.leaveCategory === 'other' ? doc.leaveCategoryCustom : undefined;

    const bodyHtml = `
      <table style="border-collapse: collapse; width:100%; border:1.5pt solid #000; ${baseFont} margin-top:14px;" cellpadding="4">
        <tr>
          <td style="${cellBorder} ${grayBg} font-weight:bold; text-align:center;">소속</td><td style="${cellBorder} text-align:center;" colspan="4">${esc(doc.department)}</td>
          <td style="${cellBorder} ${grayBg} font-weight:bold; text-align:center;">휴가자</td><td style="${cellBorder} text-align:center;" colspan="5">${esc(doc.author)}</td>
        </tr>
        <tr>
          <td rowspan="2" style="${cellBorder} ${grayBg} font-weight:bold; text-align:center;">휴가구분</td>
          <td style="${cellBorder} ${grayBg} font-weight:bold; text-align:center;">월차</td>
          <td style="${cellBorder} ${grayBg} font-weight:bold; text-align:center;">연차</td>
          <td style="${cellBorder} ${grayBg} font-weight:bold; text-align:center;">공가</td>
          <td style="${cellBorder} ${grayBg} font-weight:bold; text-align:center;">병가</td>
          <td style="${cellBorder} ${grayBg} font-weight:bold; text-align:center; ${doc.leaveCategory === 'special' && doc.specialType === 'custom' ? 'background-color:#fde68a;' : ''}" colspan="4">특별 휴가${doc.leaveCategory === 'special' && doc.specialType === 'custom' ? `<br/><span style="font-weight:normal;font-size:8pt;">(${esc(doc.specialTypeCustom || '직접입력')})</span>` : ''}</td>
          <td style="${cellBorder} ${grayBg} font-weight:bold; text-align:center;">보건</td>
          <td style="${cellBorder} ${grayBg} font-weight:bold; text-align:center;">기타</td>
        </tr>
        <tr>
          ${markCell('monthly')}
          ${markCell('annual', annualExtra)}
          ${markCell('official')}
          ${markCell('sick')}
          <td style="${cellBorder} text-align:center; ${markSpecial('birth')}">출산</td>
          <td style="${cellBorder} text-align:center; ${markSpecial('summer')}">하기</td>
          <td style="${cellBorder} text-align:center; ${markSpecial('family')}">경조</td>
          <td style="${cellBorder} text-align:center; ${markSpecial('disaster')}">재해</td>
          ${markCell('health')}
          ${markCell('other', otherExtra)}
        </tr>
        <tr><td style="${cellBorder} ${grayBg} font-weight:bold; text-align:center;">사유</td><td style="${cellBorder}" colspan="10">${esc(doc.reason || '')}</td></tr>
        <tr>
          <td style="${cellBorder} ${grayBg} font-weight:bold; text-align:center;">기간</td>
          <td style="${cellBorder} text-align:center;" colspan="5">${esc(doc.startDate)} ~ ${esc(doc.endDate)}</td>
          <td style="${cellBorder} text-align:center;" colspan="3">${doc.startTime ? `${esc(doc.startTime)} ~ ${esc(doc.endTime || '')}` : ''}</td>
          <td style="${cellBorder} text-align:center;" colspan="2">${esc(computeAnnualLeaveLabel(doc, leaveList))}</td>
        </tr>
        <tr>
          <td rowspan="2" style="${cellBorder} ${grayBg} font-weight:bold; text-align:center;">연락처</td>
          <td style="${cellBorder}" colspan="4">집  ${esc(doc.homeContact || '')}</td>
          <td rowspan="2" style="${cellBorder} ${grayBg} font-weight:bold; text-align:center;">직무 대행자</td>
          <td rowspan="2" style="${cellBorder} text-align:center;" colspan="5">${esc(doc.actingPerson || '')}</td>
        </tr>
        <tr>
          <td style="${cellBorder}" colspan="4">휴대폰  ${esc(doc.mobileContact || '')}</td>
        </tr>
      </table>`;

    const fullHtml = `
      <table style="border-collapse: collapse; width: 190mm; height: 265mm;"><tr>
      <td style="border: 2px solid #000000; box-sizing: border-box; padding: 15mm 10mm; mso-padding-alt: 43pt 28pt 43pt 28pt; vertical-align: top;">
      <div style="text-align:center; margin-bottom:16px;">
        <span style="font-size:18pt; font-weight:bold; border-bottom: 3px double #000000; padding-bottom:4px;">휴가 신청서</span>
      </div>
      ${approvalRowHtml}
      <p style="${baseFont}">기안번호 : ${esc(doc.draftNumber)}</p>
      ${bodyHtml}
      <p style="text-align:center; margin-top:40mm; ${baseFont}">위와 같이 신청하오니 승인하여 주시기 바랍니다.</p>
      <p style="text-align:center; margin-top:20px; ${baseFont}">${esc(doc.submittedDate.replace(/-/g, '. '))}</p>
      </td>
      </tr></table>
    `;

    const excelContent = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8">
      <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
      <x:Name>휴가신청서</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
      </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
      </head><body>${fullHtml}</body></html>
    `;

    const blob = new Blob([excelContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `휴가신청서_${doc.draftNumber || todayStr()}.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 인쇄 전용 정적 렌더러: #print-root 포털에 렌더링되어 화면 미리보기와 별개로 단독 인쇄됨
  const renderPrintableLeave = (doc: LeaveRequest | undefined) => {
    if (!doc) return null;
    const approvalLine = doc.approvalLine || [];
    const cellStyle: React.CSSProperties = { border: '0.5pt solid #000', padding: '6px 8px', verticalAlign: 'middle' };
    const grayStyle: React.CSSProperties = { ...cellStyle, backgroundColor: '#f3f4f6', fontWeight: 700 };
    const markStyle = (cat: string): React.CSSProperties => doc.leaveCategory === cat ? { ...cellStyle, textAlign: 'center', backgroundColor: '#fde68a', fontWeight: 700 } : { ...cellStyle, textAlign: 'center' };
    const markCell = (cat: string, extra?: string) => {
      const selected = doc.leaveCategory === cat;
      return (
        <td style={selected ? { ...cellStyle, textAlign: 'center', backgroundColor: '#fde68a', fontWeight: 700 } : { ...cellStyle, textAlign: 'center' }}>
          {selected && <>●{extra && <><br /><span style={{ fontWeight: 400, fontSize: 9 }}>({extra})</span></>}</>}
        </td>
      );
    };
    return (
      <div style={{ width: '210mm', minHeight: '270mm', boxSizing: 'border-box', margin: '0 auto', padding: '15mm 10mm', color: 'black', fontFamily: "'Malgun Gothic', Arial, sans-serif", fontSize: 11, border: '3px solid #000', background: 'white' }}>
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 22, fontWeight: 800, borderBottom: '3px double #000', paddingBottom: 4 }}>휴가 신청서</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td rowSpan={2} style={{ ...grayStyle, textAlign: 'center', width: 60 }}>결&nbsp;&nbsp;재</td>
                {approvalLine.map((s, i) => <th key={i} style={{ ...grayStyle, textAlign: 'center', width: 90 }}>{s.role}</th>)}
              </tr>
              <tr>
                {approvalLine.map((s, i) => <td key={i} style={{ ...cellStyle, textAlign: 'center', height: 40 }}>{s.date || ''}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11 }}>기안번호 : {doc.draftNumber}</p>
        <table style={{ borderCollapse: 'collapse', width: '100%', border: '1.5pt solid #000', marginTop: 10, tableLayout: 'fixed' }}>
          <tbody>
            <tr>
              <td style={{ ...grayStyle, textAlign: 'center' }}>소속</td><td style={{ ...cellStyle, textAlign: 'center' }} colSpan={4}>{doc.department}</td>
              <td style={{ ...grayStyle, textAlign: 'center' }}>휴가자</td><td style={{ ...cellStyle, textAlign: 'center' }} colSpan={5}>{doc.author}</td>
            </tr>
            <tr>
              <td rowSpan={2} style={{ ...grayStyle, textAlign: 'center' }}>휴가<br />구분</td>
              <td style={{ ...grayStyle, textAlign: 'center' }}>월차</td>
              <td style={{ ...grayStyle, textAlign: 'center' }}>연차</td>
              <td style={{ ...grayStyle, textAlign: 'center' }}>공가</td>
              <td style={{ ...grayStyle, textAlign: 'center' }}>병가</td>
              <td style={doc.leaveCategory === 'special' && doc.specialType === 'custom' ? { ...grayStyle, textAlign: 'center', backgroundColor: '#fde68a' } : { ...grayStyle, textAlign: 'center' }} colSpan={4}>
                특별 휴가
                {doc.leaveCategory === 'special' && doc.specialType === 'custom' && <><br /><span style={{ fontWeight: 400, fontSize: 9 }}>({doc.specialTypeCustom || '직접입력'})</span></>}
              </td>
              <td style={{ ...grayStyle, textAlign: 'center' }}>보건</td>
              <td style={{ ...grayStyle, textAlign: 'center' }}>기타</td>
            </tr>
            <tr>
              {markCell('monthly')}
              {markCell('annual', doc.annualType && doc.annualType !== 'full' ? ANNUAL_TYPE_LABEL[doc.annualType] : undefined)}
              {markCell('official')}
              {markCell('sick')}
              <td style={doc.leaveCategory === 'special' && doc.specialType === 'birth' ? { ...cellStyle, textAlign: 'center', backgroundColor: '#fde68a', fontWeight: 700 } : { ...cellStyle, textAlign: 'center' }}>출산</td>
              <td style={doc.leaveCategory === 'special' && doc.specialType === 'summer' ? { ...cellStyle, textAlign: 'center', backgroundColor: '#fde68a', fontWeight: 700 } : { ...cellStyle, textAlign: 'center' }}>하기</td>
              <td style={doc.leaveCategory === 'special' && doc.specialType === 'family' ? { ...cellStyle, textAlign: 'center', backgroundColor: '#fde68a', fontWeight: 700 } : { ...cellStyle, textAlign: 'center' }}>경조</td>
              <td style={doc.leaveCategory === 'special' && doc.specialType === 'disaster' ? { ...cellStyle, textAlign: 'center', backgroundColor: '#fde68a', fontWeight: 700 } : { ...cellStyle, textAlign: 'center' }}>재해</td>
              {markCell('health')}
              {markCell('other', doc.leaveCategory === 'other' ? doc.leaveCategoryCustom : undefined)}
            </tr>
            <tr><td style={grayStyle}>사유</td><td style={cellStyle} colSpan={10}>{doc.reason || ''}</td></tr>
            <tr>
              <td style={{ ...grayStyle, textAlign: 'center' }}>기간</td>
              <td style={{ ...cellStyle, textAlign: 'center' }} colSpan={5}>{doc.startDate} ~ {doc.endDate}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }} colSpan={3}>{doc.startTime ? `${doc.startTime} ~ ${doc.endTime || ''}` : ''}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }} colSpan={2}>{computeAnnualLeaveLabel(doc, leaveList)}</td>
            </tr>
            <tr>
              <td rowSpan={2} style={{ ...grayStyle, textAlign: 'center' }}>연락처</td>
              <td style={cellStyle} colSpan={4}>집&nbsp;&nbsp;{doc.homeContact || ''}</td>
              <td rowSpan={2} style={{ ...grayStyle, textAlign: 'center' }}>직무 대행자</td>
              <td rowSpan={2} style={{ ...cellStyle, textAlign: 'center' }} colSpan={5}>{doc.actingPerson || ''}</td>
            </tr>
            <tr>
              <td style={cellStyle} colSpan={4}>휴대폰&nbsp;&nbsp;{doc.mobileContact || ''}</td>
            </tr>
          </tbody>
        </table>
        <p style={{ textAlign: 'center', marginTop: '40mm' }}>위와 같이 신청하오니 승인하여 주시기 바랍니다.</p>
        <p style={{ textAlign: 'center', marginTop: 30 }}>{doc.submittedDate.replace(/-/g, '. ')}</p>
      </div>
    );
  };

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
    const days = calcLeaveDays(lvStartDate, lvEndDate, lvCategory === 'annual' ? ANNUAL_TYPE_MULTIPLIER[lvAnnualType] : 1);
    const payload: Partial<LeaveRequest> = {
      draftNumber: lvDraftNumber, department: lvDepartment, author: lvAuthor,
      leaveCategory: lvCategory, leaveCategoryCustom: lvCategory === 'other' ? lvCategoryCustom : undefined,
      specialType: lvCategory === 'special' ? lvSpecialType : undefined,
      specialTypeCustom: lvCategory === 'special' && lvSpecialType === 'custom' ? lvSpecialTypeCustom : undefined,
      annualType: lvCategory === 'annual' ? lvAnnualType : undefined,
      totalAnnualDays: lvTotalAnnualDays || undefined,
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
          <input key={idx} type="text" value={step.role} placeholder={`결재${idx + 1}`} list="company-positions-datalist"
            onChange={(e) => setLine(line.map((s, i) => i === idx ? { ...s, role: e.target.value } : s))}
            className="px-2 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
        ))}
      </div>
      {companyPositions.length > 0 && (
        <datalist id="company-positions-datalist">
          {companyPositions.map((p) => <option key={p} value={p} />)}
        </datalist>
      )}
      <p className="text-[10px] text-slate-500">
        여기 적는 직책이 회원가입 시 등록한 직책과 정확히 일치해야 결재 요청 이메일이 그 사람에게 자동으로 전달됩니다.
      </p>
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
          <div className="flex justify-start">
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
            <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-3 -mx-1 px-1 [scrollbar-width:thin]">
              {[...advanceList].sort((a, b) => {
                const byDate = (b.periodStart || '').localeCompare(a.periodStart || '');
                if (byDate !== 0) return byDate;
                return (b.createdAt || '').localeCompare(a.createdAt || '');
              }).map(doc => {
                const total = (doc.items || []).reduce((s, it) => s + (Number(it.amount) || 0), 0);
                return (
                  <div key={doc.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2.5 snap-center shrink-0 w-[88vw] sm:w-[420px]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-slate-100 truncate">{doc.companyName} 가지급금 정산서</h3>
                          <StatusBadge status={doc.status} />
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                          <span className="flex items-center gap-1"><UserIcon className="w-3 h-3" />{doc.author}</span>
                          <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{doc.department}</span>
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatKoreanPeriod(doc.periodStart, doc.periodEnd)}</span>
                        </div>
                        <ApprovalLineMini line={doc.approvalLine || []} />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setPreviewAdvanceId(doc.id)} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition-colors" title="출력 미리보기">
                          <Eye className="w-4 h-4" />
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
                      <span className="text-slate-500">정산 항목 {(doc.items || []).length}건</span>
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
          <div className="flex justify-start">
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
            <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-3 -mx-1 px-1 [scrollbar-width:thin]">
              {[...leaveList].sort((a, b) => {
                const byDate = (b.startDate || '').localeCompare(a.startDate || '');
                if (byDate !== 0) return byDate;
                return (b.createdAt || '').localeCompare(a.createdAt || '');
              }).map(doc => (
                <div key={doc.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2.5 snap-center shrink-0 w-[88vw] sm:w-[420px]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-100 truncate">{doc.author}님 휴가 신청서</h3>
                        <StatusBadge status={doc.status} />
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                          {leaveCategoryDisplay(doc)}
                        </span>
                        {doc.totalAnnualDays ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            누적 {computeAnnualLeaveLabel(doc, leaveList)}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{doc.draftNumber}</span>
                        <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{doc.department}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{doc.startDate} ~ {doc.endDate}{doc.startTime ? ` (${doc.startTime}~${doc.endTime || ''})` : ''} · {doc.days}일</span>
                      </div>
                      {doc.reason && <p className="text-xs text-slate-500">{doc.reason}</p>}
                      <ApprovalLineMini line={doc.approvalLine || []} />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setPreviewLeaveId(doc.id)} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-indigo-400 transition-colors" title="출력 미리보기">
                        <Eye className="w-4 h-4" />
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
                  <YMDInput value={apDraftDate} onChange={setApDraftDate} />
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
                  <YMDInput value={apPeriodStart} onChange={setApPeriodStart} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">기간 종료</label>
                  <YMDInput value={apPeriodEnd} onChange={setApPeriodEnd} />
                </div>
              </div>

              {(apPeriodStart || apPeriodEnd) && (
                <p className="text-xs text-slate-400 bg-slate-950/50 rounded-xl px-4 py-2.5 -mt-2">
                  출력 표기: <span className="font-bold text-slate-200">{formatKoreanPeriod(apPeriodStart, apPeriodEnd)}</span>
                </p>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300">정산 내역</label>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={openImportModal} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-bold">
                      <Download className="w-3.5 h-3.5" /> 업무일지/차량운행일지에서 가져오기
                    </button>
                    <button type="button" onClick={addApItem} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 font-bold">
                      <Plus className="w-3.5 h-3.5" /> 내역 추가
                    </button>
                  </div>
                </div>
                {apItems.length === 0 && (
                  <div className="text-xs text-slate-500 text-center py-4 bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                    정산 내역이 없습니다. "내역 추가"를 눌러 등록해 주세요.
                  </div>
                )}
                <div className="space-y-2">
                  {apItems.map(item => (
                    <div key={item.id} className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500 font-bold shrink-0">날짜</span>
                        <YMDInput value={item.date} onChange={(v) => updateApItem(item.id, { date: v })} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="relative">
                          <input type="text" placeholder="프로젝트명 (클릭하면 개인카드/현금 사용내역에서 선택)" value={item.project}
                            onChange={(e) => updateApItem(item.id, { project: e.target.value })}
                            onFocus={() => openItemPicker(item.id)}
                            onBlur={() => { setTimeout(() => { setItemPickerForId(prev => prev === item.id ? null : prev); }, 150); }}
                            className="w-full px-2.5 py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          {itemPickerForId === item.id && (
                            <div className="absolute z-30 mt-1 w-full sm:w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-h-64 overflow-y-auto">
                              {itemPickerLoading ? (
                                <div className="p-3 text-xs text-slate-400">불러오는 중...</div>
                              ) : (() => {
                                const q = item.project.trim().toLowerCase();
                                const filtered = itemPickerRows.filter(r =>
                                  !q || r.project.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
                                if (filtered.length === 0) {
                                  return <div className="p-3 text-xs text-slate-500">일치하는 개인카드/현금 사용 내역이 없습니다.</div>;
                                }
                                return filtered.map(r => (
                                  <button key={r.id} type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyItemPicker(item.id, r)}
                                    className="w-full text-left px-3 py-2 hover:bg-slate-800 border-b border-slate-800 last:border-0 transition-colors">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-semibold text-blue-300 truncate">{r.project || '(프로젝트 없음)'}</span>
                                      <span className="text-[10px] text-slate-500 shrink-0">{r.date}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 mt-0.5">
                                      <span className="text-[11px] text-slate-400 truncate">{r.description}</span>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{r.payMethodLabel}</span>
                                        <span className="text-xs font-bold text-slate-200">{formatCurrencyInput(r.amount)}원</span>
                                      </div>
                                    </div>
                                  </button>
                                ));
                              })()}
                            </div>
                          )}
                        </div>
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

      {/* 업무일지/차량운행일지 비용 가져오기 모달 */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="font-bold text-lg text-slate-100 flex items-center gap-2">
                <Download className="w-5 h-5 text-indigo-400" />
                비용 가져오기
              </h2>
              <button onClick={() => setIsImportModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400"><X className="w-5 h-5" /></button>
            </div>

            <div className="px-6 pt-4">
              <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => { setImportTab('worklog'); setImportProjectFilter('all'); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${importTab === 'worklog' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'}`}>
                    <ClipboardList className="w-3.5 h-3.5" /> 업무일지 비용 ({importWorklogRows.length})
                  </button>
                  <button onClick={() => { setImportTab('vehicle'); setImportProjectFilter('all'); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${importTab === 'vehicle' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'}`}>
                    <Car className="w-3.5 h-3.5" /> 차량 비용관리 ({importVehicleRows.length})
                  </button>
                  <button onClick={() => { setImportTab('maintenance'); setImportProjectFilter('all'); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${importTab === 'maintenance' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-400 hover:bg-slate-800/60 border border-transparent'}`}>
                    <Wrench className="w-3.5 h-3.5" /> 정비일지 비용 ({importMaintenanceRows.length})
                  </button>
                </div>
                {(() => {
                  const rows = importTab === 'worklog' ? importWorklogRows : importTab === 'vehicle' ? importVehicleRows : importMaintenanceRows;
                  const projectNames = Array.from(new Set(rows.map(r => r.project).filter(Boolean)));
                  if (projectNames.length === 0) return null;
                  return (
                    <select value={importProjectFilter} onChange={(e) => setImportProjectFilter(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="all">전체 프로젝트</option>
                      {projectNames.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  );
                })()}
              </div>
              <p className="text-[11px] text-slate-500 mt-2">개인카드/현금으로 결제한 항목만 표시됩니다 (법인카드 결제분은 이미 별도 정산되므로 제외).</p>
            </div>

            <div className="p-6 pt-4 space-y-2">
              {importLoading ? (
                <div className="py-16 flex flex-col items-center justify-center space-y-3">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-slate-400">비용 내역을 불러오는 중입니다...</p>
                </div>
              ) : (() => {
                const sourceRows = importTab === 'worklog' ? importWorklogRows : importTab === 'vehicle' ? importVehicleRows : importMaintenanceRows;
                const rows = sourceRows.filter(r => importProjectFilter === 'all' || r.project === importProjectFilter);
                return rows.length === 0 ? (
                  <div className="py-16 text-center text-slate-500 bg-slate-950/40 border border-dashed border-slate-800 rounded-2xl text-xs">
                    가져올 수 있는 비용 내역이 없습니다.
                  </div>
                ) : (
                  rows.map(row => (
                    <label key={row.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${importSelectedIds.has(row.id) ? 'bg-blue-600/10 border-blue-500/40' : 'bg-slate-950/50 border-slate-800 hover:bg-slate-800/40'}`}>
                      <input type="checkbox" checked={importSelectedIds.has(row.id)} onChange={() => toggleImportSelect(row.id)}
                        className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-0" />
                      <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-xs items-center">
                        <span className="text-slate-400">{row.date}</span>
                        <span className="text-blue-300 font-semibold truncate">{row.project || '-'}</span>
                        <span className="text-slate-300 truncate col-span-2 sm:col-span-1">{row.description}</span>
                        <span className="text-slate-100 font-bold text-right sm:text-left">{formatCurrencyInput(row.amount)}원</span>
                        <span className="justify-self-start sm:justify-self-end px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">{row.payMethodLabel}</span>
                      </div>
                    </label>
                  ))
                );
              })()}
            </div>

            <div className="sticky bottom-0 bg-slate-900 border-t border-slate-800 px-6 py-4 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-400">{importSelectedIds.size}건 선택됨</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setIsImportModalOpen(false)} className="px-4 py-2.5 rounded-xl font-semibold text-sm text-slate-400 hover:bg-slate-800 transition-colors">취소</button>
                <button onClick={applyImportedItems} disabled={importSelectedIds.size === 0} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-600/25 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">선택 항목 가져오기</button>
              </div>
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
                  <input type="text" value={lvAuthor} onChange={(e) => {
                    const v = e.target.value;
                    setLvAuthor(v);
                    setLvTotalAnnualDays(getStoredTotalAnnualDays(v));
                  }}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
              </div>

              {/* 총 연차 일수: 카테고리와 무관하게 항상 보이고, 한 번 입력해두면 이 휴가자 이름으로 자동 저장되어
                  다음에 새 휴가 신청서를 작성할 때도 다시 입력할 필요가 없다. */}
              <div className="p-3 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 space-y-1.5">
                <label className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5" /> 총 연차 일수 (올해 부여된 전체 연차 — 한 번 입력해두면 자동 저장됩니다)
                </label>
                <input type="number" min={0} step={0.5} value={lvTotalAnnualDays}
                  onChange={(e) => {
                    const v = Number(e.target.value) || 0;
                    setLvTotalAnnualDays(v);
                    setStoredTotalAnnualDays(lvAuthor, v);
                  }}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 text-sm" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">휴가 구분</label>
                <div className="flex flex-wrap gap-2">
                  {LEAVE_CATEGORY_ORDER.map(c => (
                    c === 'special' ? (
                      <div key={c} className="relative">
                        <button type="button"
                          onClick={() => { setLvCategory('special'); setLvSpecialDropdownOpen(v => !v); setLvStartTime('09:00'); setLvEndTime('18:00'); }}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${lvCategory === 'special' ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'}`}>
                          <span>
                            특별휴가{lvCategory === 'special' ? ` · ${lvSpecialType === 'custom' ? (lvSpecialTypeCustom || '직접입력') : SPECIAL_TYPE_LABEL[lvSpecialType]}` : ''}
                          </span>
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        {lvSpecialDropdownOpen && (
                          <>
                            <div className="fixed inset-0 z-20" onClick={() => setLvSpecialDropdownOpen(false)} />
                            <div className="absolute z-30 mt-1 left-0 w-40 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
                              {SPECIAL_TYPE_ORDER.map(t => (
                                <button key={t} type="button"
                                  onClick={() => { setLvSpecialType(t); if (t !== 'custom') setLvSpecialDropdownOpen(false); setLvStartTime('09:00'); setLvEndTime('18:00'); }}
                                  className={`w-full text-left px-3 py-2 text-xs font-semibold transition-colors ${lvSpecialType === t ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-300 hover:bg-slate-800'}`}>
                                  {SPECIAL_TYPE_LABEL[t]}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    ) : c === 'annual' ? (
                      <div key={c} className="relative">
                        <button type="button"
                          onClick={() => {
                            setLvCategory('annual');
                            setLvAnnualDropdownOpen(v => !v);
                            if (lvAnnualType === 'full') { setLvStartTime('09:00'); setLvEndTime('18:00'); }
                          }}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${lvCategory === 'annual' ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'}`}>
                          <span>
                            연차{lvCategory === 'annual' ? ` · ${ANNUAL_TYPE_LABEL[lvAnnualType]}` : ''}
                          </span>
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        {lvAnnualDropdownOpen && (
                          <>
                            <div className="fixed inset-0 z-20" onClick={() => setLvAnnualDropdownOpen(false)} />
                            <div className="absolute z-30 mt-1 left-0 w-40 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
                              {ANNUAL_TYPE_ORDER.map(t => (
                                <button key={t} type="button"
                                  onClick={() => {
                                    setLvAnnualType(t);
                                    setLvAnnualDropdownOpen(false);
                                    if (t === 'full') {
                                      setLvStartTime('09:00');
                                      setLvEndTime('18:00');
                                    } else if (lvStartTime) {
                                      setLvEndTime(addHoursToTime(lvStartTime, ANNUAL_TYPE_HOURS[t]));
                                    }
                                  }}
                                  className={`w-full text-left px-3 py-2 text-xs font-semibold transition-colors ${lvAnnualType === t ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-300 hover:bg-slate-800'}`}>
                                  {ANNUAL_TYPE_LABEL[t]}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <button key={c} type="button" onClick={() => { setLvCategory(c); setLvStartTime('09:00'); setLvEndTime('18:00'); }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${lvCategory === c ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'}`}>
                        {LEAVE_CATEGORY_LABEL[c]}
                      </button>
                    )
                  ))}
                </div>
                {lvCategory === 'other' && (
                  <input type="text" placeholder="휴가 구분 직접 입력" value={lvCategoryCustom} onChange={(e) => setLvCategoryCustom(e.target.value)}
                    className="w-full mt-2 px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                )}
                {lvCategory === 'special' && lvSpecialType === 'custom' && (
                  <input type="text" placeholder="특별휴가 종류 직접 입력" value={lvSpecialTypeCustom} onChange={(e) => setLvSpecialTypeCustom(e.target.value)}
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
                  <YMDInput value={lvStartDate} onChange={(v) => {
                    setLvStartDate(v);
                    const isHalfOrQuarter = lvCategory === 'annual' && (lvAnnualType === 'half' || lvAnnualType === 'quarter');
                    if (!isHalfOrQuarter) { setLvStartTime('09:00'); setLvEndTime('18:00'); }
                  }} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">종료일</label>
                  <YMDInput value={lvEndDate} onChange={(v) => {
                    setLvEndDate(v);
                    const isHalfOrQuarter = lvCategory === 'annual' && (lvAnnualType === 'half' || lvAnnualType === 'quarter');
                    if (!isHalfOrQuarter) { setLvStartTime('09:00'); setLvEndTime('18:00'); }
                  }} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">시작 시간 (반차 등, 선택)</label>
                  <input type="time" value={lvStartTime} onChange={(e) => {
                    const v = e.target.value;
                    setLvStartTime(v);
                    if (lvCategory === 'annual' && (lvAnnualType === 'half' || lvAnnualType === 'quarter')) {
                      setLvEndTime(addHoursToTime(v, ANNUAL_TYPE_HOURS[lvAnnualType]));
                    }
                  }}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">종료 시간 (선택)</label>
                  <input type="time" value={lvEndTime} onChange={(e) => setLvEndTime(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
              </div>

              <div className="text-xs text-slate-400 bg-slate-950/50 rounded-xl px-4 py-2.5">
                산정된 휴가 일수: <span className="font-bold text-slate-200">{calcLeaveDays(lvStartDate, lvEndDate, lvCategory === 'annual' ? ANNUAL_TYPE_MULTIPLIER[lvAnnualType] : 1)}일</span>
                {lvCategory === 'annual' && <span className="text-slate-500"> ({ANNUAL_TYPE_LABEL[lvAnnualType]} 기준)</span>}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">누적 휴가 표기 (총 연차 일수 기준 자동 계산, 필요시 직접 수정)</label>
                <input type="text" placeholder="5일/총20일, 잔여 15일" value={lvAnnualNote} onChange={(e) => setLvAnnualNote(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">자택 연락처</label>
                  <input type="text" inputMode="numeric" placeholder="02-1234-5678" value={lvHomeContact} onChange={(e) => setLvHomeContact(formatPhoneNumber(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-950 border border-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-200 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">휴대폰</label>
                  <input type="text" inputMode="numeric" placeholder="010-1234-5678" value={lvMobileContact} onChange={(e) => setLvMobileContact(formatPhoneNumber(e.target.value))}
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
                  <YMDInput value={lvSubmittedDate} onChange={setLvSubmittedDate} />
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

      {/* 가지급금 정산서 출력 미리보기 (주간업무일지/차량운행일지와 동일한 방식: 화면에 그대로 보여준 뒤 엑셀/PDF로 출력) */}
      {previewAdvanceId && (() => {
        const previewDoc = advanceList.find(d => d.id === previewAdvanceId);
        if (!previewDoc) return null;
        const previewItems = previewDoc.items || [];
        const previewApprovalLine = previewDoc.approvalLine || [];
        const total = previewItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);
        return (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center overflow-y-auto p-4">
            <div className="w-full max-w-[215mm] h-[92vh] mx-auto bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
              {/* 비인쇄 상단 바 */}
              <div className="no-print p-4 sm:p-5 border-b border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                    <Eye className="w-5 h-5" />
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">가지급금 정산서 출력 미리보기</h2>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => downloadAdvanceToExcel(previewDoc)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/15 active:scale-95 transition-all">
                    <FileSpreadsheet className="w-3.5 h-3.5" /><span>엑셀 다운로드</span>
                  </button>
                  <button onClick={handlePrintAdvance} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/15 active:scale-95 transition-all">
                    <Printer className="w-3.5 h-3.5" /><span>인쇄 / PDF 저장</span>
                  </button>
                  <button onClick={() => setPreviewAdvanceId(null)} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 화면에 그대로 보이는 A4 미리보기 종이 영역 */}
              <div className="flex-1 bg-slate-950 p-4 sm:p-8 overflow-y-auto flex justify-center">
                <table className="shrink-0" style={{ width: '210mm', borderCollapse: 'collapse' }}><tbody><tr><td style={{ border: '2px solid #000000', background: '#fff' }}>
                <div className="text-black p-6 sm:p-8 text-xs font-sans leading-tight">
                  <div className="text-center mb-6">
                    <span className="inline-block border-b-4 border-double border-black pb-1 px-4 text-xl sm:text-2xl font-extrabold text-black">가지급금 정산서</span>
                  </div>

                  <div className="flex items-start justify-between gap-4 mb-5">
                    <table className="border-collapse text-xs w-[55%]">
                      <tbody>
                        <tr><td className="border border-black bg-gray-100 font-bold px-3 py-1.5 w-[28%]">회사명</td><td className="border border-black px-3 py-1.5">{previewDoc.companyName}</td></tr>
                        <tr><td className="border border-black bg-gray-100 font-bold px-3 py-1.5">기간</td><td className="border border-black px-3 py-1.5">{formatKoreanPeriod(previewDoc.periodStart, previewDoc.periodEnd)}</td></tr>
                        <tr><td className="border border-black bg-gray-100 font-bold px-3 py-1.5">부서</td><td className="border border-black px-3 py-1.5">{previewDoc.department}</td></tr>
                        <tr><td className="border border-black bg-gray-100 font-bold px-3 py-1.5">작성자</td><td className="border border-black px-3 py-1.5">{previewDoc.author}</td></tr>
                        <tr><td className="border border-black bg-gray-100 font-bold px-3 py-1.5">기안일</td><td className="border border-black px-3 py-1.5">{formatKoreanDate(previewDoc.draftDate)}</td></tr>
                      </tbody>
                    </table>

                    <table className="border-collapse text-center text-xs shrink-0">
                      <tbody>
                        <tr>
                          <td rowSpan={2} className="border border-black bg-gray-100 font-bold px-3 py-1.5 align-middle">결&nbsp;&nbsp;재</td>
                          {previewApprovalLine.map((s, i) => (
                            <th key={i} className="border border-black bg-gray-100 font-bold px-4 py-1.5 min-w-[80px]">{s.role}</th>
                          ))}
                        </tr>
                        <tr>
                          {previewApprovalLine.map((s, i) => (
                            <td key={i} className="border border-black px-3 py-2.5 h-10">{s.date || ''}</td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <table className="w-full border-collapse border-[1.5px] border-black text-xs">
                    <thead>
                      <tr className="bg-gray-100">
                        {[['Date', '날짜'], ['Project', '프로젝트명'], ['Description', '내용'], ['Expenses', '금액/원'], ['Account', '계정과목'], ['Company name', '상호'], ['Remark', '비고']].map(([en, ko]) => (
                          <th key={en} className="border border-black px-2 py-1.5 font-bold leading-tight">
                            <div>{en}</div>
                            <div className="font-normal text-[10px]">({ko})</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewItems.map(it => (
                        <tr key={it.id}>
                          <td className="border border-black px-2 py-1.5 text-center">{it.date}</td>
                          <td className="border border-black px-2 py-1.5 text-center">{it.project}</td>
                          <td className="border border-black px-2 py-1.5">{it.description}</td>
                          <td className="border border-black px-2 py-1.5 text-right">{it.amount.toLocaleString()}</td>
                          <td className="border border-black px-2 py-1.5 text-center">{it.account}</td>
                          <td className="border border-black px-2 py-1.5 text-center">{it.companyName}</td>
                          <td className="border border-black px-2 py-1.5">{it.remark}</td>
                        </tr>
                      ))}
                      {Array.from({ length: Math.max(0, 15 - previewItems.length) }).map((_, i) => (
                        <tr key={`blank-${i}`}>
                          <td className="border border-black px-2 py-1.5">&nbsp;</td>
                          <td className="border border-black px-2 py-1.5">&nbsp;</td>
                          <td className="border border-black px-2 py-1.5">&nbsp;</td>
                          <td className="border border-black px-2 py-1.5">&nbsp;</td>
                          <td className="border border-black px-2 py-1.5">&nbsp;</td>
                          <td className="border border-black px-2 py-1.5">&nbsp;</td>
                          <td className="border border-black px-2 py-1.5">&nbsp;</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-100 font-bold">
                        <td className="border border-black px-2 py-1.5 text-center" colSpan={3}>총 합계</td>
                        <td className="border border-black px-2 py-1.5 text-right">{total.toLocaleString()}</td>
                        <td className="border border-black px-2 py-1.5" colSpan={3}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                </td></tr></tbody></table>
              </div>
            </div>
          </div>
        );
      })()}
      {previewLeaveId && (() => {
        const previewLeave = leaveList.find(d => d.id === previewLeaveId);
        if (!previewLeave) return null;
        const previewLeaveApprovalLine = previewLeave.approvalLine || [];
        const catLabel = previewLeave.leaveCategory === 'other' ? (previewLeave.leaveCategoryCustom || '기타') : LEAVE_CATEGORY_LABEL[previewLeave.leaveCategory];
        return (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center overflow-y-auto p-4">
            <div className="w-full max-w-[215mm] h-[92vh] mx-auto bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
              {/* 비인쇄 상단 바 */}
              <div className="no-print p-4 sm:p-5 border-b border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                    <Eye className="w-5 h-5" />
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">휴가 신청서 출력 미리보기</h2>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => downloadLeaveToExcel(previewLeave)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/15 active:scale-95 transition-all">
                    <FileSpreadsheet className="w-3.5 h-3.5" /><span>엑셀 다운로드</span>
                  </button>
                  <button onClick={handlePrintLeave} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/15 active:scale-95 transition-all">
                    <Printer className="w-3.5 h-3.5" /><span>인쇄 / PDF 저장</span>
                  </button>
                  <button onClick={() => setPreviewLeaveId(null)} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 화면에 그대로 보이는 A4 미리보기 종이 영역 */}
              <div className="flex-1 bg-slate-950 p-4 sm:p-8 overflow-y-auto flex justify-center">
                <table className="shrink-0" style={{ width: '210mm', borderCollapse: 'collapse' }}><tbody><tr><td style={{ border: '3px solid #000000', background: '#fff' }}>
                <div className="text-black text-xs font-sans leading-tight" style={{ paddingTop: '15mm', paddingBottom: '15mm', paddingLeft: '10mm', paddingRight: '10mm', minHeight: '297mm', boxSizing: 'border-box' }}>
                  <div className="text-center mb-6">
                    <span className="inline-block border-b-4 border-double border-black pb-1 px-4 text-xl sm:text-2xl font-extrabold text-black">휴가 신청서</span>
                  </div>

                  <div className="flex justify-end mb-3">
                    <table className="border-collapse text-center text-xs">
                      <tbody>
                        <tr>
                          <td rowSpan={2} className="border border-black bg-gray-100 font-bold px-3 py-1.5 align-middle">결&nbsp;&nbsp;재</td>
                          {previewLeaveApprovalLine.map((s, i) => (
                            <th key={i} className="border border-black bg-gray-100 font-bold px-4 py-1.5 min-w-[80px]">{s.role}</th>
                          ))}
                        </tr>
                        <tr>
                          {previewLeaveApprovalLine.map((s, i) => (
                            <td key={i} className="border border-black px-3 py-2.5 h-10">{s.date || ''}</td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <p className="mb-2">기안번호 : {previewLeave.draftNumber}</p>

                  <table className="w-full border-collapse border-[1.5px] border-black text-xs table-fixed">
                    <tbody>
                      <tr>
                        <td className="border border-black bg-gray-100 font-bold px-3 py-1.5 text-center">소속</td>
                        <td className="border border-black px-3 py-1.5 text-center" colSpan={4}>{previewLeave.department}</td>
                        <td className="border border-black bg-gray-100 font-bold px-3 py-1.5 text-center">휴가자</td>
                        <td className="border border-black px-3 py-1.5 text-center" colSpan={5}>{previewLeave.author}</td>
                      </tr>
                      <tr>
                        <td rowSpan={2} className="border border-black bg-gray-100 font-bold px-3 py-1.5 text-center align-middle">휴가<br />구분</td>
                        <td className="border border-black px-1 py-1.5 text-center font-bold bg-gray-100">월차</td>
                        <td className="border border-black px-1 py-1.5 text-center font-bold bg-gray-100">연차</td>
                        <td className="border border-black px-1 py-1.5 text-center font-bold bg-gray-100">공가</td>
                        <td className="border border-black px-1 py-1.5 text-center font-bold bg-gray-100">병가</td>
                        <td className={`border border-black px-1 py-1 text-center font-bold leading-tight ${previewLeave.leaveCategory === 'special' && previewLeave.specialType === 'custom' ? 'bg-yellow-200' : 'bg-gray-100'}`} colSpan={4}>
                          특별 휴가
                          {previewLeave.leaveCategory === 'special' && previewLeave.specialType === 'custom' && (
                            <div className="font-normal text-[10px]">({previewLeave.specialTypeCustom || '직접입력'})</div>
                          )}
                        </td>
                        <td className="border border-black px-1 py-1.5 text-center font-bold bg-gray-100">보건</td>
                        <td className="border border-black px-1 py-1.5 text-center font-bold bg-gray-100">기타</td>
                      </tr>
                      <tr>
                        <td className={`border border-black px-1 py-1.5 text-center font-bold leading-tight ${previewLeave.leaveCategory === 'monthly' ? 'bg-yellow-200' : ''}`}>
                          {previewLeave.leaveCategory === 'monthly' && '●'}
                        </td>
                        <td className={`border border-black px-1 py-1.5 text-center font-bold leading-tight ${previewLeave.leaveCategory === 'annual' ? 'bg-yellow-200' : ''}`}>
                          {previewLeave.leaveCategory === 'annual' && (
                            <>
                              ●
                              {previewLeave.annualType && previewLeave.annualType !== 'full' && (
                                <div className="font-normal text-[10px]">({ANNUAL_TYPE_LABEL[previewLeave.annualType]})</div>
                              )}
                            </>
                          )}
                        </td>
                        <td className={`border border-black px-1 py-1.5 text-center font-bold ${previewLeave.leaveCategory === 'official' ? 'bg-yellow-200' : ''}`}>
                          {previewLeave.leaveCategory === 'official' && '●'}
                        </td>
                        <td className={`border border-black px-1 py-1.5 text-center font-bold ${previewLeave.leaveCategory === 'sick' ? 'bg-yellow-200' : ''}`}>
                          {previewLeave.leaveCategory === 'sick' && '●'}
                        </td>
                        <td className={`border border-black px-1 py-1.5 text-center ${previewLeave.leaveCategory === 'special' && previewLeave.specialType === 'birth' ? 'bg-yellow-200 font-bold' : ''}`}>출산</td>
                        <td className={`border border-black px-1 py-1.5 text-center ${previewLeave.leaveCategory === 'special' && previewLeave.specialType === 'summer' ? 'bg-yellow-200 font-bold' : ''}`}>하기</td>
                        <td className={`border border-black px-1 py-1.5 text-center ${previewLeave.leaveCategory === 'special' && previewLeave.specialType === 'family' ? 'bg-yellow-200 font-bold' : ''}`}>경조</td>
                        <td className={`border border-black px-1 py-1.5 text-center ${previewLeave.leaveCategory === 'special' && previewLeave.specialType === 'disaster' ? 'bg-yellow-200 font-bold' : ''}`}>재해</td>
                        <td className={`border border-black px-1 py-1.5 text-center font-bold ${previewLeave.leaveCategory === 'health' ? 'bg-yellow-200' : ''}`}>
                          {previewLeave.leaveCategory === 'health' && '●'}
                        </td>
                        <td className={`border border-black px-1 py-1.5 text-center font-bold leading-tight ${previewLeave.leaveCategory === 'other' ? 'bg-yellow-200' : ''}`}>
                          {previewLeave.leaveCategory === 'other' && (
                            <>
                              ●
                              {previewLeave.leaveCategoryCustom && (
                                <div className="font-normal text-[10px]">({previewLeave.leaveCategoryCustom})</div>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-black bg-gray-100 font-bold px-3 py-1.5 text-center">사유</td>
                        <td className="border border-black px-3 py-1.5" colSpan={10}>{previewLeave.reason || ''}</td>
                      </tr>
                      <tr>
                        <td className="border border-black bg-gray-100 font-bold px-3 py-1.5 text-center">기간</td>
                        <td className="border border-black px-3 py-1.5 text-center" colSpan={5}>{previewLeave.startDate}&nbsp;&nbsp;~&nbsp;&nbsp;{previewLeave.endDate}</td>
                        <td className="border border-black px-3 py-1.5 text-center" colSpan={3}>{previewLeave.startTime ? `${previewLeave.startTime}  ~  ${previewLeave.endTime || ''}` : ''}</td>
                        <td className="border border-black px-2 py-1.5 text-center" colSpan={2}>{computeAnnualLeaveLabel(previewLeave, leaveList)}</td>
                      </tr>
                      <tr>
                        <td rowSpan={2} className="border border-black bg-gray-100 font-bold px-3 py-1.5 text-center align-middle">연락처</td>
                        <td className="border border-black px-3 py-1.5" colSpan={4}>집&nbsp;&nbsp;{previewLeave.homeContact || ''}</td>
                        <td rowSpan={2} className="border border-black bg-gray-100 font-bold px-3 py-1.5 text-center align-middle">직무 대행자</td>
                        <td rowSpan={2} className="border border-black px-3 py-1.5 text-center align-middle" colSpan={5}>{previewLeave.actingPerson || ''}</td>
                      </tr>
                      <tr>
                        <td className="border border-black px-3 py-1.5" colSpan={4}>휴대폰&nbsp;&nbsp;{previewLeave.mobileContact || ''}</td>
                      </tr>
                    </tbody>
                  </table>

                  <p className="text-center" style={{ marginTop: '40mm' }}>위와 같이 신청하오니 승인하여 주시기 바랍니다.</p>
                  <p className="text-center mt-8">{previewLeave.submittedDate.replace(/-/g, '. ')}</p>
                </div>
                </td></tr></tbody></table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 인쇄 전용 정적 리포트: 앱 트리 밖의 별도 포털(#print-root)에 렌더링되어 인쇄 시 단독으로 출력됨 */}
      {previewAdvanceId && typeof document !== 'undefined' && document.getElementById('print-root') &&
        createPortal(renderPrintableAdvance(advanceList.find(d => d.id === previewAdvanceId)), document.getElementById('print-root')!)}
      {previewLeaveId && typeof document !== 'undefined' && document.getElementById('print-root') &&
        createPortal(renderPrintableLeave(leaveList.find(d => d.id === previewLeaveId)), document.getElementById('print-root')!)}
    </div>
  );
};
