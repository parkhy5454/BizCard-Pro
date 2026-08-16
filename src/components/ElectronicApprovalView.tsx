import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Wallet, Plane, Plus, Trash2, Edit2, X, Check, Clock, CheckCircle2, XCircle,
  Printer, Calendar, User as UserIcon, Briefcase, Hash, FileSpreadsheet, Eye,
  Download, ClipboardList, Car, Wrench, ChevronDown, Camera, PenTool, FileText
} from 'lucide-react';
import { AdvancePaymentSettlement, AdvancePaymentItem, LeaveRequest, LeaveCategory, LeaveSpecialType, LeaveAnnualType, OfficialDocument, ApprovalStatus, ApprovalStep, User } from '../types.js';
import { formatCurrencyInput, parseCurrencyInput } from '../currencyFormat.js';
import { SignaturePadModal } from './SignaturePadModal.js';

interface Props {
  currentUser: User | null;
  // [추가] 서명을 새로 등록/변경했을 때 앱 전체(App.tsx)의 currentUser 상태를 갱신하기 위한
  // 콜백. 없으면(옵셔널) 이 화면 안에서만 반영되고 다음 새로고침 시 서버에서 다시 받아온다.
  onUpdateCurrentUser?: (user: User) => void;
}

const STATUS_LABEL: Record<ApprovalStatus, string> = {
  draft: '임시저장',
  pending: '결재대기',
  approved: '승인',
  rejected: '반려'
};

const STATUS_STYLE: Record<ApprovalStatus, string> = {
  draft: 'bg-slate-200/50 text-slate-600 border-slate-600/50',
  pending: 'bg-amber-50 text-amber-700 border-amber-500/30',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-500/30',
  rejected: 'bg-rose-50 text-rose-700 border-rose-500/30'
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
  receiptImage?: string;  // [수정] 원본(차량비용/정비/업무일지)에 첨부된 영수증 사진도 같이 가져온다
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

  const inputCls = "px-1.5 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-500";

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
      <span className="text-slate-400 text-xs">년</span>
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
      <span className="text-slate-400 text-xs">월</span>
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
      <span className="text-slate-400 text-xs">일</span>
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
// [추가] 공문서 결재선 기본값. 공유해주신 실제 양식(담당/이사 → 협조자/대표 2단 배치)을
// 그대로 기본으로 쓴다. 출력 화면에서 2개씩 묶어 표시하므로 이 순서 그대로면
// "담당·이사"가 첫 줄, "협조자·대표"가 둘째 줄에 놓인다.
const defaultOfficialApprovalLine = (): ApprovalStep[] => [
  { role: '담당' }, { role: '이사' }, { role: '협조자' }, { role: '대표' }
];

function makeDraftNumber(existing: string[]): string {
  const prefix = todayStr().replace(/-/g, '');
  const seq = existing.filter(d => d.startsWith(prefix)).length + 1;
  return `${prefix}-${String(seq).padStart(2, '0')}`;
}

// [추가] 공문서 시행번호 생성: "접두어-YYYYMMDD-일련번호" 형식(예: KS-20260816-001).
// 같은 날짜(YYYYMMDD)로 이미 만들어진 문서 개수를 세어 그 다음 번호를 매기므로, 날짜가
// 바뀌면(예: 8/23) 그 날짜엔 아직 아무것도 없으니 자동으로 001부터 다시 시작한다.
function makeExecutionNumber(existing: string[], prefix: string, dateStr: string): string {
  const datePart = (dateStr || todayStr()).replace(/-/g, '');
  const fullPrefix = `${(prefix || 'KS').trim()}-${datePart}-`;
  const seq = existing.filter(d => d.startsWith(fullPrefix)).length + 1;
  return `${fullPrefix}${String(seq).padStart(3, '0')}`;
}

// 'YYYY-MM-DD' -> 'YYYY. MM. DD' (공문서 시행번호 옆 괄호 표기용)
function formatDateDot(dateStr?: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[0]}. ${parts[1]}. ${parts[2]}`;
}

// [수정] 이 컴포넌트는 원래 ElectronicApprovalView 함수 "안"에서 정의되어 있었다.
// 그러면 부모가 리렌더링될 때마다(글자 하나 입력할 때마다) 매번 새로운 컴포넌트로 취급되어
// React가 이 입력창을 통째로 언마운트 후 재마운트하면서 포커스가 끊겨, 한 글자 치면 커서가
// 빠져나가 이어서 입력할 수 없는 문제가 있었다. 컴포넌트 바깥(모듈 최상단)으로 옮겨서 고정하고,
// 필요한 값들은 클로저 대신 props로 전달받도록 바꿔서 이 문제를 해결한다.
const ApprovalLineEditor: React.FC<{
  line: ApprovalStep[];
  setLine: (v: ApprovalStep[]) => void;
  kind: 'advance' | 'leave' | 'official';
  companyPositions: string[];
  onSaveAsDefault: (kind: 'advance' | 'leave' | 'official', line: ApprovalStep[]) => void;
}> = ({ line, setLine, kind, companyPositions, onSaveAsDefault }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between gap-2">
      <label className="text-xs font-bold text-slate-600">결재선</label>
      <button
        type="button"
        onClick={() => onSaveAsDefault(kind, line)}
        className="text-[10px] px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-500/20 text-indigo-700 border border-indigo-500/30 font-semibold transition-colors whitespace-nowrap"
      >
        우리 회사 기본값으로 저장
      </button>
    </div>
    {/* 회사마다 결재 단계 수가 다를 수 있어 4단계 고정 그리드 대신, 자유롭게 추가/삭제 가능한 구조로 되어 있다 */}
    <div className="flex flex-wrap gap-2">
      {line.map((step, idx) => (
        <div key={idx} className="flex items-center gap-1">
          <input type="text" value={step.role} placeholder={`결재${idx + 1}`} list="company-positions-datalist"
            onChange={(e) => setLine(line.map((s, i) => i === idx ? { ...s, role: e.target.value } : s))}
            className="w-24 px-2 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {line.length > 1 && (
            <button
              type="button"
              onClick={() => setLine(line.filter((_, i) => i !== idx))}
              className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
              title="이 단계 삭제"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setLine([...line, { role: '' }])}
        className="flex items-center gap-1 px-2.5 py-2 rounded-lg border border-dashed border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-500/50 text-xs font-semibold transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>단계 추가</span>
      </button>
    </div>
    {companyPositions.length > 0 && (
      <datalist id="company-positions-datalist">
        {companyPositions.map((p) => <option key={p} value={p} />)}
      </datalist>
    )}
    <p className="text-[10px] text-slate-400">
      여기 적는 직책이 회원가입 시 등록한 직책과 정확히 일치해야 결재 요청 이메일이 그 사람에게 자동으로 전달됩니다.
      "우리 회사 기본값으로 저장"을 누르면 다음부터 새 문서 작성 시 이 결재선이 자동으로 채워집니다.
    </p>
  </div>
);

export const ElectronicApprovalView: React.FC<Props> = ({ currentUser, onUpdateCurrentUser }) => {
  const [activeApprovalTab, setActiveApprovalTab] = useState<'advance' | 'leave' | 'official'>('advance');

  // [추가] 서명 등록 모달 상태. 결재자가 아직 서명을 등록 안 한 상태에서 "승인"을 누르면
  // 먼저 이 모달을 열어 서명을 받고, 저장되는 즉시 원래 하려던 승인을 이어서 처리한다
  // (pendingApprovalTarget에 "무엇을 승인하려 했는지" 잠깐 담아둔다).
  const [isSignaturePadOpen, setIsSignaturePadOpen] = useState(false);
  const [pendingApprovalTarget, setPendingApprovalTarget] = useState<{ kind: 'advance' | 'leave' | 'official'; id: string } | null>(null);

  const [advanceList, setAdvanceList] = useState<AdvancePaymentSettlement[]>([]);
  const [leaveList, setLeaveList] = useState<LeaveRequest[]>([]);
  const [officialList, setOfficialList] = useState<OfficialDocument[]>([]);
  // [수정] 결재 문서가 몇백 건으로 늘어나도 느려지지 않도록, 처음엔 50건만 화면에 그린다.
  const [visibleAdvanceCount, setVisibleAdvanceCount] = useState<number>(50);
  const [visibleLeaveCount, setVisibleLeaveCount] = useState<number>(50);
  const [visibleOfficialCount, setVisibleOfficialCount] = useState<number>(50);
  // [추가] 경영지원 서류(근로계약서 등)와 공유하는 회사 공통 설정값. 공문서 작성 시
  // 발신처 주소/전화/팩스/이메일과 시행번호 접두어(기본 "KS")를 자동으로 채우는 데 쓰인다.
  const [companySettings, setCompanySettings] = useState<{ address: string; businessType: string; phone: string; fax: string; email: string; docPrefix: string }>({ address: '', businessType: '', phone: '', fax: '', email: '', docPrefix: 'KS' });
  const [myProfile, setMyProfile] = useState<any>(null);
  const [companyPositions, setCompanyPositions] = useState<string[]>([]);
  // [수정] 회사마다 결재 단계/직책명이 다를 수 있어, 서버에 저장된 "우리 회사 기본 결재선"을 불러와 사용한다.
  // 저장된 게 없으면 null로 남아있고, 이 경우에만 내장된 예시 기본값을 쓴다.
  const [companyApprovalTemplate, setCompanyApprovalTemplate] = useState<{ advance: ApprovalStep[] | null; leave: ApprovalStep[] | null; official: ApprovalStep[] | null }>({ advance: null, leave: null, official: null });
  const [loading, setLoading] = useState<boolean>(true);

  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isOfficialModalOpen, setIsOfficialModalOpen] = useState(false);
  const [editingAdvanceId, setEditingAdvanceId] = useState<string | null>(null);
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);
  const [editingOfficialId, setEditingOfficialId] = useState<string | null>(null);

  // 가지급금 정산서 폼 상태
  const [apCompanyName, setApCompanyName] = useState('');
  const [apPeriodStart, setApPeriodStart] = useState(todayStr());
  const [apPeriodEnd, setApPeriodEnd] = useState(todayStr());
  const [apDepartment, setApDepartment] = useState('');
  const [apAuthor, setApAuthor] = useState('');
  const [apDraftDate, setApDraftDate] = useState(todayStr());
  const [apItems, setApItems] = useState<AdvancePaymentItem[]>([]);
  // [수정] 정산 항목에 딸려온 영수증 사진을 눌렀을 때 크게 볼 수 있는 팝업(라이트박스)용 상태
  const [enlargedReceiptUrl, setEnlargedReceiptUrl] = useState<string | null>(null);
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
  // 공문서 화면 출력(미리보기)
  const [previewOfficialId, setPreviewOfficialId] = useState<string | null>(null);

  // [추가] 공문서 폼 상태. 공유해주신 실제 공문 양식(수신자/참조/제목 + 번호 매겨진 본문 +
  // 결재란 + 시행번호/접수 + 발신처 정보)을 그대로 재현한다.
  // 기안자(작성자) - 문서 자체에는 안 찍히지만, 결재 요청 알림 이메일에 "누가 상신했는지" 표시할 때 쓰인다.
  const [ofAuthor, setOfAuthor] = useState('');
  const [ofRecipient, setOfRecipient] = useState('');
  const [ofReference, setOfReference] = useState('');
  const [ofSubject, setOfSubject] = useState('');
  // 본문은 textarea에 한 줄(문단)씩 입력받아 저장 시 bodyParagraphs 배열로 쪼갠다.
  const [ofBodyText, setOfBodyText] = useState('');
  const [ofIssueDate, setOfIssueDate] = useState(todayStr());
  const [ofExecutionNumber, setOfExecutionNumber] = useState('');
  const [ofReceiptNumber, setOfReceiptNumber] = useState('');
  const [ofCompanyName, setOfCompanyName] = useState('');
  const [ofCompanyAddress, setOfCompanyAddress] = useState('');
  const [ofCompanyPhone, setOfCompanyPhone] = useState('');
  const [ofCompanyFax, setOfCompanyFax] = useState('');
  const [ofCompanyEmail, setOfCompanyEmail] = useState('');
  const [ofApprovalLine, setOfApprovalLine] = useState<ApprovalStep[]>(defaultOfficialApprovalLine());

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
    fetchApprovalLineTemplate();
    fetchCompanySettings();
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

  // [수정] 회사(스코프) 단위로 저장된 기본 결재선을 불러온다. (여러 회사가 함께 쓰는 서비스이므로,
  // "경영지원실장/기술이사/대표이사" 같은 특정 회사의 직책이 모두에게 강제되지 않도록 회사별로 다르게 저장 가능하게 함)
  const fetchApprovalLineTemplate = async () => {
    try {
      const headers = currentUser ? { 'x-user-id': currentUser.id } : undefined;
      const res = await fetch('/api/approval-line-templates', { headers });
      if (!res.ok) return;
      const data = await res.json();
      setCompanyApprovalTemplate({
        advance: (data.advance && data.advance.length) ? data.advance : null,
        leave: (data.leave && data.leave.length) ? data.leave : null,
        official: (data.official && data.official.length) ? data.official : null
      });
    } catch (err) {
      console.error('Approval line template fetch error:', err);
    }
  };

  // [추가] 경영지원 서류와 공유하는 회사 공통 설정(주소/전화/팩스/이메일/시행번호 접두어)을 불러온다.
  // 공문서를 작성하는 사람 누구나 발신처 정보를 자동으로 채울 수 있어야 하므로 관리자가 아니어도 조회 가능하다.
  const fetchCompanySettings = async () => {
    try {
      const headers = currentUser ? { 'x-user-id': currentUser.id } : undefined;
      const res = await fetch('/api/company-settings', { headers });
      if (!res.ok) return;
      const data = await res.json();
      setCompanySettings({
        address: data.address || '', businessType: data.businessType || '',
        phone: data.phone || '', fax: data.fax || '', email: data.email || '',
        docPrefix: data.docPrefix || 'KS'
      });
    } catch (err) {
      console.error('Company settings fetch error:', err);
    }
  };

  // 현재 편집 중인 결재선을 "우리 회사 기본값"으로 저장 (다음부터 새 문서 작성 시 자동으로 채워짐)
  const saveApprovalLineAsCompanyDefault = async (kind: 'advance' | 'leave' | 'official', line: ApprovalStep[]) => {
    const cleanedLine = line.map(s => ({ role: s.role })); // 이름/날짜는 템플릿에 저장하지 않고 직책만
    const nextTemplate = { ...companyApprovalTemplate, [kind]: cleanedLine };
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      if (currentUser) headers['x-user-id'] = currentUser.id;
      const res = await fetch('/api/approval-line-templates', {
        method: 'PUT',
        headers,
        body: JSON.stringify(nextTemplate)
      });
      if (res.ok) {
        setCompanyApprovalTemplate(nextTemplate as any);
        alert('현재 결재선을 우리 회사 기본값으로 저장했습니다. 다음부터 새 문서 작성 시 자동으로 채워집니다.');
      } else {
        alert('저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }
    } catch (err) {
      console.error('Approval line template save error:', err);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const headers = currentUser ? { 'x-user-id': currentUser.id } : undefined;
      const [advRes, lvRes, ofRes] = await Promise.all([
        fetch('/api/approvals/advance', { headers }).then(r => r.json()),
        fetch('/api/approvals/leave', { headers }).then(r => r.json()),
        fetch('/api/approvals/official', { headers }).then(r => r.json())
      ]);
      if (Array.isArray(advRes)) setAdvanceList(advRes);
      if (Array.isArray(lvRes)) setLeaveList(lvRes);
      if (Array.isArray(ofRes)) setOfficialList(ofRes);
    } catch (err) {
      console.error('Approvals fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // [추가] 작성자 이름 칸에 입력하고 다른 칸으로 넘어가면(포커스 아웃), 그 사람이 예전에
  // 작성했던 문서 중 가장 최근 것의 부서를 찾아서 자동으로 채운다. 위의 resetAdvanceForm/
  // resetLeaveForm은 "새 문서 열 때 내 프로필 기준" 기본값만 채우므로, 작성자를 다른
  // 사람으로 바꿔 입력하는 경우까지 다루려면 이 헬퍼가 따로 필요하다. 일치하는 기록이
  // 없으면 기존에 입력된 부서를 지우지 않고 그대로 둔다.
  const fillAdvanceDepartmentForAuthor = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const match = advanceList
      .filter((d) => d.author === trimmed && d.department)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
    if (match?.department) setApDepartment(match.department);
  };
  const fillLeaveDepartmentForAuthor = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const match = leaveList
      .filter((d) => d.author === trimmed && d.department)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
    if (match?.department) setLvDepartment(match.department);
  };

  const resetAdvanceForm = () => {
    setApCompanyName(myProfile?.company || '');
    setApPeriodStart(todayStr());
    setApPeriodEnd(todayStr());
    // [수정] 프로필에 부서명이 없으면, 본인이 최근에 작성한 정산서에 남아있는 부서명을
    // 대신 찾아서 채워준다(운행기록/업무일지와 같은 방식으로 통일).
    if (myProfile?.department) {
      setApDepartment(myProfile.department);
    } else {
      const myName = myProfile?.name || currentUser?.name || '';
      const myLast = advanceList
        .filter((d) => d.author === myName && d.department)
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
      setApDepartment(myLast?.department || '');
    }
    setApAuthor(myProfile?.name || currentUser?.name || '');
    setApDraftDate(todayStr());
    setApItems([]);
    setApApprovalLine((companyApprovalTemplate.advance && companyApprovalTemplate.advance.length) ? companyApprovalTemplate.advance : defaultAdvanceApprovalLine());
    setEditingAdvanceId(null);
    setItemPickerForId(null);
  };

  const resetLeaveForm = () => {
    setLvDraftNumber(makeDraftNumber(leaveList.map(l => l.draftNumber || '')));
    // [수정] 위와 동일하게, 프로필에 없으면 본인의 최근 휴가신청서 부서명으로 대체한다.
    if (myProfile?.department) {
      setLvDepartment(myProfile.department);
    } else {
      const myName = myProfile?.name || currentUser?.name || '';
      const myLast = leaveList
        .filter((d) => d.author === myName && d.department)
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
      setLvDepartment(myLast?.department || '');
    }
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
    setLvApprovalLine((companyApprovalTemplate.leave && companyApprovalTemplate.leave.length) ? companyApprovalTemplate.leave : defaultLeaveApprovalLine());
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
    setApApprovalLine(doc.approvalLine && doc.approvalLine.length ? doc.approvalLine : ((companyApprovalTemplate.advance && companyApprovalTemplate.advance.length) ? companyApprovalTemplate.advance : defaultAdvanceApprovalLine()));
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
    setLvApprovalLine(doc.approvalLine && doc.approvalLine.length ? doc.approvalLine : ((companyApprovalTemplate.leave && companyApprovalTemplate.leave.length) ? companyApprovalTemplate.leave : defaultLeaveApprovalLine()));
    setIsLeaveModalOpen(true);
  };

  // [추가] 공문서 폼 초기화. 시행번호는 오늘 날짜 + 회사 접두어 기준으로 자동 계산해 채워주되,
  // 언제든 직접 고칠 수 있는 일반 입력창이라 겹치거나 틀리면 사용자가 바로 수정하면 된다.
  const resetOfficialForm = () => {
    const today = todayStr();
    setOfAuthor(myProfile?.name || currentUser?.name || '');
    setOfRecipient('');
    setOfReference('');
    setOfSubject('');
    setOfBodyText('');
    setOfIssueDate(today);
    setOfExecutionNumber(makeExecutionNumber(officialList.map(d => d.executionNumber || ''), companySettings.docPrefix, today));
    setOfReceiptNumber('');
    setOfCompanyName(myProfile?.company || currentUser?.companyName || '');
    setOfCompanyAddress(companySettings.address || '');
    setOfCompanyPhone(companySettings.phone || '');
    setOfCompanyFax(companySettings.fax || '');
    setOfCompanyEmail(companySettings.email || '');
    setOfApprovalLine((companyApprovalTemplate.official && companyApprovalTemplate.official.length) ? companyApprovalTemplate.official : defaultOfficialApprovalLine());
    setEditingOfficialId(null);
  };

  const openNewOfficial = () => { resetOfficialForm(); setIsOfficialModalOpen(true); };

  const openEditOfficial = (doc: OfficialDocument) => {
    setEditingOfficialId(doc.id);
    setOfAuthor(doc.author || '');
    setOfRecipient(doc.recipient);
    setOfReference(doc.reference || '');
    setOfSubject(doc.subject);
    setOfBodyText((doc.bodyParagraphs || []).join('\n'));
    setOfIssueDate(doc.issueDate);
    setOfExecutionNumber(doc.executionNumber);
    setOfReceiptNumber(doc.receiptNumber || '');
    setOfCompanyName(doc.companyName);
    setOfCompanyAddress(doc.companyAddress || '');
    setOfCompanyPhone(doc.companyPhone || '');
    setOfCompanyFax(doc.companyFax || '');
    setOfCompanyEmail(doc.companyEmail || '');
    setOfApprovalLine(doc.approvalLine && doc.approvalLine.length ? doc.approvalLine : ((companyApprovalTemplate.official && companyApprovalTemplate.official.length) ? companyApprovalTemplate.official : defaultOfficialApprovalLine()));
    setIsOfficialModalOpen(true);
  };

  // [추가] 공문서 발신처 정보(주소/전화/팩스/이메일/시행번호 접두어)를 회사 공통 설정에 저장한다.
  // 관리자만 저장할 수 있고, 저장해두면 다음 공문서 작성 시 자동으로 채워진다.
  const saveCompanyContactSettings = async () => {
    if (!currentUser) return;
    try {
      const headers = { 'Content-Type': 'application/json', 'x-user-id': currentUser.id };
      const patch = { address: ofCompanyAddress, phone: ofCompanyPhone, fax: ofCompanyFax, email: ofCompanyEmail, docPrefix: companySettings.docPrefix || 'KS' };
      const res = await fetch('/api/company-settings', { method: 'PUT', headers, body: JSON.stringify(patch) });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCompanySettings(prev => ({ ...prev, address: data.address || '', phone: data.phone || '', fax: data.fax || '', email: data.email || '', docPrefix: data.docPrefix || 'KS' }));
      alert('발신처 정보를 회사 기본값으로 저장했습니다. 다음 공문서 작성 시 자동으로 채워집니다.');
    } catch (err) {
      console.error('Company contact settings save error:', err);
      alert('저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
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
              payMethodLabel: exp.payMethod === 'cash_personal' ? '개인현금' : '개인카드',
              receiptImage: exp.receiptImage
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
            payMethodLabel: exp.payMethod === 'cash' ? '현금' : '개인카드',
            receiptImage: exp.receiptImage
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
            payMethodLabel: m.payMethod === 'cash' ? '현금' : '개인카드',
            receiptImage: m.receiptImage
          });
        });
    }

    // [수정] 최신순(내림차순)이던 정렬을 날짜 오름차순(오래된 순)으로 변경.
    // 뒤쪽 "영수증 첨부" 페이지도 날짜 오름차순으로 정렬되므로, 가져오기 목록과 등록 순서를
    // 통일해두면 경영정보실장이 위 표와 뒤 영수증을 순서대로 대조하기 쉬워진다.
    worklogRows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    vehicleRows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    maintenanceRows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
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
      amount: row.amount, account: row.account, companyName: row.companyName, remark: row.remark,
      receiptImage: row.receiptImage
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
      amount: r.amount, account: r.account, companyName: r.companyName, remark: r.remark,
      receiptImage: r.receiptImage
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
    const dateCell = (d?: string, sigUrl?: string) => `<td style="${cellBorder} text-align:center; height:32px;">${sigUrl ? `<img src="${esc(sigUrl)}" style="max-height:26px; max-width:90%; display:block; margin:0 auto 2px;" />` : ''}${esc(d || '')}</td>`;

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
          ${approvalLine.map(s => dateCell(s.date, s.signatureUrl)).join('')}
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

  // [수정] 이 인쇄는 #print-root 포털 내용을 쓰므로, 인쇄할 때만 body에 print-portal-mode를
  // 붙여서 #root(화면에 보이는 나머지 앱)를 감춘다.
  const handlePrintAdvance = () => {
    document.body.classList.add('print-portal-mode');
    window.addEventListener('afterprint', () => document.body.classList.remove('print-portal-mode'), { once: true });
    window.print();
  };

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
                {approvalLine.map((s, i) => (
                  <td key={i} style={{ ...cellStyle, textAlign: 'center', height: 48 }}>
                    {s.signatureUrl && <img src={s.signatureUrl} style={{ maxHeight: 28, maxWidth: '90%', display: 'block', margin: '0 auto 2px' }} />}
                    {s.date || ''}
                  </td>
                ))}
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

        {/* [수정] 영수증 사진이 첨부된 항목이 하나라도 있으면, 정산서 뒤에 "영수증 첨부" 페이지를
            자동으로 붙여서 결재 올릴 때 증빙이 같이 첨부되도록 한다 (인쇄 시 새 페이지로 시작됨). */}
        {items.some(it => it.receiptImage) && (
          <div style={{ pageBreakBefore: 'always', marginTop: 24 }}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 18, fontWeight: 800, borderBottom: '2px solid #000', paddingBottom: 4 }}>영수증 첨부</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {items
                .filter(it => it.receiptImage)
                .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
                .map((it, idx) => (
                <div key={it.id} style={{ border: '0.5pt solid #000', padding: 8, breakInside: 'avoid' }}>
                  <img src={it.receiptImage} alt="영수증" style={{ width: '100%', maxHeight: 260, objectFit: 'contain', display: 'block', marginBottom: 6 }} />
                  <div style={{ fontSize: 10, lineHeight: 1.5 }}>
                    <div><strong>No.{idx + 1} &nbsp;날짜:</strong> {it.date}</div>
                    <div><strong>내용:</strong> {it.description}</div>
                    <div><strong>금액:</strong> {it.amount.toLocaleString()}원</div>
                    {it.companyName && <div><strong>상호:</strong> {it.companyName}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  // [수정] 이 인쇄도 #print-root 포털 내용을 쓰므로 위 handlePrintAdvance와 동일하게 처리.
  const handlePrintLeave = () => {
    document.body.classList.add('print-portal-mode');
    window.addEventListener('afterprint', () => document.body.classList.remove('print-portal-mode'), { once: true });
    window.print();
  };

  // 화면에 보이는 휴가 신청서 양식 그대로 엑셀(.xls)로 다운로드
  const downloadLeaveToExcel = (doc: LeaveRequest) => {
    const esc = (str: any): string => (str === null || str === undefined ? '' : String(str))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
    const cellBorder = 'border: 0.5pt solid #000000;';
    const grayBg = 'background-color: #f3f4f6;';
    const baseFont = "font-family: 'Malgun Gothic', Arial; font-size: 10pt;";
    const approvalLine = doc.approvalLine || [];

    const markCell = (cat: string, extra?: string) => {
      const selected = doc.leaveCategory === cat;
      const bg = selected ? 'background-color: #fde68a;' : '';
      const content = selected ? `●${extra ? `<br/><span style="font-weight:normal;font-size:8pt;">(${esc(extra)})</span>` : ''}` : '';
      return `<td style="${cellBorder} text-align:center; font-weight:bold; ${bg}">${content}</td>`;
    };
    const markSpecial = (t: string) => (doc.leaveCategory === 'special' && doc.specialType === t) ? 'background-color: #fde68a; font-weight:bold;' : '';
    const annualExtra = doc.leaveCategory === 'annual' && doc.annualType && doc.annualType !== 'full' ? ANNUAL_TYPE_LABEL[doc.annualType] : undefined;
    const otherExtra = doc.leaveCategory === 'other' ? doc.leaveCategoryCustom : undefined;

    // 엑셀은 별도의 <table> 태그끼리는 열 폭을 공유하지 않으므로, 결재 영역과 본문 표를
    // 하나의 표 + 하나의 11열 구성으로 합쳐야 결재표가 본문 표와 정확히 같은 오른쪽 끝까지 맞춰진다.
    const COLS = Array(11).fill(9); // 11개 열, 각 9% (합계 99%, 반올림 오차는 무시)
    const colgroup = `<colgroup>${COLS.map(w => `<col style="width:${w}%;" />`).join('')}</colgroup>`;

    const bodyHtml = `
      <table style="border-collapse: collapse; width:100%; border-left:1.5pt solid #000; border-right:1.5pt solid #000; border-bottom:1.5pt solid #000; border-top:none; ${baseFont} table-layout: fixed;" cellpadding="4">
        ${colgroup}
        <tr><td colspan="11" style="border:none; height:2px; line-height:2px; font-size:1px;">&nbsp;</td></tr>
        <tr>
          <td colspan="6" style="border:none;"></td>
          <td rowspan="2" style="${cellBorder} ${grayBg} font-weight:bold; text-align:center;">결&nbsp;&nbsp;재</td>
          ${approvalLine.map(s => `<th style="${cellBorder} ${grayBg} text-align:center;">${esc(s.role)}</th>`).join('')}
        </tr>
        <tr>
          <td colspan="6" style="border:none;"></td>
          ${approvalLine.map(s => `<td style="${cellBorder} text-align:center; height:32px;">${s.signatureUrl ? `<img src="${esc(s.signatureUrl)}" style="max-height:26px; max-width:90%; display:block; margin:0 auto 2px;" />` : ''}${esc(s.date || '')}</td>`).join('')}
        </tr>
        <tr><td colspan="11" style="border:none; padding-top:10px;">기안번호 : ${esc(doc.draftNumber)}</td></tr>
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
        ${Array(11).fill(`<tr style="height:17pt;"><td colspan="11" style="border:none; height:17pt;">&nbsp;</td></tr>`).join('')}
        <tr><td colspan="11" style="border:none; text-align:center; ${baseFont}">위와 같이 신청하오니 승인하여 주시기 바랍니다.</td></tr>
        <tr style="height:17pt;"><td colspan="11" style="border:none; height:17pt;">&nbsp;</td></tr>
        <tr><td colspan="11" style="border:none; text-align:center; ${baseFont}">${esc(doc.submittedDate.replace(/-/g, '. '))}</td></tr>
        ${Array(11).fill(`<tr style="height:17pt;"><td colspan="11" style="border:none; height:17pt;">&nbsp;</td></tr>`).join('')}
      </table>`;

    const fullHtml = `
      <table style="border-collapse: collapse; width: 190mm; height: 265mm;"><tr>
      <td style="box-sizing: border-box; padding: 15mm 10mm; mso-padding-alt: 43pt 28pt 43pt 28pt; vertical-align: top;">
      <table style="border-collapse: collapse; width:100%; height:100%; border: 2px solid #000000;"><tr>
      <td style="box-sizing: border-box; padding: 10mm; mso-padding-alt: 28pt 28pt 28pt 28pt; vertical-align: top;">
      <div style="text-align:center; margin-bottom:16px;">
        <span style="font-size:18pt; font-weight:bold; border-bottom: 6px double #000000; padding-bottom:4px;">휴가 신청서</span>
      </div>
      ${bodyHtml}
      </td>
      </tr></table>
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
      <div style={{ width: '210mm', minHeight: '270mm', boxSizing: 'border-box', margin: '0 auto', display: 'flex', flexDirection: 'column', paddingTop: '15mm', paddingBottom: '15mm', paddingLeft: '10mm', paddingRight: '10mm', background: 'white' }}>
      <div style={{ flex: 1, border: '3px solid #000', boxSizing: 'border-box', padding: '10mm', color: 'black', fontFamily: "'Malgun Gothic', Arial, sans-serif", fontSize: 11 }}>
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
                {approvalLine.map((s, i) => (
                  <td key={i} style={{ ...cellStyle, textAlign: 'center', height: 48 }}>
                    {s.signatureUrl && <img src={s.signatureUrl} style={{ maxHeight: 28, maxWidth: '90%', display: 'block', margin: '0 auto 2px' }} />}
                    {s.date || ''}
                  </td>
                ))}
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
        if (!res.ok) throw new Error(`정산서 저장에 실패했습니다 (상태: ${res.status}).`);
        const updated = await res.json();
        setAdvanceList(prev => prev.map(d => d.id === editingAdvanceId ? updated : d));
      } else {
        const res = await fetch('/api/approvals/advance', { method: 'POST', headers, body: JSON.stringify({ ...payload, status: 'pending' }) });
        if (!res.ok) throw new Error(`정산서 저장에 실패했습니다 (상태: ${res.status}).`);
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
        if (!res.ok) throw new Error(`휴가신청서 저장에 실패했습니다 (상태: ${res.status}).`);
        const updated = await res.json();
        setLeaveList(prev => prev.map(d => d.id === editingLeaveId ? updated : d));
      } else {
        const res = await fetch('/api/approvals/leave', { method: 'POST', headers, body: JSON.stringify({ ...payload, status: 'pending' }) });
        if (!res.ok) throw new Error(`휴가신청서 저장에 실패했습니다 (상태: ${res.status}).`);
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

  const saveOfficial = async () => {
    if (!ofRecipient.trim()) { alert('수신자를 입력해 주세요.'); return; }
    if (!ofSubject.trim()) { alert('제목을 입력해 주세요.'); return; }
    if (!currentUser) return;
    const headers = { 'Content-Type': 'application/json', 'x-user-id': currentUser.id };
    // 본문은 textarea에서 한 줄(문단)씩 입력받은 걸 배열로 쪼갠다. 빈 줄은 문단 사이 여백일 뿐이니 제외.
    const bodyParagraphs = ofBodyText.split('\n').map(p => p.trim()).filter(p => p.length > 0);
    const payload: Partial<OfficialDocument> = {
      companyName: ofCompanyName, author: ofAuthor || currentUser.name, recipient: ofRecipient, reference: ofReference || undefined,
      subject: ofSubject, bodyParagraphs, issueDate: ofIssueDate, executionNumber: ofExecutionNumber,
      receiptNumber: ofReceiptNumber || undefined, companyAddress: ofCompanyAddress || undefined,
      companyPhone: ofCompanyPhone || undefined, companyFax: ofCompanyFax || undefined,
      companyEmail: ofCompanyEmail || undefined, approvalLine: ofApprovalLine
    };
    try {
      if (editingOfficialId) {
        const res = await fetch(`/api/approvals/official/${editingOfficialId}`, { method: 'PUT', headers, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(`공문서 저장에 실패했습니다 (상태: ${res.status}).`);
        const updated = await res.json();
        setOfficialList(prev => prev.map(d => d.id === editingOfficialId ? updated : d));
      } else {
        const res = await fetch('/api/approvals/official', { method: 'POST', headers, body: JSON.stringify({ ...payload, status: 'pending' }) });
        if (!res.ok) throw new Error(`공문서 저장에 실패했습니다 (상태: ${res.status}).`);
        const created = await res.json();
        setOfficialList(prev => [created, ...prev]);
      }
      setIsOfficialModalOpen(false);
      resetOfficialForm();
    } catch (err) {
      console.error('Official document save error:', err);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const deleteAdvance = async (id: string) => {
    if (!currentUser) return;
    if (!confirm('이 정산서를 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/approvals/advance/${id}`, { method: 'DELETE', headers: { 'x-user-id': currentUser.id } });
      if (!res.ok) throw new Error(`삭제에 실패했습니다 (상태: ${res.status}).`);
      setAdvanceList(prev => prev.filter(d => d.id !== id));
    } catch (err: any) {
      alert(`삭제에 실패했습니다.\n${err.message || '다시 시도해주세요.'}`);
    }
  };

  const deleteLeave = async (id: string) => {
    if (!currentUser) return;
    if (!confirm('이 휴가 신청서를 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/approvals/leave/${id}`, { method: 'DELETE', headers: { 'x-user-id': currentUser.id } });
      if (!res.ok) throw new Error(`삭제에 실패했습니다 (상태: ${res.status}).`);
      setLeaveList(prev => prev.filter(d => d.id !== id));
    } catch (err: any) {
      alert(`삭제에 실패했습니다.\n${err.message || '다시 시도해주세요.'}`);
    }
  };

  const deleteOfficial = async (id: string) => {
    if (!currentUser) return;
    if (!confirm('이 공문서를 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/approvals/official/${id}`, { method: 'DELETE', headers: { 'x-user-id': currentUser.id } });
      if (!res.ok) throw new Error(`삭제에 실패했습니다 (상태: ${res.status}).`);
      setOfficialList(prev => prev.filter(d => d.id !== id));
    } catch (err: any) {
      alert(`삭제에 실패했습니다.\n${err.message || '다시 시도해주세요.'}`);
    }
  };

  // 결재선의 다음 미결 단계에 오늘 날짜로 승인 처리 (모든 단계가 끝나면 문서 상태를 승인으로 전환)
  // [수정] 승인자 이름과 서명 이미지도 그 단계에 같이 스냅샷으로 남긴다. approverOverride는
  // "방금 서명을 등록/변경한 직후 이어서 승인하는" 경우에 쓴다 - currentUser prop이 다음
  // 렌더링에서야 갱신되므로, 그 사이의 낡은 값 대신 방금 저장된 최신 사용자 정보를 바로 쓰기 위함.
  const advanceNextApprovalStep = async (kind: 'advance' | 'leave' | 'official', id: string, approverOverride?: User) => {
    const approver = approverOverride || currentUser;
    if (!approver) return;
    const list: any[] = kind === 'advance' ? advanceList : kind === 'leave' ? leaveList : officialList;
    const doc = list.find((d: any) => d.id === id);
    if (!doc) return;
    const line: ApprovalStep[] = [...doc.approvalLine];
    const idx = line.findIndex(s => !s.date);
    if (idx === -1) return;
    line[idx] = { ...line[idx], date: todayStr(), name: approver.name, signatureUrl: approver.signatureImage };
    const allDone = line.every(s => !!s.date);
    const headers = { 'Content-Type': 'application/json', 'x-user-id': approver.id };
    const body = JSON.stringify({ approvalLine: line, status: allDone ? 'approved' : 'pending' });
    try {
      if (kind === 'advance') {
        const res = await fetch(`/api/approvals/advance/${id}`, { method: 'PUT', headers, body });
        if (!res.ok) throw new Error(`승인 처리에 실패했습니다 (상태: ${res.status}).`);
        const updated = await res.json();
        setAdvanceList(prev => prev.map(d => d.id === id ? updated : d));
      } else if (kind === 'leave') {
        const res = await fetch(`/api/approvals/leave/${id}`, { method: 'PUT', headers, body });
        if (!res.ok) throw new Error(`승인 처리에 실패했습니다 (상태: ${res.status}).`);
        const updated = await res.json();
        setLeaveList(prev => prev.map(d => d.id === id ? updated : d));
      } else {
        const res = await fetch(`/api/approvals/official/${id}`, { method: 'PUT', headers, body });
        if (!res.ok) throw new Error(`승인 처리에 실패했습니다 (상태: ${res.status}).`);
        const updated = await res.json();
        setOfficialList(prev => prev.map(d => d.id === id ? updated : d));
      }
    } catch (err: any) {
      alert(`승인 처리에 실패했습니다.\n${err.message || '다시 시도해주세요.'}`);
    }
  };

  // [추가] "승인" 버튼을 눌렀을 때: 아직 서명을 등록 안 했으면 먼저 서명 등록 모달을 띄우고,
  // 저장이 끝나면 자동으로 이어서 승인 처리한다. 이미 등록돼 있으면 바로 승인한다.
  const handleApproveClick = (kind: 'advance' | 'leave' | 'official', id: string) => {
    if (!currentUser) return;
    if (!currentUser.signatureImage) {
      setPendingApprovalTarget({ kind, id });
      setIsSignaturePadOpen(true);
      return;
    }
    advanceNextApprovalStep(kind, id);
  };

  const rejectDoc = async (kind: 'advance' | 'leave' | 'official', id: string) => {
    if (!currentUser) return;
    const memo = prompt('반려 사유를 입력해 주세요.') || '';
    const headers = { 'Content-Type': 'application/json', 'x-user-id': currentUser.id };
    const body = JSON.stringify({ status: 'rejected', approverMemo: memo });
    try {
      if (kind === 'advance') {
        const res = await fetch(`/api/approvals/advance/${id}`, { method: 'PUT', headers, body });
        if (!res.ok) throw new Error(`반려 처리에 실패했습니다 (상태: ${res.status}).`);
        const updated = await res.json();
        setAdvanceList(prev => prev.map(d => d.id === id ? updated : d));
      } else if (kind === 'leave') {
        const res = await fetch(`/api/approvals/leave/${id}`, { method: 'PUT', headers, body });
        if (!res.ok) throw new Error(`반려 처리에 실패했습니다 (상태: ${res.status}).`);
        const updated = await res.json();
        setLeaveList(prev => prev.map(d => d.id === id ? updated : d));
      } else {
        const res = await fetch(`/api/approvals/official/${id}`, { method: 'PUT', headers, body });
        if (!res.ok) throw new Error(`반려 처리에 실패했습니다 (상태: ${res.status}).`);
        const updated = await res.json();
        setOfficialList(prev => prev.map(d => d.id === id ? updated : d));
      }
    } catch (err: any) {
      alert(`반려 처리에 실패했습니다.\n${err.message || '다시 시도해주세요.'}`);
    }
  };

  // [추가] 공문서 인쇄. 화면 미리보기와 동일한 renderPrintableOfficial 출력을 #print-root
  // 포털로 그대로 재사용해, 화면에 보이는 그대로 인쇄/PDF 저장되도록 한다.
  const handlePrintOfficial = () => {
    document.body.classList.add('print-portal-mode');
    window.addEventListener('afterprint', () => document.body.classList.remove('print-portal-mode'), { once: true });
    window.print();
  };

  // [추가] 공문서 출력용 렌더러. 요청하신 여백(위/아래 20mm, 좌/우 25mm)을 그대로 반영하고,
  // 화면 미리보기와 실제 인쇄(#print-root 포털) 양쪽에서 동일하게 재사용한다.
  const renderPrintableOfficial = (doc: OfficialDocument | undefined) => {
    if (!doc) return null;
    const approvalLine = doc.approvalLine || [];
    const bodyParagraphs = doc.bodyParagraphs || [];
    const footerLine = [doc.companyPhone && `전화 : ${doc.companyPhone}`, doc.companyFax && `전송 : ${doc.companyFax}`, doc.companyEmail && `e-mail : ${doc.companyEmail}`].filter(Boolean).join('   ');
    // [수정] 결재란 우측 상단에 표시하는 "최종 결재일" - 배열상 마지막 날짜가 아니라, 실제로
    // "대표"(대표/대표이사 등) 역할을 맡은 단계가 결재한 날짜를 명시적으로 찾아서 쓴다.
    // 결재선에 "대표" 역할이 없으면(회사마다 결재선 구성이 다를 수 있으므로) 예외적으로
    // 배열상 가장 마지막에 결재된 날짜로 대신한다.
    const daepyoStep = approvalLine.find(s => s.role.includes('대표'));
    const finalApprovalDate = daepyoStep?.date || [...approvalLine].reverse().find(s => s.date)?.date || '';
    // 실제 양식의 라벨 색(진한 파랑) - 담당/이사/협조자/대표, 시행 라벨에만 쓰이고 나머지는 검정 그대로.
    const labelBlue = '#1a5cab';
    return (
      // [수정] 출력/미리보기가 실제 A4 용지 크기(297mm)에 맞게 보이도록 minHeight를 지정하고,
      // 아래쪽 결재/직인 블록을 페이지 맨 밑(여백 25mm)으로 밀어내기 위해 flex column으로 구성한다.
      // 하단 여백만 25mm로(다른 여백은 기존 위/아래 20, 좌우 25 그대로 유지) 늘려서, 그 여백
      // 바로 위에 결재 블록이 marginTop:'auto'로 붙게 된다.
      <div style={{ width: '210mm', minHeight: '297mm', boxSizing: 'border-box', margin: '0 auto', padding: '20mm 25mm 25mm', display: 'flex', flexDirection: 'column', color: 'black', fontFamily: "'Malgun Gothic', Arial, sans-serif", fontSize: 12, background: 'white' }}>
        {/* [수정] 상단 레터헤드: 로고는 왼쪽 끝에 고정, 회사명은 전체 폭 기준 가운데 정렬.
            로고 높이를 회사명 글자("(주)카이저솔루션", 22px)의 위아래 폭에 맞춰 32px로 조정했다. */}
        <div style={{ position: 'relative', textAlign: 'center', marginBottom: 28, minHeight: 34 }}>
          <img src="/brand/kaiser-logo.png" alt="" style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', height: 32 }} />
          <span style={{ fontSize: 22, fontWeight: 800 }}>{doc.companyName}</span>
        </div>

        {/* 수신자/참조/제목 - 줄마다 밑줄 없이, 블록 전체 아래에 선 하나만 긋는다 */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, borderBottom: '1px solid #000' }}>
          <tbody>
            <tr>
              <td style={{ width: 76, padding: '5px 0', fontWeight: 700, verticalAlign: 'top' }}>수 신 자</td>
              <td style={{ padding: '5px 0' }}>{doc.recipient}</td>
            </tr>
            <tr>
              <td style={{ padding: '5px 0', fontWeight: 700, verticalAlign: 'top' }}>참&nbsp;&nbsp;&nbsp;&nbsp;조</td>
              <td style={{ padding: '5px 0' }}>{doc.reference || ''}</td>
            </tr>
            <tr>
              <td style={{ padding: '5px 0 10px', fontWeight: 700, verticalAlign: 'top' }}>제&nbsp;&nbsp;&nbsp;&nbsp;목</td>
              <td style={{ padding: '5px 0 10px', fontWeight: 700 }}>{doc.subject}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ minHeight: 180, lineHeight: 1.9, fontSize: 12 }}>
          {bodyParagraphs.map((p, i) => (
            <p key={i} style={{ marginBottom: 14 }}>
              <span style={{ marginRight: 6 }}>{i + 1}.</span>{p}{i === bodyParagraphs.length - 1 ? '  - 끝 -' : ''}
            </p>
          ))}
        </div>

        {/* [수정] 하단 블록(직인+결재란+시행/접수+발신처 정보) 전체를 하나로 묶어서, 본문 뒤에
            바로 붙지 않고 marginTop:'auto'로 페이지 맨 아래(바깥 padding-bottom 25mm 바로 위)까지
            밀어낸다. 상위 컨테이너가 flex column이라 이 auto 마진이 남은 세로 공간을 모두 차지한다. */}
        <div style={{ marginTop: 'auto' }}>
          {/* [추가] 회사명 + 직인(도장) - 실제로 도장이 찍힌 것처럼 회사명 글자 위에 살짝 겹치게, 가운데 배치 */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: 40, marginBottom: 0 }}>
            <span style={{ fontSize: 20, fontWeight: 800 }}>{doc.companyName}</span>
            <img src="/brand/kaiser-seal.png" alt="" style={{ height: 58, marginLeft: -20 }} />
          </div>

          {/* [수정] 도장 아래 굵은 회색 구분선 - 그 아래로 결재란/시행/발신처 정보를 묶는다 */}
          <div style={{ borderTop: '4px solid #5d5d5d', marginTop: 10, paddingTop: 14, fontSize: 11 }}>
            {/* [수정] 결재란 - 표(테두리) 없이 한 줄로 배치. 담당/이사/협조자는 왼쪽에 나란히,
                "결재 [날짜]"와 "대표 [서명]"은 오른쪽에 세로로 쌓아서 같은 폭(오른쪽 정렬)으로
                맞춘다 - 대표이사가 결재하면 서명이 아래 칸에, 그 결재 날짜가 서명 바로 위에 표시됨. */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16, gap: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
                {approvalLine.filter(s => !s.role.includes('대표')).map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: labelBlue, fontWeight: 700 }}>{s.role}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 56 }}>
                      {s.signatureUrl && <img src={s.signatureUrl} style={{ maxHeight: 24, maxWidth: 72 }} />}
                      <span style={{ fontSize: 10 }}>{s.date || ''}</span>
                    </span>
                  </div>
                ))}
              </div>
              {daepyoStep && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div style={{ fontWeight: 700 }}>결재&nbsp;&nbsp;{finalApprovalDate}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: labelBlue, fontWeight: 700 }}>대표</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 56 }}>
                      {daepyoStep.signatureUrl && <img src={daepyoStep.signatureUrl} style={{ maxHeight: 24, maxWidth: 72 }} />}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <p style={{ marginBottom: 4 }}>
              <span style={{ color: labelBlue }}>시행</span>&nbsp;&nbsp;{doc.executionNumber}{doc.issueDate ? `(${formatDateDot(doc.issueDate)})` : ''}&nbsp;&nbsp;&nbsp;&nbsp;접수&nbsp;&nbsp;{doc.receiptNumber || ''}
            </p>
            {/* 맨 아래 2줄: 첫 줄엔 (우편번호 포함) 주소, 둘째 줄엔 전화/전송/이메일 */}
            {doc.companyAddress && <p style={{ color: '#333', marginBottom: 2 }}>{doc.companyAddress}</p>}
            {footerLine && <p style={{ color: '#333' }}>{footerLine}</p>}
          </div>
        </div>
      </div>
    );
  };

  const ApprovalLineMini: React.FC<{ line: ApprovalStep[] }> = ({ line }) => (
    <div className="flex items-center gap-1 flex-wrap">
      {line.map((s, i) => (
        <span key={i} className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${s.date ? 'bg-emerald-50 text-emerald-700 border-emerald-500/30' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
          {s.role}{s.date ? ` ✓ ${s.date}` : ''}
        </span>
      ))}
    </div>
  );

  return (
    <div className="space-y-5">
      {/* 전자결재 하위 탭 */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveApprovalTab('advance')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
              activeApprovalTab === 'advance' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/60 border border-transparent'
            }`}
          >
            <Wallet className="w-4 h-4" />
            <span>가지급금 정산서</span>
            <span className="px-1.5 py-0.2 rounded-full text-[11px] bg-slate-100 text-slate-600 font-mono">{advanceList.length}</span>
          </button>
          <button
            onClick={() => setActiveApprovalTab('leave')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
              activeApprovalTab === 'leave' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/60 border border-transparent'
            }`}
          >
            <Plane className="w-4 h-4" />
            <span>휴가 신청서</span>
            <span className="px-1.5 py-0.2 rounded-full text-[11px] bg-slate-100 text-slate-600 font-mono">{leaveList.length}</span>
          </button>
          <button
            onClick={() => setActiveApprovalTab('official')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
              activeApprovalTab === 'official' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/60 border border-transparent'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>공문서</span>
            <span className="px-1.5 py-0.2 rounded-full text-[11px] bg-slate-100 text-slate-600 font-mono">{officialList.length}</span>
          </button>
        </div>
        <button
          onClick={() => { setPendingApprovalTarget(null); setIsSignaturePadOpen(true); }}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold text-xs bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 transition-colors"
        >
          <PenTool className="w-3.5 h-3.5 text-indigo-500" />
          <span>{currentUser?.signatureImage ? '내 서명 변경' : '내 서명 등록'}</span>
        </button>
      </div>

      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">결재 문서를 불러오는 중입니다...</p>
        </div>
      ) : activeApprovalTab === 'advance' ? (
        <div className="space-y-4">
          <div className="flex justify-start">
            <button onClick={openNewAdvance} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm shadow-md shadow-blue-600/25 transition-all active:scale-95">
              <Plus className="w-4 h-4" /><span>가지급금 정산서 작성</span>
            </button>
          </div>

          {advanceList.length === 0 ? (
            <div className="py-20 text-center text-slate-400 bg-slate-100 border border-dashed border-slate-200 rounded-2xl">
              <Wallet className="w-8 h-8 mx-auto mb-2 text-slate-700" />
              <p className="text-sm">등록된 가지급금 정산서가 없습니다.</p>
            </div>
          ) : (
            <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-3 -mx-1 px-1 [scrollbar-width:thin]">
              {[...advanceList].sort((a, b) => {
                const byDate = (b.periodStart || '').localeCompare(a.periodStart || '');
                if (byDate !== 0) return byDate;
                return (b.createdAt || '').localeCompare(a.createdAt || '');
              }).slice(0, visibleAdvanceCount).map(doc => {
                const total = (doc.items || []).reduce((s, it) => s + (Number(it.amount) || 0), 0);
                return (
                  <div key={doc.id} className="bg-slate-100 border border-slate-200 rounded-2xl p-4 space-y-2.5 snap-center shrink-0 w-[88vw] sm:w-[420px]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-slate-800 truncate">{doc.companyName} 가지급금 정산서</h3>
                          <StatusBadge status={doc.status} />
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                          <span className="flex items-center gap-1"><UserIcon className="w-3 h-3" />{doc.author}</span>
                          <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{doc.department}</span>
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatKoreanPeriod(doc.periodStart, doc.periodEnd)}</span>
                        </div>
                        <ApprovalLineMini line={doc.approvalLine || []} />
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => setPreviewAdvanceId(doc.id)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-indigo-400 transition-colors" title="출력 미리보기">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEditAdvance(doc)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-400 transition-colors">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteAdvance(doc.id)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-rose-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="text-xs bg-slate-100 rounded-xl p-3 flex items-center justify-between">
                      <span className="text-slate-400">정산 항목 {(doc.items || []).length}건</span>
                      <span className="font-bold text-slate-700">총 합계 {formatCurrencyInput(total)}원</span>
                    </div>

                    {doc.status === 'pending' && (
                      <div className="flex items-center gap-2 pt-1">
                        <button onClick={() => handleApproveClick('advance', doc.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-bold border border-emerald-600/30 transition-colors">
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

              {/* [수정] 더 남은 정산서가 있으면 "더 보기" 버튼으로 이어서 로딩 */}
              {visibleAdvanceCount < advanceList.length && (
                <button
                  type="button"
                  onClick={() => setVisibleAdvanceCount((prev) => Math.min(prev + 50, advanceList.length))}
                  className="flex-none w-[150px] snap-center border border-dashed border-slate-200 hover:border-indigo-500/50 bg-slate-100 hover:bg-white rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-indigo-600 transition-all"
                >
                  <span className="text-2xl">＋</span>
                  <span className="text-xs font-bold">{advanceList.length - visibleAdvanceCount}건 더 보기</span>
                </button>
              )}
            </div>
          )}
        </div>
      ) : activeApprovalTab === 'leave' ? (
        <div className="space-y-4">
          <div className="flex justify-start">
            <button onClick={openNewLeave} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm shadow-md shadow-blue-600/25 transition-all active:scale-95">
              <Plus className="w-4 h-4" /><span>휴가 신청서 작성</span>
            </button>
          </div>

          {leaveList.length === 0 ? (
            <div className="py-20 text-center text-slate-400 bg-slate-100 border border-dashed border-slate-200 rounded-2xl">
              <Plane className="w-8 h-8 mx-auto mb-2 text-slate-700" />
              <p className="text-sm">등록된 휴가 신청서가 없습니다.</p>
            </div>
          ) : (
            <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-3 -mx-1 px-1 [scrollbar-width:thin]">
              {[...leaveList].sort((a, b) => {
                const byDate = (b.startDate || '').localeCompare(a.startDate || '');
                if (byDate !== 0) return byDate;
                return (b.createdAt || '').localeCompare(a.createdAt || '');
              }).slice(0, visibleLeaveCount).map(doc => (
                <div key={doc.id} className="bg-slate-100 border border-slate-200 rounded-2xl p-4 space-y-2.5 snap-center shrink-0 w-[88vw] sm:w-[420px]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-800 truncate">{doc.author}님 휴가 신청서</h3>
                        <StatusBadge status={doc.status} />
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-500/30">
                          {leaveCategoryDisplay(doc)}
                        </span>
                        {doc.totalAnnualDays ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-500/30">
                            누적 {computeAnnualLeaveLabel(doc, leaveList)}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{doc.draftNumber}</span>
                        <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{doc.department}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{doc.startDate} ~ {doc.endDate}{doc.startTime ? ` (${doc.startTime}~${doc.endTime || ''})` : ''} · {doc.days}일</span>
                      </div>
                      {doc.reason && <p className="text-xs text-slate-400">{doc.reason}</p>}
                      <ApprovalLineMini line={doc.approvalLine || []} />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setPreviewLeaveId(doc.id)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-indigo-400 transition-colors" title="출력 미리보기">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEditLeave(doc)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-400 transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteLeave(doc.id)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-rose-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {doc.status === 'pending' && (
                    <div className="flex items-center gap-2 pt-1">
                      <button onClick={() => handleApproveClick('leave', doc.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-bold border border-emerald-600/30 transition-colors">
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

              {/* [수정] 더 남은 휴가신청서가 있으면 "더 보기" 버튼으로 이어서 로딩 */}
              {visibleLeaveCount < leaveList.length && (
                <button
                  type="button"
                  onClick={() => setVisibleLeaveCount((prev) => Math.min(prev + 50, leaveList.length))}
                  className="flex-none w-[150px] snap-center border border-dashed border-slate-200 hover:border-indigo-500/50 bg-slate-100 hover:bg-white rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-indigo-600 transition-all"
                >
                  <span className="text-2xl">＋</span>
                  <span className="text-xs font-bold">{leaveList.length - visibleLeaveCount}건 더 보기</span>
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-start">
            <button onClick={openNewOfficial} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm shadow-md shadow-blue-600/25 transition-all active:scale-95">
              <Plus className="w-4 h-4" /><span>공문서 작성</span>
            </button>
          </div>

          {officialList.length === 0 ? (
            <div className="py-20 text-center text-slate-400 bg-slate-100 border border-dashed border-slate-200 rounded-2xl">
              <FileText className="w-8 h-8 mx-auto mb-2 text-slate-700" />
              <p className="text-sm">등록된 공문서가 없습니다.</p>
            </div>
          ) : (
            <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-3 -mx-1 px-1 [scrollbar-width:thin]">
              {[...officialList].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, visibleOfficialCount).map(doc => (
                <div key={doc.id} className="bg-slate-100 border border-slate-200 rounded-2xl p-4 space-y-2.5 snap-center shrink-0 w-[88vw] sm:w-[420px]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-800 truncate">{doc.subject}</h3>
                        <StatusBadge status={doc.status} />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{doc.executionNumber}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{doc.issueDate}</span>
                        <span className="flex items-center gap-1"><UserIcon className="w-3 h-3" />{doc.author}</span>
                      </div>
                      <p className="text-xs text-slate-400 truncate">수신: {doc.recipient}{doc.reference ? ` · 참조: ${doc.reference}` : ''}</p>
                      <ApprovalLineMini line={doc.approvalLine || []} />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setPreviewOfficialId(doc.id)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-indigo-400 transition-colors" title="출력 미리보기">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => openEditOfficial(doc)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-blue-400 transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteOfficial(doc.id)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-rose-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {doc.status === 'pending' && (
                    <div className="flex items-center gap-2 pt-1">
                      <button onClick={() => handleApproveClick('official', doc.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-bold border border-emerald-600/30 transition-colors">
                        <Check className="w-3.5 h-3.5" /> 다음 결재 승인
                      </button>
                      <button onClick={() => rejectDoc('official', doc.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 text-xs font-bold border border-rose-600/30 transition-colors">
                        <X className="w-3.5 h-3.5" /> 반려
                      </button>
                    </div>
                  )}
                  {doc.status === 'rejected' && doc.approverMemo && (
                    <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">반려 사유: {doc.approverMemo}</p>
                  )}
                </div>
              ))}

              {/* [수정] 더 남은 공문서가 있으면 "더 보기" 버튼으로 이어서 로딩 */}
              {visibleOfficialCount < officialList.length && (
                <button
                  type="button"
                  onClick={() => setVisibleOfficialCount((prev) => Math.min(prev + 50, officialList.length))}
                  className="flex-none w-[150px] snap-center border border-dashed border-slate-200 hover:border-indigo-500/50 bg-slate-100 hover:bg-white rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-indigo-600 transition-all"
                >
                  <span className="text-2xl">＋</span>
                  <span className="text-xs font-bold">{officialList.length - visibleOfficialCount}건 더 보기</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 가지급금 정산서 작성/수정 모달 */}
      {isAdvanceModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-blue-400" />
                {editingAdvanceId ? '가지급금 정산서 수정' : '가지급금 정산서 작성'}
              </h2>
              <button onClick={() => setIsAdvanceModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-4">
              <ApprovalLineEditor line={apApprovalLine} setLine={setApApprovalLine} kind="advance" companyPositions={companyPositions} onSaveAsDefault={saveApprovalLineAsCompanyDefault} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">회사명</label>
                  <input type="text" value={apCompanyName} onChange={(e) => setApCompanyName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">기안일</label>
                  <YMDInput value={apDraftDate} onChange={setApDraftDate} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">부서</label>
                  <input type="text" value={apDepartment} onChange={(e) => setApDepartment(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">작성자</label>
                  <input type="text" value={apAuthor} onChange={(e) => setApAuthor(e.target.value)}
                    onBlur={(e) => fillAdvanceDepartmentForAuthor(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">기간 시작</label>
                  <YMDInput value={apPeriodStart} onChange={setApPeriodStart} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">기간 종료</label>
                  <YMDInput value={apPeriodEnd} onChange={setApPeriodEnd} />
                </div>
              </div>

              {(apPeriodStart || apPeriodEnd) && (
                <p className="text-xs text-slate-500 bg-slate-100 rounded-xl px-4 py-2.5 -mt-2">
                  출력 표기: <span className="font-bold text-slate-700">{formatKoreanPeriod(apPeriodStart, apPeriodEnd)}</span>
                </p>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-600">정산 내역</label>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={openImportModal} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-600 font-bold">
                      <Download className="w-3.5 h-3.5" /> 업무일지/차량운행일지에서 가져오기
                    </button>
                    <button type="button" onClick={addApItem} className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-600 font-bold">
                      <Plus className="w-3.5 h-3.5" /> 내역 추가
                    </button>
                  </div>
                </div>
                {apItems.length === 0 && (
                  <div className="text-xs text-slate-400 text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    정산 내역이 없습니다. "내역 추가"를 눌러 등록해 주세요.
                  </div>
                )}
                <div className="space-y-2">
                  {/* [수정] 등록된 항목들을 날짜 오름차순(오래된 순)으로 보여준다.
                      뒤쪽 "영수증 첨부" 페이지도 같은 순서로 정렬되므로 서로 대조하기 쉬워진다. */}
                  {[...apItems]
                    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
                    .map(item => (
                    <div key={item.id} className="bg-slate-100 border border-slate-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-bold shrink-0">날짜</span>
                        <YMDInput value={item.date} onChange={(v) => updateApItem(item.id, { date: v })} />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="relative">
                          <input type="text" placeholder="프로젝트명 (클릭하면 개인카드/현금 사용내역에서 선택)" value={item.project}
                            onChange={(e) => updateApItem(item.id, { project: e.target.value })}
                            onFocus={() => openItemPicker(item.id)}
                            onBlur={() => { setTimeout(() => { setItemPickerForId(prev => prev === item.id ? null : prev); }, 150); }}
                            className="w-full px-2.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                          {itemPickerForId === item.id && (
                            <div className="absolute z-30 mt-1 w-full sm:w-80 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto">
                              {itemPickerLoading ? (
                                <div className="p-3 text-xs text-slate-500">불러오는 중...</div>
                              ) : (() => {
                                const q = item.project.trim().toLowerCase();
                                const filtered = itemPickerRows.filter(r =>
                                  !q || r.project.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
                                if (filtered.length === 0) {
                                  return <div className="p-3 text-xs text-slate-400">일치하는 개인카드/현금 사용 내역이 없습니다.</div>;
                                }
                                return filtered.map(r => (
                                  <button key={r.id} type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyItemPicker(item.id, r)}
                                    className="w-full text-left px-3 py-2 hover:bg-slate-100 border-b border-slate-200 last:border-0 transition-colors">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-semibold text-blue-600 truncate">{r.project || '(프로젝트 없음)'}</span>
                                      <span className="text-[10px] text-slate-400 shrink-0">{r.date}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 mt-0.5">
                                      <span className="text-[11px] text-slate-500 truncate">{r.description}</span>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {r.receiptImage && <Camera className="w-3 h-3 text-emerald-400" />}
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{r.payMethodLabel}</span>
                                        <span className="text-xs font-bold text-slate-700">{formatCurrencyInput(r.amount)}원</span>
                                      </div>
                                    </div>
                                  </button>
                                ));
                              })()}
                            </div>
                          )}
                        </div>
                        <input type="text" placeholder="계정과목" value={item.account} onChange={(e) => updateApItem(item.id, { account: e.target.value })}
                          className="px-2.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <input type="text" placeholder="상호" value={item.companyName} onChange={(e) => updateApItem(item.id, { companyName: e.target.value })}
                          className="px-2.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_130px_1fr_36px] gap-2 items-center">
                        <input type="text" placeholder="내용" value={item.description} onChange={(e) => updateApItem(item.id, { description: e.target.value })}
                          className="px-2.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <input type="text" inputMode="numeric" placeholder="금액" value={formatCurrencyInput(item.amount)}
                          onChange={(e) => updateApItem(item.id, { amount: parseCurrencyInput(e.target.value) })}
                          className="px-2.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <input type="text" placeholder="비고" value={item.remark} onChange={(e) => updateApItem(item.id, { remark: e.target.value })}
                          className="px-2.5 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <button type="button" onClick={() => removeApItem(item.id)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-rose-400 justify-self-center">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      {/* [수정] 차량비용/정비/업무일지에서 가져온 항목에 영수증 사진이 딸려있으면 여기에 썸네일로 표시.
                          누르면 크게 볼 수 있어 결재자가 원본 지출 증빙을 바로 확인할 수 있다. */}
                      {item.receiptImage && (
                        <div className="flex items-center gap-2 pt-1">
                          <img
                            src={item.receiptImage}
                            alt="영수증"
                            onClick={() => setEnlargedReceiptUrl(item.receiptImage!)}
                            className="w-10 h-10 rounded-lg object-cover border border-slate-200 cursor-pointer hover:opacity-80 transition-opacity"
                          />
                          <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                            <Camera className="w-3 h-3" />
                            영수증 첨부됨 (눌러서 크게 보기)
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-100 rounded-xl p-3 text-right text-sm">
                <span className="text-slate-400 mr-2">총 합계</span>
                <span className="font-bold text-slate-800">{formatCurrencyInput(apTotal)}원</span>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-2">
              <button onClick={() => setIsAdvanceModalOpen(false)} className="px-4 py-2.5 rounded-xl font-semibold text-sm text-slate-500 hover:bg-slate-100 transition-colors">취소</button>
              <button onClick={saveAdvance} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-600/25 transition-all active:scale-95">저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 업무일지/차량운행일지 비용 가져오기 모달 */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Download className="w-5 h-5 text-indigo-400" />
                비용 가져오기
              </h2>
              <button onClick={() => setIsImportModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
            </div>

            <div className="px-6 pt-4">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => { setImportTab('worklog'); setImportProjectFilter('all'); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${importTab === 'worklog' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-500 hover:bg-slate-100/60 border border-transparent'}`}>
                    <ClipboardList className="w-3.5 h-3.5" /> 업무일지 비용 ({importWorklogRows.length})
                  </button>
                  <button onClick={() => { setImportTab('vehicle'); setImportProjectFilter('all'); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${importTab === 'vehicle' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-500 hover:bg-slate-100/60 border border-transparent'}`}>
                    <Car className="w-3.5 h-3.5" /> 차량 비용관리 ({importVehicleRows.length})
                  </button>
                  <button onClick={() => { setImportTab('maintenance'); setImportProjectFilter('all'); }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${importTab === 'maintenance' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-500 hover:bg-slate-100/60 border border-transparent'}`}>
                    <Wrench className="w-3.5 h-3.5" /> 정비일지 비용 ({importMaintenanceRows.length})
                  </button>
                </div>
                {(() => {
                  const rows = importTab === 'worklog' ? importWorklogRows : importTab === 'vehicle' ? importVehicleRows : importMaintenanceRows;
                  const projectNames = Array.from(new Set(rows.map(r => r.project).filter(Boolean)));
                  if (projectNames.length === 0) return null;
                  return (
                    <select value={importProjectFilter} onChange={(e) => setImportProjectFilter(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="all">전체 프로젝트</option>
                      {projectNames.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  );
                })()}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">개인카드/현금으로 결제한 항목만 표시됩니다 (법인카드 결제분은 이미 별도 정산되므로 제외).</p>
            </div>

            <div className="p-6 pt-4 space-y-2">
              {importLoading ? (
                <div className="py-16 flex flex-col items-center justify-center space-y-3">
                  <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-slate-500">비용 내역을 불러오는 중입니다...</p>
                </div>
              ) : (() => {
                const sourceRows = importTab === 'worklog' ? importWorklogRows : importTab === 'vehicle' ? importVehicleRows : importMaintenanceRows;
                const rows = sourceRows.filter(r => importProjectFilter === 'all' || r.project === importProjectFilter);
                return rows.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-xs">
                    가져올 수 있는 비용 내역이 없습니다.
                  </div>
                ) : (
                  rows.map(row => (
                    <label key={row.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${importSelectedIds.has(row.id) ? 'bg-blue-600/10 border-blue-500/40' : 'bg-slate-100 border-slate-200 hover:bg-slate-100/40'}`}>
                      <input type="checkbox" checked={importSelectedIds.has(row.id)} onChange={() => toggleImportSelect(row.id)}
                        className="w-4 h-4 rounded border-slate-200 bg-white text-blue-500 focus:ring-0" />
                      <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-xs items-center">
                        <span className="text-slate-500">{row.date}</span>
                        <span className="text-blue-600 font-semibold truncate">{row.project || '-'}</span>
                        <span className="text-slate-600 truncate col-span-2 sm:col-span-1">{row.description}</span>
                        <span className="text-slate-800 font-bold text-right sm:text-left">{formatCurrencyInput(row.amount)}원</span>
                        <span className="flex items-center gap-1 justify-self-start sm:justify-self-end">
                          {row.receiptImage && <Camera className="w-3 h-3 text-emerald-400" title="영수증 첨부됨" />}
                          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200">{row.payMethodLabel}</span>
                        </span>
                      </div>
                    </label>
                  ))
                );
              })()}
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">{importSelectedIds.size}건 선택됨</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setIsImportModalOpen(false)} className="px-4 py-2.5 rounded-xl font-semibold text-sm text-slate-500 hover:bg-slate-100 transition-colors">취소</button>
                <button onClick={applyImportedItems} disabled={importSelectedIds.size === 0} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-600/25 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed">선택 항목 가져오기</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 휴가 신청서 작성/수정 모달 */}
      {isLeaveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <Plane className="w-5 h-5 text-blue-400" />
                {editingLeaveId ? '휴가 신청서 수정' : '휴가 신청서 작성'}
              </h2>
              <button onClick={() => setIsLeaveModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-4">
              <ApprovalLineEditor line={lvApprovalLine} setLine={setLvApprovalLine} kind="leave" companyPositions={companyPositions} onSaveAsDefault={saveApprovalLineAsCompanyDefault} />

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600">기안번호</label>
                <input type="text" value={lvDraftNumber} onChange={(e) => setLvDraftNumber(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm font-mono" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">소속</label>
                  <input type="text" value={lvDepartment} onChange={(e) => setLvDepartment(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">휴가자</label>
                  <input type="text" value={lvAuthor} onChange={(e) => {
                    const v = e.target.value;
                    setLvAuthor(v);
                    setLvTotalAnnualDays(getStoredTotalAnnualDays(v));
                  }}
                    onBlur={(e) => fillLeaveDepartmentForAuthor(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
                </div>
              </div>

              {/* 총 연차 일수: 카테고리와 무관하게 항상 보이고, 한 번 입력해두면 이 휴가자 이름으로 자동 저장되어
                  다음에 새 휴가 신청서를 작성할 때도 다시 입력할 필요가 없다. */}
              <div className="p-3 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 space-y-1.5">
                <label className="text-xs font-bold text-indigo-600 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5" /> 총 연차 일수 (올해 부여된 전체 연차 — 한 번 입력해두면 자동 저장됩니다)
                </label>
                <input type="number" min={0} step={0.5} value={lvTotalAnnualDays}
                  onChange={(e) => {
                    const v = Number(e.target.value) || 0;
                    setLvTotalAnnualDays(v);
                    setStoredTotalAnnualDays(lvAuthor, v);
                  }}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 text-sm" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600">휴가 구분</label>
                <div className="flex flex-wrap gap-2">
                  {LEAVE_CATEGORY_ORDER.map(c => (
                    c === 'special' ? (
                      <div key={c} className="relative">
                        <button type="button"
                          onClick={() => { setLvCategory('special'); setLvSpecialDropdownOpen(v => !v); setLvStartTime('09:00'); setLvEndTime('18:00'); }}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${lvCategory === 'special' ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}>
                          <span>
                            특별휴가{lvCategory === 'special' ? ` · ${lvSpecialType === 'custom' ? (lvSpecialTypeCustom || '직접입력') : SPECIAL_TYPE_LABEL[lvSpecialType]}` : ''}
                          </span>
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        {lvSpecialDropdownOpen && (
                          <>
                            <div className="fixed inset-0 z-20" onClick={() => setLvSpecialDropdownOpen(false)} />
                            <div className="absolute z-30 mt-1 left-0 w-40 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
                              {SPECIAL_TYPE_ORDER.map(t => (
                                <button key={t} type="button"
                                  onClick={() => { setLvSpecialType(t); if (t !== 'custom') setLvSpecialDropdownOpen(false); setLvStartTime('09:00'); setLvEndTime('18:00'); }}
                                  className={`w-full text-left px-3 py-2 text-xs font-semibold transition-colors ${lvSpecialType === t ? 'bg-indigo-600/20 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
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
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${lvCategory === 'annual' ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}>
                          <span>
                            연차{lvCategory === 'annual' ? ` · ${ANNUAL_TYPE_LABEL[lvAnnualType]}` : ''}
                          </span>
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        {lvAnnualDropdownOpen && (
                          <>
                            <div className="fixed inset-0 z-20" onClick={() => setLvAnnualDropdownOpen(false)} />
                            <div className="absolute z-30 mt-1 left-0 w-40 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
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
                                  className={`w-full text-left px-3 py-2 text-xs font-semibold transition-colors ${lvAnnualType === t ? 'bg-indigo-600/20 text-indigo-600' : 'text-slate-600 hover:bg-slate-100'}`}>
                                  {ANNUAL_TYPE_LABEL[t]}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <button key={c} type="button" onClick={() => { setLvCategory(c); setLvStartTime('09:00'); setLvEndTime('18:00'); }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${lvCategory === c ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'}`}>
                        {LEAVE_CATEGORY_LABEL[c]}
                      </button>
                    )
                  ))}
                </div>
                {lvCategory === 'other' && (
                  <input type="text" placeholder="휴가 구분 직접 입력" value={lvCategoryCustom} onChange={(e) => setLvCategoryCustom(e.target.value)}
                    className="w-full mt-2 px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
                )}
                {lvCategory === 'special' && lvSpecialType === 'custom' && (
                  <input type="text" placeholder="특별휴가 종류 직접 입력" value={lvSpecialTypeCustom} onChange={(e) => setLvSpecialTypeCustom(e.target.value)}
                    className="w-full mt-2 px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600">사유</label>
                <textarea rows={2} value={lvReason} onChange={(e) => setLvReason(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm resize-none" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">시작일</label>
                  <YMDInput value={lvStartDate} onChange={(v) => {
                    setLvStartDate(v);
                    const isHalfOrQuarter = lvCategory === 'annual' && (lvAnnualType === 'half' || lvAnnualType === 'quarter');
                    if (!isHalfOrQuarter) { setLvStartTime('09:00'); setLvEndTime('18:00'); }
                  }} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">종료일</label>
                  <YMDInput value={lvEndDate} onChange={(v) => {
                    setLvEndDate(v);
                    const isHalfOrQuarter = lvCategory === 'annual' && (lvAnnualType === 'half' || lvAnnualType === 'quarter');
                    if (!isHalfOrQuarter) { setLvStartTime('09:00'); setLvEndTime('18:00'); }
                  }} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">시작 시간 (반차 등, 선택)</label>
                  <input type="time" value={lvStartTime} onChange={(e) => {
                    const v = e.target.value;
                    setLvStartTime(v);
                    if (lvCategory === 'annual' && (lvAnnualType === 'half' || lvAnnualType === 'quarter')) {
                      setLvEndTime(addHoursToTime(v, ANNUAL_TYPE_HOURS[lvAnnualType]));
                    }
                  }}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">종료 시간 (선택)</label>
                  <input type="time" value={lvEndTime} onChange={(e) => setLvEndTime(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
                </div>
              </div>

              <div className="text-xs text-slate-500 bg-slate-100 rounded-xl px-4 py-2.5">
                산정된 휴가 일수: <span className="font-bold text-slate-700">{calcLeaveDays(lvStartDate, lvEndDate, lvCategory === 'annual' ? ANNUAL_TYPE_MULTIPLIER[lvAnnualType] : 1)}일</span>
                {lvCategory === 'annual' && <span className="text-slate-400"> ({ANNUAL_TYPE_LABEL[lvAnnualType]} 기준)</span>}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600">누적 휴가 표기 (총 연차 일수 기준 자동 계산, 필요시 직접 수정)</label>
                <input type="text" placeholder="5일/총20일, 잔여 15일" value={lvAnnualNote} onChange={(e) => setLvAnnualNote(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">자택 연락처</label>
                  <input type="text" inputMode="numeric" placeholder="02-1234-5678" value={lvHomeContact} onChange={(e) => setLvHomeContact(formatPhoneNumber(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">휴대폰</label>
                  <input type="text" inputMode="numeric" placeholder="010-1234-5678" value={lvMobileContact} onChange={(e) => setLvMobileContact(formatPhoneNumber(e.target.value))}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">직무 대행자</label>
                  <input type="text" value={lvActingPerson} onChange={(e) => setLvActingPerson(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">신청일</label>
                  <YMDInput value={lvSubmittedDate} onChange={setLvSubmittedDate} />
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-2">
              <button onClick={() => setIsLeaveModalOpen(false)} className="px-4 py-2.5 rounded-xl font-semibold text-sm text-slate-500 hover:bg-slate-100 transition-colors">취소</button>
              <button onClick={saveLeave} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-600/25 transition-all active:scale-95">저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 공문서 작성/수정 모달 */}
      {isOfficialModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                {editingOfficialId ? '공문서 수정' : '공문서 작성'}
              </h2>
              <button onClick={() => setIsOfficialModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-6 space-y-4">
              <ApprovalLineEditor line={ofApprovalLine} setLine={setOfApprovalLine} kind="official" companyPositions={companyPositions} onSaveAsDefault={saveApprovalLineAsCompanyDefault} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">발신 회사명</label>
                  <input type="text" value={ofCompanyName} onChange={(e) => setOfCompanyName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">작성자(기안자)</label>
                  <input type="text" value={ofAuthor} onChange={(e) => setOfAuthor(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">수신자</label>
                  <input type="text" value={ofRecipient} onChange={(e) => setOfRecipient(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">참조 (선택)</label>
                  <input type="text" value={ofReference} onChange={(e) => setOfReference(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600">제목</label>
                <input type="text" value={ofSubject} onChange={(e) => setOfSubject(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600">본문 (한 줄에 문단 하나씩 입력하면 출력 시 자동으로 1. 2. 3. 번호가 매겨집니다)</label>
                <textarea value={ofBodyText} onChange={(e) => setOfBodyText(e.target.value)} rows={6}
                  placeholder={'예)\n귀 원의 무궁한 발전을 기원합니다.\n2026년 혁신제품 선정과 관련사항입니다.'}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm resize-y" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">시행일자</label>
                  <YMDInput value={ofIssueDate} onChange={(v) => { setOfIssueDate(v); setOfExecutionNumber(makeExecutionNumber(officialList.filter(d => d.id !== editingOfficialId).map(d => d.executionNumber || ''), companySettings.docPrefix, v)); }} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-600">시행번호</label>
                  <input type="text" value={ofExecutionNumber} onChange={(e) => setOfExecutionNumber(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm font-mono" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600">접수번호 (선택, 보통 공란으로 둡니다)</label>
                <input type="text" value={ofReceiptNumber} onChange={(e) => setOfReceiptNumber(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm font-mono" />
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-600">발신처 정보 (문서 하단에 표시)</label>
                  {currentUser?.role === 'admin' && (
                    <button type="button" onClick={saveCompanyContactSettings} className="text-[10px] px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-500/20 text-indigo-700 border border-indigo-500/30 font-semibold transition-colors whitespace-nowrap">
                      회사 기본값으로 저장
                    </button>
                  )}
                </div>
                <input type="text" value={ofCompanyAddress} onChange={(e) => setOfCompanyAddress(e.target.value)} placeholder="주소"
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input type="text" value={ofCompanyPhone} onChange={(e) => setOfCompanyPhone(e.target.value)} placeholder="전화"
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
                  <input type="text" value={ofCompanyFax} onChange={(e) => setOfCompanyFax(e.target.value)} placeholder="전송(팩스)"
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
                  <input type="text" value={ofCompanyEmail} onChange={(e) => setOfCompanyEmail(e.target.value)} placeholder="e-mail"
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 text-sm" />
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-2">
              <button onClick={() => setIsOfficialModalOpen(false)} className="px-4 py-2.5 rounded-xl font-semibold text-sm text-slate-500 hover:bg-slate-100 transition-colors">취소</button>
              <button onClick={saveOfficial} className="px-5 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-600/25 transition-all active:scale-95">저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 공문서 출력 미리보기 */}
      {previewOfficialId && (() => {
        const previewOfficial = officialList.find(d => d.id === previewOfficialId);
        if (!previewOfficial) return null;
        return (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center overflow-y-auto p-4">
            <div className="w-full max-w-[215mm] h-[92vh] mx-auto bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
              <div className="no-print p-4 sm:p-5 border-b border-slate-200 bg-white/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-500/20 text-indigo-700">
                    <Eye className="w-5 h-5" />
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight">공문서 출력 미리보기</h2>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={handlePrintOfficial} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/15 active:scale-95 transition-all">
                    <Printer className="w-3.5 h-3.5" /><span>인쇄 / PDF 저장</span>
                  </button>
                  <button onClick={() => setPreviewOfficialId(null)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 border border-slate-200 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 bg-slate-50 p-4 sm:p-8 overflow-y-auto flex justify-center">
                <div className="shrink-0" style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.08)' }}>
                  {renderPrintableOfficial(previewOfficial)}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 가지급금 정산서 출력 미리보기 (주간업무일지/차량운행일지와 동일한 방식: 화면에 그대로 보여준 뒤 엑셀/PDF로 출력) */}
      {previewAdvanceId && (() => {
        const previewDoc = advanceList.find(d => d.id === previewAdvanceId);
        if (!previewDoc) return null;
        const previewItems = previewDoc.items || [];
        const previewApprovalLine = previewDoc.approvalLine || [];
        const total = previewItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);
        return (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center overflow-y-auto p-4">
            <div className="w-full max-w-[215mm] h-[92vh] mx-auto bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
              {/* 비인쇄 상단 바 */}
              <div className="no-print p-4 sm:p-5 border-b border-slate-200 bg-white/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-500/20 text-indigo-700">
                    <Eye className="w-5 h-5" />
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight">가지급금 정산서 출력 미리보기</h2>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => downloadAdvanceToExcel(previewDoc)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/15 active:scale-95 transition-all">
                    <FileSpreadsheet className="w-3.5 h-3.5" /><span>엑셀 다운로드</span>
                  </button>
                  <button onClick={handlePrintAdvance} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/15 active:scale-95 transition-all">
                    <Printer className="w-3.5 h-3.5" /><span>인쇄 / PDF 저장</span>
                  </button>
                  <button onClick={() => setPreviewAdvanceId(null)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 border border-slate-200 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 화면에 그대로 보이는 A4 미리보기 종이 영역 */}
              <div className="flex-1 bg-slate-50 p-4 sm:p-8 overflow-y-auto flex justify-center">
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
                            <td key={i} className="border border-black px-3 py-2.5 h-10 text-center">
                              {s.signatureUrl && <img src={s.signatureUrl} className="max-h-6 max-w-[90%] inline-block mb-0.5" />}
                              <div>{s.date || ''}</div>
                            </td>
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

                  {/* [수정] 영수증이 첨부된 항목이 있으면 화면 미리보기에도 같이 보여준다 (인쇄본과 동일하게) */}
                  {previewItems.some(it => it.receiptImage) && (
                    <div style={{ pageBreakBefore: 'always' }} className="mt-6">
                      <div className="text-center mb-4">
                        <span className="inline-block border-b-2 border-black pb-1 px-3 text-base font-extrabold text-black">영수증 첨부</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {previewItems
                          .filter(it => it.receiptImage)
                          .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
                          .map((it, idx) => (
                          <div key={it.id} className="border border-black p-2" style={{ breakInside: 'avoid' }}>
                            <img src={it.receiptImage} alt="영수증" className="w-full object-contain mb-1.5" style={{ maxHeight: 260 }} />
                            <div className="text-[10px] leading-relaxed">
                              <div><strong>No.{idx + 1} &nbsp;날짜:</strong> {it.date}</div>
                              <div><strong>내용:</strong> {it.description}</div>
                              <div><strong>금액:</strong> {it.amount.toLocaleString()}원</div>
                              {it.companyName && <div><strong>상호:</strong> {it.companyName}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
            <div className="w-full max-w-[215mm] h-[92vh] mx-auto bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
              {/* 비인쇄 상단 바 */}
              <div className="no-print p-4 sm:p-5 border-b border-slate-200 bg-white/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-500/20 text-indigo-700">
                    <Eye className="w-5 h-5" />
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight">휴가 신청서 출력 미리보기</h2>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => downloadLeaveToExcel(previewLeave)} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/15 active:scale-95 transition-all">
                    <FileSpreadsheet className="w-3.5 h-3.5" /><span>엑셀 다운로드</span>
                  </button>
                  <button onClick={handlePrintLeave} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/15 active:scale-95 transition-all">
                    <Printer className="w-3.5 h-3.5" /><span>인쇄 / PDF 저장</span>
                  </button>
                  <button onClick={() => setPreviewLeaveId(null)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 border border-slate-200 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 화면에 그대로 보이는 A4 미리보기 종이 영역 */}
              <div className="flex-1 bg-slate-50 p-4 sm:p-8 overflow-y-auto flex justify-center">
                <div className="shrink-0" style={{ width: '210mm', minHeight: '297mm', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', paddingTop: '15mm', paddingBottom: '15mm', paddingLeft: '10mm', paddingRight: '10mm', background: '#fff' }}>
                <div style={{ flex: 1, border: '3px solid #000000', boxSizing: 'border-box' }}>
                <div className="text-black text-xs font-sans leading-tight" style={{ padding: '10mm', boxSizing: 'border-box' }}>
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
                            <td key={i} className="border border-black px-3 py-2.5 h-10 text-center">
                              {s.signatureUrl && <img src={s.signatureUrl} className="max-h-6 max-w-[90%] inline-block mb-0.5" />}
                              <div>{s.date || ''}</div>
                            </td>
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
                </div>
                </div>
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
      {previewOfficialId && typeof document !== 'undefined' && document.getElementById('print-root') &&
        createPortal(renderPrintableOfficial(officialList.find(d => d.id === previewOfficialId)), document.getElementById('print-root')!)}

      {/* [수정] 정산 항목에 딸린 영수증 썸네일 확대보기 라이트박스 */}
      {enlargedReceiptUrl && (
        <div
          className="fixed inset-0 bg-slate-900/85 backdrop-blur-md z-[110] flex items-center justify-center p-4"
          onClick={() => setEnlargedReceiptUrl(null)}
        >
          <button
            onClick={() => setEnlargedReceiptUrl(null)}
            className="absolute top-4 right-4 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition-all"
          >
            닫기
          </button>
          <img
            src={enlargedReceiptUrl}
            alt="영수증 확대보기"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl border border-slate-200"
          />
        </div>
      )}

      {/* [추가] 서명 등록/변경 모달. "내 서명 등록" 버튼으로 직접 열거나, 서명이 없는 상태에서
          결재를 시도하면 자동으로 뜬다 — 후자의 경우 저장 완료 시 대기 중이던 결재를 이어서 진행한다. */}
      {isSignaturePadOpen && currentUser && (
        <SignaturePadModal
          currentUser={currentUser}
          onClose={() => { setIsSignaturePadOpen(false); setPendingApprovalTarget(null); }}
          onSaved={(updatedUser) => {
            setIsSignaturePadOpen(false);
            onUpdateCurrentUser?.(updatedUser);
            if (pendingApprovalTarget) {
              const target = pendingApprovalTarget;
              setPendingApprovalTarget(null);
              advanceNextApprovalStep(target.kind, target.id, updatedUser);
            }
          }}
        />
      )}
    </div>
  );
};
