import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { Plus, X, Trash2, Edit2, Paperclip, Download, FileText, Search, ShieldAlert, Printer, Percent, Calculator, RefreshCw, Upload, Car, Check } from 'lucide-react';
import { AdminDoc, AdminDocCategory, AdminDocLineItem, AdminDocSection, ProjectFollowUpAttachment, User, Vehicle } from '../types.js';
import { formatCurrencyInput, parseCurrencyInput } from '../currencyFormat.js';

interface Props {
  section: AdminDocSection;
  currentUser: User | null;
}

// [수정] datalist 자동완성은 브라우저마다 동작이 다르고(포커스만으론 후보가 안 뜨는 경우도
// 있어) 눈에 잘 안 띈다는 피드백이 있었다. 명함/프로젝트 담당자 선택에 쓰던 것과 같은,
// 눈에 보이는 드롭다운 방식으로 바꾼다 - 입력칸에 포커스하면 바로 등록 차량 목록이 펼쳐지고,
// 타이핑하면 그 목록이 실시간으로 좁혀지며(자유 입력도 그대로 유지), 목록에서 고르면 선택된다.
interface VehicleSearchInputProps {
  vehicles: Vehicle[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}

const VehicleSearchInput: React.FC<VehicleSearchInputProps> = ({ vehicles, value, onChange, placeholder, className, inputClassName }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const labelOf = (v: Vehicle) => `${v.modelName} (${v.plateNumber})`;
  const q = value.toLowerCase();
  const filtered = vehicles
    .filter((v) => !q || v.modelName.toLowerCase().includes(q) || v.plateNumber.toLowerCase().includes(q) || (v.owner || '').toLowerCase().includes(q))
    .slice(0, 30);

  return (
    <div ref={wrapRef} className={`relative ${className || ''}`}>
      <input
        type="text"
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        placeholder={placeholder}
        className={inputClassName || 'w-full bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-indigo-500'}
      />
      {open && vehicles.length > 0 && (
        <div className="absolute z-30 mt-1 w-full min-w-[200px] bg-white border border-slate-200 rounded-lg shadow-2xl overflow-hidden">
          <div className="max-h-40 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-[10px] text-slate-400 text-center py-3">일치하는 등록 차량이 없습니다 (직접 입력한 값이 그대로 저장됩니다)</p>
            ) : (
              filtered.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => { onChange(labelOf(v)); setOpen(false); }}
                  className={`w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-indigo-50 flex items-center gap-1.5 ${labelOf(v) === value ? 'bg-indigo-50' : ''}`}
                >
                  <Car className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="font-medium text-slate-700 truncate">{v.modelName}</span>
                  <span className="text-slate-400 truncate">({v.plateNumber})</span>
                  {labelOf(v) === value && <Check className="w-3 h-3 text-indigo-600 ml-auto shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// [추가] 차량 과태료 "내용(위반 상세)"에서 자주 쓰는 항목을 골라 쓰거나, 직접 입력한 값도
// (호출하는 쪽에서 저장된 데이터로부터 모아서) 다음부터 목록에 나타나 선택할 수 있게 하는
// 범용 자동완성 입력칸. VehicleSearchInput과 같은 방식이지만 옵션이 문자열 목록이면 어디든
// 재사용할 수 있게 일반화했다.
const VEHICLE_FINE_DETAIL_PRESETS = [
  '주정차 위반',
  '신호 위반',
  '어린이보호구역 내 속도 위반',
  '통행료 미정산',
  '안전지대 등 진입금지 위반',
  '단말기 미부착',
];

interface SuggestTextInputProps {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}

const SuggestTextInput: React.FC<SuggestTextInputProps> = ({ options, value, onChange, placeholder, className }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const q = value.toLowerCase();
  const filtered = options.filter((o) => !q || o.toLowerCase().includes(q)).slice(0, 30);

  return (
    <div ref={wrapRef} className={`relative ${className || ''}`}>
      <input
        type="text"
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        placeholder={placeholder}
        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-indigo-500"
      />
      {open && options.length > 0 && (
        <div className="absolute z-30 mt-1 w-full min-w-[200px] bg-white border border-slate-200 rounded-lg shadow-2xl overflow-hidden">
          <div className="max-h-40 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-[10px] text-slate-400 text-center py-3">일치하는 항목이 없습니다 (직접 입력한 값이 그대로 저장됩니다)</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => { onChange(o); setOpen(false); }}
                  className={`w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-indigo-50 ${o === value ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-slate-700'}`}
                >
                  {o}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// [추가] 카드번호 입력칸(법인카드 관리/카드사용내역 공용) - 숫자만 입력받아 "0000-0000-0000-0000"
// 형태로 4자리마다 자동으로 하이픈을 넣어준다.
function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1-');
}

// [추가] 경영지원/회계관리 각 섹션의 서브 탭(서류 종류) 정의. 종류마다 필요한 항목이 조금씩
// 다르지만(예: 근로계약서엔 "직원명"이 중요하고, 통장 출금 내역엔 "금액"이 중요하다), 화면은
// 하나의 공용 폼(제목/날짜/관련자/금액/메모/첨부파일)을 그대로 쓰고 라벨과 플레이스홀더만
// 종류별로 다르게 보여준다.
const CATEGORY_CONFIG: Record<AdminDocSection, { id: AdminDocCategory; label: string; personLabel: string; showAmount: boolean }[]> = {
  management: [
    { id: 'labor_contract', label: '근로계약서', personLabel: '직원명', showAmount: false },
    { id: 'salary_agreement', label: '연봉협약서', personLabel: '직원명', showAmount: true },
    { id: 'employment_cert', label: '재직증명서', personLabel: '직원명', showAmount: false },
    { id: 'power_of_attorney', label: '위임장', personLabel: '위임받는 사람', showAmount: false },
    { id: 'office_supplies', label: '사무실 비품 관리', personLabel: '담당자/비품명', showAmount: true },
    { id: 'sales_contract', label: '영업 계약', personLabel: '거래처명', showAmount: true },
    { id: 'corp_card', label: '법인카드 관리', personLabel: '카드 소지자', showAmount: true }
  ],
  accounting: [
    { id: 'payslip', label: '급여명세서', personLabel: '직원명', showAmount: true },
    { id: 'severance', label: '퇴직금 정산', personLabel: '직원명', showAmount: true },
    { id: 'monthly_cashflow', label: '월별 자금 현황', personLabel: '작성자', showAmount: true },
    { id: 'bank_withdrawal', label: '통장 출금 내역', personLabel: '거래처/적요', showAmount: true },
    { id: 'bank_deposit', label: '통장 입금 내역', personLabel: '거래처/적요', showAmount: true },
    { id: 'loan_repayment', label: '대출 현황', personLabel: '금융기관', showAmount: true },
    { id: 'card_usage', label: '카드사용내역', personLabel: '카드 소지자', showAmount: true },
    { id: 'advance_payment', label: '가지급내역', personLabel: '인원', showAmount: true },
    { id: 'vehicle_fine', label: '차량 과태료 내역', personLabel: '차량', showAmount: true },
    { id: 'tax', label: '각종 세금', personLabel: '내역', showAmount: true },
    { id: 'management_fee', label: '관리비내역', personLabel: '호실', showAmount: true }
  ]
};

const SECTION_LABEL: Record<AdminDocSection, string> = {
  management: '경영지원',
  accounting: '회계관리'
};

// [추가] 4대보험·지방소득세 공제율 기본값 (2026년 기준, 근로자 부담분). 국세청/공단 요율은
// 매년 바뀌기 때문에, 이 값은 어디까지나 "처음 열었을 때 채워지는 기본값"일 뿐이고 화면에서
// 언제든 직접 고쳐서 쓸 수 있다. 마지막으로 쓴 값은 브라우저(localStorage)에 저장해뒀다가
// 다음에 급여명세서를 새로 만들 때 그대로 불러온다.
const DEFAULT_RATES = {
  pensionRate: 4.75,
  healthRate: 3.595,
  ltcRate: 13.14,
  employmentRate: 0.9,
  localTaxRate: 10
};
const RATES_STORAGE_KEY = 'bizcard_payslip_rates';

function loadSavedRates(): typeof DEFAULT_RATES {
  try {
    const raw = localStorage.getItem(RATES_STORAGE_KEY);
    if (!raw) return DEFAULT_RATES;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_RATES, ...parsed };
  } catch {
    return DEFAULT_RATES;
  }
}

const emptyForm = (category: AdminDocCategory): Partial<AdminDoc> => ({
  category,
  title: '',
  date: new Date().toISOString().split('T')[0],
  personName: '',
  amount: '',
  memo: '',
  attachments: [],
  // [추가] 급여명세서용 기본값. 다른 서류에서는 그냥 안 쓰이고 무시된다.
  // 지급/공제 내역은 회사에서 거의 항상 쓰는 항목들을 미리 깔아두고, 필요하면 "항목 추가"로
  // 더 늘리거나 X로 지워서 쓸 수 있게 한다 — 매번 기본급부터 손으로 다 치는 걸 줄여준다.
  // 식대·차량유지비는 비과세 항목이라 4대보험 계산 기준(과세 대상 급여)에서 빠지도록
  // taxable: false로 시작한다.
  payslip: category === 'payslip' ? {
    payMonth: new Date().toISOString().slice(0, 7),
    paymentDate: new Date().toISOString().split('T')[0],
    payItems: [
      { id: `li-${Date.now()}-1`, label: '기본급', amount: 0, taxable: true },
      { id: `li-${Date.now()}-2`, label: '연장수당', amount: 0, taxable: true },
      { id: `li-${Date.now()}-3`, label: '식대', amount: 0, taxable: false },
      { id: `li-${Date.now()}-4`, label: '차량유지비', amount: 0, taxable: false }
    ],
    deductionItems: [
      { id: `li-${Date.now()}-5`, label: '국민연금', amount: 0 },
      { id: `li-${Date.now()}-6`, label: '건강보험', amount: 0 },
      { id: `li-${Date.now()}-7`, label: '장기요양보험료', amount: 0 },
      { id: `li-${Date.now()}-8`, label: '고용보험', amount: 0 },
      { id: `li-${Date.now()}-9`, label: '소득세', amount: 0 },
      { id: `li-${Date.now()}-10`, label: '지방소득세', amount: 0 }
    ],
    rates: loadSavedRates()
  } : undefined,
  // [추가] 월별 자금 현황 기본값. 통장 하나를 빈 줄로 미리 하나 넣어두고, "계좌 추가"로
  // 늘릴 수 있게 한다. periodStart/End는 선택한 date의 월 시작~끝으로 기본값을 잡는다.
  cashflow: category === 'monthly_cashflow' ? (() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    return {
      periodStart: start,
      periodEnd: end,
      accounts: [{ id: `acc-${Date.now()}`, bankName: '', accountNumber: '', subCategory: '', broughtForward: 0, deposit: 0, withdrawal: 0, note: '' }]
    };
  })() : undefined,
  // [추가] 통장 출금/입금 내역 기본값 - 두 카테고리 공용. 계좌 하나에 빈 거래 한 줄을
  // 미리 넣어두고, "계좌 추가"/"거래 추가"로 늘릴 수 있게 한다.
  bankLedger: (category === 'bank_withdrawal' || category === 'bank_deposit') ? {
    accounts: [{
      id: `bacc-${Date.now()}`,
      bankName: '',
      accountNumber: '',
      subCategory: '',
      entries: [{ id: `be-${Date.now()}`, date: new Date().toISOString().split('T')[0], project: '', amount: 0, description: '', note: '' }]
    }]
  } : undefined,
  // [추가] 대출 현황 기본값. 대출 하나를 빈 줄로 미리 넣어두고, "대출 추가"로 늘릴 수 있게 한다.
  loanRepayment: category === 'loan_repayment' ? {
    loans: [{
      id: `loan-${Date.now()}`,
      loanName: '',
      loanAccount: '',
      initialAmount: 0,
      initialRate: 0,
      currentRate: 0,
      loanDate: '',
      maturityDate: '',
      paymentDay: '',
      balance: 0,
      principalPaid: 0,
      interestPaid: 0,
      withdrawBank: '',
      withdrawAccount: '',
      isRepaid: false
    }]
  } : undefined,
  // [추가] 법인카드 사용내역 기본값. 카드 하나에 빈 사용 내역 한 줄을 미리 넣어두고,
  // "카드 추가"/"내역 추가"로 늘릴 수 있게 한다.
  cardUsage: category === 'card_usage' ? {
    cards: [{
      id: `card-${Date.now()}`,
      cardName: '',
      cardNumber: '',
      holder: '',
      entries: [{ id: `cue-${Date.now()}`, amount: 0, date: new Date().toISOString().split('T')[0], project: '', user: '', note: '' }]
    }]
  } : undefined,
  // [추가] 법인카드 관리(월별 카드별 사용 요약) 기본값. 카드 한 장을 빈 줄로 미리 넣어두고
  // "카드 추가"로 늘릴 수 있게 한다.
  corpCard: category === 'corp_card' ? {
    yearMonth: new Date().toISOString().slice(0, 7),
    cards: [{
      id: `cc-${Date.now()}`,
      cardCompany: '', cardNumber: '', expiry: '', user: '', periodLabel: '', paymentDay: '',
      amount: 0, withdrawBank: '', withdrawAccount: '', note: ''
    }]
  } : undefined,
  // [추가] 가지급내역 기본값. 공유해주신 양식과 동일하게 12개월 행을 미리 다 채워두고
  // (연중 아무 때나 열어도 1~12월이 다 보이게), 인원(열)은 빈 칸 하나만 두고 "인원 추가"로
  // 늘려서 회사 상황에 맞는 이름을 직접 입력하게 한다.
  advancePayment: category === 'advance_payment' ? (() => {
    const year = new Date().getFullYear();
    return {
      people: [{ id: `person-${Date.now()}`, name: '' }],
      months: Array.from({ length: 12 }, (_, i) => {
        const mm = String(i + 1).padStart(2, '0');
        return {
          id: `apm-${Date.now()}-${i}`,
          monthKey: `${year}-${mm}`,
          label: `${mm}월`,
          depositDate: '',
          amounts: {},
          note: ''
        };
      })
    };
  })() : undefined,
  // [추가] 차량 과태료 내역 기본값. 빈 줄 하나를 미리 넣어두고 "항목 추가"로 늘릴 수 있게 한다.
  vehicleFine: category === 'vehicle_fine' ? {
    entries: [{ id: `vf-${Date.now()}`, date: new Date().toISOString().split('T')[0], vehicle: '', amount: 0, processedDate: '', detail: '', note: '' }]
  } : undefined,
  // [추가] 각종 세금 기본값. 빈 줄 하나를 미리 넣어두고 "항목 추가"로 늘릴 수 있게 한다.
  taxPayment: category === 'tax' ? {
    entries: [{ id: `tax-${Date.now()}`, description: '', paidDate: '', amount: 0, note: '' }]
  } : undefined,
  // [추가] 관리비내역 기본값. 가지급내역과 동일하게 12개월 행을 미리 다 채워두고,
  // 호실(열)은 빈 칸 하나만 두고 "호실 추가"로 늘려서 직접 입력하게 한다.
  managementFee: category === 'management_fee' ? (() => {
    const year = new Date().getFullYear();
    return {
      units: [{ id: `unit-${Date.now()}`, name: '' }],
      months: Array.from({ length: 12 }, (_, i) => {
        const mm = String(i + 1).padStart(2, '0');
        return {
          id: `mfm-${Date.now()}-${i}`,
          monthKey: `${year}-${mm}`,
          label: `${mm}월`,
          paymentDate: '',
          amounts: {},
          note: ''
        };
      })
    };
  })() : undefined,
  // [추가] 근로계약서 기본값. 급여 구성 항목을 실제 회사 양식(기본급/연장근로수당/
  // 차량유지비/식대)에 맞춰 미리 채워두고, 필요하면 항목을 더 추가/삭제할 수 있다.
  laborContract: (category === 'labor_contract' || category === 'salary_agreement') ? {
    companyBusinessType: '', companyAddress: '',
    employeeName: '', employeeBirthDate: '', employeeAddress: '', employmentType: 'regular',
    salaryItems: category === 'salary_agreement' ? [
      { id: `sal-${Date.now()}-1`, label: '기본급', amount: 0 },
      { id: `sal-${Date.now()}-2`, label: '연장근로수당', amount: 0 },
      { id: `sal-${Date.now()}-3`, label: '식대', amount: 0 }
    ] : [
      { id: `sal-${Date.now()}-1`, label: '기본급', amount: 0 },
      { id: `sal-${Date.now()}-2`, label: '연장근로수당', amount: 0 },
      { id: `sal-${Date.now()}-3`, label: '차량 유지비', amount: 0 },
      { id: `sal-${Date.now()}-4`, label: '식대', amount: 0 }
    ],
    contractStartDate: new Date().toISOString().split('T')[0],
    contractEndDate: category === 'salary_agreement' ? new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0] : '',
    workLocation: category === 'salary_agreement' ? '주소지 회사(회사 사정이 있을 시 변경 가능)' : '주소지 회사(회사 사정이 있을 시 변경 가능) 및 프로젝트 현장',
    jobDuties: '기술 영업 및 기술 지원(회사 사정이 있을 시 변경 가능)',
    contractDate: new Date().toISOString().split('T')[0]
  } : undefined,
  // [추가] 재직증명서 기본값
  employmentCert: category === 'employment_cert' ? {
    companyAddress: '', employeeAddress: '', employeeName: '', residentNumberMasked: '',
    hireDate: '', purpose: '제출용', submitTo: '',
    applicationDate: new Date().toISOString().split('T')[0],
    department: '', position: '',
    documentNumber: '', issueDate: new Date().toISOString().split('T')[0]
  } : undefined,
  // [추가] 위임장 기본값
  powerOfAttorney: category === 'power_of_attorney' ? {
    employeeAddress: '', employeeName: '', residentNumberMasked: '',
    purpose: '', submitTo: '', taskDescription: '',
    issueDate: new Date().toISOString().split('T')[0]
  } : undefined,
  // [추가] 영업 계약서 기본값. 매출구간별 누진 수수료율 등은 공유해주신 예시 계약의
  // 표준 조건을 기본값으로 깔아두고, 거래처마다 조건이 다르면 직접 고쳐 쓸 수 있게 한다.
  salesContract: category === 'sales_contract' ? {
    counterpartyName: '', counterpartyAddress: '', counterpartyBizNumber: '', counterpartyRepName: '',
    contractDate: new Date().toISOString().split('T')[0],
    contractStartDate: new Date().toISOString().split('T')[0],
    contractEndDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
    feeTier1Max: 1800000000, feeTier1Rate: 5,
    feeTier2Max: 3000000000, feeTier2Rate: 4,
    feeTier3Rate: 3,
    lowProfitThreshold: 20, lowProfitRate: 20,
    aftercareCapRate: 3,
    recognitionMonths: 24, recognitionCapAmount: 2000000000
  } : undefined,
  // [추가] 퇴직금 정산 기본값
  severance: category === 'severance' ? {
    employeeName: '', residentNumberMasked: '', hireYearMonth: '',
    periodStart: '', periodEnd: '', reason: '',
    companyAdvanceAmount: 0, companyAdvanceDate: new Date().toISOString().split('T')[0], companyAdvanceBank: '',
    bankAccrualAmount: 0,
    receiveDate: new Date().toISOString().split('T')[0]
  } : undefined
});

// 급여명세서 지급/공제 내역 합계 계산
function sumItems(items?: AdminDocLineItem[]): number {
  return (items || []).reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
}

// [추가] 퇴직금 정산 지급명세서처럼, 금액을 숫자와 한글로 같이 적는 공식 문서 관행에 맞춰
// 숫자를 한글 금액으로 자동 변환한다. "일천만원(₩10,000,000)"처럼 나란히 적을 때 쓴다.
// 관용적으로 "일" 앞에 십/백/천이 붙어도 "일십/일백/일천"처럼 그대로 적는 방식(공문서에서
// 흔한 표기)을 따른다.
function numberToKoreanMoney(num: number): string {
  if (!num || num === 0) return '영';
  const digitsKo = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const smallUnits = ['', '십', '백', '천'];
  const bigUnits = ['', '만', '억', '조'];

  function convertGroup(n: number): string {
    let result = '';
    let divisor = 1000;
    for (let i = 0; i < 4; i++) {
      const digit = Math.floor(n / divisor) % 10;
      if (digit > 0) result += digitsKo[digit] + smallUnits[3 - i];
      divisor /= 10;
    }
    return result;
  }

  const groups: number[] = [];
  let n = Math.floor(Math.abs(num));
  while (n > 0) { groups.push(n % 10000); n = Math.floor(n / 10000); }
  let result = '';
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] > 0) result += convertGroup(groups[i]) + bigUnits[i];
  }
  return result || '영';
}

// [추가] 통장 출금/입금 내역 엑셀 가져오기용 - 은행에서 내려받은 엑셀은 날짜가
// "2026.01.12", "2026/01/12", "2026-01-12", 44654(엑셀 일련번호) 등 제각각이라, 화면의
// <input type="date">에 바로 채워지도록 최대한 "YYYY-MM-DD"로 맞춰본다. 못 알아보는
// 형식이면 원본 텍스트를 그대로 둔다(날짜 칸은 비어 보여도 데이터 자체는 남아있음).
function normalizeDateForInput(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // 엑셀 날짜 일련번호(예: 45678)인 경우 - 1900-01-01 기준 오프셋으로 변환
  if (/^\d{4,6}$/.test(s)) {
    const serial = Number(s);
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const parsed = new Date(epoch.getTime() + serial * 86400000);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1990 && parsed.getFullYear() < 2100) {
      return parsed.toISOString().split('T')[0];
    }
  }
  return s;
}

// [추가] 통장 출금/입금 내역 엑셀 가져오기용 - "1,234,500", "₩1,234,500", "1234500" 등을
// 숫자로 변환한다. 부호(-)가 있으면(은행 엑셀에서 출금을 음수로 표기하는 경우가 있음)
// 절대값으로 바꿔서 저장한다 - 출금/입금 내역은 카테고리로 이미 방향이 정해져 있어서
// 금액 칸에는 항상 양수만 저장하는 기존 방식과 맞춘다.
function parseExcelAmount(raw: string): number {
  const cleaned = (raw || '').toString().replace(/[^\d.-]/g, '');
  const n = Number(cleaned);
  return isNaN(n) ? 0 : Math.abs(n);
}

// [추가] "은행+계좌번호"가 일치하는 통장 입금/출금 내역 문서를 전체 목록(docs)에서 찾아,
// 지정한 기간(periodStart~periodEnd)에 해당하는 거래 금액만 더한다. 월별 자금 현황의
// 입금/출금 칸을 실제 입금/출금 내역과 자동으로 맞추기 위한 함수 — 은행명·계좌번호는
// 공백을 없애고 비교해서, "하나은행"과 "하나은행 " 같은 사소한 표기 차이로 안 맞는
// 일이 없게 한다.
function sumLedgerByAccount(
  allDocs: AdminDoc[],
  category: 'bank_deposit' | 'bank_withdrawal',
  bankName: string,
  accountNumber: string,
  periodStart?: string,
  periodEnd?: string
): number {
  const norm = (s: string) => s.replace(/\s/g, '');
  const targetBank = norm(bankName);
  const targetAcc = norm(accountNumber);
  if (!targetBank || !targetAcc) return 0;

  let total = 0;
  for (const doc of allDocs) {
    if (doc.category !== category || !doc.bankLedger) continue;
    for (const acc of doc.bankLedger.accounts) {
      if (norm(acc.bankName || '') !== targetBank || norm(acc.accountNumber || '') !== targetAcc) continue;
      for (const e of acc.entries) {
        if (periodStart && e.date < periodStart) continue;
        if (periodEnd && e.date > periodEnd) continue;
        total += Number(e.amount) || 0;
      }
    }
  }
  return total;
}

// [추가] "카드사(cardCompany)+카드번호"가 일치하는 회계관리 > 카드사용내역 문서를 전체
// 목록(docs)에서 찾아, 지정한 기간(periodStart~periodEnd)에 해당하는 사용 금액만 더한다.
// 경영지원 > 법인카드 관리의 "출금 금액"을 실제 카드사용내역 합계와 대조하기 위한 함수.
function sumCardUsageByCard(
  allDocs: AdminDoc[],
  cardCompany: string,
  cardNumber: string,
  periodStart?: string,
  periodEnd?: string
): number {
  // [수정] 카드번호에 "0000-0000-0000-0000"처럼 하이픈 자동 서식이 붙게 되면서, 예전에
  // 하이픈 없이 저장해둔 카드번호와 비교할 때도 같은 카드로 인식되도록 하이픈도 함께 지운다.
  const norm = (s: string) => s.replace(/[\s-]/g, '');
  const targetCompany = norm(cardCompany);
  const targetNumber = norm(cardNumber);
  if (!targetCompany || !targetNumber) return 0;

  let total = 0;
  for (const doc of allDocs) {
    if (doc.category !== 'card_usage' || !doc.cardUsage) continue;
    for (const card of doc.cardUsage.cards) {
      if (norm(card.cardName || '') !== targetCompany || norm(card.cardNumber || '') !== targetNumber) continue;
      for (const e of card.entries) {
        if (periodStart && e.date < periodStart) continue;
        if (periodEnd && e.date > periodEnd) continue;
        total += Number(e.amount) || 0;
      }
    }
  }
  return total;
}

// [추가] 회계관리 > 카드사용내역에 "카드사(cardCompany)+카드번호"가 일치하는 내역이 하나라도
// 기록되어 있는지 확인한다. 있으면 "연동됨" 상태로 보고 실사용 금액을 자동 계산해서 보여주고,
// 없으면(아직 카드사용내역이 등록 안 된 카드) 입력해두신 금액을 그대로 보여준다.
function hasCardUsageRecord(allDocs: AdminDoc[], cardCompany: string, cardNumber: string): boolean {
  const norm = (s: string) => s.replace(/[\s-]/g, '');
  const targetCompany = norm(cardCompany);
  const targetNumber = norm(cardNumber);
  if (!targetCompany || !targetNumber) return false;
  return allDocs.some(
    (doc) =>
      doc.category === 'card_usage' &&
      doc.cardUsage?.cards.some((card) => norm(card.cardName || '') === targetCompany && norm(card.cardNumber || '') === targetNumber)
  );
}

// [수정] 처음엔 "전월 사용분을 이번 달에 결제"하는 관행을 가정해서 corpCard.yearMonth의
// "전월" 기간으로 카드사용내역을 대조했는데, 실제로는 카드사용내역을 대상 연월과 "같은 달"
// 날짜로 매일 실시간 입력/확인하는 방식으로 쓰고 계셔서(예: "2026-08" 법인카드 문서에
// 8월 날짜 카드사용내역을 그때그때 기록) 전월 기준으로는 항상 0으로 집계되는 문제가 있었다.
// 대상 연월과 같은 달(YYYY-MM-01 ~ 그 달 마지막 날) 기준으로 바꾼다.
function getTargetMonthRange(yearMonth?: string): { start?: string; end?: string } {
  if (!yearMonth) return {};
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m) return {};
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

// [추가] 4대보험료 등을 요율에 맞춰 자동 계산한다. 소득세는 국세청 근로소득 간이세액표
// (부양가족 수 등에 따라 달라짐)를 따로 봐야 해서 자동 계산 대상에서 제외하고 직접
// 입력한 값을 그대로 쓴다 — 대신 지방소득세는 "소득세 × 지방소득세율"로 정확히 계산된다.
function calcDeductions(
  payItems: AdminDocLineItem[],
  currentDeductions: AdminDocLineItem[],
  rates: { pensionRate: number; healthRate: number; ltcRate: number; employmentRate: number; localTaxRate: number }
): AdminDocLineItem[] {
  // 과세 대상 급여(비과세 항목 제외) 합계
  const taxableBase = payItems.filter((it) => it.taxable !== false).reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
  const round = (n: number) => Math.round(n);

  const findIncomeTax = currentDeductions.find((it) => it.label.replace(/\s/g, '') === '소득세')?.amount || 0;
  const healthAmount = round(taxableBase * (rates.healthRate / 100));

  const computed: Record<string, number> = {
    '국민연금': round(taxableBase * (rates.pensionRate / 100)),
    '건강보험': healthAmount,
    '장기요양보험료': round(healthAmount * (rates.ltcRate / 100)),
    '고용보험': round(taxableBase * (rates.employmentRate / 100)),
    '지방소득세': round(findIncomeTax * (rates.localTaxRate / 100))
  };

  return currentDeductions.map((it) => {
    const key = it.label.replace(/\s/g, '');
    return key in computed ? { ...it, amount: computed[key] } : it;
  });
}

export const AdminDocsView: React.FC<Props> = ({ section, currentUser }) => {
  const categories = CATEGORY_CONFIG[section];
  const [activeCategory, setActiveCategory] = useState<AdminDocCategory>(categories[0].id);
  const [docs, setDocs] = useState<AdminDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingDoc, setEditingDoc] = useState<Partial<AdminDoc> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // [추가] 근로계약서/연봉협약서/재직증명서에서 반복 입력해야 하는 "회사 사업체 주소·사업종류"를
  // 한 번만 입력하면 다음부터 자동으로 채워지도록, 회사 스코프에 저장된 값을 가져와둔다.
  const [companySettings, setCompanySettings] = useState<{ address: string; businessType: string }>({ address: '', businessType: '' });

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') return;
    fetch('/api/company-settings', { headers: { 'x-user-id': currentUser.id } })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data) setCompanySettings({ address: data.address || '', businessType: data.businessType || '' }); })
      .catch((err) => console.error('회사 설정 불러오기 실패:', err));
  }, [currentUser?.id]);

  // [추가] 회사 주소·사업종류를 문서 안에서 고치면, 다음에 새 문서를 만들 때도 그 값이
  // 바로 기본으로 채워지도록 회사 스코프 설정에도 같이 저장해둔다(디바운스 없이 blur 시 저장).
  const persistCompanySettings = (patch: Partial<{ address: string; businessType: string }>) => {
    if (!currentUser) return;
    const next = { ...companySettings, ...patch };
    setCompanySettings(next);
    fetch('/api/company-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
      body: JSON.stringify(next)
    }).catch((err) => console.error('회사 설정 저장 실패:', err));
  };

  // [추가] 차량 과태료 내역의 "위반차량"을 직접 타이핑하지 않고 통합 차량관리에 등록된
  // 차량에서 골라 쓸 수 있도록, 등록 차량 목록을 불러온다.
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  useEffect(() => {
    if (!currentUser || currentUser.role !== 'admin') return;
    fetch('/api/vehicles', { headers: { 'x-user-id': currentUser.id } })
      .then((res) => res.ok ? res.json() : [])
      .then((data) => setVehicles(Array.isArray(data) ? data : []))
      .catch((err) => console.error('등록 차량 목록 불러오기 실패:', err));
  }, [currentUser?.id]);

  // [추가] 차량 과태료 "내용(위반 상세)" - 자주 쓰는 항목을 기본 목록으로 두고, 직접
  // 입력하신 값은 저장된 다른 과태료 문서들에서 모아서 다음부터 목록에 추가로 보이게 한다
  // (별도 저장 없이, 이미 저장된 데이터에서 매번 다시 모음).
  const vehicleFineDetailOptions = (() => {
    const extra = new Set<string>();
    docs.forEach((d) => {
      if (d.category !== 'vehicle_fine' || !d.vehicleFine) return;
      d.vehicleFine.entries.forEach((e) => {
        const t = (e.detail || '').trim();
        if (t && !VEHICLE_FINE_DETAIL_PRESETS.includes(t)) extra.add(t);
      });
    });
    return [...VEHICLE_FINE_DETAIL_PRESETS, ...Array.from(extra).sort((a, b) => a.localeCompare(b, 'ko'))];
  })();

  const activeConfig = categories.find((c) => c.id === activeCategory) || categories[0];

  // [추가] 재직증명서를 새로 만드는 중에 신청일을 바꿔서 연도가 달라지면, 문서번호도
  // 그 연도 기준으로 다시 계산해준다. 이미 저장된 문서를 열람/수정할 때는 번호를 그대로
  // 유지한다(수정 화면에서 신청일을 바꿔도 이미 발급된 번호는 안 바뀌게).
  const applicationYearForDocNumber = !editingDoc?.id ? editingDoc?.employmentCert?.applicationDate?.slice(0, 4) : undefined;
  useEffect(() => {
    if (!applicationYearForDocNumber || !editingDoc || editingDoc.id) return;
    const currentNumberYear = editingDoc.employmentCert?.documentNumber?.split('-')[0];
    if (currentNumberYear === applicationYearForDocNumber) return;
    const countThisYear = docs.filter((d) => d.category === 'employment_cert' && d.employmentCert?.documentNumber?.startsWith(`${applicationYearForDocNumber}-`)).length;
    setEditingDoc((prev) => prev && prev.employmentCert ? { ...prev, employmentCert: { ...prev.employmentCert, documentNumber: `${applicationYearForDocNumber}-${String(countThisYear + 1).padStart(3, '0')}` } } : prev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationYearForDocNumber]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/admin-docs', { headers: currentUser ? { 'x-user-id': currentUser.id } : {} })
      .then(async (res) => {
        if (!res.ok) throw new Error(`불러오기에 실패했습니다 (상태: ${res.status}).`);
        return res.json();
      })
      .then((data: AdminDoc[]) => { if (!cancelled) setDocs(data); })
      .catch((err) => { console.error('admin-docs 불러오기 실패:', err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  const filteredDocs = docs
    .filter((d) => d.section === section && d.category === activeCategory)
    .filter((d) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      return d.title.toLowerCase().includes(q) || (d.personName || '').toLowerCase().includes(q) || (d.memo || '').toLowerCase().includes(q);
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // [추가] 법인카드 관리 - 카드 한 장씩 문서를 따로 등록해두신 경우가 많아서, "이번 달에 등록된
  // 카드 문서를 전부 모아 한 표로 보여달라"는 요청에 맞춰 같은 연월(yearMonth)의 corp_card
  // 문서를 전부 찾아 카드 목록을 하나로 합쳐서 인쇄 화면(renderPrintableCorpCard)에 넘긴다.
  // 실제 데이터는 그대로 두고(문서를 합치거나 지우지 않음), 보여줄 때만 화면에서 합친다.
  const corpCardDocs = docs.filter((d) => d.section === 'management' && d.category === 'corp_card' && d.corpCard);
  const corpCardMonthSet = new Set<string>();
  corpCardDocs.forEach((d) => { const ym = d.corpCard?.yearMonth; if (ym) corpCardMonthSet.add(ym); });
  const corpCardMonths: string[] = Array.from(corpCardMonthSet).sort((a, b) => b.localeCompare(a)); // 최신 연월이 먼저 오도록

  // [추가] 차량 과태료 내역 - "년도별로 보이게" 요청에 맞춰, 문서를 여러 개로 나눠 등록했거나
  // 한 문서에 여러 건을 같이 넣어뒀어도 상관없이 전체 문서의 모든 항목(entries)을 위반일자
  // 기준 연도로 모을 수 있게 미리 연도 목록을 뽑아둔다. 법인카드와 달리 문서 자체에 연월
  // 필드가 없고 건(항목)마다 날짜가 따로 있어서, 문서 단위가 아니라 항목 단위로 연도를 센다.
  const vehicleFineDocs = docs.filter((d) => d.section === 'accounting' && d.category === 'vehicle_fine' && d.vehicleFine);
  const vehicleFineYearSet = new Set<string>();
  vehicleFineDocs.forEach((d) => {
    (d.vehicleFine?.entries || []).forEach((e) => {
      const y = (e.date || d.date || '').slice(0, 4);
      if (y) vehicleFineYearSet.add(y);
    });
  });
  const vehicleFineYears: string[] = Array.from(vehicleFineYearSet).sort((a, b) => b.localeCompare(a)); // 최신 연도가 먼저 오도록

  // [추가] 회계관리 > 카드사용내역에서 "카드명/카드번호/소지자"를 매번 직접 타이핑하지 않고,
  // 경영지원 > 법인카드 관리에 이미 등록된 카드 목록에서 골라 그대로 연동해 채울 수 있도록
  // 전체 문서에서 corp_card 카드 목록을 모아 카드사+카드번호 기준으로 중복 제거한다.
  const knownCorpCards = (() => {
    const seen = new Set<string>();
    const list: { key: string; cardCompany: string; cardNumber: string; user: string }[] = [];
    docs.forEach((d) => {
      if (d.category !== 'corp_card' || !d.corpCard) return;
      d.corpCard.cards.forEach((c) => {
        const key = `${c.cardCompany.replace(/\s/g, '')}__${(c.cardNumber || '').replace(/[\s-]/g, '')}`;
        if (!c.cardCompany || seen.has(key)) return;
        seen.add(key);
        list.push({ key, cardCompany: c.cardCompany, cardNumber: c.cardNumber, user: c.user });
      });
    });
    return list;
  })();

  const handleViewAllCorpCards = () => {
    const targetMonth = corpCardMergeMonth || corpCardMonths[0];
    if (!targetMonth) return;
    const docsForMonth = corpCardDocs
      .filter((d) => (d.corpCard?.yearMonth || '') === targetMonth)
      .sort((a, b) => (a.personName || a.title || '').localeCompare(b.personName || b.title || '', 'ko'));

    // [추가] 관리자가 매일 확인해야 하는 화면이라, 저장해둔 금액을 그대로 보여주지 않고
    // 회계관리 > 카드사용내역에 실제 기록된 내역에서 "오늘까지" 사용한 금액을 실시간으로
    // 계산해서 보여준다. 대상 기간은 "대상 연월과 같은 달"이며(카드사용내역을 대상 연월과
    // 같은 달 날짜로 매일 실시간 입력하시는 방식에 맞춘 것), 그 달이 아직 안 끝났으면
    // 오늘 날짜까지만 합산한다.
    const { start, end } = getTargetMonthRange(targetMonth);
    const todayStr = new Date().toISOString().slice(0, 10);
    const cappedEnd = end ? (end > todayStr ? todayStr : end) : undefined;

    const mergedCards = docsForMonth
      .flatMap((d) => d.corpCard?.cards || [])
      .map((c, i) => {
        const linked = !!(start && cappedEnd) && hasCardUsageRecord(docs, c.cardCompany, c.cardNumber);
        const liveAmount = linked ? sumCardUsageByCard(docs, c.cardCompany, c.cardNumber, start, cappedEnd) : (Number(c.amount) || 0);
        // [수정] 연동 안 된 카드가 왜 안 되는지("카드사용내역에 아직 기록이 없어서"인지) 관리자가
        // 화면만 보고 바로 알 수 있게, 미연동 카드에도 그 사실을 비고에 명시적으로 남긴다.
        const note = linked
          ? `${c.note ? c.note + ' · ' : ''}카드사용내역 연동(${todayStr} 기준)`
          : `${c.note ? c.note + ' · ' : ''}카드사용내역 미연동(카드사용내역에 이 카드사+카드번호로 기록된 내역 없음)`;
        return { ...c, id: `merged-${i}-${c.id}`, amount: liveAmount, note };
      });
    if (mergedCards.length === 0) return;
    const [year, month] = targetMonth.split('-');
    const base = docsForMonth[0];
    setPrintingDoc({
      ...base,
      id: `merged-corp-card-${targetMonth}`,
      title: `${year}년도 카드별 월 사용 내역(${Number(month)}월) - 전체`,
      corpCard: { yearMonth: targetMonth, cards: mergedCards },
    });
  };

  // [추가] "카드별 월 사용 내역" 인쇄 화면(renderPrintableCorpCard, 전체보기든 개별 문서든
  // 동일)을 그대로 엑셀로도 받을 수 있게 한다. 지금까지 쓰던 xlsx 패키지(SheetJS 커뮤니티
  // 버전)는 셀 배경색 등 서식을 저장할 수 없어서(프로젝트 목록 엑셀 내보내기 때 확인된
  // 제약 - 위 handleExportProjectsExcel 참고), 서식 쓰기가 되는 exceljs로 화면과 똑같이
  // 노란 헤더/합계 행 배경색을 넣어 만든다.
  const handleExportCorpCardExcel = async () => {
    if (!printingDoc || !printingDoc.corpCard) return;
    const cc = printingDoc.corpCard;
    const [year, month] = (cc.yearMonth || '').split('-');
    const isMerged = printingDoc.id.startsWith('merged-corp-card-');

    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('카드별_월_사용_내역', {
      pageSetup: { orientation: 'landscape', paperSize: 9 /* A4 */, margins: { left: 0.47, right: 0.47, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } }
    });

    const columns = ['번호', '카드사', '카드번호', '사용자', '사용일수', '출금일자', '사용금액', '출금은행', '출금계좌', '비 고'];
    const colCount = columns.length;
    const thinBorder = { style: 'thin' as const, color: { argb: 'FF000000' } };
    const fullBorder = { top: thinBorder, left: thinBorder, right: thinBorder, bottom: thinBorder };
    const yellowFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFE600' } };

    // 제목 줄
    ws.mergeCells(1, 1, 1, colCount);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = year && month ? `${year}년도 카드별 월 사용 내역(${Number(month)}월)` : printingDoc.title;
    titleCell.font = { bold: true, size: 14, underline: true };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 24;

    let headerRowIdx = 2;
    if (isMerged) {
      ws.mergeCells(2, 1, 2, colCount);
      const noteCell = ws.getCell(2, 1);
      noteCell.value = `※ 금액은 회계관리 > 카드사용내역에 기록된 실제 사용 내역을 기준으로 ${new Date().toISOString().slice(0, 10)} 현재까지 자동 집계된 금액입니다. (카드사용내역에 기록이 없는 카드는 입력해두신 금액을 그대로 표시)`;
      noteCell.font = { size: 9, color: { argb: 'FF555555' } };
      noteCell.alignment = { horizontal: 'center' };
      headerRowIdx = 3;
    }

    const headerRow = ws.getRow(headerRowIdx);
    columns.forEach((label, colIdx) => {
      const cell = headerRow.getCell(colIdx + 1);
      cell.value = label;
      cell.font = { bold: true };
      cell.fill = yellowFill;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = fullBorder;
    });
    headerRow.height = 20;

    cc.cards.forEach((c, i) => {
      const row = ws.getRow(headerRowIdx + 1 + i);
      const values: (string | number)[] = [i + 1, c.cardCompany, c.cardNumber, c.user, c.periodLabel || '', c.paymentDay || '', Number(c.amount) || 0, c.withdrawBank || '', c.withdrawAccount || '', c.note || ''];
      values.forEach((v, colIdx) => {
        const cell = row.getCell(colIdx + 1);
        cell.value = v;
        cell.border = fullBorder;
        cell.alignment = { vertical: 'middle', horizontal: colIdx === 0 || colIdx === 3 || colIdx === 4 ? 'center' : (colIdx === 6 ? 'right' : 'left'), wrapText: colIdx === 9 };
        if (colIdx === 6) cell.numFmt = '#,##0';
      });
    });

    const total = cc.cards.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const totalRowIdx = headerRowIdx + 1 + cc.cards.length;
    ws.mergeCells(totalRowIdx, 1, totalRowIdx, 6);
    const totalRow = ws.getRow(totalRowIdx);
    for (let c = 1; c <= colCount; c++) {
      const cell = totalRow.getCell(c);
      cell.font = { bold: true };
      cell.fill = yellowFill;
      cell.border = fullBorder;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    totalRow.getCell(1).value = '합 계';
    const totalAmountCell = totalRow.getCell(7);
    totalAmountCell.value = total;
    totalAmountCell.numFmt = '#,##0';
    totalAmountCell.alignment = { horizontal: 'right', vertical: 'middle' };

    // 열 너비 - 헤더/데이터 기준으로 대략 계산
    columns.forEach((label, colIdx) => {
      let maxLen = label.length;
      cc.cards.forEach((c, i) => {
        const v = [i + 1, c.cardCompany, c.cardNumber, c.user, c.periodLabel, c.paymentDay, formatCurrencyInput(c.amount || 0), c.withdrawBank, c.withdrawAccount, c.note][colIdx];
        if (v !== undefined && v !== null) maxLen = Math.max(maxLen, String(v).length);
      });
      ws.getColumn(colIdx + 1).width = Math.min(Math.max(maxLen + 3, 8), colIdx === 9 ? 45 : 20);
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `카드별_월_사용_내역_${cc.yearMonth || ''}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // [추가] 차량 과태료 내역 - "개별이 아니라 년도별로 보이게" 요청에 맞춰, 문서 여러 개(또는
  // 한 문서 안의 여러 건)에 나눠 등록된 항목들을 위반일자 기준으로 선택한 연도에 해당하는
  // 것만 전부 모아 한 표(인쇄 화면)로 보여준다. 법인카드의 handleViewAllCorpCards와 같은
  // 패턴 - 실제 문서는 그대로 두고, 보여줄 때만 화면에서 합친다.
  const handleViewAllVehicleFines = () => {
    const targetYear = vehicleFineMergeYear || vehicleFineYears[0];
    if (!targetYear) return;

    const matchesYear = (e: NonNullable<AdminDoc['vehicleFine']>['entries'][number], docDate?: string) =>
      (e.date || docDate || '').slice(0, 4) === targetYear;

    // 표시할 문서 기본값(제목/작성자 등 공용 필드)은 실제로 해당 연도 항목을 가진 문서 중
    // 첫 번째 것을 쓴다. 메모는 특정 문서 하나의 것이라 합친 화면에 그대로 쓰면 오해를 살 수
    // 있어 비워둔다.
    const docsWithMatch = vehicleFineDocs.filter((d) => (d.vehicleFine?.entries || []).some((e) => matchesYear(e, d.date)));
    const base = docsWithMatch[0] || vehicleFineDocs[0];
    if (!base) return;

    const mergedEntries = vehicleFineDocs
      .flatMap((d) => (d.vehicleFine?.entries || []).map((e) => ({ entry: e, docDate: d.date })))
      .filter(({ entry, docDate }) => matchesYear(entry, docDate))
      .sort((a, b) => (a.entry.date || '').localeCompare(b.entry.date || ''))
      .map(({ entry }, i) => ({ ...entry, id: `merged-${i}-${entry.id}` }));
    if (mergedEntries.length === 0) return;

    setPrintingDoc({
      ...base,
      id: `merged-vehicle-fine-${targetYear}`,
      title: `${targetYear}년 법인차량 과태료 내역 - 전체`,
      memo: undefined,
      vehicleFine: { entries: mergedEntries },
    });
  };

  // [추가] 차량 과태료 내역 인쇄 화면(renderPrintableVehicleFine)을 그대로 엑셀로도 받을 수
  // 있게 한다. 법인카드 관리 엑셀 출력(handleExportCorpCardExcel)과 같은 방식 - 서식 쓰기가
  // 되는 exceljs로 노란 헤더/합계 행 배경색을 그대로 재현한다.
  const handleExportVehicleFineExcel = async () => {
    if (!printingDoc || !printingDoc.vehicleFine) return;
    const vf = printingDoc.vehicleFine;

    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('차량_과태료_내역', {
      pageSetup: { orientation: 'portrait', paperSize: 9 /* A4 */, margins: { left: 0.79, right: 0.79, top: 0.79, bottom: 0.79, header: 0.3, footer: 0.3 } }
    });

    const columns = ['위반일자', '위반차량', '금액', '처리일자', '내용', '비고'];
    const colCount = columns.length;
    const thinBorder = { style: 'thin' as const, color: { argb: 'FF000000' } };
    const fullBorder = { top: thinBorder, left: thinBorder, right: thinBorder, bottom: thinBorder };
    const yellowFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFE600' } };
    const fmtDate = (d?: string) => d ? d.replace(/-/g, '.') : '';

    ws.mergeCells(1, 1, 1, colCount);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = printingDoc.title;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 24;

    const headerRowIdx = 2;
    const headerRow = ws.getRow(headerRowIdx);
    columns.forEach((label, colIdx) => {
      const cell = headerRow.getCell(colIdx + 1);
      cell.value = label;
      cell.font = { bold: true };
      cell.fill = yellowFill;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = fullBorder;
    });
    headerRow.height = 20;

    vf.entries.forEach((e, i) => {
      const row = ws.getRow(headerRowIdx + 1 + i);
      const values: (string | number)[] = [fmtDate(e.date), e.vehicle, Number(e.amount) || 0, fmtDate(e.processedDate), e.detail || '', e.note || ''];
      values.forEach((v, colIdx) => {
        const cell = row.getCell(colIdx + 1);
        cell.value = v;
        cell.border = fullBorder;
        cell.alignment = { vertical: 'middle', horizontal: colIdx === 2 ? 'right' : (colIdx === 4 ? 'left' : 'center'), wrapText: colIdx === 4 };
        if (colIdx === 2) cell.numFmt = '#,##0';
      });
    });

    const total = vf.entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalRowIdx = headerRowIdx + 1 + vf.entries.length;
    ws.mergeCells(totalRowIdx, 1, totalRowIdx, 2);
    ws.mergeCells(totalRowIdx, 4, totalRowIdx, colCount);
    const totalRow = ws.getRow(totalRowIdx);
    for (let c = 1; c <= colCount; c++) {
      const cell = totalRow.getCell(c);
      cell.font = { bold: true };
      cell.fill = yellowFill;
      cell.border = fullBorder;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    totalRow.getCell(1).value = '합 계';
    const totalAmountCell = totalRow.getCell(3);
    totalAmountCell.value = total;
    totalAmountCell.numFmt = '#,##0';
    totalAmountCell.alignment = { horizontal: 'right', vertical: 'middle' };

    columns.forEach((label, colIdx) => {
      let maxLen = label.length;
      vf.entries.forEach((e) => {
        const v = [fmtDate(e.date), e.vehicle, formatCurrencyInput(e.amount || 0), fmtDate(e.processedDate), e.detail, e.note][colIdx];
        if (v !== undefined && v !== null) maxLen = Math.max(maxLen, String(v).length);
      });
      ws.getColumn(colIdx + 1).width = Math.min(Math.max(maxLen + 3, 10), colIdx === 4 ? 55 : 20);
    });

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${printingDoc.title || '차량_과태료_내역'}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files.length || !editingDoc) return;
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const att: ProjectFollowUpAttachment = {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          dataUrl: reader.result as string,
          size: file.size
        };
        setEditingDoc((prev) => prev ? { ...prev, attachments: [...(prev.attachments || []), att] } : prev);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeAttachment = (attId: string) => {
    setEditingDoc((prev) => prev ? { ...prev, attachments: (prev.attachments || []).filter((a) => a.id !== attId) } : prev);
  };

  // [추가] 급여명세서 지급/공제 내역 줄 추가·삭제·수정. payItems/deductionItems 둘 다
  // 같은 모양(label + amount)이라 kind로 어느 쪽인지만 구분해서 공용으로 처리한다.
  const updatePayslipItems = (kind: 'payItems' | 'deductionItems', updater: (items: AdminDocLineItem[]) => AdminDocLineItem[]) => {
    setEditingDoc((prev) => {
      if (!prev) return prev;
      const payslip = prev.payslip || { payItems: [], deductionItems: [] };
      return { ...prev, payslip: { ...payslip, [kind]: updater(payslip[kind] || []) } };
    });
  };
  const addPayslipItem = (kind: 'payItems' | 'deductionItems') => {
    updatePayslipItems(kind, (items) => [...items, { id: `li-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: '', amount: 0 }]);
  };
  const removePayslipItem = (kind: 'payItems' | 'deductionItems', id: string) => {
    updatePayslipItems(kind, (items) => items.filter((it) => it.id !== id));
  };
  const updatePayslipItem = (kind: 'payItems' | 'deductionItems', id: string, patch: Partial<AdminDocLineItem>) => {
    updatePayslipItems(kind, (items) => items.map((it) => it.id === id ? { ...it, ...patch } : it));
  };

  // [수정] 예전엔 이 버튼을 눌러야만 계산됐지만, 이제는 아래 useEffect가 지급 내역/공제율이
  // 바뀔 때마다 자동으로 재계산한다(더 아래 참고). 이 함수는 더 이상 쓰이지 않는다.

  const updateRate = (key: keyof typeof DEFAULT_RATES, value: number) => {
    setEditingDoc((prev) => {
      if (!prev) return prev;
      const payslip = prev.payslip || { payItems: [], deductionItems: [] };
      const rates = { ...(payslip.rates || DEFAULT_RATES), [key]: value };
      try { localStorage.setItem(RATES_STORAGE_KEY, JSON.stringify(rates)); } catch { /* 저장 실패해도 무시 */ }
      return { ...prev, payslip: { ...payslip, rates } };
    });
  };

  const [showRateSettings, setShowRateSettings] = useState(false);

  // [추가] 예전엔 "자동 계산" 버튼을 직접 눌러야만 계산됐는데, 지급 내역이나 공제율을 바꿀
  // 때마다 매번 버튼 누르는 게 번거로워서, 바뀌는 즉시 자동으로 다시 계산되게 한다.
  // 소득세 금액이 바뀌어도(지방소득세가 소득세에 딸려있으므로) 다시 계산한다.
  // 실제로 계산 결과가 달라질 때만 상태를 갱신해서 무한 재실행을 막는다.
  const payItemsKey = editingDoc?.payslip?.payItems?.map((it) => `${it.amount}_${it.taxable !== false}`).join('|') || '';
  const ratesKey = JSON.stringify(editingDoc?.payslip?.rates || {});
  const incomeTaxAmount = editingDoc?.payslip?.deductionItems?.find((it) => it.label.replace(/\s/g, '') === '소득세')?.amount || 0;
  useEffect(() => {
    if (!editingDoc || editingDoc.category !== 'payslip' || !editingDoc.payslip) return;
    const rates = editingDoc.payslip.rates || DEFAULT_RATES;
    const current = editingDoc.payslip.deductionItems || [];
    const recalculated = calcDeductions(editingDoc.payslip.payItems || [], current, rates);
    const isSame = recalculated.length === current.length && recalculated.every((it, i) => it.amount === current[i].amount);
    if (!isSame) {
      setEditingDoc((prev) => prev && prev.payslip ? { ...prev, payslip: { ...prev.payslip, deductionItems: recalculated } } : prev);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payItemsKey, ratesKey, incomeTaxAmount, editingDoc?.category]);

  // [추가] 인쇄할 급여명세서 (null이면 인쇄 화면 없음)
  const [printingDoc, setPrintingDoc] = useState<AdminDoc | null>(null);

  // [추가] 법인카드 관리 - "전체 카드 한 페이지로 보기"에서 고를 대상 연월
  const [corpCardMergeMonth, setCorpCardMergeMonth] = useState('');

  // [추가] 차량 과태료 내역 - "연도별로 모아보기"에서 고를 대상 연도
  const [vehicleFineMergeYear, setVehicleFineMergeYear] = useState('');

  // [추가] 월별 자금 현황 - 통장(계좌) 줄 추가·삭제·수정
  const updateCashflowAccounts = (updater: (accounts: NonNullable<AdminDoc['cashflow']>['accounts']) => NonNullable<AdminDoc['cashflow']>['accounts']) => {
    setEditingDoc((prev) => {
      if (!prev) return prev;
      const cashflow = prev.cashflow || { accounts: [] };
      return { ...prev, cashflow: { ...cashflow, accounts: updater(cashflow.accounts || []) } };
    });
  };
  const addCashflowAccount = () => {
    updateCashflowAccounts((accounts) => [...accounts, { id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: '', broughtForward: 0, deposit: 0, withdrawal: 0, note: '' }]);
  };
  const removeCashflowAccount = (id: string) => {
    updateCashflowAccounts((accounts) => accounts.filter((a) => a.id !== id));
  };
  const updateCashflowAccount = (id: string, patch: Partial<NonNullable<AdminDoc['cashflow']>['accounts'][number]>) => {
    updateCashflowAccounts((accounts) => accounts.map((a) => a.id === id ? { ...a, ...patch } : a));
  };
  // 통장잔액 = 이월금 + 입금 - 출금
  const accountBalance = (a: { broughtForward: number; deposit: number; withdrawal: number }) => a.broughtForward + a.deposit - a.withdrawal;

  // [추가] 통장 출금/입금 내역 - 계좌·거래 줄 추가·삭제·수정 (두 카테고리 공용)
  type BankAccount = NonNullable<AdminDoc['bankLedger']>['accounts'][number];
  type BankEntry = BankAccount['entries'][number];
  const updateBankAccounts = (updater: (accounts: BankAccount[]) => BankAccount[]) => {
    setEditingDoc((prev) => {
      if (!prev) return prev;
      const bankLedger = prev.bankLedger || { accounts: [] };
      return { ...prev, bankLedger: { ...bankLedger, accounts: updater(bankLedger.accounts || []) } };
    });
  };
  const addBankAccount = () => {
    updateBankAccounts((accounts) => [...accounts, {
      id: `bacc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      bankName: '',
      accountNumber: '',
      subCategory: '',
      entries: [{ id: `be-${Date.now()}`, date: new Date().toISOString().split('T')[0], project: '', amount: 0, description: '', note: '' }]
    }]);
  };
  const removeBankAccount = (accId: string) => {
    updateBankAccounts((accounts) => accounts.filter((a) => a.id !== accId));
  };
  const updateBankAccountField = (accId: string, patch: Partial<Pick<BankAccount, 'bankName' | 'accountNumber' | 'subCategory'>>) => {
    updateBankAccounts((accounts) => accounts.map((a) => a.id === accId ? { ...a, ...patch } : a));
  };
  const addBankEntry = (accId: string) => {
    updateBankAccounts((accounts) => accounts.map((a) => a.id === accId
      ? { ...a, entries: [...a.entries, { id: `be-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, date: new Date().toISOString().split('T')[0], project: '', amount: 0, description: '', note: '' }] }
      : a));
  };
  const removeBankEntry = (accId: string, entryId: string) => {
    updateBankAccounts((accounts) => accounts.map((a) => a.id === accId ? { ...a, entries: a.entries.filter((e) => e.id !== entryId) } : a));
  };
  const updateBankEntry = (accId: string, entryId: string, patch: Partial<BankEntry>) => {
    updateBankAccounts((accounts) => accounts.map((a) => a.id === accId
      ? { ...a, entries: a.entries.map((e) => e.id === entryId ? { ...e, ...patch } : e) }
      : a));
  };
  const bankAccountTotal = (a: BankAccount) => a.entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  // [추가] 통장 출금/입금 내역 - 엑셀 내보내기. 지금까지 등록된 이 종류(출금 또는 입금)의
  // 모든 문서·통장·거래를 한 시트로 펼쳐서 다운로드한다 - 은행 사이트/회계 프로그램으로
  // 옮기거나 백업해두기 좋게, 그리고 아래 "엑셀 가져오기"로 다시 그대로 불러올 수 있게
  // 컬럼 순서를 맞춰뒀다.
  const [isImportingBankLedger, setIsImportingBankLedger] = useState(false);
  const handleExportBankLedgerExcel = () => {
    const isWithdrawal = activeCategory === 'bank_withdrawal';
    const targetDocs = docs.filter((d) => d.section === section && d.category === activeCategory);
    const wsData: (string | number)[][] = [['문서 제목', '은행', '계좌번호', '구분', '일자', '프로젝트', '금액', '거래내용', '비고']];
    targetDocs.forEach((d) => {
      (d.bankLedger?.accounts || []).forEach((acc) => {
        acc.entries.forEach((e) => {
          wsData.push([d.title, acc.bankName || '', acc.accountNumber || '', acc.subCategory || '', e.date, e.project || '', Number(e.amount) || 0, e.description || '', e.note || '']);
        });
      });
    });
    if (wsData.length === 1) {
      alert(`내보낼 ${isWithdrawal ? '통장 출금 내역' : '통장 입금 내역'}이 없습니다.`);
      return;
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = wsData[0].map((_, colIdx) => {
      let maxLen = 8;
      wsData.forEach((row) => { const len = (row[colIdx] ?? '').toString().length; if (len > maxLen) maxLen = Math.min(len, 40); });
      return { wch: maxLen + 2 };
    });
    XLSX.utils.book_append_sheet(wb, ws, isWithdrawal ? '통장 출금 내역' : '통장 입금 내역');
    XLSX.writeFile(wb, `${isWithdrawal ? '통장출금내역' : '통장입금내역'}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // [추가] 통장 출금/입금 내역 - 엑셀 가져오기. 위 "엑셀 내보내기"로 받은 파일이나, 은행에서
  // 바로 내려받은 거래내역 엑셀을 업로드하면 새 문서 하나로 만들어준다(통장 하나, 거래
  // 여러 줄). 은행마다 컬럼 이름이 달라서 자주 쓰이는 이름들을 최대한 알아보려고 하고,
  // 못 알아본 컬럼은 빈 채로 둔다 - 가져온 뒤 "수정"에서 은행명/계좌번호 등을 채우거나
  // 잘못 들어온 값을 고치면 된다.
  const handleImportBankLedgerFile = async (file: File) => {
    if (!currentUser) return;
    setIsImportingBankLedger(true);
    try {
      const isWithdrawal = activeCategory === 'bank_withdrawal';
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1, raw: false, defval: '' });
      if (rows.length < 2) throw new Error('엑셀에 데이터가 없습니다.');

      const norm = (s: string) => (s || '').toString().replace(/\s/g, '').toLowerCase();
      const header = rows[0].map((h) => norm(h));
      const findCol = (candidates: string[]) => header.findIndex((h) => candidates.some((c) => h.includes(norm(c))));

      const colDate = findCol(['거래일자', '거래일', '일자', '날짜', 'date']);
      const colDesc = findCol(['거래내용', '적요', '내용', '거래처', 'description']);
      const colProject = findCol(['프로젝트']);
      const colNote = findCol(['비고', '메모', 'note']);
      const colAmount = findCol(['금액', 'amount']);
      const colWithdrawal = findCol(['출금액', '출금', 'withdrawal']);
      const colDeposit = findCol(['입금액', '입금', 'deposit']);
      // 이 카테고리(출금/입금)에 맞는 금액 컬럼을 우선 쓰고, 없으면 공용 "금액" 컬럼을 쓴다.
      const amountCol = isWithdrawal
        ? (colWithdrawal >= 0 ? colWithdrawal : colAmount)
        : (colDeposit >= 0 ? colDeposit : colAmount);

      if (amountCol < 0) {
        throw new Error('금액 컬럼을 찾지 못했습니다. 첫 줄(헤더)에 "금액" 또는 "출금액"/"입금액" 컬럼이 있는지 확인해주세요.');
      }

      const entries = rows.slice(1)
        .filter((row) => row.some((cell) => (cell || '').toString().trim() !== ''))
        .map((row, idx) => {
          const amount = parseExcelAmount(row[amountCol]);
          return {
            id: `be-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            date: colDate >= 0 ? normalizeDateForInput(row[colDate]) : '',
            project: colProject >= 0 ? (row[colProject] || '').toString() : '',
            amount,
            description: colDesc >= 0 ? (row[colDesc] || '').toString() : '',
            note: colNote >= 0 ? (row[colNote] || '').toString() : ''
          };
        })
        .filter((e) => e.amount > 0); // 다른 방향(예: 출금 파일에 섞여 들어온 입금 줄)은 0원으로 걸러진다

      if (entries.length === 0) {
        throw new Error('가져올 거래가 없습니다 (금액이 있는 줄을 찾지 못했습니다).');
      }

      const totalAmount = entries.reduce((s, e) => s + e.amount, 0);
      const newDoc: Partial<AdminDoc> = {
        section,
        category: activeCategory,
        title: `${isWithdrawal ? '통장 출금 내역' : '통장 입금 내역'} 엑셀 가져오기 (${file.name.replace(/\.(xlsx|xls|csv)$/i, '')})`,
        date: new Date().toISOString().split('T')[0],
        amount: String(totalAmount),
        bankLedger: { accounts: [{ id: `bacc-${Date.now()}`, bankName: '', accountNumber: '', subCategory: '', entries }] }
      };

      const res = await fetch('/api/admin-docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
        body: JSON.stringify(newDoc)
      });
      if (!res.ok) throw new Error(`저장에 실패했습니다 (상태: ${res.status}).`);
      const saved: AdminDoc = await res.json();
      setDocs((prev) => [saved, ...prev]);
      alert(`${entries.length}건을 가져왔습니다. 새로 만들어진 "${saved.title}" 문서를 열어서 은행명/계좌번호를 채우고 내용을 확인해주세요.`);
    } catch (err: any) {
      alert(`엑셀 가져오기에 실패했습니다.\n${err.message || '파일 형식을 확인해주세요.'}`);
    } finally {
      setIsImportingBankLedger(false);
    }
  };

  // [추가] 대출이자 및 원금 상환 내역 - 대출 줄 추가·삭제·수정
  type LoanEntry = NonNullable<AdminDoc['loanRepayment']>['loans'][number];
  const updateLoans = (updater: (loans: LoanEntry[]) => LoanEntry[]) => {
    setEditingDoc((prev) => {
      if (!prev) return prev;
      const loanRepayment = prev.loanRepayment || { loans: [] };
      return { ...prev, loanRepayment: { ...loanRepayment, loans: updater(loanRepayment.loans || []) } };
    });
  };
  const addLoan = () => {
    updateLoans((loans) => [...loans, {
      id: `loan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      loanName: '', loanAccount: '', initialAmount: 0, initialRate: 0, currentRate: 0,
      loanDate: '', maturityDate: '', paymentDay: '', balance: 0,
      principalPaid: 0, interestPaid: 0, withdrawBank: '', withdrawAccount: '', isRepaid: false
    }]);
  };
  const removeLoan = (id: string) => {
    updateLoans((loans) => loans.filter((l) => l.id !== id));
  };
  const updateLoan = (id: string, patch: Partial<LoanEntry>) => {
    updateLoans((loans) => loans.map((l) => l.id === id ? { ...l, ...patch } : l));
  };
  const loanPaymentTotal = (l: LoanEntry) => (Number(l.principalPaid) || 0) + (Number(l.interestPaid) || 0);

  // [추가] 법인카드 사용내역 - 카드·사용내역 줄 추가·삭제·수정 (통장 출금/입금 내역과 같은 패턴)
  type CardGroup = NonNullable<AdminDoc['cardUsage']>['cards'][number];
  type CardEntry = CardGroup['entries'][number];
  const updateCards = (updater: (cards: CardGroup[]) => CardGroup[]) => {
    setEditingDoc((prev) => {
      if (!prev) return prev;
      const cardUsage = prev.cardUsage || { cards: [] };
      return { ...prev, cardUsage: { ...cardUsage, cards: updater(cardUsage.cards || []) } };
    });
  };
  const addCard = () => {
    updateCards((cards) => [...cards, {
      id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      cardName: '', cardNumber: '', holder: '',
      entries: [{ id: `cue-${Date.now()}`, amount: 0, date: new Date().toISOString().split('T')[0], project: '', user: '', note: '' }]
    }]);
  };
  const removeCard = (cardId: string) => {
    updateCards((cards) => cards.filter((c) => c.id !== cardId));
  };
  const updateCardField = (cardId: string, patch: Partial<Pick<CardGroup, 'cardName' | 'cardNumber' | 'holder'>>) => {
    updateCards((cards) => cards.map((c) => c.id === cardId ? { ...c, ...patch } : c));
  };
  const addCardEntry = (cardId: string) => {
    updateCards((cards) => cards.map((c) => c.id === cardId
      ? { ...c, entries: [...c.entries, { id: `cue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, amount: 0, date: new Date().toISOString().split('T')[0], project: '', user: '', note: '' }] }
      : c));
  };
  const removeCardEntry = (cardId: string, entryId: string) => {
    updateCards((cards) => cards.map((c) => c.id === cardId ? { ...c, entries: c.entries.filter((e) => e.id !== entryId) } : c));
  };
  const updateCardEntry = (cardId: string, entryId: string, patch: Partial<CardEntry>) => {
    updateCards((cards) => cards.map((c) => c.id === cardId
      ? { ...c, entries: c.entries.map((e) => e.id === entryId ? { ...e, ...patch } : e) }
      : c));
  };
  const cardGroupTotal = (c: CardGroup) => c.entries.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  // [추가] 가지급내역 - 인원(열) 추가/삭제/이름수정, 월(행) 추가/삭제/수정, 칸(인원×월)
  // 금액 직접입력수정. 칸 하나는 "직접 입력한 금액(manual) + 전자결재에서 자동으로 가져온
  // 항목들(imported)의 합"으로 구성된다 - 자동 불러오기와 별개로 사람이 직접 조정 금액을
  // 더 얹거나 뺄 수 있도록(공유해주신 양식의 "-8,800(주차료부족금액)" 같은 조정 내역), manual은
  // 음수도 허용한다.
  type AdvancePayment = NonNullable<AdminDoc['advancePayment']>;
  type AdvancePerson = AdvancePayment['people'][number];
  type AdvanceMonth = AdvancePayment['months'][number];
  type AdvanceCell = AdvanceMonth['amounts'][string];
  const updateAdvancePayment = (updater: (ap: AdvancePayment) => AdvancePayment) => {
    setEditingDoc((prev) => {
      if (!prev) return prev;
      const ap = prev.advancePayment || { people: [], months: [] };
      return { ...prev, advancePayment: updater(ap) };
    });
  };
  const addAdvancePerson = () => {
    updateAdvancePayment((ap) => ({ ...ap, people: [...ap.people, { id: `person-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: '' }] }));
  };
  const removeAdvancePerson = (personId: string) => {
    updateAdvancePayment((ap) => ({
      ...ap,
      people: ap.people.filter((p) => p.id !== personId),
      months: ap.months.map((m) => {
        const nextAmounts = { ...m.amounts };
        delete nextAmounts[personId];
        return { ...m, amounts: nextAmounts };
      })
    }));
  };
  const updateAdvancePersonName = (personId: string, name: string) => {
    updateAdvancePayment((ap) => ({ ...ap, people: ap.people.map((p) => p.id === personId ? { ...p, name } : p) }));
  };
  const addAdvanceMonth = () => {
    updateAdvancePayment((ap) => ({
      ...ap,
      months: [...ap.months, { id: `apm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, monthKey: '', label: '', depositDate: '', amounts: {}, note: '' }]
    }));
  };
  const removeAdvanceMonth = (monthId: string) => {
    updateAdvancePayment((ap) => ({ ...ap, months: ap.months.filter((m) => m.id !== monthId) }));
  };
  const updateAdvanceMonthField = (monthId: string, patch: Partial<Pick<AdvanceMonth, 'monthKey' | 'label' | 'depositDate' | 'note'>>) => {
    updateAdvancePayment((ap) => ({ ...ap, months: ap.months.map((m) => m.id === monthId ? { ...m, ...patch } : m) }));
  };
  const updateAdvanceCellManual = (monthId: string, personId: string, manual: number) => {
    updateAdvancePayment((ap) => ({
      ...ap,
      months: ap.months.map((m) => m.id === monthId
        ? { ...m, amounts: { ...m.amounts, [personId]: { manual, imported: m.amounts[personId]?.imported || [] } } }
        : m)
    }));
  };
  const advanceCellTotal = (cell?: AdvanceCell) => cell ? (Number(cell.manual) || 0) + cell.imported.reduce((s, it) => s + (Number(it.amount) || 0), 0) : 0;
  const advanceMonthTotal = (m: AdvanceMonth, people: AdvancePerson[]) => people.reduce((sum, p) => sum + advanceCellTotal(m.amounts[p.id]), 0);
  const advancePersonTotal = (personId: string, months: AdvanceMonth[]) => months.reduce((sum, m) => sum + advanceCellTotal(m.amounts[personId]), 0);
  const advanceGrandTotal = (ap?: AdvancePayment) => ap ? ap.months.reduce((sum, m) => sum + advanceMonthTotal(m, ap.people), 0) : 0;

  // [추가] "자동 불러오기" - 전자결재 > 가지급금 정산서가 승인(status: 'approved')되면 그
  // 정산 내역을 서버에서 모아와서, 고른 항목을 이름이 일치하는 인원 열 + 날짜가 속한 월 행의
  // 칸에 채워 넣는다. 일치하는 인원 열이 없으면 새로 만들고, 해당 월 행이 없으면 새로 만든다.
  // 이미 가져온 적 있는 항목(sourceKey로 판단)은 다시 목록에 안 뜨게 해서 중복 등록을 막는다.
  type AdvanceImportCandidate = { sourceKey: string; sourceLabel: string; date: string; amount: number; personName?: string; project?: string; memo?: string };
  const [advanceImportCandidates, setAdvanceImportCandidates] = useState<AdvanceImportCandidate[]>([]);
  const [showAdvanceImportPanel, setShowAdvanceImportPanel] = useState(false);
  const [isLoadingAdvanceCandidates, setIsLoadingAdvanceCandidates] = useState(false);
  const [selectedAdvanceImportKeys, setSelectedAdvanceImportKeys] = useState<Set<string>>(new Set());

  const alreadyImportedAdvanceKeys = new Set<string>();
  for (const d of docs) {
    if (d.category !== 'advance_payment' || !d.advancePayment) continue;
    for (const m of d.advancePayment.months) {
      for (const personId of Object.keys(m.amounts)) {
        for (const imp of (m.amounts[personId].imported || [])) alreadyImportedAdvanceKeys.add(imp.sourceKey);
      }
    }
  }
  for (const m of (editingDoc?.advancePayment?.months || [])) {
    for (const personId of Object.keys(m.amounts)) {
      for (const imp of (m.amounts[personId]?.imported || [])) alreadyImportedAdvanceKeys.add(imp.sourceKey);
    }
  }

  const handleOpenAdvanceImportPanel = async () => {
    if (!currentUser) return;
    setShowAdvanceImportPanel(true);
    setIsLoadingAdvanceCandidates(true);
    try {
      const res = await fetch('/api/admin-docs/advance-payment-candidates', { headers: { 'x-user-id': currentUser.id } });
      if (!res.ok) throw new Error(`불러오기에 실패했습니다 (상태: ${res.status}).`);
      const data: AdvanceImportCandidate[] = await res.json();
      setAdvanceImportCandidates(data);
    } catch (err: any) {
      alert(`전자결재 가지급금 정산서 내역을 불러오지 못했습니다.\n${err.message || '다시 시도해주세요.'}`);
      setShowAdvanceImportPanel(false);
    } finally {
      setIsLoadingAdvanceCandidates(false);
    }
  };

  const toggleAdvanceImportKey = (key: string) => {
    setSelectedAdvanceImportKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const importAdvanceCandidate = (ap: AdvancePayment, cand: AdvanceImportCandidate): AdvancePayment => {
    let people = ap.people;
    const name = (cand.personName || '').trim();
    let person = people.find((p) => p.name.trim() === name);
    if (!person && name) {
      person = { id: `person-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name };
      people = [...people, person];
    }
    if (!person) return ap; // 이름 정보가 아예 없으면 어느 인원 열에 넣을지 알 수 없어 건너뜀

    const monthKey = (cand.date || '').slice(0, 7);
    let months = ap.months;
    let month = months.find((m) => m.monthKey === monthKey);
    if (!month) {
      const mm = monthKey.slice(5, 7);
      month = { id: `apm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, monthKey, label: mm ? `${mm}월` : (monthKey || ''), depositDate: '', amounts: {}, note: '' };
      months = [...months, month].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    }
    const targetMonthId = month.id;
    months = months.map((m) => {
      if (m.id !== targetMonthId) return m;
      const existing = m.amounts[person!.id] || { manual: 0, imported: [] };
      return { ...m, amounts: { ...m.amounts, [person!.id]: { ...existing, imported: [...existing.imported, { sourceKey: cand.sourceKey, sourceLabel: cand.sourceLabel, amount: cand.amount }] } } };
    });
    return { ...ap, people, months };
  };

  const handleImportAdvanceSelected = () => {
    const toImport = advanceImportCandidates.filter((c) => selectedAdvanceImportKeys.has(c.sourceKey));
    updateAdvancePayment((ap) => toImport.reduce((acc, cand) => importAdvanceCandidate(acc, cand), ap));
    setSelectedAdvanceImportKeys(new Set());
    setShowAdvanceImportPanel(false);
  };

  // [추가] 차량 과태료 내역 - 항목 추가/삭제/수정 (건별로 여러 줄)
  type VehicleFineRow = NonNullable<AdminDoc['vehicleFine']>['entries'][number];
  const updateVehicleFineEntries = (updater: (entries: VehicleFineRow[]) => VehicleFineRow[]) => {
    setEditingDoc((prev) => {
      if (!prev) return prev;
      const vehicleFine = prev.vehicleFine || { entries: [] };
      return { ...prev, vehicleFine: { ...vehicleFine, entries: updater(vehicleFine.entries || []) } };
    });
  };
  const addVehicleFineEntry = () => {
    updateVehicleFineEntries((entries) => [...entries, { id: `vf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, date: new Date().toISOString().split('T')[0], vehicle: '', amount: 0, processedDate: '', detail: '', note: '' }]);
  };
  const removeVehicleFineEntry = (id: string) => {
    updateVehicleFineEntries((entries) => entries.filter((e) => e.id !== id));
  };
  const updateVehicleFineEntry = (id: string, patch: Partial<VehicleFineRow>) => {
    updateVehicleFineEntries((entries) => entries.map((e) => e.id === id ? { ...e, ...patch } : e));
  };

  // [추가] "자동 불러오기" - 회계관리 > 통장 출금 내역에 이미 등록된 거래 내역을 서버에서
  // 모아와서, 실제로 과태료인 건만 골라 지금 편집 중인 차량 과태료 내역에 항목으로 채워
  // 넣는다. 출금 내역 자체엔 "과태료 여부" 표시가 없어 전부 후보로 보여주고 사람이 고른다.
  // 이미 가져온 적 있는 항목(sourceKey로 판단)은 다시 목록에 안 뜨게 해서 중복 등록을 막는다.
  type VehicleFineImportCandidate = { sourceKey: string; sourceLabel: string; date: string; amount: number; memo?: string };
  const [vehicleFineImportCandidates, setVehicleFineImportCandidates] = useState<VehicleFineImportCandidate[]>([]);
  const [showVehicleFineImportPanel, setShowVehicleFineImportPanel] = useState(false);
  const [isLoadingVehicleFineCandidates, setIsLoadingVehicleFineCandidates] = useState(false);
  const [selectedVehicleFineImportKeys, setSelectedVehicleFineImportKeys] = useState<Set<string>>(new Set());

  const alreadyImportedVehicleFineKeys = new Set<string>();
  for (const d of docs) {
    if (d.category !== 'vehicle_fine' || !d.vehicleFine) continue;
    for (const e of d.vehicleFine.entries) {
      if (e.sourceKey) alreadyImportedVehicleFineKeys.add(e.sourceKey);
    }
  }
  for (const e of (editingDoc?.vehicleFine?.entries || [])) {
    if (e.sourceKey) alreadyImportedVehicleFineKeys.add(e.sourceKey);
  }

  const handleOpenVehicleFineImportPanel = async () => {
    if (!currentUser) return;
    setShowVehicleFineImportPanel(true);
    setIsLoadingVehicleFineCandidates(true);
    try {
      const res = await fetch('/api/admin-docs/bank-withdrawal-candidates', { headers: { 'x-user-id': currentUser.id } });
      if (!res.ok) throw new Error(`불러오기에 실패했습니다 (상태: ${res.status}).`);
      const data: VehicleFineImportCandidate[] = await res.json();
      setVehicleFineImportCandidates(data);
    } catch (err: any) {
      alert(`통장 출금 내역을 불러오지 못했습니다.\n${err.message || '다시 시도해주세요.'}`);
      setShowVehicleFineImportPanel(false);
    } finally {
      setIsLoadingVehicleFineCandidates(false);
    }
  };

  const toggleVehicleFineImportKey = (key: string) => {
    setSelectedVehicleFineImportKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleImportVehicleFineSelected = () => {
    const toImport = vehicleFineImportCandidates.filter((c) => selectedVehicleFineImportKeys.has(c.sourceKey));
    updateVehicleFineEntries((entries) => [
      ...entries,
      ...toImport.map((cand) => ({
        id: `vf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date: cand.date,
        vehicle: '',
        amount: cand.amount,
        processedDate: '',
        detail: cand.memo || '',
        note: '',
        sourceKey: cand.sourceKey,
        sourceLabel: cand.sourceLabel
      }))
    ]);
    setSelectedVehicleFineImportKeys(new Set());
    setShowVehicleFineImportPanel(false);
  };

  // [추가] 각종 세금 - 항목 추가/삭제/수정 (건별로 여러 줄)
  type TaxRow = NonNullable<AdminDoc['taxPayment']>['entries'][number];
  const updateTaxEntries = (updater: (entries: TaxRow[]) => TaxRow[]) => {
    setEditingDoc((prev) => {
      if (!prev) return prev;
      const taxPayment = prev.taxPayment || { entries: [] };
      return { ...prev, taxPayment: { ...taxPayment, entries: updater(taxPayment.entries || []) } };
    });
  };
  const addTaxEntry = () => {
    updateTaxEntries((entries) => [...entries, { id: `tax-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, description: '', paidDate: '', amount: 0, note: '' }]);
  };
  const removeTaxEntry = (id: string) => {
    updateTaxEntries((entries) => entries.filter((e) => e.id !== id));
  };
  const updateTaxEntry = (id: string, patch: Partial<TaxRow>) => {
    updateTaxEntries((entries) => entries.map((e) => e.id === id ? { ...e, ...patch } : e));
  };

  // [추가] "자동 불러오기" - 회계관리 > 통장 출금 내역에서 실제 세금 납부 건만 골라
  // 지금 편집 중인 각종 세금 내역에 항목으로 채워 넣는다 (차량 과태료 내역과 같은 패턴).
  type TaxImportCandidate = { sourceKey: string; sourceLabel: string; date: string; amount: number; memo?: string };
  const [taxImportCandidates, setTaxImportCandidates] = useState<TaxImportCandidate[]>([]);
  const [showTaxImportPanel, setShowTaxImportPanel] = useState(false);
  const [isLoadingTaxCandidates, setIsLoadingTaxCandidates] = useState(false);
  const [selectedTaxImportKeys, setSelectedTaxImportKeys] = useState<Set<string>>(new Set());

  const alreadyImportedTaxKeys = new Set<string>();
  for (const d of docs) {
    if (d.category !== 'tax' || !d.taxPayment) continue;
    for (const e of d.taxPayment.entries) {
      if (e.sourceKey) alreadyImportedTaxKeys.add(e.sourceKey);
    }
  }
  for (const e of (editingDoc?.taxPayment?.entries || [])) {
    if (e.sourceKey) alreadyImportedTaxKeys.add(e.sourceKey);
  }

  const handleOpenTaxImportPanel = async () => {
    if (!currentUser) return;
    setShowTaxImportPanel(true);
    setIsLoadingTaxCandidates(true);
    try {
      const res = await fetch('/api/admin-docs/bank-withdrawal-candidates', { headers: { 'x-user-id': currentUser.id } });
      if (!res.ok) throw new Error(`불러오기에 실패했습니다 (상태: ${res.status}).`);
      const data: TaxImportCandidate[] = await res.json();
      setTaxImportCandidates(data);
    } catch (err: any) {
      alert(`통장 출금 내역을 불러오지 못했습니다.\n${err.message || '다시 시도해주세요.'}`);
      setShowTaxImportPanel(false);
    } finally {
      setIsLoadingTaxCandidates(false);
    }
  };

  const toggleTaxImportKey = (key: string) => {
    setSelectedTaxImportKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleImportTaxSelected = () => {
    const toImport = taxImportCandidates.filter((c) => selectedTaxImportKeys.has(c.sourceKey));
    updateTaxEntries((entries) => [
      ...entries,
      ...toImport.map((cand) => ({
        id: `tax-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        description: cand.memo || '',
        paidDate: cand.date,
        amount: cand.amount,
        note: '',
        sourceKey: cand.sourceKey,
        sourceLabel: cand.sourceLabel
      }))
    ]);
    setSelectedTaxImportKeys(new Set());
    setShowTaxImportPanel(false);
  };

  // [추가] 관리비내역 - 호실(열) 추가/삭제/이름수정, 월(행) 추가/삭제/수정, 칸(호실×월)
  // 금액 직접입력수정. 가지급내역과 완전히 같은 패턴(호실 = 인원 자리).
  type ManagementFee = NonNullable<AdminDoc['managementFee']>;
  type ManagementUnit = ManagementFee['units'][number];
  type ManagementMonth = ManagementFee['months'][number];
  type ManagementCell = ManagementMonth['amounts'][string];
  const updateManagementFee = (updater: (mf: ManagementFee) => ManagementFee) => {
    setEditingDoc((prev) => {
      if (!prev) return prev;
      const mf = prev.managementFee || { units: [], months: [] };
      return { ...prev, managementFee: updater(mf) };
    });
  };
  const addManagementUnit = () => {
    updateManagementFee((mf) => ({ ...mf, units: [...mf.units, { id: `unit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: '' }] }));
  };
  const removeManagementUnit = (unitId: string) => {
    updateManagementFee((mf) => ({
      ...mf,
      units: mf.units.filter((u) => u.id !== unitId),
      months: mf.months.map((m) => {
        const nextAmounts = { ...m.amounts };
        delete nextAmounts[unitId];
        return { ...m, amounts: nextAmounts };
      })
    }));
  };
  const updateManagementUnitName = (unitId: string, name: string) => {
    updateManagementFee((mf) => ({ ...mf, units: mf.units.map((u) => u.id === unitId ? { ...u, name } : u) }));
  };
  const addManagementMonth = () => {
    updateManagementFee((mf) => ({
      ...mf,
      months: [...mf.months, { id: `mfm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, monthKey: '', label: '', paymentDate: '', amounts: {}, note: '' }]
    }));
  };
  const removeManagementMonth = (monthId: string) => {
    updateManagementFee((mf) => ({ ...mf, months: mf.months.filter((m) => m.id !== monthId) }));
  };
  const updateManagementMonthField = (monthId: string, patch: Partial<Pick<ManagementMonth, 'monthKey' | 'label' | 'paymentDate' | 'note'>>) => {
    updateManagementFee((mf) => ({ ...mf, months: mf.months.map((m) => m.id === monthId ? { ...m, ...patch } : m) }));
  };
  const updateManagementCellManual = (monthId: string, unitId: string, manual: number) => {
    updateManagementFee((mf) => ({
      ...mf,
      months: mf.months.map((m) => m.id === monthId
        ? { ...m, amounts: { ...m.amounts, [unitId]: { manual, imported: m.amounts[unitId]?.imported || [] } } }
        : m)
    }));
  };
  const managementCellTotal = (cell?: ManagementCell) => cell ? (Number(cell.manual) || 0) + cell.imported.reduce((s, it) => s + (Number(it.amount) || 0), 0) : 0;
  const managementMonthTotal = (m: ManagementMonth, units: ManagementUnit[]) => units.reduce((sum, u) => sum + managementCellTotal(m.amounts[u.id]), 0);
  const managementUnitTotal = (unitId: string, months: ManagementMonth[]) => months.reduce((sum, m) => sum + managementCellTotal(m.amounts[unitId]), 0);
  const managementGrandTotal = (mf?: ManagementFee) => mf ? mf.months.reduce((sum, m) => sum + managementMonthTotal(m, mf.units), 0) : 0;

  // [추가] "자동 불러오기" - 관리비는 보통 통장에서 한 번에 통합 출금되고(호실별로 나뉘어
  // 출금되지 않음), 출금 내역만 봐서는 어느 호실 몫인지 알 수 없다. 그래서 가지급내역처럼
  // 이름 자동 매칭 대신, 사람이 먼저 "가져올 대상 호실"을 고르고 그 호실의 해당 월 칸에
  // 선택한 출금 건들을 채워 넣는 방식(법인카드 사용내역의 "자동 불러오기"와 같은 패턴)을 쓴다.
  type ManagementImportCandidate = { sourceKey: string; sourceLabel: string; date: string; amount: number; memo?: string };
  const [managementImportCandidates, setManagementImportCandidates] = useState<ManagementImportCandidate[]>([]);
  const [showManagementImportPanel, setShowManagementImportPanel] = useState(false);
  const [isLoadingManagementCandidates, setIsLoadingManagementCandidates] = useState(false);
  const [selectedManagementImportKeys, setSelectedManagementImportKeys] = useState<Set<string>>(new Set());
  const [managementImportTargetUnitId, setManagementImportTargetUnitId] = useState<string>('');

  const alreadyImportedManagementKeys = new Set<string>();
  for (const d of docs) {
    if (d.category !== 'management_fee' || !d.managementFee) continue;
    for (const m of d.managementFee.months) {
      for (const unitId of Object.keys(m.amounts)) {
        for (const imp of (m.amounts[unitId].imported || [])) alreadyImportedManagementKeys.add(imp.sourceKey);
      }
    }
  }
  for (const m of (editingDoc?.managementFee?.months || [])) {
    for (const unitId of Object.keys(m.amounts)) {
      for (const imp of (m.amounts[unitId]?.imported || [])) alreadyImportedManagementKeys.add(imp.sourceKey);
    }
  }

  const handleOpenManagementImportPanel = async () => {
    if (!currentUser) return;
    setShowManagementImportPanel(true);
    setIsLoadingManagementCandidates(true);
    if (!managementImportTargetUnitId && editingDoc?.managementFee?.units?.length) {
      setManagementImportTargetUnitId(editingDoc.managementFee.units[0].id);
    }
    try {
      const res = await fetch('/api/admin-docs/bank-withdrawal-candidates', { headers: { 'x-user-id': currentUser.id } });
      if (!res.ok) throw new Error(`불러오기에 실패했습니다 (상태: ${res.status}).`);
      const data: ManagementImportCandidate[] = await res.json();
      setManagementImportCandidates(data);
    } catch (err: any) {
      alert(`통장 출금 내역을 불러오지 못했습니다.\n${err.message || '다시 시도해주세요.'}`);
      setShowManagementImportPanel(false);
    } finally {
      setIsLoadingManagementCandidates(false);
    }
  };

  const toggleManagementImportKey = (key: string) => {
    setSelectedManagementImportKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleImportManagementSelected = () => {
    if (!managementImportTargetUnitId || selectedManagementImportKeys.size === 0) return;
    const toImport = managementImportCandidates.filter((c) => selectedManagementImportKeys.has(c.sourceKey));
    updateManagementFee((mf) => {
      let months = mf.months;
      toImport.forEach((cand) => {
        const monthKey = (cand.date || '').slice(0, 7);
        let month = months.find((m) => m.monthKey === monthKey);
        if (!month) {
          const mm = monthKey.slice(5, 7);
          month = { id: `mfm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, monthKey, label: mm ? `${mm}월` : (monthKey || ''), paymentDate: '', amounts: {}, note: '' };
          months = [...months, month].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
        }
        const targetMonthId = month.id;
        months = months.map((m) => {
          if (m.id !== targetMonthId) return m;
          const existing = m.amounts[managementImportTargetUnitId] || { manual: 0, imported: [] };
          return { ...m, amounts: { ...m.amounts, [managementImportTargetUnitId]: { ...existing, imported: [...existing.imported, { sourceKey: cand.sourceKey, sourceLabel: cand.sourceLabel, amount: cand.amount }] } } };
        });
      });
      return { ...mf, months };
    });
    setSelectedManagementImportKeys(new Set());
    setShowManagementImportPanel(false);
  };

  // [추가] 법인카드 관리(월별 요약) - 카드 줄 추가·삭제·수정
  type CorpCardRow = NonNullable<AdminDoc['corpCard']>['cards'][number];
  const updateCorpCards = (updater: (cards: CorpCardRow[]) => CorpCardRow[]) => {
    setEditingDoc((prev) => {
      if (!prev) return prev;
      const corpCard = prev.corpCard || { cards: [] };
      return { ...prev, corpCard: { ...corpCard, cards: updater(corpCard.cards || []) } };
    });
  };
  const addCorpCard = () => {
    updateCorpCards((cards) => [...cards, {
      id: `cc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      cardCompany: '', cardNumber: '', expiry: '', user: '', periodLabel: '', paymentDay: '',
      amount: 0, withdrawBank: '', withdrawAccount: '', note: ''
    }]);
  };
  const removeCorpCard = (id: string) => {
    updateCorpCards((cards) => cards.filter((c) => c.id !== id));
  };
  const updateCorpCard = (id: string, patch: Partial<CorpCardRow>) => {
    updateCorpCards((cards) => cards.map((c) => c.id === id ? { ...c, ...patch } : c));
  };

  // [추가] 근로계약서 - 급여 구성 항목 추가·삭제·수정 (급여명세서 지급 내역과 같은 패턴)
  const updateSalaryItems = (updater: (items: AdminDocLineItem[]) => AdminDocLineItem[]) => {
    setEditingDoc((prev) => {
      if (!prev) return prev;
      const laborContract = prev.laborContract || { salaryItems: [] };
      return { ...prev, laborContract: { ...laborContract, salaryItems: updater(laborContract.salaryItems || []) } };
    });
  };
  const addSalaryItem = () => {
    updateSalaryItems((items) => [...items, { id: `sal-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: '', amount: 0 }]);
  };
  const removeSalaryItem = (id: string) => {
    updateSalaryItems((items) => items.filter((it) => it.id !== id));
  };
  const updateSalaryItem = (id: string, patch: Partial<AdminDocLineItem>) => {
    updateSalaryItems((items) => items.map((it) => it.id === id ? { ...it, ...patch } : it));
  };
  const updateLaborContractField = (patch: Partial<NonNullable<AdminDoc['laborContract']>>) => {
    setEditingDoc((prev) => prev ? { ...prev, laborContract: { ...(prev.laborContract || { salaryItems: [] }), ...patch } } : prev);
  };
  const updateEmploymentCertField = (patch: Partial<NonNullable<AdminDoc['employmentCert']>>) => {
    setEditingDoc((prev) => prev ? { ...prev, employmentCert: { ...(prev.employmentCert || {}), ...patch } } : prev);
  };
  const updatePowerOfAttorneyField = (patch: Partial<NonNullable<AdminDoc['powerOfAttorney']>>) => {
    setEditingDoc((prev) => prev ? { ...prev, powerOfAttorney: { ...(prev.powerOfAttorney || {}), ...patch } } : prev);
  };
  const updateSalesContractField = (patch: Partial<NonNullable<AdminDoc['salesContract']>>) => {
    setEditingDoc((prev) => prev ? { ...prev, salesContract: { ...(prev.salesContract || {}), ...patch } } : prev);
  };
  const updateSeveranceField = (patch: Partial<NonNullable<AdminDoc['severance']>>) => {
    setEditingDoc((prev) => prev ? { ...prev, severance: { ...(prev.severance || {}), ...patch } } : prev);
  };

  // [추가] "자동 불러오기" - 통합 차량 관리(비용관리/정비일지)·프로젝트·업무일지(일일/주간)에
  // 이미 "법인카드" 결제로 기록된 지출들을 서버에서 모아와서, 그중 원하는 것만 골라 지금
  // 편집 중인 카드 그룹에 항목으로 채워 넣는다. 이미 가져온 적 있는 항목(sourceKey로 판단)은
  // 다시 목록에 안 뜨게 해서 중복 등록을 막는다.
  type CardImportCandidate = { sourceKey: string; sourceLabel: string; date: string; amount: number; project?: string; memo?: string; personName?: string };
  const [cardImportCandidates, setCardImportCandidates] = useState<CardImportCandidate[]>([]);
  const [showCardImportPanel, setShowCardImportPanel] = useState(false);
  const [isLoadingCandidates, setIsLoadingCandidates] = useState(false);
  const [selectedImportKeys, setSelectedImportKeys] = useState<Set<string>>(new Set());
  const [importTargetCardId, setImportTargetCardId] = useState<string>('');

  // 이미 어딘가(저장된 문서든, 지금 편집 중인 폼이든)에 가져와져 있는 sourceKey 모음
  const alreadyImportedKeys = new Set<string>();
  for (const d of docs) {
    if (d.category !== 'card_usage' || !d.cardUsage) continue;
    for (const c of d.cardUsage.cards) {
      for (const e of c.entries) {
        if (e.sourceKey) alreadyImportedKeys.add(e.sourceKey);
      }
    }
  }
  for (const c of (editingDoc?.cardUsage?.cards || [])) {
    for (const e of c.entries) {
      if (e.sourceKey) alreadyImportedKeys.add(e.sourceKey);
    }
  }

  const handleOpenCardImportPanel = async () => {
    if (!currentUser) return;
    setShowCardImportPanel(true);
    setIsLoadingCandidates(true);
    // 가져올 대상 카드를 기본으로 첫 번째 카드로 잡아둔다
    if (!importTargetCardId && editingDoc?.cardUsage?.cards?.length) {
      setImportTargetCardId(editingDoc.cardUsage.cards[0].id);
    }
    try {
      const res = await fetch('/api/admin-docs/card-usage-candidates', { headers: { 'x-user-id': currentUser.id } });
      if (!res.ok) throw new Error(`불러오기에 실패했습니다 (상태: ${res.status}).`);
      const data: CardImportCandidate[] = await res.json();
      setCardImportCandidates(data);
    } catch (err: any) {
      alert(`법인카드 사용 내역을 불러오지 못했습니다.\n${err.message || '다시 시도해주세요.'}`);
      setShowCardImportPanel(false);
    } finally {
      setIsLoadingCandidates(false);
    }
  };

  const toggleImportKey = (key: string) => {
    setSelectedImportKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleImportSelected = () => {
    if (!importTargetCardId || selectedImportKeys.size === 0) return;
    const toImport = cardImportCandidates.filter((c) => selectedImportKeys.has(c.sourceKey));
    updateCards((cards) => cards.map((c) => c.id === importTargetCardId
      ? {
          ...c,
          entries: [
            ...c.entries,
            ...toImport.map((cand) => ({
              id: `cue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              amount: cand.amount,
              date: cand.date,
              project: cand.project || '',
              user: cand.personName || '',
              note: cand.memo || '',
              sourceKey: cand.sourceKey,
              sourceLabel: cand.sourceLabel
            }))
          ]
        }
      : c));
    setSelectedImportKeys(new Set());
    setShowCardImportPanel(false);
  };

  const handleSave = async () => {
    if (!editingDoc || !editingDoc.title?.trim()) {
      alert('제목을 입력해주세요.');
      return;
    }
    if (!currentUser) return;
    setIsSaving(true);
    try {
      const isNew = !editingDoc.id;
      const payload: Partial<AdminDoc> = { ...editingDoc, section };
      // [추가] 급여명세서는 지급/공제 내역 합계로 차인지급액(실수령액)을 계산해서, 목록/검색
      // 화면에서 다른 서류들과 똑같이 amount 칸에 표시되게 한다.
      if (payload.category === 'payslip' && payload.payslip) {
        const net = sumItems(payload.payslip.payItems) - sumItems(payload.payslip.deductionItems);
        payload.amount = String(net);
      }
      // [추가] 월별 자금 현황은 통장잔액 합계를 amount 칸에 표시해서, 목록 화면에서 바로
      // 전체 잔액 규모를 볼 수 있게 한다.
      if (payload.category === 'monthly_cashflow' && payload.cashflow) {
        const totalBalance = payload.cashflow.accounts.reduce((sum, a) => sum + accountBalance(a), 0);
        payload.amount = String(totalBalance);
      }
      // [추가] 통장 출금/입금 내역은 전체 거래 합계를 amount 칸에 표시한다.
      if ((payload.category === 'bank_withdrawal' || payload.category === 'bank_deposit') && payload.bankLedger) {
        const total = payload.bankLedger.accounts.reduce((sum, a) => sum + a.entries.reduce((s, e) => s + (Number(e.amount) || 0), 0), 0);
        payload.amount = String(total);
      }
      // [추가] 대출이자 및 원금 상환 내역은 이번 출금(원금+이자) 합계를 amount 칸에 표시한다.
      if (payload.category === 'loan_repayment' && payload.loanRepayment) {
        const total = payload.loanRepayment.loans.reduce((sum, l) => sum + loanPaymentTotal(l), 0);
        payload.amount = String(total);
      }
      // [추가] 법인카드 사용내역은 전체 사용 금액 합계를 amount 칸에 표시한다.
      if (payload.category === 'card_usage' && payload.cardUsage) {
        const total = payload.cardUsage.cards.reduce((sum, c) => sum + c.entries.reduce((s, e) => s + (Number(e.amount) || 0), 0), 0);
        payload.amount = String(total);
      }
      // [추가] 법인카드 관리(월별 요약)는 카드별 금액 합계를 amount 칸에 표시한다.
      if (payload.category === 'corp_card' && payload.corpCard) {
        const total = payload.corpCard.cards.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
        payload.amount = String(total);
      }
      // [추가] 가지급내역은 인원×월 전체 칸(직접입력+자동반영)의 총 합계를 amount 칸에 표시한다.
      if (payload.category === 'advance_payment' && payload.advancePayment) {
        payload.amount = String(advanceGrandTotal(payload.advancePayment));
      }
      // [추가] 차량 과태료 내역은 전체 과태료 합계를 amount 칸에 표시한다.
      if (payload.category === 'vehicle_fine' && payload.vehicleFine) {
        const total = payload.vehicleFine.entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        payload.amount = String(total);
      }
      // [추가] 각종 세금은 전체 세금 합계를 amount 칸에 표시한다.
      if (payload.category === 'tax' && payload.taxPayment) {
        const total = payload.taxPayment.entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        payload.amount = String(total);
      }
      // [추가] 관리비내역은 호실×월 전체 칸(직접입력+자동반영)의 총 합계를 amount 칸에 표시한다.
      if (payload.category === 'management_fee' && payload.managementFee) {
        payload.amount = String(managementGrandTotal(payload.managementFee));
      }
      // [추가] 근로계약서는 월 급여 합계를 amount 칸에 표시하고, 근로자 이름을 검색 대상인
      // personName에도 반영해서 다른 서류들처럼 이름으로 검색할 수 있게 한다.
      if ((payload.category === 'labor_contract' || payload.category === 'salary_agreement') && payload.laborContract) {
        const total = sumItems(payload.laborContract.salaryItems);
        payload.amount = String(total);
        if (payload.laborContract.employeeName) payload.personName = payload.laborContract.employeeName;
      }
      // [추가] 재직증명서는 금액 개념이 없는 서류라 amount는 그대로 두고, 이름만 검색용
      // personName에 반영한다.
      if (payload.category === 'employment_cert' && payload.employmentCert?.employeeName) {
        payload.personName = payload.employmentCert.employeeName;
      }
      // [추가] 위임장도 금액 개념이 없는 서류라, 위임받는 사람 이름만 검색용 personName에 반영한다.
      if (payload.category === 'power_of_attorney' && payload.powerOfAttorney?.employeeName) {
        payload.personName = payload.powerOfAttorney.employeeName;
      }
      // [추가] 영업 계약서는 거래처(갑) 상호를 검색용 personName에 반영한다.
      if (payload.category === 'sales_contract' && payload.salesContract?.counterpartyName) {
        payload.personName = payload.salesContract.counterpartyName;
      }
      // [추가] 퇴직금 정산은 회사선지급+은행적립금 합계를 amount 칸에, 신청인 이름을
      // personName에 반영한다.
      if (payload.category === 'severance' && payload.severance) {
        const total = (Number(payload.severance.companyAdvanceAmount) || 0) + (Number(payload.severance.bankAccrualAmount) || 0);
        payload.amount = String(total);
        if (payload.severance.employeeName) payload.personName = payload.severance.employeeName;
      }
      const res = await fetch(isNew ? '/api/admin-docs' : `/api/admin-docs/${editingDoc.id}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-user-id': currentUser.id },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `저장에 실패했습니다 (상태: ${res.status}).`);
      }
      const saved: AdminDoc = await res.json();
      setDocs((prev) => isNew ? [saved, ...prev] : prev.map((d) => d.id === saved.id ? saved : d));
      setEditingDoc(null);
    } catch (err: any) {
      alert(`저장에 실패했습니다.\n${err.message || '다시 시도해주세요.'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!currentUser) return;
    if (!confirm('이 기록을 삭제하시겠습니까? 되돌릴 수 없습니다.')) return;
    try {
      const res = await fetch(`/api/admin-docs/${id}`, {
        method: 'DELETE',
        headers: { 'x-user-id': currentUser.id }
      });
      if (!res.ok) throw new Error(`삭제에 실패했습니다 (상태: ${res.status}).`);
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (err: any) {
      alert(`삭제에 실패했습니다.\n${err.message || '다시 시도해주세요.'}`);
    }
  };

  if (currentUser?.role !== 'admin') {
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-3">
        <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto" />
        <p className="text-sm text-slate-500">관리자만 접근할 수 있는 화면입니다.</p>
      </div>
    );
  }

  // [추가] 급여명세서 인쇄용 화면. 앱 트리 밖의 #print-root 포털에 그려서, 다른 화면
  // 요소(메뉴, 여백 등)와 완전히 분리된 채로 이미지로 공유해주신 양식과 최대한 비슷하게
  // 인쇄되도록 한다.
  const renderPrintablePayslip = () => {
    if (!printingDoc || !printingDoc.payslip) return null;
    const p = printingDoc.payslip;
    const payTotal = sumItems(p.payItems);
    const deductionTotal = sumItems(p.deductionItems);
    const net = payTotal - deductionTotal;
    const [year, month] = (p.payMonth || '').split('-');
    const fmt = (n: number) => new Intl.NumberFormat('ko-KR').format(n);
    const maxRows = Math.max(p.payItems.length, p.deductionItems.length, 8);

    return (
      <div style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', padding: '20mm', fontFamily: 'sans-serif', color: '#111', boxSizing: 'border-box' }}>
        <h1 style={{ textAlign: 'center', fontSize: '22px', fontWeight: 700, marginBottom: '18px' }}>
          {year && month ? `${year}년 ${month}월분 급여명세서` : printingDoc.title}
        </h1>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '10px' }}>
          <span>회사명 : {p.companyName || ''}</span>
          <span>지 급 일 : {p.paymentDate || printingDoc.date}</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #000' }}>
          <tbody>
            <tr style={{ background: '#f2f2f2' }}>
              <td style={{ border: '1px solid #000', padding: '5px 8px' }} colSpan={2}>사원코드 : {p.employeeCode || ''}</td>
              <td style={{ border: '1px solid #000', padding: '5px 8px' }} colSpan={2}>사 원 명 : {printingDoc.personName || ''}</td>
              <td style={{ border: '1px solid #000', padding: '5px 8px' }} colSpan={2}>입 사 일 : {p.hireDate || ''}</td>
            </tr>
            <tr style={{ background: '#f2f2f2' }}>
              <td style={{ border: '1px solid #000', padding: '5px 8px' }} colSpan={2}>부 서 : {p.department || ''}</td>
              <td style={{ border: '1px solid #000', padding: '5px 8px' }} colSpan={2}>직 위 : {p.position || ''}</td>
              <td style={{ border: '1px solid #000', padding: '5px 8px' }} colSpan={2}>호 봉 : {p.salaryGrade || ''}</td>
            </tr>
            <tr style={{ background: '#e8e8e8', fontWeight: 700, textAlign: 'center' }}>
              <td style={{ border: '1px solid #000', padding: '6px' }}>지 급 내 역</td>
              <td style={{ border: '1px solid #000', padding: '6px' }}>지 급 액</td>
              <td style={{ border: '1px solid #000', padding: '6px' }}>공 제 내 역</td>
              <td style={{ border: '1px solid #000', padding: '6px' }} colSpan={3}>공 제 액</td>
            </tr>
            {Array.from({ length: maxRows }).map((_, i) => {
              const pay = p.payItems[i];
              const ded = p.deductionItems[i];
              return (
                <tr key={i}>
                  <td style={{ border: '1px solid #000', padding: '5px 8px', height: '22px' }}>{pay?.label || ''}</td>
                  <td style={{ border: '1px solid #000', padding: '5px 8px', textAlign: 'right' }}>{pay ? fmt(pay.amount) : ''}</td>
                  <td style={{ border: '1px solid #000', padding: '5px 8px' }}>{ded?.label || ''}</td>
                  <td style={{ border: '1px solid #000', padding: '5px 8px', textAlign: 'right' }} colSpan={3}>{ded ? fmt(ded.amount) : ''}</td>
                </tr>
              );
            })}
            <tr style={{ fontWeight: 700 }}>
              <td style={{ border: '1px solid #000', padding: '6px 8px' }}>지 급 액 계</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'right' }}>{fmt(payTotal)}</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px' }}>공 제 액 계</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'right' }} colSpan={3}>{fmt(deductionTotal)}</td>
            </tr>
            <tr style={{ fontWeight: 700 }}>
              <td style={{ border: '1px solid #000', padding: '6px 8px' }} colSpan={2} align="center">차 인 지 급 액</td>
              <td style={{ border: '1px solid #000', padding: '6px 8px', textAlign: 'right' }} colSpan={4}>{fmt(net)}</td>
            </tr>
          </tbody>
        </table>
        <p style={{ fontSize: '12px', marginTop: '14px' }}>귀하의 노고에 감사드립니다.</p>
      </div>
    );
  };

  // [추가] 월별 자금 현황 인쇄용 화면. 공유해주신 "N월 자금현황" 표 양식(NO/구분/이월금/
  // 입금/출금/통장잔액/비고 + 합계)을 그대로 재현한다.
  // [수정] 은행명+계좌번호+구분을 "하나(13004)_급여/외화송금/카드대금"처럼 사람이 보기
  // 좋은 한 줄로 합쳐준다. 자금 현황과 통장 출금/입금 내역이 이제 같은 구조(은행/계좌번호/
  // 구분)를 쓰므로, 인쇄 화면에서 둘 다 이 함수 하나를 공용으로 쓴다.
  const accountLabel = (a: { bankName?: string; accountNumber?: string; subCategory?: string }) => {
    const parts = [a.bankName, a.accountNumber].filter(Boolean).join(' ');
    return [parts, a.subCategory].filter(Boolean).join('_') || '(계좌 미입력)';
  };

  const renderPrintableCashflow = () => {
    if (!printingDoc || !printingDoc.cashflow) return null;
    const c = printingDoc.cashflow;
    const fmt = (n: number) => n === 0 ? '-' : new Intl.NumberFormat('ko-KR').format(n);
    const monthLabel = printingDoc.cashflow.periodStart ? `${Number(printingDoc.cashflow.periodStart.split('-')[1])}월` : printingDoc.title;
    const totals = c.accounts.reduce((acc, a) => ({
      broughtForward: acc.broughtForward + a.broughtForward,
      deposit: acc.deposit + a.deposit,
      withdrawal: acc.withdrawal + a.withdrawal,
      balance: acc.balance + accountBalance(a)
    }), { broughtForward: 0, deposit: 0, withdrawal: 0, balance: 0 });

    return (
      <div className="print-landscape" style={{ width: '297mm', minHeight: '210mm', margin: '0 auto', padding: '15mm', fontFamily: 'sans-serif', color: '#111', boxSizing: 'border-box' }}>
        <h1 style={{ textAlign: 'center', fontSize: '24px', fontWeight: 700, textDecoration: 'underline', marginBottom: '6px' }}>
          {monthLabel} 자 금 현 황
        </h1>
        {c.periodStart && c.periodEnd && (
          <p style={{ textAlign: 'center', fontSize: '13px', fontWeight: 700, marginBottom: '16px' }}>
            ({c.periodStart.replace(/-/g, '.')}~{c.periodEnd.slice(5).replace('-', '.')})
          </p>
        )}
        <p style={{ textAlign: 'center', fontSize: '14px', fontWeight: 700, marginBottom: '10px' }}>&lt;통장 잔액&gt;</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #000' }}>
          <thead>
            <tr style={{ background: '#ffe600', fontWeight: 700, textAlign: 'center' }}>
              <td style={{ border: '1px solid #000', padding: '6px', width: '5%' }}>NO.</td>
              <td style={{ border: '1px solid #000', padding: '6px', width: '28%' }}>구분</td>
              <td style={{ border: '1px solid #000', padding: '6px' }}>이월금(원)</td>
              <td style={{ border: '1px solid #000', padding: '6px' }}>입금(원)</td>
              <td style={{ border: '1px solid #000', padding: '6px' }}>출금(원)</td>
              <td style={{ border: '1px solid #000', padding: '6px' }}>통장잔액</td>
              <td style={{ border: '1px solid #000', padding: '6px' }}>비고</td>
            </tr>
          </thead>
          <tbody>
            {c.accounts.map((a, i) => (
              <tr key={a.id}>
                <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{i + 1}</td>
                <td style={{ border: '1px solid #000', padding: '6px' }}>{accountLabel(a)}</td>
                <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{fmt(a.broughtForward)}</td>
                <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{fmt(a.deposit)}</td>
                <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{fmt(a.withdrawal)}</td>
                <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{fmt(accountBalance(a))}</td>
                <td style={{ border: '1px solid #000', padding: '6px', color: '#c00', fontSize: '11px' }}>{a.note}</td>
              </tr>
            ))}
            <tr style={{ background: '#ffe600', fontWeight: 700 }}>
              <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }} colSpan={2}>합 계</td>
              <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{fmt(totals.broughtForward)}</td>
              <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{fmt(totals.deposit)}</td>
              <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{fmt(totals.withdrawal)}</td>
              <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{fmt(totals.balance)}</td>
              <td style={{ border: '1px solid #000', padding: '6px' }}></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  // [수정] 이 화면(과 아래 대출 현황/법인카드 사용내역/카드별 월 사용 내역, 총 4개)은
  // .print-landscape 클래스로 가로(297mm x 210mm) 인쇄를 지정해놓고, 정작 바깥 div의
  // 실제 크기는 세로 문서 크기(width:210mm, minHeight:297mm)를 그대로 쓰고 있었다.
  // 그러면 가로로 눕힌 297mm(가로)x210mm(세로) 용지 위에서 세로로 297mm짜리 내용을
  // 채우려다 보니, 짧은 문서도 실제 인쇄 가능 영역(210mm)을 넘겨 뒤에 빈 페이지가
  // 하나 더 생기고, 폭도 210mm만 써서 오른쪽에 약 87mm가 그냥 비어 보였다. 이미 올바르게
  // 되어 있던 자금 현황(renderPrintableCashflow, width:297mm/minHeight:210mm)과
  // 동일하게 맞춰서 고친다.
  // [추가] 통장 출금/입금 내역 인쇄용 화면 (두 카테고리 공용). 공유해주신 양식대로
  // 계좌별로 거래를 묶고, 계좌 소계 행과 맨 아래 전체 합계 행을 넣고, 오른쪽 끝
  // "출금(입금)통장" 칸은 그 계좌의 거래+소계 행 전체에 걸쳐 하나로 병합해서 보여준다.
  const renderPrintableBankLedger = () => {
    if (!printingDoc || !printingDoc.bankLedger) return null;
    const isWithdrawal = printingDoc.category === 'bank_withdrawal';
    const ledger = printingDoc.bankLedger;
    const fmt = (n: number) => n === 0 ? '' : new Intl.NumberFormat('ko-KR').format(n);
    const grandTotal = ledger.accounts.reduce((s, a) => s + bankAccountTotal(a), 0);

    return (
      <div className="print-landscape" style={{ width: '297mm', minHeight: '210mm', margin: '0 auto', padding: '12mm', fontFamily: 'sans-serif', color: '#111', boxSizing: 'border-box' }}>
        <h1 style={{ textAlign: 'center', fontSize: '18px', fontWeight: 700, marginBottom: '14px' }}>
          &lt;{isWithdrawal ? '통장 출금 내역' : '통장 입금 내역'}&gt;
        </h1>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', border: '1px solid #000' }}>
          <thead>
            <tr style={{ background: '#dbe5f1', fontWeight: 700, textAlign: 'center' }}>
              <td style={{ border: '1px solid #000', padding: '5px' }}>일자</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>프로젝트</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>금액(원)</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>거래내용</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>비 고</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>{isWithdrawal ? '출금통장' : '입금통장'}</td>
            </tr>
          </thead>
          <tbody>
            {ledger.accounts.map((acc, accIdx) => (
              <React.Fragment key={acc.id}>
                {acc.entries.map((e, i) => (
                  <tr key={e.id}>
                    <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>{e.date ? e.date.slice(5).replace('-', ' 월 ') + '일' : ''}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{e.project}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right' }}>{fmt(e.amount)}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{e.description}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{e.note}</td>
                    {i === 0 && (
                      <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center', verticalAlign: 'middle', fontWeight: 700 }} rowSpan={acc.entries.length + 1}>
                        {accountLabel(acc)}
                      </td>
                    )}
                  </tr>
                ))}
                <tr style={{ background: '#f2f2f2', fontWeight: 700 }}>
                  <td style={{ border: '1px solid #000', padding: '5px 6px', textAlign: 'center' }} colSpan={2}>
                    {accountLabel(acc)} {isWithdrawal ? '출금' : '입금'} 합계({accIdx + 1})
                  </td>
                  <td style={{ border: '1px solid #000', padding: '5px 6px', textAlign: 'right' }}>{fmt(bankAccountTotal(acc))}</td>
                  <td style={{ border: '1px solid #000', padding: '5px 6px' }} colSpan={2}></td>
                </tr>
              </React.Fragment>
            ))}
            <tr style={{ background: '#ffe600', fontWeight: 700 }}>
              <td style={{ border: '1px solid #000', padding: '6px' }} colSpan={2}>
                통장 {isWithdrawal ? '출금' : '입금'} 총 합계(1)~({ledger.accounts.length})
              </td>
              <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{fmt(grandTotal)}</td>
              <td style={{ border: '1px solid #000', padding: '6px' }} colSpan={3}></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  // [추가] 대출이자 및 원금 상환 내역 인쇄용 화면. 공유해주신 양식대로 진행 중인 대출과
  // 상환완료된 대출을 구역을 나눠서 보여준다.
  const renderPrintableLoanRepayment = () => {
    if (!printingDoc || !printingDoc.loanRepayment) return null;
    const loans = printingDoc.loanRepayment.loans;
    const active = loans.filter((l) => !l.isRepaid);
    const repaid = loans.filter((l) => l.isRepaid);
    const fmt = (n: number) => n === 0 ? '-' : new Intl.NumberFormat('ko-KR').format(n);
    const totals = active.reduce((acc, l) => ({
      balance: acc.balance + l.balance,
      principalPaid: acc.principalPaid + l.principalPaid,
      interestPaid: acc.interestPaid + l.interestPaid,
      total: acc.total + loanPaymentTotal(l)
    }), { balance: 0, principalPaid: 0, interestPaid: 0, total: 0 });

    // [추가] "대출잔액" 칸 폭을, 그 아래로 이어지는 원금+이자+계 세 칸을 합친 폭과 같게
    // 맞춰서 큰 금액도 잘리지 않고 잘 보이게 한다.
    const colWidths = ['3%', '9%', '9%', '7%', '5%', '5%', '6%', '6%', '5%', '15%', '5%', '5%', '5%', '8%', '7%'];
    const colGroup = (
      <colgroup>
        {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
      </colgroup>
    );

    const headerRow = (
      <tr style={{ background: '#ffe600', fontWeight: 700, textAlign: 'center' }}>
        <td style={{ border: '1px solid #000', padding: '5px' }}>NO.</td>
        <td style={{ border: '1px solid #000', padding: '5px' }}>대출 명</td>
        <td style={{ border: '1px solid #000', padding: '5px' }}>대출 계좌</td>
        <td style={{ border: '1px solid #000', padding: '5px' }}>대출 금액(원)</td>
        <td style={{ border: '1px solid #000', padding: '5px' }}>최초 이자율(%)</td>
        <td style={{ border: '1px solid #000', padding: '5px' }}>현재 이자율(%)</td>
        <td style={{ border: '1px solid #000', padding: '5px' }}>대출일</td>
        <td style={{ border: '1px solid #000', padding: '5px' }}>만기일</td>
        <td style={{ border: '1px solid #000', padding: '5px' }}>납기일</td>
        <td style={{ border: '1px solid #000', padding: '5px' }}>대출잔액</td>
        <td style={{ border: '1px solid #000', padding: '5px' }} colSpan={3}>출금 금액(원)</td>
        <td style={{ border: '1px solid #000', padding: '5px' }}>출금 은행</td>
        <td style={{ border: '1px solid #000', padding: '5px' }}>출금 계좌</td>
      </tr>
    );
    const subHeaderRow = (
      <tr style={{ background: '#fff7cc', fontWeight: 700, textAlign: 'center', fontSize: '10px' }}>
        <td style={{ border: '1px solid #000', padding: '3px' }} colSpan={10}></td>
        <td style={{ border: '1px solid #000', padding: '3px' }}>원금</td>
        <td style={{ border: '1px solid #000', padding: '3px' }}>이자</td>
        <td style={{ border: '1px solid #000', padding: '3px' }}>계</td>
        <td style={{ border: '1px solid #000', padding: '3px' }} colSpan={2}></td>
      </tr>
    );

    return (
      <div className="print-landscape" style={{ width: '297mm', minHeight: '210mm', margin: '0 auto', padding: '10mm', fontFamily: 'sans-serif', color: '#111', boxSizing: 'border-box' }}>
        <h1 style={{ textAlign: 'center', fontSize: '18px', fontWeight: 700, marginBottom: '14px' }}>대출 현황</h1>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', border: '1px solid #000', tableLayout: 'fixed' }}>
          {colGroup}
          <thead>
            {headerRow}
            {subHeaderRow}
          </thead>
          <tbody>
            {active.map((l, i) => (
              <tr key={l.id}>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{i + 1}</td>
                <td style={{ border: '1px solid #000', padding: '4px' }}>{l.loanName}</td>
                <td style={{ border: '1px solid #000', padding: '4px' }}>{l.loanAccount}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right' }}>{fmt(l.initialAmount)}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{l.initialRate}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 700 }}>{l.currentRate}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{l.loanDate}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{l.maturityDate}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{l.paymentDay}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right', fontWeight: 700 }}>{fmt(l.balance)}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right' }}>{fmt(l.principalPaid)}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right' }}>{fmt(l.interestPaid)}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right' }}>{fmt(loanPaymentTotal(l))}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{l.withdrawBank}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{l.withdrawAccount}</td>
              </tr>
            ))}
            <tr style={{ background: '#ffe600', fontWeight: 700, textAlign: 'center' }}>
              <td style={{ border: '1px solid #000', padding: '5px' }} colSpan={9}>합 계</td>
              <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>{fmt(totals.balance)}</td>
              <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>{fmt(totals.principalPaid)}</td>
              <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>{fmt(totals.interestPaid)}</td>
              <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>{fmt(totals.total)}</td>
              <td style={{ border: '1px solid #000', padding: '5px' }} colSpan={2}></td>
            </tr>
            {repaid.map((l, i) => (
              <tr key={l.id} style={{ background: '#e5e5e5' }}>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', fontWeight: 700 }}>상환완료 {i + 1}</td>
                <td style={{ border: '1px solid #000', padding: '4px' }}>{l.loanName}</td>
                <td style={{ border: '1px solid #000', padding: '4px' }}>{l.loanAccount}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right' }}>{fmt(l.initialAmount)}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{l.initialRate}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{l.currentRate}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{l.loanDate}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{l.maturityDate}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{l.paymentDay}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', color: '#c00', fontWeight: 700 }}>
                  {l.repaidDate ? `${l.repaidDate} 상환${l.repaidFee ? ` (${l.repaidFee})` : ''}` : '상환완료'}
                </td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right' }}>{fmt(l.principalPaid)}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right' }}>{fmt(l.interestPaid)}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'right' }}>{fmt(loanPaymentTotal(l))}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{l.withdrawBank}</td>
                <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center' }}>{l.withdrawAccount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // [추가] 법인카드 사용내역 인쇄용 화면. 공유해주신 양식대로 카드(소지자)별로 묶어서
  // 사용 내역을 나열하고, 카드마다 소계 행, 맨 아래에 총계 행을 넣는다. 왼쪽 끝 "구분"
  // 칸(카드명/카드번호/소지자)은 그 카드의 사용내역+소계 행 전체에 걸쳐 하나로 병합한다.
  const renderPrintableCardUsage = () => {
    if (!printingDoc || !printingDoc.cardUsage) return null;
    const cardUsage = printingDoc.cardUsage;
    const fmt = (n: number) => n === 0 ? '' : new Intl.NumberFormat('ko-KR').format(n);
    const grandTotal = cardUsage.cards.reduce((s, c) => s + cardGroupTotal(c), 0);

    return (
      <div className="print-landscape" style={{ width: '297mm', minHeight: '210mm', margin: '0 auto', padding: '10mm', fontFamily: 'sans-serif', color: '#111', boxSizing: 'border-box' }}>
        <h1 style={{ textAlign: 'center', fontSize: '18px', fontWeight: 700, marginBottom: '14px' }}>법인 카드 사용내역</h1>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', border: '1px solid #000' }}>
          <colgroup>
            <col style={{ width: '4%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '25%' }} />
          </colgroup>
          <thead>
            <tr style={{ background: '#ffe600', fontWeight: 700, textAlign: 'center' }}>
              <td style={{ border: '1px solid #000', padding: '5px' }}>구분</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>카드명</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>카드번호</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>소지자</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>사용 금액(원)</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>사용일자</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>프로젝트명</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>사용자</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>비 고</td>
            </tr>
          </thead>
          <tbody>
            {cardUsage.cards.map((c, cardIdx) => (
              <React.Fragment key={c.id}>
                {c.entries.map((e, i) => (
                  <tr key={e.id}>
                    {i === 0 && (
                      <>
                        <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', verticalAlign: 'middle', fontWeight: 700 }} rowSpan={c.entries.length + 1}>
                          {cardIdx + 1}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', verticalAlign: 'middle' }} rowSpan={c.entries.length + 1}>
                          {c.cardName}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', verticalAlign: 'middle' }} rowSpan={c.entries.length + 1}>
                          {c.cardNumber}
                        </td>
                        <td style={{ border: '1px solid #000', padding: '4px', textAlign: 'center', verticalAlign: 'middle' }} rowSpan={c.entries.length + 1}>
                          {c.holder}
                        </td>
                      </>
                    )}
                    <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right' }}>{fmt(e.amount)}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>{e.date ? e.date.slice(5).replace('-', '월 ') + '일' : ''}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{e.project}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>{e.user}</td>
                    <td style={{ border: '1px solid #000', padding: '4px 6px' }}>{e.note}</td>
                  </tr>
                ))}
                <tr style={{ background: '#ffe600', fontWeight: 700 }}>
                  <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'center' }}>합계</td>
                  <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>{fmt(cardGroupTotal(c))}</td>
                  <td style={{ border: '1px solid #000', padding: '5px' }} colSpan={3}></td>
                </tr>
              </React.Fragment>
            ))}
            <tr style={{ background: '#ffe600', fontWeight: 700 }}>
              <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }} colSpan={4}>총계</td>
              <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{fmt(grandTotal)}</td>
              <td style={{ border: '1px solid #000', padding: '6px' }} colSpan={4}></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  // [추가] 법인카드 관리(월별 요약) 인쇄용 화면. 공유해주신 양식대로 카드사/카드번호/사용자/
  // 사용일수/출금일자/금액/출금은행/출금계좌/비고를 카드 한 장당 한 줄로 나열하고, 맨 아래
  // 합계 행을 넣는다.
  const renderPrintableCorpCard = () => {
    if (!printingDoc || !printingDoc.corpCard) return null;
    const cc = printingDoc.corpCard;
    const fmt = (n: number) => n === 0 ? '' : new Intl.NumberFormat('ko-KR').format(n);
    const total = cc.cards.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const [year, month] = (cc.yearMonth || '').split('-');
    const isMerged = printingDoc.id.startsWith('merged-corp-card-');

    return (
      <div className="print-landscape" style={{ width: '297mm', minHeight: '210mm', margin: '0 auto', padding: '12mm', fontFamily: 'sans-serif', color: '#111', boxSizing: 'border-box' }}>
        <h1 style={{ textAlign: 'center', fontSize: '18px', fontWeight: 700, textDecoration: 'underline', marginBottom: isMerged ? '4px' : '14px' }}>
          {year && month ? `${year}년도 카드별 월 사용 내역(${Number(month)}월)` : printingDoc.title}
        </h1>
        {isMerged && (
          <p style={{ textAlign: 'center', fontSize: '11px', color: '#555', marginBottom: '12px' }}>
            ※ 금액은 회계관리 &gt; 카드사용내역에 기록된 실제 사용 내역을 기준으로 {new Date().toISOString().slice(0, 10)} 현재까지 자동 집계된 금액입니다. (카드사용내역에 기록이 없는 카드는 입력해두신 금액을 그대로 표시)
          </p>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', border: '1px solid #000' }}>
          <thead>
            <tr style={{ background: '#ffe600', fontWeight: 700, textAlign: 'center' }}>
              <td style={{ border: '1px solid #000', padding: '5px' }}>번호</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>카드사</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>카드번호</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>사용자</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>사용일수</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>출금일자</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>사용금액</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>출금은행</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>출금계좌</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>비 고</td>
            </tr>
          </thead>
          <tbody>
            {cc.cards.map((c, i) => (
              <tr key={c.id}>
                <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'center' }}>{i + 1}</td>
                <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'center', fontWeight: 700 }}>{c.cardCompany}</td>
                <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'center' }}>{c.cardNumber}</td>
                <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'center' }}>{c.user}</td>
                <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'center' }}>{c.periodLabel}</td>
                <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'center', color: '#c00', fontWeight: 700 }}>{c.paymentDay}</td>
                <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'right' }}>{fmt(c.amount)}</td>
                <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'center' }}>{c.withdrawBank}</td>
                <td style={{ border: '1px solid #000', padding: '5px', textAlign: 'center' }}>{c.withdrawAccount}</td>
                <td style={{ border: '1px solid #000', padding: '5px' }}>{c.note}</td>
              </tr>
            ))}
            <tr style={{ background: '#ffe600', fontWeight: 700, textAlign: 'center' }}>
              <td style={{ border: '1px solid #000', padding: '6px' }} colSpan={6}>합 계</td>
              <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{fmt(total)}</td>
              <td style={{ border: '1px solid #000', padding: '6px' }} colSpan={3}></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  // [추가] 관리비내역 인쇄용 화면. 공유해주신 "월별 관리비내역" 양식대로 호실(열) × 월(행)
  // 표로 그리고, 맨 아래 합계 행과(입력해두신 경우) 입금 계좌 등 참고사항을 메모에서
  // 가져와 표 아래에 각주로 넣는다.
  const renderPrintableManagementFee = () => {
    if (!printingDoc || !printingDoc.managementFee) return null;
    const mf = printingDoc.managementFee;
    const fmt = (n: number) => n === 0 ? '' : new Intl.NumberFormat('ko-KR').format(n);
    const firstYear = (mf.months.find((m) => m.monthKey)?.monthKey || '').slice(0, 4);
    const grandTotal = managementGrandTotal(mf);

    return (
      <div style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', padding: '15mm', fontFamily: 'sans-serif', color: '#111', boxSizing: 'border-box' }}>
        <h1 style={{ textAlign: 'center', fontSize: '18px', fontWeight: 700, marginBottom: '14px' }}>
          {firstYear ? `${firstYear.slice(2)}년도 월별 관리비내역` : printingDoc.title}
        </h1>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #000' }}>
          <thead>
            <tr style={{ background: '#ffe600', fontWeight: 700, textAlign: 'center' }}>
              <td style={{ border: '1px solid #000', padding: '6px' }}>{firstYear ? `${firstYear}년` : '연도'}</td>
              <td style={{ border: '1px solid #000', padding: '6px' }}>납부일</td>
              {mf.units.map((u) => (
                <td key={u.id} style={{ border: '1px solid #000', padding: '6px' }}>{u.name || '(호실명 미입력)'}</td>
              ))}
              <td style={{ border: '1px solid #000', padding: '6px' }}>합계</td>
            </tr>
          </thead>
          <tbody>
            {mf.months.map((m) => (
              <tr key={m.id}>
                <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', fontWeight: 700 }}>{m.label}</td>
                <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{m.paymentDate}</td>
                {mf.units.map((u) => (
                  <td key={u.id} style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{fmt(managementCellTotal(m.amounts[u.id]))}</td>
                ))}
                <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right', fontWeight: 700 }}>{fmt(managementMonthTotal(m, mf.units))}</td>
              </tr>
            ))}
            <tr style={{ background: '#ffe600', fontWeight: 700, textAlign: 'center' }}>
              <td style={{ border: '1px solid #000', padding: '6px' }} colSpan={2 + mf.units.length}>합 계</td>
              <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{fmt(grandTotal)}</td>
            </tr>
          </tbody>
        </table>
        {printingDoc.memo && (
          <p style={{ fontSize: '11px', color: '#333', marginTop: '10px' }}>*{printingDoc.memo}</p>
        )}
      </div>
    );
  };

  // [추가] 차량 과태료 내역 인쇄용 화면. 공유해주신 "OOOO년 법인차량 과태료 내역" 양식대로
  // 위반일자/위반차량/금액/처리일자/내용/비고 열로 표를 그리고, 맨 아래 합계 행을 넣는다.
  const renderPrintableVehicleFine = () => {
    if (!printingDoc || !printingDoc.vehicleFine) return null;
    const vf = printingDoc.vehicleFine;
    const fmt = (n: number) => n === 0 ? '' : new Intl.NumberFormat('ko-KR').format(n);
    const fmtDate = (d?: string) => d ? d.replace(/-/g, '.') : '';
    const total = vf.entries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const isMerged = printingDoc.id.startsWith('merged-vehicle-fine-');

    return (
      <div style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', padding: '15mm', fontFamily: 'sans-serif', color: '#111', boxSizing: 'border-box' }}>
        <h1 style={{ textAlign: 'center', fontSize: '18px', fontWeight: 700, marginBottom: isMerged ? '4px' : '14px' }}>{printingDoc.title}</h1>
        {isMerged && (
          <p style={{ textAlign: 'center', fontSize: '11px', color: '#555', marginBottom: '12px' }}>
            ※ 문서별로 나눠 등록하신 차량 과태료 내역 중 위반일자가 이 연도에 해당하는 건을 모두 모아 보여줍니다.
          </p>
        )}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', border: '1px solid #000' }}>
          <thead>
            <tr style={{ background: '#ffe600', fontWeight: 700, textAlign: 'center' }}>
              <td style={{ border: '1px solid #000', padding: '6px' }}>위반일자</td>
              <td style={{ border: '1px solid #000', padding: '6px' }}>위반차량</td>
              <td style={{ border: '1px solid #000', padding: '6px' }}>금액</td>
              <td style={{ border: '1px solid #000', padding: '6px' }}>처리일자</td>
              <td style={{ border: '1px solid #000', padding: '6px' }}>내용</td>
              <td style={{ border: '1px solid #000', padding: '6px' }}>비고</td>
            </tr>
          </thead>
          <tbody>
            {vf.entries.map((e) => (
              <tr key={e.id}>
                <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{fmtDate(e.date)}</td>
                <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{e.vehicle}</td>
                <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{fmt(e.amount)}</td>
                <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{fmtDate(e.processedDate)}</td>
                <td style={{ border: '1px solid #000', padding: '6px' }}>{e.detail}</td>
                <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{e.note}</td>
              </tr>
            ))}
            <tr style={{ background: '#ffe600', fontWeight: 700, textAlign: 'center' }}>
              <td style={{ border: '1px solid #000', padding: '6px' }} colSpan={2}>합 계</td>
              <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'right' }}>{fmt(total)}</td>
              <td style={{ border: '1px solid #000', padding: '6px' }} colSpan={3}></td>
            </tr>
          </tbody>
        </table>
        {printingDoc.memo && (
          <p style={{ fontSize: '11px', color: '#333', marginTop: '10px' }}>*{printingDoc.memo}</p>
        )}
      </div>
    );
  };

  // [추가] 근로계약서 인쇄용 화면. 공유해주신 실제 계약서 전문(고정 조항 포함)을 그대로
  // 재현하고, 근로자 정보/급여 구성/계약기간처럼 사람마다 달라지는 부분만 채워 넣는다.
  const renderPrintableLaborContract = () => {
    if (!printingDoc || !printingDoc.laborContract) return null;
    const lc = printingDoc.laborContract;
    const isSalaryAgreement = printingDoc.category === 'salary_agreement';
    const fmt = (n: number) => new Intl.NumberFormat('ko-KR').format(n);
    const monthlyTotal = sumItems(lc.salaryItems);
    const annualTotal = monthlyTotal * 12;
    const employmentTypeLabel = { regular: '정규직', contract: '계약직', intern: '인턴' }[lc.employmentType || 'regular'];
    const fmtDateKo = (d?: string) => {
      if (!d) return '';
      const [y, m, day] = d.split('-');
      return `${y}년 ${m}월 ${day}일`;
    };
    const companyName = currentUser?.companyName || '';
    const bizNumber = currentUser?.businessNumber || '';
    const repName = currentUser?.name || '';

    const cellStyle: React.CSSProperties = { border: '0.5px solid #999', padding: '5px 8px', fontSize: '11px' };
    const labelCellStyle: React.CSSProperties = { ...cellStyle, background: '#f5f5f5', fontWeight: 700, width: '18%', textAlign: 'center' };

    return (
      <div className="print-document-margins" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', padding: '30mm 25mm', fontFamily: 'sans-serif', color: '#111', boxSizing: 'border-box', fontSize: '11px', lineHeight: 1.6 }}>
        <h1 style={{ textAlign: 'center', fontSize: '20px', fontWeight: 700, marginBottom: '20px' }}>{isSalaryAgreement ? '연봉 계약서' : '근로 계약서'}</h1>

        <p style={{ fontWeight: 700, margin: '14px 0 6px' }}>1. 계약 당사자</p>
        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '4px 0' }}>사용자</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}><tbody>
            <tr><td style={labelCellStyle}>사업체명</td><td style={cellStyle}>{companyName}</td><td style={labelCellStyle}>대표</td><td style={cellStyle}>{repName}</td></tr>
            <tr><td style={labelCellStyle}>사업종류</td><td style={cellStyle}>{lc.companyBusinessType}</td><td style={labelCellStyle}>사업자등록번호</td><td style={cellStyle}>{bizNumber}</td></tr>
            <tr><td style={labelCellStyle}>주 소</td><td style={cellStyle} colSpan={3}>{lc.companyAddress}</td></tr>
          </tbody></table>
        </div>
        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '8px 0 4px' }}>근로자</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}><tbody>
            <tr><td style={labelCellStyle}>성 명</td><td style={cellStyle}>{lc.employeeName}</td><td style={labelCellStyle}>생년월일</td><td style={cellStyle}>{fmtDateKo(lc.employeeBirthDate)}</td></tr>
            <tr><td style={labelCellStyle}>주 소</td><td style={cellStyle} colSpan={3}>{lc.employeeAddress}</td></tr>
            <tr><td style={labelCellStyle}>고용형태</td><td style={cellStyle} colSpan={3}>
              {(['regular', 'contract', 'intern'] as const).map((t) => (
                <span key={t} style={{ marginRight: '14px' }}>{lc.employmentType === t ? '■' : '□'} {({ regular: '정규직', contract: '계약직', intern: '인턴' } as any)[t]}</span>
              ))}
            </td></tr>
          </tbody></table>
        </div>

        {/* [추가] 인쇄할 때 페이지가 넘어가면서 소제목만 페이지 맨 아래 외따로 남고 내용은
        다음 페이지로 넘어가는 문제가 있었다(예: "5. 퇴직 시 준수 사항"만 1페이지 끝에 남음).
        breakInside: 'avoid'로 소제목+본문을 하나로 묶어서, 이 묶음이 남은 공간에 다 안
        들어가면 통째로 다음 페이지로 넘어가게 한다. */}
        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '14px 0 6px' }}>2. 근로 조건</p>
          <p style={{ margin: '4px 0' }}>1) 급여 : 상여금을 포함한 포괄 연봉제이며, 급여는 매월 말일에 계좌로 입금하거나 본인이 현금 지급을 원할 시 현금으로 지급한다.</p>
        </div>
        <p style={{ margin: '4px 0 6px', paddingLeft: '10px' }}>가. 임금계산 원칙 - 구체적인 항목 및 지급액은 다음과 같다</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px', breakInside: 'avoid' }}>
          <thead><tr>
            <td style={{ ...labelCellStyle, width: '25%', textAlign: 'center' }}>지급 항목</td>
            <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 700, background: '#f5f5f5' }}>금액(원)</td>
          </tr></thead>
          <tbody>
            {lc.salaryItems.map((it) => (
              <tr key={it.id}><td style={cellStyle}>{it.label}</td><td style={{ ...cellStyle, textAlign: 'right' }}>{fmt(it.amount)}</td></tr>
            ))}
            <tr><td style={{ ...cellStyle, fontWeight: 700, textAlign: 'center' }}>지급 합계 (월 급여)</td><td style={{ ...cellStyle, textAlign: 'right', fontWeight: 700 }}>{fmt(monthlyTotal)}</td></tr>
            <tr><td style={{ ...cellStyle, fontWeight: 700, background: '#fff7cc', textAlign: 'center' }}>총 액 (연봉)</td><td style={{ ...cellStyle, textAlign: 'right', fontWeight: 700, background: '#fff7cc' }}>{fmt(annualTotal)}</td></tr>
          </tbody>
        </table>
        <p style={{ margin: '4px 0', paddingLeft: '10px' }}>나. 계산기간 및 계산방법 - 월 급여의 계산기간은 초일부터 기산하여 당월 말일로 마감한다.</p>
        <p style={{ margin: '4px 0 8px', paddingLeft: '10px' }}>다. 지급일 및 지급방법 - 월 급여의 지급일은 매월 말일 근로자의 통장으로 지급한다.</p>
        {isSalaryAgreement && (
          <p style={{ margin: '4px 0 8px' }}>- 단, 경력직의 경우 1년 동안은 업무 적응 기간으로, 업무 적응 기간의 보수는 근로자의 경력, 자질, 업무 능력, 업무 적응도 및 적성 등 각종 제반 상황을 종합적으로 판단하여 최초 연봉 계약 금액의 가감이 가능.</p>
        )}
        <p style={{ margin: '4px 0' }}>2) 급여 외 수당 : 없음 - 주 12시간의 연장 근로를 할 수 있음에 동의하고 이에 해당하는 수당은 급여에 포함한 금액으로 한다.</p>
        <p style={{ margin: '4px 0' }}>3) 근로 시간 : 매주 월요일 ~ 금요일 09:00~18:00(휴게시간 : 12:00~13:00) - 주간 40시간 만근 시 일요일 유급 휴일, 토요일 무급 휴일</p>
        <p style={{ margin: '4px 0' }}>4) 근무 장소 : {lc.workLocation}</p>
        <p style={{ margin: '4px 0' }}>5) 담당 업무 : {lc.jobDuties}</p>
        <p style={{ margin: '4px 0 8px' }}>6) 근무 지침 : 당사 직원 수첩 규정에 동의하고 이에 따름</p>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '14px 0 6px' }}>3. 고용 기간</p>
          {isSalaryAgreement ? (
            <p style={{ margin: '4px 0 8px' }}>- 계약 기간은 {fmtDateKo(lc.contractStartDate)} ~ {fmtDateKo(lc.contractEndDate)} 까지(1년) (단, 기간 만료일까지 별도 의사표시 없을 시 본 계약은 자동 연장)</p>
          ) : (
            <>
              <p style={{ margin: '4px 0' }}>- 계약 기간은 {fmtDateKo(lc.contractStartDate)} ~ {lc.contractEndDate ? fmtDateKo(lc.contractEndDate) : '(기간의 정함 없음)'}</p>
              <p style={{ margin: '4px 0 8px' }}>- 계약 후 1년은 업무 적응 기간으로 당사의 업무에 적합하지 않다고 판단될 시 이 기간 내에라도 계약 종료 가능</p>
            </>
          )}
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '14px 0 6px' }}>4. 연차 휴가</p>
          <p style={{ margin: '4px 0' }}>- 1년간 8할 이상 출근 시 15일의 유급 휴가 부여(2년에 1개씩 가산)</p>
          <p style={{ margin: '4px 0 8px' }}>- 또한, 별도의 서면 합의로 특정 근로일을 연차 휴가로 대체 가능</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '14px 0 6px' }}>5. 퇴직 시 준수 사항</p>
          <p style={{ margin: '4px 0 8px' }}>- 퇴직 1개월 이전까지 회사에 퇴사 의사를 알리고 업무 인수 인계서를 작성하여 제출하고, 후임자를 선임하여 업무 인수인계를 완료할 때까지 성실하게 근무하여야 한다.</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '14px 0 6px' }}>6. 근로 계약 해지 사유</p>
          <p style={{ margin: '4px 0' }}>- 정당한 사유 없이 무단 결근 시</p>
          <p style={{ margin: '4px 0' }}>- 업무 태만, 업무 수행 능력 부족 또는 건강상 장애로 업무 수행이 곤란 시</p>
          <p style={{ margin: '4px 0' }}>- 정당한 사유 없이 상사의 업무 지시 또는 작업 지시를 이행하지 않을 시</p>
          <p style={{ margin: '4px 0' }}>- 회사의 명예를 손상시켰거나 고의 또는 중과실로 회사에 손해를 입혔을 시</p>
          <p style={{ margin: '4px 0 8px' }}>- 당사 직원 수첩의 취업 규칙 또는 기타 사회통념 상 더 이상 근로관계 유지 어렵다고 판단될 시</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '14px 0 6px' }}>7. 지적 자산의 소유, 기밀 유지(비밀 보호) 및 손해 배상</p>
          <p style={{ margin: '4px 0' }}>- 근로자는 업무를 수행함에 있어 지적 자산에 관한 권리는 회사에 귀속된다는 점에 동의한다.</p>
          <p style={{ margin: '4px 0' }}>- 근로자는 계약서에 명시된 연봉 및 월 급여에 대하여 상호 간에 비교·공개하거나 타인에게 누설하여서는 아니 되며, 이를 위반한 경우 이로 인한 모든 불이익을 감수한다.</p>
          <p style={{ margin: '4px 0' }}>- 근로자는 근로 계약 기간을 포함하여 퇴사 후에라도 회사의 서면 허가 없이는 회사에서 지득한 업무상 기밀사항 또는 고객의 비밀 사항에 대해 그 경중을 막론하고 외부에 유출하여서는 아니 되며, 만일 위반할 경우 민·형사상의 모든 책임을 진다.</p>
          <p style={{ margin: '4px 0 8px' }}>- 근로자는 고의 또는 과실로 갑에 손해를 입힌 경우 그 손해의 한도 내에서 배상 책임을 진다.</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '14px 0 6px' }}>8. 기타 조건</p>
          <p style={{ margin: '4px 0 8px' }}>- 상기 조건 이외의 개별약정이 있는 경우 그 약정을 본 계약에 우선하여 적용.</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '14px 0 6px' }}>9. 준용</p>
          <p style={{ margin: '4px 0 8px' }}>- 본 계약서에 명시되지 않은 사항은 근로기준법 등 노동관계법령, 취업규칙을 준용한다.</p>
        </div>

        <p style={{ textAlign: 'center', margin: '20px 0 6px' }}>양 당사자는 상기 계약 조건을 성실히 준수할 것을 약속하며 본 근로계약을 체결합니다.</p>
        <p style={{ textAlign: 'center', margin: '10px 0 20px', fontWeight: 700 }}>{fmtDateKo(lc.contractDate)}</p>

        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '20px' }}>
          <p>사용자 : {repName} (인)</p>
          <p>근로자 : {lc.employeeName} (인)</p>
        </div>
      </div>
    );
  };

  // [추가] 재직증명서 인쇄용 화면. 공유해주신 실제 양식대로, 테두리 박스 안에 증명 내용을
  // 담고, 구분선 아래에 문서번호·발급일·회사 직인 영역을 별도로 둔다.
  const renderPrintableEmploymentCert = () => {
    if (!printingDoc || !printingDoc.employmentCert) return null;
    const ec = printingDoc.employmentCert;
    const fmtDateKo = (d?: string) => {
      if (!d) return '';
      const [y, m, day] = d.split('-');
      return `${y}년 ${m}월 ${day}일`;
    };
    const companyName = currentUser?.companyName || '';
    const repName = currentUser?.name || '';
    const rowStyle: React.CSSProperties = { display: 'flex', margin: '10px 0', fontSize: '13px' };
    const labelStyle: React.CSSProperties = { fontWeight: 700, width: '90px', flexShrink: 0 };

    return (
      <div className="print-document-margins" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', padding: '30mm 25mm', fontFamily: 'sans-serif', color: '#111', boxSizing: 'border-box', fontSize: '13px', lineHeight: 1.7 }}>
        <div style={{ border: '1.5px solid #000', padding: '15mm 20mm', breakInside: 'avoid' }}>
          <h1 style={{ textAlign: 'center', fontSize: '26px', fontWeight: 700, letterSpacing: '10px', marginBottom: '30px' }}>재 직 증 명</h1>

          <div style={rowStyle}><span style={labelStyle}>주 소</span><span>: {ec.employeeAddress}</span></div>
          <div style={rowStyle}>
            <span style={labelStyle}>성 명</span><span style={{ width: '160px' }}>: {ec.employeeName}</span>
            <span style={{ fontWeight: 700, marginRight: '8px' }}>주민등록번호</span><span>: {ec.residentNumberMasked}</span>
          </div>
          <div style={rowStyle}><span style={labelStyle}>입사일</span><span>: {fmtDateKo(ec.hireDate)}</span></div>
          <div style={rowStyle}>
            <span style={labelStyle}>용 도</span><span style={{ width: '160px' }}>: {ec.purpose}</span>
            <span style={{ fontWeight: 700, marginRight: '8px' }}>제출처</span><span>: {ec.submitTo}</span>
          </div>

          <p style={{ margin: '25px 0' }}>
            위와 같이 {companyName ? `주식회사 ${companyName.replace(/^\(주\)|주식회사\s?/g, '')}` : ''} {ec.position || ''}로 재직하고 있음을 증명하여 주시기 바랍니다.
          </p>

          <div style={{ marginLeft: 'auto', width: '260px', position: 'relative' }}>
            <div style={rowStyle}><span style={labelStyle}>신청일</span><span>: {fmtDateKo(ec.applicationDate)}</span></div>
            <div style={rowStyle}><span style={labelStyle}>소 속</span><span>: {ec.department}</span></div>
            <div style={rowStyle}><span style={labelStyle}>직 위</span><span>: {ec.position}</span></div>
            <div style={rowStyle}><span style={labelStyle}>위원인</span><span>: {ec.employeeName} (인)</span></div>
          </div>

          <p style={{ textAlign: 'center', fontSize: '17px', fontWeight: 700, margin: '25px 0' }}>{companyName} 대표 귀하</p>

          <div style={{ borderTop: '1px solid #000', margin: '20px 0' }} />

          <p style={{ margin: '10px 0' }}>{ec.documentNumber}</p>
          <p style={{ margin: '10px 0' }}>위와 같이 증명함.</p>
          <p style={{ textAlign: 'right', margin: '10px 0', fontWeight: 700 }}>{fmtDateKo(ec.issueDate)}</p>
          <p style={{ margin: '20px 0 10px' }}>{ec.companyAddress}</p>
          <p style={{ textAlign: 'center', fontSize: '18px', fontWeight: 700, margin: '10px 0' }}>{companyName} 대표</p>
        </div>
      </div>
    );
  };

  // [추가] 위임장 인쇄용 화면. 공유해주신 양식대로 위임받는 사람 정보 + 위임 업무 내용을
  // 채운다.
  const renderPrintablePowerOfAttorney = () => {
    if (!printingDoc || !printingDoc.powerOfAttorney) return null;
    const poa = printingDoc.powerOfAttorney;
    const fmtDateKo = (d?: string) => {
      if (!d) return '';
      const [y, m, day] = d.split('-');
      return `${y}년 ${m}월 ${day}일`;
    };
    const companyName = currentUser?.companyName || '';
    const rowStyle: React.CSSProperties = { display: 'flex', margin: '10px 0', fontSize: '13px' };
    const labelStyle: React.CSSProperties = { fontWeight: 700, width: '110px', flexShrink: 0 };

    return (
      <div className="print-document-margins" style={{ width: '210mm', margin: '0 auto', padding: '30mm 25mm', fontFamily: 'sans-serif', color: '#111', boxSizing: 'border-box', fontSize: '13px', lineHeight: 1.7 }}>
        <div style={{ border: '1.5px solid #000', padding: '15mm 20mm', breakInside: 'avoid' }}>
          <h1 style={{ textAlign: 'center', fontSize: '26px', fontWeight: 700, letterSpacing: '14px', marginBottom: '15mm' }}>위 임 장</h1>

          <div style={rowStyle}><span style={labelStyle}>주 소</span><span>: {poa.employeeAddress}</span></div>
          <div style={rowStyle}><span style={labelStyle}>성 명</span><span>: {poa.employeeName}</span></div>
          <div style={rowStyle}><span style={labelStyle}>주민등록번호</span><span>: {poa.residentNumberMasked}</span></div>
          <div style={rowStyle}><span style={labelStyle}>용 도</span><span>: {poa.purpose}</span></div>
          <div style={rowStyle}><span style={labelStyle}>제 출 처</span><span>: {poa.submitTo}</span></div>

          <p style={{ margin: '30px 0' }}>
            위 사람을 {poa.submitTo}에서 {companyName} 지점 {poa.taskDescription} 관련 업무 일체의 권한을 위임합니다.
          </p>

          <p style={{ textAlign: 'center', fontWeight: 700, margin: '30px 0 20px' }}>{fmtDateKo(poa.issueDate)}</p>
          <p style={{ textAlign: 'center', fontSize: '17px', fontWeight: 700 }}>{companyName} 대표 (인)</p>
        </div>
      </div>
    );
  };

  // [추가] 영업 계약서 인쇄용 화면. 공유해주신 18개 조항 전문을 그대로 재현하고, 거래처(갑)
  // 정보·계약기간·수수료 구조만 입력받은 값으로 치환한다.
  const renderPrintableSalesContract = () => {
    if (!printingDoc || !printingDoc.salesContract) return null;
    const sc = printingDoc.salesContract;
    const fmtDateKo = (d?: string) => {
      if (!d) return '';
      const [y, m, day] = d.split('-');
      return `${y}년 ${m}월 ${day}일`;
    };
    const fmt = (n: number) => new Intl.NumberFormat('ko-KR').format(n);
    // 1억 단위로 딱 떨어지면 "18억 원"처럼, 아니면 콤마 금액으로 표시
    const fmtEok = (n?: number) => {
      if (!n) return '0원';
      const eok = Math.floor(n / 100000000);
      const remainder = n % 100000000;
      if (eok > 0 && remainder === 0) return `${eok}억 원`;
      return `${fmt(n)}원`;
    };
    const companyName = currentUser?.companyName || '';
    const bizNumber = currentUser?.businessNumber || '';
    const repName = currentUser?.name || '';

    return (
      <div className="print-document-margins" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', padding: '30mm 25mm', fontFamily: 'sans-serif', color: '#111', boxSizing: 'border-box', fontSize: '11px', lineHeight: 1.65 }}>
        <h1 style={{ textAlign: 'center', fontSize: '20px', fontWeight: 700, marginBottom: '10px' }}>영업 계약서</h1>
        <p style={{ textAlign: 'center', margin: '4px 0 20px' }}>
          본 계약서는 영업 개발(수요업체 발굴) 자문 업무와 관련하여 계약 당사자 간의 권리·의무 및 보수 정산 기준을 명확히 함을 목적으로 한다.
        </p>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>§ 계약 당사자</p>
          <p style={{ fontWeight: 700, margin: '6px 0 2px' }}>갑 (영업 자문사)</p>
          <p style={{ margin: '2px 0' }}>• 상호 : {sc.counterpartyName}</p>
          <p style={{ margin: '2px 0' }}>• 주소 : {sc.counterpartyAddress}</p>
          <p style={{ margin: '2px 0' }}>• 사업자등록번호 : {sc.counterpartyBizNumber}</p>
          <p style={{ margin: '2px 0 8px' }}>• 대표이사 : {sc.counterpartyRepName}</p>
          <p style={{ fontWeight: 700, margin: '6px 0 2px' }}>을 (수주사)</p>
          <p style={{ margin: '2px 0' }}>• 상호 : {companyName}</p>
          <p style={{ margin: '2px 0' }}>• 사업자등록번호 : {bizNumber}</p>
          <p style={{ margin: '2px 0 8px' }}>• 대표이사 : {repName}</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>제1조 (목적)</p>
          <p style={{ margin: '2px 0 8px' }}>본 계약은 갑이 을의 사업과 관련하여 영업(수요업체 발굴) 자문 업무를 수행하고, 이에 따른 보수 산정 기준, 지급 조건 및 상호 권리·의무를 명확히 함을 목적으로 한다.</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>제2조 (영업 업무의 범위)</p>
          <p style={{ margin: '2px 0' }}>1. 신규 수요업체 및 발주 가능 거래처 발굴</p>
          <p style={{ margin: '2px 0' }}>2. 프로젝트 및 사업 기회 정보 제공</p>
          <p style={{ margin: '2px 0' }}>3. 발주처 소개 및 영업 기회 연결</p>
          <p style={{ margin: '2px 0 8px' }}>4. 기타 상호 합의한 영업개발 관련 업무 * 갑은 계약 체결, 가격 결정, 조건 협상 및 법적 대리권을 보유하지 아니한다.</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>제3조 (계약기간)</p>
          <p style={{ margin: '2px 0 8px' }}>본 계약의 계약 기간은 {fmtDateKo(sc.contractStartDate)}부터 {fmtDateKo(sc.contractEndDate)}까지로 하며 계약기간 만료 전 상호 합의 시 서면으로 연장할 수 있다.</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>제4조 (보수 산정의 기본 원칙)</p>
          <p style={{ margin: '2px 0' }}>1. 갑의 보수는 갑의 영업개발 활동을 통해 실제 수주가 성립되어 발생한 매출을 기준으로 산정한다.</p>
          <p style={{ margin: '2px 0' }}>2. 보수 산정은 발주처로부터 실제 수금이 완료된 매출에 한하여 적용한다.</p>
          <p style={{ margin: '2px 0 8px' }}>3. 보수 정산의 기준 자료는 을이 작성·확정한 프로젝트별 손익계산서로 한다.</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>제5조 (경상이익 및 경상이익률 산정)</p>
          <p style={{ margin: '2px 0' }}>1. 경상이익은 다음 산식에 따른다. 경상이익 = 매출액 – 총원가 / 경상이익률(%) = (경상이익 ÷ 매출액) × 100</p>
          <p style={{ margin: '2px 0 8px' }}>2. 총원가에는 직접비, 간접비, 일반관리비 및 사후 관리 예상 비용을 포함한다.</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>제6조 (사후 관리 비용 산정 한도)</p>
          <p style={{ margin: '2px 0 8px' }}>경상이익 산정을 위한 사후 관리 관련 비용은 실제 발생 여부와 관계없이 해당 프로젝트 매출액의 최대 {sc.aftercareCapRate}%를 초과하여 계상할 수 없다. 본 조항은 경상이익률 산정의 객관성과 정산의 공정성 확보하기 위한 강행 기준으로 적용한다.</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>제7조 (수수료 산정의 기본 원칙)</p>
          <p style={{ margin: '2px 0' }}>1. 수수료는 갑의 영업개발 활동으로 실제 수주가 성립되고, 발주처로부터 대금이 실제 수금된 매출액을 기준으로 산정한다.</p>
          <p style={{ margin: '2px 0' }}>2. 수수료는 매출 증가에 따라 총 수수료 금액이 감소하거나 불리해지지 않도록 적용한다.</p>
          <p style={{ margin: '2px 0 8px' }}>3. 수수료는 구간별 누진 방식으로 적용하며, 단일 수수료율을 소급 적용하지 아니한다.</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>제8조 (매출액 기준 누진 수수료율)</p>
          <p style={{ margin: '2px 0' }}>갑의 영업 개발 활동으로 발생한 매출액에 대하여 다음과 같이 구간별 누진 수수료율을 적용한다.</p>
          <p style={{ margin: '2px 0' }}>1. 매출액 {fmtEok(sc.feeTier1Max)} 이하 구간 → 해당 구간 매출액의 {sc.feeTier1Rate}%</p>
          <p style={{ margin: '2px 0' }}>2. 매출액 {fmtEok(sc.feeTier1Max)} 초과 ~ {fmtEok(sc.feeTier2Max)} 이하 구간 → 해당 초과 구간 매출액의 {sc.feeTier2Rate}%</p>
          <p style={{ margin: '2px 0' }}>3. 매출액 {fmtEok(sc.feeTier2Max)} 초과 구간 → 해당 초과 구간 매출액의 {sc.feeTier3Rate}%</p>
          <p style={{ margin: '2px 0 8px' }}>4. 경상이익율이 {sc.lowProfitThreshold}%미만의 경우 경상 이익의 {sc.lowProfitRate}%</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>제9조 (누진 적용 방식의 명확화)</p>
          <p style={{ margin: '2px 0' }}>1. 수수료는 각 매출 구간별로 분리하여 계산한다.</p>
          <p style={{ margin: '2px 0' }}>2. 매출 구간 초과로 인해 기존 구간에 적용된 수수료율이 변경되거나 감소하지 아니한다.</p>
          <p style={{ margin: '2px 0 8px' }}>3. 본 조의 누진 적용 방식은 수수료 산정의 유일한 기준으로 한다.</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>제10조 (수수료 역전 방지 조항)</p>
          <p style={{ margin: '2px 0' }}>1. 매출 증가로 인해 수수료 총액이 감소하거나, 낮은 매출 구간의 수수료 총액보다 불리하게 산정되는 결과는 허용되지 아니한다.</p>
          <p style={{ margin: '2px 0 8px' }}>2. 수수료 산정과 관련한 해석상 다툼은 누진 적용 및 역전 방지 원칙을 우선 기준으로 해석한다.</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>제11조 (영업 기여도 인정 제한)</p>
          <p style={{ margin: '2px 0' }}>1. 갑의 영업 기여도는 갑의 단독 행위로 발주처가 특정되고, 그 결과로 을과 발주처 간 계약이 최초로 체결된 경우에 한하여 인정한다.</p>
          <p style={{ margin: '2px 0' }}>2. 다음 각 호의 경우 영업 기여도로 인정하지 아니한다.</p>
          <p style={{ margin: '2px 0' }}>1) 을과 기존 거래 또는 사전 접촉 이력이 있는 발주처</p>
          <p style={{ margin: '2px 0' }}>2) 갑의 소개 이전에 을이 협의·견적·미팅을 진행한 경우</p>
          <p style={{ margin: '2px 0' }}>3) 단순 명단·정보·연락처 제공</p>
          <p style={{ margin: '2px 0 8px' }}>4) 갑의 행위와 수주 간 인과관계가 입증되지 않는 경우</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>제12조 (영업 기여 입증 책임)</p>
          <p style={{ margin: '2px 0 8px' }}>갑이 보수를 청구하기 위해서는 영업기여 사실 및 수주와의 인과관계를 객관적 자료로 입증하여야 하며, 입증되지 않는 경우 을은 보수 지급 의무를 부담하지 아니한다.</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>제13조 (지속 거래에 대한 제한적 보수 인정)</p>
          <p style={{ margin: '2px 0' }}>1. 갑의 영업 개발 활동으로 최초 수주가 성립된 발주처에 한하여, 동일 발주처에서 발생하는 후속 매출에 대하여는 본 조에서 정한 범위 내에서만 예외적으로 보수를 인정한다.</p>
          <p style={{ margin: '2px 0' }}>2. 보수 인정 기간은 최초 수주일로부터 {sc.recognitionMonths}개월로 제한한다.</p>
          <p style={{ margin: '2px 0' }}>3. 보수 인정 대상이 되는 후속 매출 누적 매출 한도는 {fmtEok(sc.recognitionCapAmount)}을 초과할 수 없다.</p>
          <p style={{ margin: '2px 0' }}>4. 위 기간 또는 금액 한도 중 어느 하나가 먼저 도달한 시점 이후, 발생하는 매출에 대하여는 갑은 어떠한 명목으로도 보수를 청구할 수 없다.</p>
          <p style={{ margin: '2px 0 8px' }}>5. 본 조는 갑의 영업기여도에 대한 유일하고 한정적인 예외 규정이며, 본 계약의 다른 조항에 우선하여 적용된다.</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>제14조 (계약 종료 후 보수 청구 제한)</p>
          <p style={{ margin: '2px 0 8px' }}>본 계약이 해지·종료·만료된 이후 체결되는 모든 수주에 대하여 갑은 어떠한 명목으로도 보수를 청구할 수 없다.</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>제15조 (보수의 법적 성격)</p>
          <p style={{ margin: '2px 0 8px' }}>본 계약에 따른 보수는 조건부 성과 보수이며, 자문료·고문료·고정비 성격을 가지지 아니한다.</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>제16조 (손익 및 원가 산정 기준)</p>
          <p style={{ margin: '2px 0 8px' }}>매출액, 경상이익, 원가 및 사후관리 비용 산정은 을이 작성·확정한 회계 자료를 최종 기준으로 한다.</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>제17조 (계약 해석 원칙)</p>
          <p style={{ margin: '2px 0 8px' }}>보수 조항은 엄격하고 제한적으로 해석하며, 해석상 불명확한 경우 을에게 유리하게 해석한다.</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ fontWeight: 700, margin: '10px 0 4px' }}>제18조 (관할 법원)</p>
          <p style={{ margin: '2px 0 8px' }}>본 계약과 관련하여 발생하는 모든 분쟁은 을의 본점 소재지를 관할하는 법원을 전속 관할로 한다.</p>
        </div>

        <div style={{ breakInside: 'avoid' }}>
          <p style={{ textAlign: 'center', fontWeight: 700, margin: '16px 0 6px' }}>【 서명 및 날인 】</p>
          <p style={{ textAlign: 'center', margin: '4px 0' }}>본 계약의 내용을 모두 확인하고 이에 동의하여 본 계약서를 2부 작성하여 각자 기명 날인 후 1부씩 보관한다.</p>
          <p style={{ textAlign: 'center', margin: '4px 0 14px', fontWeight: 700 }}>계약일자 : {fmtDateKo(sc.contractDate)}</p>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', border: '0.5px solid #999' }}>
            <tbody>
              <tr>
                <td style={{ border: '0.5px solid #999', padding: '6px', textAlign: 'center', fontWeight: 700, width: '10%' }}>구분</td>
                <td style={{ border: '0.5px solid #999', padding: '6px', textAlign: 'center', fontWeight: 700 }}>서명</td>
              </tr>
              <tr>
                <td style={{ border: '0.5px solid #999', padding: '8px', textAlign: 'center', fontWeight: 700 }}>갑</td>
                <td style={{ border: '0.5px solid #999', padding: '8px' }}>{sc.counterpartyName} 대표이사 {sc.counterpartyRepName} (인)</td>
              </tr>
              <tr>
                <td style={{ border: '0.5px solid #999', padding: '8px', textAlign: 'center', fontWeight: 700 }}>을</td>
                <td style={{ border: '0.5px solid #999', padding: '8px' }}>{companyName} 대표이사 {repName} (인)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // [추가] 퇴직금 정산 지급명세서 인쇄용 화면. 공유해주신 양식대로 신청인 정보/중간정산
  // 대상기간/정산금 내역을 나열하고, 금액은 숫자와 한글을 나란히 표기한다.
  const renderPrintableSeverance = () => {
    if (!printingDoc || !printingDoc.severance) return null;
    const sv = printingDoc.severance;
    const fmt = (n: number) => new Intl.NumberFormat('ko-KR').format(n);
    const fmtDateKo = (d?: string) => {
      if (!d) return '';
      const [y, m, day] = d.split('-');
      return day ? `${y}년 ${m}월 ${day}일` : `${y}년 ${m}월`;
    };
    const total = (Number(sv.companyAdvanceAmount) || 0) + (Number(sv.bankAccrualAmount) || 0);
    const companyName = currentUser?.companyName || '';
    const repName = currentUser?.name || '';
    const periodLabelMonths = (() => {
      if (!sv.periodStart || !sv.periodEnd) return '';
      const start = new Date(sv.periodStart);
      const end = new Date(sv.periodEnd);
      const totalMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      const years = Math.floor(totalMonths / 12);
      const months = totalMonths % 12;
      return `${years > 0 ? `${years}년 ` : ''}${months > 0 ? `${months}개월` : ''}`.trim();
    })();

    return (
      <div className="print-document-margins" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', padding: '30mm 25mm', fontFamily: 'sans-serif', color: '#111', boxSizing: 'border-box', fontSize: '12px', lineHeight: 1.8 }}>
        <h1 style={{ textAlign: 'center', fontSize: '20px', fontWeight: 700, marginBottom: '25mm' }}>퇴직금 중간정산 지급명세서</h1>

        <p style={{ margin: '4px 0' }}>1. 신 청 인 : {sv.employeeName}</p>
        <p style={{ margin: '4px 0' }}>2. 주민번호 : {sv.residentNumberMasked}</p>
        <p style={{ margin: '4px 0' }}>3. 입사년도 : {fmtDateKo(sv.hireYearMonth)}</p>
        <p style={{ margin: '4px 0' }}>4. 중간정산 대상기간 : {fmtDateKo(sv.periodStart)} ~ {fmtDateKo(sv.periodEnd)}</p>
        <p style={{ margin: '4px 0 16px' }}>5. 중간정산 사유 : {sv.reason}</p>

        <p style={{ margin: '10px 0' }}>
          &nbsp;&nbsp;상기 본인은 {companyName} 근무하는 자로서 상기와 같은 이유로 아래와 같이 중간정산금 ({periodLabelMonths ? `${periodLabelMonths}_` : ''}{fmtDateKo(sv.periodStart)}부터 {fmtDateKo(sv.periodEnd)}까지의 퇴직금)을 지급 받았습니다.
        </p>

        <p style={{ fontWeight: 700, margin: '16px 0 6px' }}>6. 정산금 내역</p>
        <p style={{ margin: '4px 0' }}>
          ① 회사 선지급 - {numberToKoreanMoney(sv.companyAdvanceAmount || 0)}원 정(₩{fmt(sv.companyAdvanceAmount || 0)})
          {sv.companyAdvanceDate ? `_${sv.companyAdvanceDate.replace(/-/g, '.')}.` : ''}
          {sv.companyAdvanceBank ? `/${sv.companyAdvanceBank}에서 입금` : ''}
        </p>
        <p style={{ margin: '4px 0' }}>② 은행 적립금 - {numberToKoreanMoney(sv.bankAccrualAmount || 0)}원 (₩{fmt(sv.bankAccrualAmount || 0)})</p>
        <p style={{ margin: '4px 0 30mm' }}>③ ①+② = {numberToKoreanMoney(total)}원 (₩{fmt(total)})</p>

        <p style={{ textAlign: 'right', margin: '0 0 4px' }}>수령인 &nbsp; {sv.employeeName} &nbsp; (서명)</p>
        <p style={{ textAlign: 'right', margin: '4px 0 30mm' }}>{fmtDateKo(sv.receiveDate)}</p>
        <p style={{ textAlign: 'right', fontWeight: 700, margin: 0 }}>{companyName} 대표이사 {repName} 귀중</p>
      </div>
    );
  };

  // [추가] 인쇄 중인 문서 종류에 맞는 렌더 함수를 골라서 실행. 새 서류 종류가 인쇄를
  // 지원하게 되면 여기에 한 줄만 추가하면 된다.
  const renderActivePrintable = () => {
    if (!printingDoc) return null;
    if (printingDoc.category === 'payslip') return renderPrintablePayslip();
    if (printingDoc.category === 'monthly_cashflow') return renderPrintableCashflow();
    if (printingDoc.category === 'bank_withdrawal' || printingDoc.category === 'bank_deposit') return renderPrintableBankLedger();
    if (printingDoc.category === 'loan_repayment') return renderPrintableLoanRepayment();
    if (printingDoc.category === 'card_usage') return renderPrintableCardUsage();
    if (printingDoc.category === 'corp_card') return renderPrintableCorpCard();
    if (printingDoc.category === 'management_fee') return renderPrintableManagementFee();
    if (printingDoc.category === 'vehicle_fine') return renderPrintableVehicleFine();
    if (printingDoc.category === 'labor_contract' || printingDoc.category === 'salary_agreement') return renderPrintableLaborContract();
    if (printingDoc.category === 'employment_cert') return renderPrintableEmploymentCert();
    if (printingDoc.category === 'power_of_attorney') return renderPrintablePowerOfAttorney();
    if (printingDoc.category === 'sales_contract') return renderPrintableSalesContract();
    if (printingDoc.category === 'severance') return renderPrintableSeverance();
    return null;
  };

  return (
    <>
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-slate-900">{SECTION_LABEL[section]}</h2>
        <span className="text-xs bg-amber-50 text-amber-700 border border-amber-500/30 px-2.5 py-1 rounded-full font-semibold">관리자 전용</span>
      </div>

      {/* 서류 종류 서브 탭 */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveCategory(c.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
              activeCategory === c.id
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* 검색 + 추가 버튼 */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`${activeConfig.label} 검색 (제목, ${activeConfig.personLabel}, 메모)`}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-700 outline-none focus:border-indigo-500"
          />
        </div>
        <button
          onClick={() => {
            const fresh = emptyForm(activeCategory);
            // [추가] 새 문서를 만들 때, 저장돼 있던 회사 주소·사업종류를 자동으로 채워 넣는다.
            if (fresh.laborContract) {
              fresh.laborContract = { ...fresh.laborContract, companyAddress: companySettings.address, companyBusinessType: companySettings.businessType };
            }
            if (fresh.employmentCert) {
              fresh.employmentCert = { ...fresh.employmentCert, companyAddress: companySettings.address };
            }
            // [추가] 재직증명서는 문서번호를 신청년도 기준 일련번호로 자동 생성해준다
            // (예: 2026년 첫 신청 2026-001, 두 번째 2026-002...). 그 해에 이미 만들어진
            // 재직증명서 개수를 세어서 다음 번호를 매긴다.
            if (fresh.employmentCert) {
              const year = (fresh.employmentCert.applicationDate || new Date().toISOString().split('T')[0]).slice(0, 4);
              const countThisYear = docs.filter((d) => d.category === 'employment_cert' && d.employmentCert?.documentNumber?.startsWith(`${year}-`)).length;
              fresh.employmentCert.documentNumber = `${year}-${String(countThisYear + 1).padStart(3, '0')}`;
            }
            setEditingDoc(fresh);
          }}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-md shadow-indigo-600/20 transition-all active:scale-95 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>{activeConfig.label} 추가</span>
        </button>
      </div>

      {/* [추가] 통장 출금/입금 내역만 엑셀 가져오기/내보내기 제공. 은행 사이트에서 받은
      거래내역 엑셀을 그대로 올리거나, 여기서 내보낸 엑셀로 백업/편집 후 다시 올릴 수 있다. */}
      {(activeCategory === 'bank_withdrawal' || activeCategory === 'bank_deposit') && (
        <div className="flex items-center gap-2 -mt-1">
          <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer transition-colors ${isImportingBankLedger ? 'opacity-50 pointer-events-none' : ''}`}>
            <Upload className="w-3.5 h-3.5" />
            {isImportingBankLedger ? '가져오는 중...' : '엑셀 가져오기'}
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportBankLedgerFile(file);
                e.target.value = '';
              }}
            />
          </label>
          <button
            type="button"
            onClick={handleExportBankLedgerExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            엑셀 내보내기
          </button>
        </div>
      )}

      {/* [추가] 법인카드 관리 - 카드별로 문서를 따로 등록해도, 같은 달 것끼리 모아서
      한 페이지(엑셀표 양식)로 인쇄/미리보기 할 수 있게 해준다. */}
      {activeCategory === 'corp_card' && corpCardMonths.length > 0 && (
        <div className="flex items-center gap-2 -mt-1 flex-wrap">
          <select
            value={corpCardMergeMonth || corpCardMonths[0]}
            onChange={(e) => setCorpCardMergeMonth(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 outline-none focus:border-indigo-500"
          >
            {corpCardMonths.map((m) => {
              const [y, mo] = m.split('-');
              return <option key={m} value={m}>{y}년 {Number(mo)}월</option>;
            })}
          </select>
          <button
            type="button"
            onClick={handleViewAllCorpCards}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-bold text-indigo-600 hover:bg-indigo-100 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            전체 카드 한 페이지로 보기
          </button>
        </div>
      )}

      {/* [추가] 차량 과태료 내역 - 문서를 여러 개로 나눠 등록하거나 한 문서에 여러 건을
      같이 넣어둬도, 위반일자 기준으로 선택한 연도의 건을 전부 모아 한 페이지(표)로
      인쇄/엑셀 출력 할 수 있게 해준다. */}
      {activeCategory === 'vehicle_fine' && vehicleFineYears.length > 0 && (
        <div className="flex items-center gap-2 -mt-1 flex-wrap">
          <select
            value={vehicleFineMergeYear || vehicleFineYears[0]}
            onChange={(e) => setVehicleFineMergeYear(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-600 outline-none focus:border-indigo-500"
          >
            {vehicleFineYears.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleViewAllVehicleFines}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-xs font-bold text-indigo-600 hover:bg-indigo-100 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            연도별로 한 페이지로 보기
          </button>
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="text-center py-12 text-sm text-slate-400">불러오는 중...</div>
      ) : filteredDocs.length === 0 ? (
        <div className="text-center py-16 text-sm text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
          아직 등록된 {activeConfig.label}가 없습니다.
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredDocs.map((d) => (
            <div key={d.id} className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-indigo-300 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-slate-800 truncate">{d.title}</h3>
                    <span className="text-[11px] text-slate-400 font-mono shrink-0">{d.date}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                    {d.personName && <span>{activeConfig.personLabel}: <b className="text-slate-700">{d.personName}</b></span>}
                    {activeConfig.showAmount && d.amount && (
                      <span className="text-emerald-600 font-mono font-bold">
                        {/^\d+$/.test(d.amount) ? `${formatCurrencyInput(d.amount)}원` : d.amount}
                      </span>
                    )}
                  </div>
                  {d.memo && <p className="text-xs text-slate-500 mt-1.5 whitespace-pre-line">{d.memo}</p>}
                  {d.attachments && d.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {d.attachments.map((a) => (
                        <a
                          key={a.id}
                          href={a.dataUrl}
                          download={a.name}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-100"
                        >
                          <Paperclip className="w-3 h-3" />
                          <span className="max-w-[140px] truncate">{a.name}</span>
                          <Download className="w-3 h-3 text-slate-400" />
                        </a>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-300 mt-2">{d.createdByUserName ? `${d.createdByUserName} 등록` : ''}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* [추가] 급여명세서/월별 자금 현황만 인쇄 버튼 제공 - 각각 회사에서 흔히
                  쓰는 표 형태 양식으로 별도 인쇄용 화면(#print-root)에 그려서 인쇄한다. */}
                  {((d.category === 'payslip' && d.payslip) || (d.category === 'monthly_cashflow' && d.cashflow) || ((d.category === 'bank_withdrawal' || d.category === 'bank_deposit') && d.bankLedger) || (d.category === 'loan_repayment' && d.loanRepayment) || (d.category === 'card_usage' && d.cardUsage) || (d.category === 'corp_card' && d.corpCard) || (d.category === 'management_fee' && d.managementFee) || (d.category === 'vehicle_fine' && d.vehicleFine) || ((d.category === 'labor_contract' || d.category === 'salary_agreement') && d.laborContract) || (d.category === 'employment_cert' && d.employmentCert) || (d.category === 'power_of_attorney' && d.powerOfAttorney) || (d.category === 'sales_contract' && d.salesContract) || (d.category === 'severance' && d.severance)) && (
                    <button
                      onClick={() => setPrintingDoc(d)}
                      className="p-2 rounded-lg bg-slate-50 hover:bg-indigo-600 text-slate-500 hover:text-white transition-colors"
                      title="인쇄"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setEditingDoc(d)}
                    className="p-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="p-2 rounded-lg bg-slate-50 hover:bg-rose-600 text-slate-500 hover:text-white transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 등록/수정 모달 */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div onClick={() => setEditingDoc(null)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" />
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-4 z-10 max-h-[90vh] overflow-y-auto">
              <button
                onClick={() => setEditingDoc(null)}
                className="absolute top-5 right-5 p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 pr-8">
                <FileText className="w-5 h-5 text-indigo-500" />
                <h3 className="text-base font-bold text-slate-800">
                  {editingDoc.id ? `${activeConfig.label} 수정` : `${activeConfig.label} 추가`}
                </h3>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">제목 *</label>
                  <input
                    type="text"
                    value={editingDoc.title || ''}
                    onChange={(e) => setEditingDoc({ ...editingDoc, title: e.target.value })}
                    placeholder={`예: 2026년 ${activeConfig.personLabel} ${activeConfig.label}`}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">날짜</label>
                    <input
                      type="date"
                      value={editingDoc.date || ''}
                      onChange={(e) => setEditingDoc({ ...editingDoc, date: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">{activeConfig.personLabel}</label>
                    {/* [수정] 차량 과태료 내역에서는 이 "차량"도 통합 차량관리 등록 차량에서
                    골라 쓸 수 있게 한다(다른 서류 종류는 기존 자유 입력 그대로 유지). */}
                    {activeCategory === 'vehicle_fine' ? (
                      <VehicleSearchInput
                        vehicles={vehicles}
                        value={editingDoc.personName || ''}
                        onChange={(v) => setEditingDoc({ ...editingDoc, personName: v })}
                        inputClassName="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-indigo-500"
                      />
                    ) : (
                      <input
                        type="text"
                        value={editingDoc.personName || ''}
                        onChange={(e) => setEditingDoc({ ...editingDoc, personName: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-indigo-500"
                      />
                    )}
                  </div>
                </div>

                {/* [추가] 급여명세서 전용 구조화 입력: 회사에서 실제로 쓰는 양식(사원코드/입사일/
                부서/직위/호봉 + 지급내역·공제내역 여러 줄)을 그대로 입력받는다. 다른 서류
                종류에서는 이 블록 자체가 안 보인다. */}
                {activeCategory === 'payslip' && (
                  <div className="space-y-3 border border-indigo-100 bg-indigo-50/40 rounded-xl p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">회사명</label>
                        <input
                          type="text"
                          value={editingDoc.payslip?.companyName || ''}
                          onChange={(e) => setEditingDoc({ ...editingDoc, payslip: { ...(editingDoc.payslip || { payItems: [], deductionItems: [] }), companyName: e.target.value } })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">지급월</label>
                        <input
                          type="month"
                          value={editingDoc.payslip?.payMonth || ''}
                          onChange={(e) => setEditingDoc({ ...editingDoc, payslip: { ...(editingDoc.payslip || { payItems: [], deductionItems: [] }), payMonth: e.target.value } })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">지급일</label>
                        <input
                          type="date"
                          value={editingDoc.payslip?.paymentDate || ''}
                          onChange={(e) => setEditingDoc({ ...editingDoc, payslip: { ...(editingDoc.payslip || { payItems: [], deductionItems: [] }), paymentDate: e.target.value } })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">사원코드</label>
                        <input
                          type="text"
                          value={editingDoc.payslip?.employeeCode || ''}
                          onChange={(e) => setEditingDoc({ ...editingDoc, payslip: { ...(editingDoc.payslip || { payItems: [], deductionItems: [] }), employeeCode: e.target.value } })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">입사일</label>
                        <input
                          type="date"
                          value={editingDoc.payslip?.hireDate || ''}
                          onChange={(e) => setEditingDoc({ ...editingDoc, payslip: { ...(editingDoc.payslip || { payItems: [], deductionItems: [] }), hireDate: e.target.value } })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">부서</label>
                        <input
                          type="text"
                          value={editingDoc.payslip?.department || ''}
                          onChange={(e) => setEditingDoc({ ...editingDoc, payslip: { ...(editingDoc.payslip || { payItems: [], deductionItems: [] }), department: e.target.value } })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">직위</label>
                        <input
                          type="text"
                          value={editingDoc.payslip?.position || ''}
                          onChange={(e) => setEditingDoc({ ...editingDoc, payslip: { ...(editingDoc.payslip || { payItems: [], deductionItems: [] }), position: e.target.value } })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">호봉</label>
                        <input
                          type="text"
                          value={editingDoc.payslip?.salaryGrade || ''}
                          onChange={(e) => setEditingDoc({ ...editingDoc, payslip: { ...(editingDoc.payslip || { payItems: [], deductionItems: [] }), salaryGrade: e.target.value } })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    {/* 지급 내역 */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-bold text-slate-600">지급 내역</label>
                        <button type="button" onClick={() => addPayslipItem('payItems')} className="text-[11px] text-indigo-600 font-bold flex items-center gap-0.5">
                          <Plus className="w-3 h-3" /> 항목 추가
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {(editingDoc.payslip?.payItems || []).map((it) => (
                          <div key={it.id} className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={it.label}
                              onChange={(e) => updatePayslipItem('payItems', it.id, { label: e.target.value })}
                              placeholder="예: 기본급"
                              className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                            />
                            <input
                              type="text"
                              inputMode="numeric"
                              value={it.amount ? formatCurrencyInput(it.amount) : ''}
                              onChange={(e) => updatePayslipItem('payItems', it.id, { amount: parseCurrencyInput(e.target.value) })}
                              placeholder="0"
                              className="w-28 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                            />
                            {/* [추가] 비과세 항목(식대·차량유지비 등)은 4대보험 자동계산 기준
                            (과세 대상 급여)에서 빼야 해서, 항목별로 직접 체크할 수 있게 한다. */}
                            <label className="flex items-center gap-1 text-[10px] text-slate-500 whitespace-nowrap shrink-0" title="체크 해제하면 비과세 처리되어 4대보험 자동계산에서 제외됩니다">
                              <input
                                type="checkbox"
                                checked={it.taxable !== false}
                                onChange={(e) => updatePayslipItem('payItems', it.id, { taxable: e.target.checked })}
                                className="w-3 h-3"
                              />
                              과세
                            </label>
                            <button type="button" onClick={() => removePayslipItem('payItems', it.id)} className="p-1.5 text-slate-400 hover:text-rose-500">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <p className="text-right text-[11px] text-slate-500 mt-1.5">지급액 계: <b className="text-slate-700">{formatCurrencyInput(sumItems(editingDoc.payslip?.payItems))}원</b></p>
                    </div>

                    {/* [추가] 4대보험 등 공제율 설정. 요율은 매년 바뀌므로 여기서 직접 고칠 수
                    있게 하고, "자동 계산"을 누르면 지급 내역(비과세 항목 제외) 합계에 이 요율을
                    곱해서 공제 내역 금액을 채운다. 소득세만 국세청 간이세액표 기준이라 자동
                    계산이 안 되니 직접 입력해야 하고, 지방소득세는 그 소득세의 10%(조정 가능)로
                    계산된다. */}
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setShowRateSettings((v) => !v)}
                        className="w-full flex items-center justify-between px-2.5 py-2 bg-white text-[11px] font-bold text-slate-600"
                      >
                        <span className="flex items-center gap-1"><Percent className="w-3 h-3" /> 공제율 설정 (매년 변경될 수 있음)</span>
                        <span className="text-slate-400">{showRateSettings ? '접기' : '펼치기'}</span>
                      </button>
                      {showRateSettings && (
                        <div className="p-2.5 bg-white border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {([
                            ['pensionRate', '국민연금 (%)'],
                            ['healthRate', '건강보험 (%)'],
                            ['ltcRate', '장기요양보험료 (건강보험료 대비 %)'],
                            ['employmentRate', '고용보험 (%)'],
                            ['localTaxRate', '지방소득세 (소득세 대비 %)']
                          ] as [keyof typeof DEFAULT_RATES, string][]).map(([key, label]) => (
                            <div key={key}>
                              <label className="block text-[10px] text-slate-500 mb-0.5">{label}</label>
                              <input
                                type="number"
                                step="0.001"
                                value={editingDoc.payslip?.rates?.[key] ?? DEFAULT_RATES[key]}
                                onChange={(e) => updateRate(key, Number(e.target.value))}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <p className="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2">
                      <Calculator className="w-3.5 h-3.5 shrink-0" />
                      지급 내역이나 공제율을 바꾸면 4대보험료가 자동으로 다시 계산됩니다. (소득세는 직접 입력 — 입력하면 지방소득세도 자동 계산)
                    </p>

                    {/* 공제 내역 */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-bold text-slate-600">공제 내역</label>
                        <button type="button" onClick={() => addPayslipItem('deductionItems')} className="text-[11px] text-indigo-600 font-bold flex items-center gap-0.5">
                          <Plus className="w-3 h-3" /> 항목 추가
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {(editingDoc.payslip?.deductionItems || []).map((it) => (
                          <div key={it.id} className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={it.label}
                              onChange={(e) => updatePayslipItem('deductionItems', it.id, { label: e.target.value })}
                              placeholder="예: 국민연금"
                              className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                            />
                            <input
                              type="text"
                              inputMode="numeric"
                              value={it.amount ? formatCurrencyInput(it.amount) : ''}
                              onChange={(e) => updatePayslipItem('deductionItems', it.id, { amount: parseCurrencyInput(e.target.value) })}
                              placeholder="0"
                              className="w-28 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                            />
                            <button type="button" onClick={() => removePayslipItem('deductionItems', it.id)} className="p-1.5 text-slate-400 hover:text-rose-500">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <p className="text-right text-[11px] text-slate-500 mt-1.5">공제액 계: <b className="text-slate-700">{formatCurrencyInput(sumItems(editingDoc.payslip?.deductionItems))}원</b></p>
                    </div>

                    <p className="text-right text-xs font-bold text-emerald-600 border-t border-indigo-100 pt-2">
                      차인지급액: {formatCurrencyInput(sumItems(editingDoc.payslip?.payItems) - sumItems(editingDoc.payslip?.deductionItems))}원
                    </p>
                  </div>
                )}

                {/* [추가] 월별 자금 현황 전용 구조화 입력: 통장(계좌)별 이월금/입금/출금을
                입력하면 통장잔액은 자동 계산되고, 맨 아래 합계도 자동으로 더해진다. */}
                {activeCategory === 'monthly_cashflow' && (
                  <div className="space-y-3 border border-indigo-100 bg-indigo-50/40 rounded-xl p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">집계 시작일</label>
                        <input
                          type="date"
                          value={editingDoc.cashflow?.periodStart || ''}
                          onChange={(e) => setEditingDoc({ ...editingDoc, cashflow: { ...(editingDoc.cashflow || { accounts: [] }), periodStart: e.target.value } })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">집계 종료일</label>
                        <input
                          type="date"
                          value={editingDoc.cashflow?.periodEnd || ''}
                          onChange={(e) => setEditingDoc({ ...editingDoc, cashflow: { ...(editingDoc.cashflow || { accounts: [] }), periodEnd: e.target.value } })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-bold text-slate-600">통장 잔액</label>
                        <button type="button" onClick={addCashflowAccount} className="text-[11px] text-indigo-600 font-bold flex items-center gap-0.5">
                          <Plus className="w-3 h-3" /> 계좌 추가
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {(editingDoc.cashflow?.accounts || []).map((a) => {
                          // [추가] 같은 은행+계좌번호를 쓰는 입금/출금 내역 문서가 있으면, 이
                          // 계좌의 집계 기간(periodStart~periodEnd)에 해당하는 거래만 뽑아
                          // 합산한 금액을 미리 보여준다. 자동 불러오기 버튼을 누르면 그
                          // 값을 입금/출금 칸에 그대로 채워 넣어서, 세 문서(자금현황/입금
                          // 내역/출금내역)의 숫자가 항상 일치하도록 맞출 수 있다.
                          const matched = a.bankName && a.accountNumber
                            ? {
                                deposit: sumLedgerByAccount(docs, 'bank_deposit', a.bankName, a.accountNumber, editingDoc.cashflow?.periodStart, editingDoc.cashflow?.periodEnd),
                                withdrawal: sumLedgerByAccount(docs, 'bank_withdrawal', a.bankName, a.accountNumber, editingDoc.cashflow?.periodStart, editingDoc.cashflow?.periodEnd)
                              }
                            : null;
                          return (
                          <div key={a.id} className="bg-white border border-slate-200 rounded-lg p-2 space-y-1.5">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                              <input
                                type="text"
                                value={a.bankName || ''}
                                onChange={(e) => updateCashflowAccount(a.id, { bankName: e.target.value })}
                                placeholder="은행 (예: 하나은행)"
                                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                              />
                              <input
                                type="text"
                                value={a.accountNumber || ''}
                                onChange={(e) => updateCashflowAccount(a.id, { accountNumber: e.target.value })}
                                placeholder="계좌번호"
                                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                              />
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={a.subCategory || ''}
                                  onChange={(e) => updateCashflowAccount(a.id, { subCategory: e.target.value })}
                                  placeholder="구분 (예: 급여/카드대금)"
                                  className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                                />
                                <button type="button" onClick={() => removeCashflowAccount(a.id)} className="p-1.5 text-slate-400 hover:text-rose-500 shrink-0">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-0.5">이월금</label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={a.broughtForward ? formatCurrencyInput(a.broughtForward) : ''}
                                  onChange={(e) => updateCashflowAccount(a.id, { broughtForward: parseCurrencyInput(e.target.value) })}
                                  placeholder="0"
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-0.5">입금</label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={a.deposit ? formatCurrencyInput(a.deposit) : ''}
                                  onChange={(e) => updateCashflowAccount(a.id, { deposit: parseCurrencyInput(e.target.value) })}
                                  placeholder="0"
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] text-slate-400 mb-0.5">출금</label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={a.withdrawal ? formatCurrencyInput(a.withdrawal) : ''}
                                  onChange={(e) => updateCashflowAccount(a.id, { withdrawal: parseCurrencyInput(e.target.value) })}
                                  placeholder="0"
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                                />
                              </div>
                            </div>
                            {matched && (matched.deposit > 0 || matched.withdrawal > 0) && (
                              <button
                                type="button"
                                onClick={() => updateCashflowAccount(a.id, { deposit: matched.deposit, withdrawal: matched.withdrawal })}
                                className="w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-[10px] font-bold"
                              >
                                <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3" /> 입금/출금 내역에서 불러오기</span>
                                <span>입금 {formatCurrencyInput(matched.deposit)} · 출금 {formatCurrencyInput(matched.withdrawal)}</span>
                              </button>
                            )}
                            <input
                              type="text"
                              value={a.note || ''}
                              onChange={(e) => updateCashflowAccount(a.id, { note: e.target.value })}
                              placeholder="비고 (예: *은민_만기 08.28)"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600 outline-none focus:border-indigo-500"
                            />
                            <p className="text-right text-[11px] text-slate-500">통장잔액: <b className="text-emerald-600">{formatCurrencyInput(accountBalance(a))}원</b></p>
                          </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="border-t border-indigo-100 pt-2 text-[11px] text-slate-600 space-y-0.5">
                      <p className="flex justify-between"><span>이월금 합계</span><b>{formatCurrencyInput((editingDoc.cashflow?.accounts || []).reduce((s, a) => s + a.broughtForward, 0))}원</b></p>
                      <p className="flex justify-between"><span>입금 합계</span><b>{formatCurrencyInput((editingDoc.cashflow?.accounts || []).reduce((s, a) => s + a.deposit, 0))}원</b></p>
                      <p className="flex justify-between"><span>출금 합계</span><b>{formatCurrencyInput((editingDoc.cashflow?.accounts || []).reduce((s, a) => s + a.withdrawal, 0))}원</b></p>
                      <p className="flex justify-between text-emerald-600 font-bold text-xs"><span>통장잔액 합계</span><span>{formatCurrencyInput((editingDoc.cashflow?.accounts || []).reduce((s, a) => s + accountBalance(a), 0))}원</span></p>
                    </div>
                  </div>
                )}

                {/* [추가] 통장 출금/입금 내역 전용 구조화 입력 (두 카테고리 공용). 통장(계좌)별로
                묶어서 여러 거래(일자/프로젝트/금액/거래내용/비고)를 입력하고, 계좌마다 소계,
                맨 아래에 전체 합계가 자동으로 표시된다. */}
                {(activeCategory === 'bank_withdrawal' || activeCategory === 'bank_deposit') && (
                  <div className="space-y-3 border border-indigo-100 bg-indigo-50/40 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-slate-600">{activeCategory === 'bank_withdrawal' ? '출금통장별 거래 내역' : '입금통장별 거래 내역'}</label>
                      <button type="button" onClick={addBankAccount} className="text-[11px] text-indigo-600 font-bold flex items-center gap-0.5">
                        <Plus className="w-3 h-3" /> 통장 추가
                      </button>
                    </div>

                    {(editingDoc.bankLedger?.accounts || []).map((acc) => (
                      <div key={acc.id} className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-2">
                        {/* [수정] 자금 현황과 완전히 똑같은 구조(은행/계좌번호/구분)로
                        통일했다. 표시 이름을 따로 안 만들어도, 인쇄/목록에서는 이 세 값을
                        합쳐서 "하나은행(13004)_급여" 같은 형태로 자동으로 보여준다. */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                          <input
                            type="text"
                            value={acc.bankName || ''}
                            onChange={(e) => updateBankAccountField(acc.id, { bankName: e.target.value })}
                            placeholder="은행 (예: 하나은행)"
                            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                          />
                          <input
                            type="text"
                            value={acc.accountNumber || ''}
                            onChange={(e) => updateBankAccountField(acc.id, { accountNumber: e.target.value })}
                            placeholder="계좌번호"
                            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                          />
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={acc.subCategory || ''}
                              onChange={(e) => updateBankAccountField(acc.id, { subCategory: e.target.value })}
                              placeholder="구분 (예: 급여/카드대금)"
                              className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                            />
                            {(editingDoc.bankLedger?.accounts.length || 0) > 1 && (
                              <button type="button" onClick={() => removeBankAccount(acc.id)} className="p-1.5 text-slate-400 hover:text-rose-500 shrink-0">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          {acc.entries.map((e) => (
                            // [수정] grid-cols-12로 6개 칸을 욱여넣었더니, 폰처럼 화면이 좁으면
                            // 칸 하나하나가 너무 좁아져서 글자가 겹쳐 보이고 입력할 수 없었다.
                            // flex-wrap으로 바꿔서, 좁은 화면에서는 자연스럽게 여러 줄로
                            // 줄바꿈되고 넓은 화면에서는 한 줄로 붙어 보이게 한다.
                            <div key={e.id} className="flex flex-wrap items-center gap-1">
                              <input
                                type="date"
                                value={e.date}
                                onChange={(ev) => updateBankEntry(acc.id, e.id, { date: ev.target.value })}
                                className="flex-1 min-w-[130px] bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-indigo-500"
                              />
                              <input
                                type="text"
                                value={e.project}
                                onChange={(ev) => updateBankEntry(acc.id, e.id, { project: ev.target.value })}
                                placeholder="프로젝트"
                                className="flex-1 min-w-[90px] bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-indigo-500"
                              />
                              <input
                                type="text"
                                inputMode="numeric"
                                value={e.amount ? formatCurrencyInput(e.amount) : ''}
                                onChange={(ev) => updateBankEntry(acc.id, e.id, { amount: parseCurrencyInput(ev.target.value) })}
                                placeholder="금액"
                                className="flex-1 min-w-[90px] bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-right text-slate-700 outline-none focus:border-indigo-500"
                              />
                              <input
                                type="text"
                                value={e.description}
                                onChange={(ev) => updateBankEntry(acc.id, e.id, { description: ev.target.value })}
                                placeholder="거래내용"
                                className="flex-[2] min-w-[110px] bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-indigo-500"
                              />
                              <input
                                type="text"
                                value={e.note || ''}
                                onChange={(ev) => updateBankEntry(acc.id, e.id, { note: ev.target.value })}
                                placeholder="비고"
                                className="flex-1 min-w-[70px] bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-indigo-500"
                              />
                              <button type="button" onClick={() => removeBankEntry(acc.id, e.id)} className="shrink-0 p-1 text-slate-400 hover:text-rose-500">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <button type="button" onClick={() => addBankEntry(acc.id)} className="text-[11px] text-indigo-600 font-bold flex items-center gap-0.5">
                            <Plus className="w-3 h-3" /> 거래 추가
                          </button>
                          <p className="text-[11px] text-slate-500">소계: <b className="text-slate-700">{formatCurrencyInput(bankAccountTotal(acc))}원</b></p>
                        </div>
                      </div>
                    ))}

                    <p className="text-right text-xs font-bold text-emerald-600 border-t border-indigo-100 pt-2">
                      총 합계: {formatCurrencyInput((editingDoc.bankLedger?.accounts || []).reduce((s, a) => s + bankAccountTotal(a), 0))}원
                    </p>
                  </div>
                )}

                {/* [추가] 대출이자 및 원금 상환 내역 전용 구조화 입력. 대출 건별로 입력하고,
                "상환완료" 체크를 켜면 상환일/메모 칸이 추가로 나타난다. */}
                {activeCategory === 'loan_repayment' && (
                  <div className="space-y-3 border border-indigo-100 bg-indigo-50/40 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-slate-600">대출 목록</label>
                      <button type="button" onClick={addLoan} className="text-[11px] text-indigo-600 font-bold flex items-center gap-0.5">
                        <Plus className="w-3 h-3" /> 대출 추가
                      </button>
                    </div>

                    {(editingDoc.loanRepayment?.loans || []).map((l) => (
                      <div key={l.id} className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-1.5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          <input
                            type="text"
                            value={l.loanName}
                            onChange={(e) => updateLoan(l.id, { loanName: e.target.value })}
                            placeholder="대출 명 (예: 우리은행_중진직대출)"
                            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                          />
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={l.loanAccount || ''}
                              onChange={(e) => updateLoan(l.id, { loanAccount: e.target.value })}
                              placeholder="대출 계좌"
                              className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                            />
                            <button type="button" onClick={() => removeLoan(l.id)} className="p-1.5 text-slate-400 hover:text-rose-500 shrink-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">대출 금액</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={l.initialAmount ? formatCurrencyInput(l.initialAmount) : ''}
                              onChange={(e) => updateLoan(l.id, { initialAmount: parseCurrencyInput(e.target.value) })}
                              placeholder="0"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">최초 이자율(%)</label>
                            <input
                              type="number"
                              step="0.001"
                              value={l.initialRate || ''}
                              onChange={(e) => updateLoan(l.id, { initialRate: Number(e.target.value) })}
                              placeholder="0"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">현재 이자율(%)</label>
                            <input
                              type="number"
                              step="0.001"
                              value={l.currentRate || ''}
                              onChange={(e) => updateLoan(l.id, { currentRate: Number(e.target.value) })}
                              placeholder="0"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">대출잔액</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={l.balance ? formatCurrencyInput(l.balance) : ''}
                              onChange={(e) => updateLoan(l.id, { balance: parseCurrencyInput(e.target.value) })}
                              placeholder="0"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">대출일</label>
                            <input
                              type="date"
                              value={l.loanDate || ''}
                              onChange={(e) => updateLoan(l.id, { loanDate: e.target.value })}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">만기일</label>
                            <input
                              type="date"
                              value={l.maturityDate || ''}
                              onChange={(e) => updateLoan(l.id, { maturityDate: e.target.value })}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">납기일</label>
                            <input
                              type="text"
                              value={l.paymentDay || ''}
                              onChange={(e) => updateLoan(l.id, { paymentDay: e.target.value })}
                              placeholder="예: 29일"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">출금 - 원금</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={l.principalPaid ? formatCurrencyInput(l.principalPaid) : ''}
                              onChange={(e) => updateLoan(l.id, { principalPaid: parseCurrencyInput(e.target.value) })}
                              placeholder="0"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">출금 - 이자</label>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={l.interestPaid ? formatCurrencyInput(l.interestPaid) : ''}
                              onChange={(e) => updateLoan(l.id, { interestPaid: parseCurrencyInput(e.target.value) })}
                              placeholder="0"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">출금 은행</label>
                            <input
                              type="text"
                              value={l.withdrawBank || ''}
                              onChange={(e) => updateLoan(l.id, { withdrawBank: e.target.value })}
                              placeholder="예: 하나은행"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">출금 계좌</label>
                            <input
                              type="text"
                              value={l.withdrawAccount || ''}
                              onChange={(e) => updateLoan(l.id, { withdrawAccount: e.target.value })}
                              placeholder="계좌번호"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>

                        <p className="text-right text-[11px] text-slate-500">출금 계: <b className="text-slate-700">{formatCurrencyInput(loanPaymentTotal(l))}원</b></p>

                        <label className="flex items-center gap-1.5 text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                          <input
                            type="checkbox"
                            checked={l.isRepaid}
                            onChange={(e) => updateLoan(l.id, { isRepaid: e.target.checked })}
                            className="w-3.5 h-3.5"
                          />
                          상환완료
                        </label>
                        {l.isRepaid && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-0.5">상환일</label>
                              <input
                                type="date"
                                value={l.repaidDate || ''}
                                onChange={(e) => updateLoan(l.id, { repaidDate: e.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] text-slate-400 mb-0.5">비고 (상환수수료 등)</label>
                              <input
                                type="text"
                                value={l.repaidFee || ''}
                                onChange={(e) => updateLoan(l.id, { repaidFee: e.target.value })}
                                placeholder="예: 상환수수료 16,593원"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    <div className="border-t border-indigo-100 pt-2 text-[11px] text-slate-600 space-y-0.5">
                      <p className="flex justify-between"><span>대출 잔액 합계</span><b>{formatCurrencyInput((editingDoc.loanRepayment?.loans || []).filter((l) => !l.isRepaid).reduce((s, l) => s + l.balance, 0))}원</b></p>
                      <p className="flex justify-between text-emerald-600 font-bold text-xs"><span>출금 총 합계</span><span>{formatCurrencyInput((editingDoc.loanRepayment?.loans || []).reduce((s, l) => s + loanPaymentTotal(l), 0))}원</span></p>
                    </div>
                  </div>
                )}

                {/* [추가] 법인카드 사용내역 전용 구조화 입력. 카드(소지자)별로 묶어서 여러
                사용 내역(금액/일자/프로젝트명/사용자/비고)을 입력하고, 카드마다 소계, 맨
                아래 총계가 자동으로 표시된다. 통장 출금/입금 내역과 같은 구조다. */}
                {activeCategory === 'card_usage' && (
                  <div className="space-y-3 border border-indigo-100 bg-indigo-50/40 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-slate-600">카드별 사용 내역</label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleOpenCardImportPanel}
                          className="text-[11px] text-emerald-700 font-bold flex items-center gap-0.5 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200"
                        >
                          <RefreshCw className="w-3 h-3" /> 자동 불러오기
                        </button>
                        <button type="button" onClick={addCard} className="text-[11px] text-indigo-600 font-bold flex items-center gap-0.5">
                          <Plus className="w-3 h-3" /> 카드 추가
                        </button>
                      </div>
                    </div>

                    {/* [추가] 통합 차량 관리(비용관리/정비일지)·프로젝트·업무일지(일일/주간)에서
                    법인카드 결제로 이미 기록된 지출들을 모아 보여주고, 고른 것만 선택한 카드에
                    항목으로 채워 넣는다. */}
                    {showCardImportPanel && (
                      <div className="bg-white border border-emerald-200 rounded-lg p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-emerald-700">차량·프로젝트·업무일지에서 법인카드 지출 불러오기</span>
                          <button type="button" onClick={() => setShowCardImportPanel(false)} className="text-slate-400 hover:text-slate-600">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-400 mb-0.5">가져올 대상 카드</label>
                          <select
                            value={importTargetCardId}
                            onChange={(e) => setImportTargetCardId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                          >
                            {(editingDoc.cardUsage?.cards || []).map((c) => (
                              <option key={c.id} value={c.id}>{c.cardName || '(카드명 미입력)'} {c.holder ? `- ${c.holder}` : ''}</option>
                            ))}
                          </select>
                        </div>

                        {isLoadingCandidates ? (
                          <p className="text-[11px] text-slate-400 text-center py-3">불러오는 중...</p>
                        ) : (
                          <>
                            {(() => {
                              const available = cardImportCandidates.filter((c) => !alreadyImportedKeys.has(c.sourceKey));
                              if (available.length === 0) {
                                return <p className="text-[11px] text-slate-400 text-center py-3">새로 가져올 법인카드 지출이 없습니다 (전부 이미 가져왔거나, 법인카드로 결제된 기록이 없습니다).</p>;
                              }
                              return (
                                <div className="space-y-1">
                                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 border-b border-slate-100 pb-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={available.every((c) => selectedImportKeys.has(c.sourceKey))}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedImportKeys(new Set(available.map((c) => c.sourceKey)));
                                        } else {
                                          setSelectedImportKeys(new Set());
                                        }
                                      }}
                                      className="w-3.5 h-3.5"
                                    />
                                    전체 선택 ({available.length}건)
                                  </label>
                                  <div className="max-h-56 overflow-y-auto space-y-1">
                                    {available.map((c) => (
                                      <label key={c.sourceKey} className="flex items-start gap-1.5 text-[11px] text-slate-600 hover:bg-slate-50 rounded-lg px-1.5 py-1 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={selectedImportKeys.has(c.sourceKey)}
                                          onChange={() => toggleImportKey(c.sourceKey)}
                                          className="w-3.5 h-3.5 mt-0.5"
                                        />
                                        <span className="flex-1">
                                          <span className="font-mono text-slate-400 mr-1">[{c.sourceLabel}]</span>
                                          <span className="font-bold text-slate-700">{formatCurrencyInput(c.amount)}원</span>
                                          <span className="text-slate-400 mx-1">·</span>
                                          <span>{c.date}</span>
                                          {c.project && <span className="text-slate-400"> · {c.project}</span>}
                                          {c.memo && <span className="text-slate-400"> · {c.memo}</span>}
                                          {c.personName && <span className="text-slate-400"> · {c.personName}</span>}
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                            <button
                              type="button"
                              onClick={handleImportSelected}
                              disabled={selectedImportKeys.size === 0 || !importTargetCardId}
                              className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold disabled:opacity-40"
                            >
                              선택한 {selectedImportKeys.size}건 가져오기
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {(editingDoc.cardUsage?.cards || []).map((c) => (
                      <div key={c.id} className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-2">
                        {/* [추가] 경영지원 > 법인카드 관리에 등록된 카드에서 골라 카드명/카드번호/
                        소지자를 그대로 연동해 채운다 - 직접 타이핑하지 않아도 되고, 두 화면의
                        카드 정보가 서로 어긋나지 않게 해준다. */}
                        {knownCorpCards.length > 0 && (
                          <select
                            value=""
                            onChange={(e) => {
                              const picked = knownCorpCards.find((k) => k.key === e.target.value);
                              if (picked) updateCardField(c.id, { cardName: picked.cardCompany, cardNumber: picked.cardNumber, holder: picked.user });
                            }}
                            className="w-full bg-indigo-50 border border-indigo-200 rounded-lg px-2 py-1.5 text-[11px] font-bold text-indigo-700 outline-none focus:border-indigo-500"
                          >
                            <option value="">법인카드 관리에서 카드 불러오기...</option>
                            {knownCorpCards.map((k) => (
                              <option key={k.key} value={k.key}>{k.cardCompany}{k.cardNumber ? ` (${k.cardNumber})` : ''}{k.user ? ` - ${k.user}` : ''}</option>
                            ))}
                          </select>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                          <input
                            type="text"
                            value={c.cardName}
                            onChange={(e) => updateCardField(c.id, { cardName: e.target.value })}
                            placeholder="카드명 (예: 국민카드)"
                            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            value={c.cardNumber || ''}
                            onChange={(e) => updateCardField(c.id, { cardNumber: formatCardNumber(e.target.value) })}
                            placeholder="카드번호 (0000-0000-0000-0000)"
                            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                          />
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={c.holder}
                              onChange={(e) => updateCardField(c.id, { holder: e.target.value })}
                              placeholder="소지자"
                              className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                            />
                            {(editingDoc.cardUsage?.cards.length || 0) > 1 && (
                              <button type="button" onClick={() => removeCard(c.id)} className="p-1.5 text-slate-400 hover:text-rose-500 shrink-0">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          {c.entries.map((e) => (
                            <div key={e.id} className="space-y-0.5">
                              {e.sourceLabel && (
                                <span className="inline-flex items-center gap-1 text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                                  <RefreshCw className="w-2.5 h-2.5" /> {e.sourceLabel}에서 자동으로 가져옴
                                </span>
                              )}
                              {/* [수정] grid-cols-12를 flex-wrap으로 바꿔서, 폰처럼 화면이
                              좁으면 자연스럽게 여러 줄로 줄바꿈되고 글자가 안 겹치게 한다. */}
                              <div className="flex flex-wrap items-center gap-1">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={e.amount ? formatCurrencyInput(e.amount) : ''}
                                onChange={(ev) => updateCardEntry(c.id, e.id, { amount: parseCurrencyInput(ev.target.value) })}
                                placeholder="사용금액"
                                className="flex-1 min-w-[90px] bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-right text-slate-700 outline-none focus:border-indigo-500"
                              />
                              <input
                                type="date"
                                value={e.date}
                                onChange={(ev) => updateCardEntry(c.id, e.id, { date: ev.target.value })}
                                className="flex-1 min-w-[130px] bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-indigo-500"
                              />
                              <input
                                type="text"
                                value={e.project || ''}
                                onChange={(ev) => updateCardEntry(c.id, e.id, { project: ev.target.value })}
                                placeholder="프로젝트명"
                                className="flex-1 min-w-[90px] bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-indigo-500"
                              />
                              <input
                                type="text"
                                value={e.user || ''}
                                onChange={(ev) => updateCardEntry(c.id, e.id, { user: ev.target.value })}
                                placeholder="사용자"
                                className="flex-1 min-w-[80px] bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-indigo-500"
                              />
                              <input
                                type="text"
                                value={e.note || ''}
                                onChange={(ev) => updateCardEntry(c.id, e.id, { note: ev.target.value })}
                                placeholder="비고"
                                className="flex-[2] min-w-[110px] bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-indigo-500"
                              />
                              <button type="button" onClick={() => removeCardEntry(c.id, e.id)} className="shrink-0 p-1 text-slate-400 hover:text-rose-500">
                                <X className="w-3.5 h-3.5" />
                              </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <button type="button" onClick={() => addCardEntry(c.id)} className="text-[11px] text-indigo-600 font-bold flex items-center gap-0.5">
                            <Plus className="w-3 h-3" /> 사용내역 추가
                          </button>
                          <p className="text-[11px] text-slate-500">소계: <b className="text-slate-700">{formatCurrencyInput(cardGroupTotal(c))}원</b></p>
                        </div>
                      </div>
                    ))}

                    <p className="text-right text-xs font-bold text-emerald-600 border-t border-indigo-100 pt-2">
                      총계: {formatCurrencyInput((editingDoc.cardUsage?.cards || []).reduce((s, c) => s + cardGroupTotal(c), 0))}원
                    </p>
                  </div>
                )}

                {/* [추가] 법인카드 관리(월별 요약) 전용 입력. 카드 한 장이 한 줄이고, 카드사/
                카드번호/사용자/사용일수/출금일자/금액/출금은행/출금계좌/비고를 입력한다. */}
                {activeCategory === 'corp_card' && (
                  <div className="space-y-3 border border-indigo-100 bg-indigo-50/40 rounded-xl p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">대상 연월</label>
                        <input
                          type="month"
                          value={editingDoc.corpCard?.yearMonth || ''}
                          onChange={(e) => setEditingDoc({ ...editingDoc, corpCard: { ...(editingDoc.corpCard || { cards: [] }), yearMonth: e.target.value } })}
                          className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <button type="button" onClick={addCorpCard} className="text-[11px] text-indigo-600 font-bold flex items-center gap-0.5">
                        <Plus className="w-3 h-3" /> 카드 추가
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400">※ 회계관리 &gt; 카드사용내역과 대조할 때는 "대상 연월과 같은 달" 사용분 합계를 기준으로 비교합니다.</p>

                    {(editingDoc.corpCard?.cards || []).map((c) => (
                      <div key={c.id} className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-1.5">
                        {/* [수정] 세 입력칸을 flex-1로만 나열하면(카드번호처럼 긴 값이 들어있을 때)
                        input의 기본 최소 폭 때문에 줄어들지 못하고 셋을 합친 폭이 모달 폭을
                        넘어가 "사용자" 칸이 화면 밖으로 삐져나오는 문제가 있었다. 카드사용내역의
                        카드명/카드번호/소지자와 같은 grid-cols-3(모바일 1열) 패턴으로 맞춘다. */}
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-1.5">
                          <input
                            type="text"
                            value={c.cardCompany}
                            onChange={(e) => updateCorpCard(c.id, { cardCompany: e.target.value })}
                            placeholder="카드사 (예: 국민카드)"
                            className="min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            value={c.cardNumber}
                            onChange={(e) => updateCorpCard(c.id, { cardNumber: formatCardNumber(e.target.value) })}
                            placeholder="카드번호 (0000-0000-0000-0000)"
                            className="min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                          />
                          {/* [추가] 카드 유효기간(MM/YY). 숫자만 입력받아 "00/00" 형태로 자동으로
                          슬래시를 넣어준다. */}
                          <input
                            type="text"
                            inputMode="numeric"
                            value={c.expiry || ''}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
                              const formatted = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
                              updateCorpCard(c.id, { expiry: formatted });
                            }}
                            placeholder="유효기간(MM/YY)"
                            maxLength={5}
                            className="min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-center text-slate-700 outline-none focus:border-indigo-500"
                          />
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              value={c.user}
                              onChange={(e) => updateCorpCard(c.id, { user: e.target.value })}
                              placeholder="사용자"
                              className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                            />
                            {(editingDoc.corpCard?.cards.length || 0) > 1 && (
                              <button type="button" onClick={() => removeCorpCard(c.id)} className="p-1.5 text-slate-400 hover:text-rose-500 shrink-0">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                          <input
                            type="text"
                            value={c.periodLabel || ''}
                            onChange={(e) => updateCorpCard(c.id, { periodLabel: e.target.value })}
                            placeholder="사용일수 (예: 전월 01일~전월 말일)"
                            className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                          />
                          <input
                            type="text"
                            value={c.paymentDay || ''}
                            onChange={(e) => updateCorpCard(c.id, { paymentDay: e.target.value })}
                            placeholder="출금일자 (예: 15일)"
                            className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            value={c.amount ? formatCurrencyInput(c.amount) : ''}
                            onChange={(e) => updateCorpCard(c.id, { amount: parseCurrencyInput(e.target.value) })}
                            placeholder="금액"
                            className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                          />
                        </div>

                        {/* [추가] 회계관리 > 카드사용내역과 대조. 같은 카드사+카드번호로 기록된
                        카드사용내역 합계(전월 사용분 기준)를 보여주고, 지금 입력된 출금 금액과
                        일치하는지 표시한다. 다르면 카드사용내역 쪽 합계로 바로 맞출 수 있다. */}
                        {c.cardCompany && c.cardNumber && (() => {
                          const { start, end } = getTargetMonthRange(editingDoc.corpCard?.yearMonth);
                          const matched = sumCardUsageByCard(docs, c.cardCompany, c.cardNumber, start, end);
                          if (matched === 0) return null;
                          const isMatch = matched === Number(c.amount);
                          return (
                            <div className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] border ${isMatch ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-300 text-amber-700'}`}>
                              <span>
                                {isMatch ? '✓ 카드사용내역과 일치' : '⚠ 카드사용내역과 다름'} (카드사용내역 합계: {formatCurrencyInput(matched)}원)
                              </span>
                              {!isMatch && (
                                <button
                                  type="button"
                                  onClick={() => updateCorpCard(c.id, { amount: matched })}
                                  className="shrink-0 px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold"
                                >
                                  이 금액으로 맞추기
                                </button>
                              )}
                            </div>
                          );
                        })()}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          <input
                            type="text"
                            value={c.withdrawBank || ''}
                            onChange={(e) => updateCorpCard(c.id, { withdrawBank: e.target.value })}
                            placeholder="출금은행"
                            className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                          />
                          <input
                            type="text"
                            value={c.withdrawAccount || ''}
                            onChange={(e) => updateCorpCard(c.id, { withdrawAccount: e.target.value })}
                            placeholder="출금계좌"
                            className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                          />
                        </div>

                        <input
                          type="text"
                          value={c.note || ''}
                          onChange={(e) => updateCorpCard(c.id, { note: e.target.value })}
                          placeholder="비고"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600 outline-none focus:border-indigo-500"
                        />
                      </div>
                    ))}

                    <p className="text-right text-xs font-bold text-emerald-600 border-t border-indigo-100 pt-2">
                      합계: {formatCurrencyInput((editingDoc.corpCard?.cards || []).reduce((s, c) => s + (Number(c.amount) || 0), 0))}원
                    </p>
                  </div>
                )}

                {/* [추가] 가지급내역 전용 입력. 공유해주신 "2026년도 월별 가지급 내역" 양식과
                동일하게 인원(열) × 월(행)의 표로 입력받는다. 인원은 자유롭게 추가/삭제할 수
                있고, 카이저합계(그 달 전체 합)와 맨 아래 인원별/전체 합계는 자동으로 계산된다.
                전자결재 > 가지급금 정산서가 승인되면 "자동 불러오기"로 이름이 일치하는 인원의
                해당 월 칸에 자동으로 반영할 수 있다. */}
                {activeCategory === 'advance_payment' && (
                  <div className="space-y-3 border border-indigo-100 bg-indigo-50/40 rounded-xl p-3">
                    <div className="flex items-center justify-between flex-wrap gap-1.5">
                      <label className="text-[11px] font-bold text-slate-600">인원별 월별 가지급 내역</label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleOpenAdvanceImportPanel}
                          className="text-[11px] text-emerald-700 font-bold flex items-center gap-0.5 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200"
                        >
                          <RefreshCw className="w-3 h-3" /> 자동 불러오기
                        </button>
                        <button type="button" onClick={addAdvancePerson} className="text-[11px] text-indigo-600 font-bold flex items-center gap-0.5">
                          <Plus className="w-3 h-3" /> 인원 추가
                        </button>
                        <button type="button" onClick={addAdvanceMonth} className="text-[11px] text-indigo-600 font-bold flex items-center gap-0.5">
                          <Plus className="w-3 h-3" /> 월 추가
                        </button>
                      </div>
                    </div>

                    {/* [추가] 전자결재 > 가지급금 정산서 중 승인된 건의 정산 내역을 모아 보여주고,
                    고른 것만 이름이 일치하는 인원의 해당 월 칸으로 자동 반영한다. */}
                    {showAdvanceImportPanel && (
                      <div className="bg-white border border-emerald-200 rounded-lg p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-emerald-700">전자결재 가지급금 정산서(승인) 불러오기</span>
                          <button type="button" onClick={() => setShowAdvanceImportPanel(false)} className="text-slate-400 hover:text-slate-600">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400">이름이 일치하는 인원 열이 없으면 새로 만들고, 해당 월 행이 없으면 새로 만들어서 채웁니다.</p>

                        {isLoadingAdvanceCandidates ? (
                          <p className="text-[11px] text-slate-400 text-center py-3">불러오는 중...</p>
                        ) : (
                          <>
                            {(() => {
                              const available = advanceImportCandidates.filter((c) => !alreadyImportedAdvanceKeys.has(c.sourceKey));
                              if (available.length === 0) {
                                return <p className="text-[11px] text-slate-400 text-center py-3">새로 가져올 승인된 가지급금 정산서 내역이 없습니다.</p>;
                              }
                              return (
                                <div className="space-y-1">
                                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 border-b border-slate-100 pb-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={available.every((c) => selectedAdvanceImportKeys.has(c.sourceKey))}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedAdvanceImportKeys(new Set(available.map((c) => c.sourceKey)));
                                        } else {
                                          setSelectedAdvanceImportKeys(new Set());
                                        }
                                      }}
                                      className="w-3.5 h-3.5"
                                    />
                                    전체 선택 ({available.length}건)
                                  </label>
                                  <div className="max-h-56 overflow-y-auto space-y-1">
                                    {available.map((c) => (
                                      <label key={c.sourceKey} className="flex items-start gap-1.5 text-[11px] text-slate-600 hover:bg-slate-50 rounded-lg px-1.5 py-1 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={selectedAdvanceImportKeys.has(c.sourceKey)}
                                          onChange={() => toggleAdvanceImportKey(c.sourceKey)}
                                          className="w-3.5 h-3.5 mt-0.5"
                                        />
                                        <span className="flex-1">
                                          <span className="font-bold text-slate-700">{c.personName || '(이름 없음)'}</span>
                                          <span className="text-slate-400 mx-1">·</span>
                                          <span className="font-bold text-slate-700">{formatCurrencyInput(c.amount)}원</span>
                                          <span className="text-slate-400 mx-1">·</span>
                                          <span>{c.date}</span>
                                          {c.project && <span className="text-slate-400"> · {c.project}</span>}
                                          {c.memo && <span className="text-slate-400"> · {c.memo}</span>}
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                            <button
                              type="button"
                              onClick={handleImportAdvanceSelected}
                              disabled={selectedAdvanceImportKeys.size === 0}
                              className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold disabled:opacity-40"
                            >
                              선택한 {selectedAdvanceImportKeys.size}건 가져오기
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* [수정] 예전엔 표(table) 형태였는데, 인원이 여러 명이면 화면(특히 폰/좁은
                    창)에서 열이 넘쳐서 항목끼리 겹쳐 보이는 문제가 있었다. 인원 이름은 위에서
                    따로 관리하고, 달마다 카드 하나로 나눠서 그 안에 인원별 금액 입력칸을
                    grid로 자연스럽게 줄바꿈되게 배치하면 화면 폭에 상관없이 안 겹친다. */}
                    <div className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-1.5">
                      <label className="block text-[10px] font-bold text-slate-500">인원 (이 표의 열)</label>
                      <div className="flex flex-wrap gap-1.5">
                        {(editingDoc.advancePayment?.people || []).map((p) => (
                          <div key={p.id} className="flex items-center gap-0.5 bg-slate-50 border border-slate-200 rounded-lg pl-2 pr-0.5 py-0.5">
                            <input
                              type="text"
                              value={p.name}
                              onChange={(e) => updateAdvancePersonName(p.id, e.target.value)}
                              placeholder="이름"
                              className="w-20 bg-transparent text-[11px] font-bold text-slate-700 outline-none"
                            />
                            {(editingDoc.advancePayment?.people.length || 0) > 1 && (
                              <button type="button" onClick={() => removeAdvancePerson(p.id)} className="shrink-0 p-1 text-slate-400 hover:text-rose-500">
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      {(editingDoc.advancePayment?.months || []).map((m) => (
                        <div key={m.id} className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-2">
                          <div className="flex flex-wrap items-center gap-1">
                            <input
                              type="text"
                              value={m.label}
                              onChange={(e) => updateAdvanceMonthField(m.id, { label: e.target.value })}
                              placeholder="구분 (예: 01월)"
                              className="w-24 shrink-0 bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] font-bold text-slate-700 outline-none focus:border-indigo-500"
                            />
                            <input
                              type="text"
                              value={m.depositDate || ''}
                              onChange={(e) => updateAdvanceMonthField(m.id, { depositDate: e.target.value })}
                              placeholder="입금일 (예: 2026,03,06)"
                              className="flex-1 min-w-[110px] bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-indigo-500"
                            />
                            <input
                              type="text"
                              value={m.note || ''}
                              onChange={(e) => updateAdvanceMonthField(m.id, { note: e.target.value })}
                              placeholder="비고"
                              className="flex-[2] min-w-[120px] bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-indigo-500"
                            />
                            <button type="button" onClick={() => removeAdvanceMonth(m.id)} className="shrink-0 p-1 text-slate-400 hover:text-rose-500">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))' }}>
                            {(editingDoc.advancePayment?.people || []).map((p) => {
                              const cell = m.amounts[p.id];
                              const importedSum = cell ? cell.imported.reduce((s, it) => s + (Number(it.amount) || 0), 0) : 0;
                              return (
                                <div key={p.id}>
                                  <label className="block text-[9px] text-slate-400 truncate mb-0.5">{p.name || '(이름 미입력)'}</label>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={cell?.manual ? formatCurrencyInput(cell.manual) : ''}
                                    onChange={(e) => updateAdvanceCellManual(m.id, p.id, parseCurrencyInput(e.target.value))}
                                    placeholder="0"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-right text-slate-700 outline-none focus:border-indigo-500"
                                  />
                                  {importedSum > 0 && (
                                    <p className="text-[9px] text-emerald-600 mt-0.5 text-right">+{formatCurrencyInput(importedSum)} 자동반영</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          <p className="text-right text-[11px] font-bold text-slate-700 border-t border-slate-100 pt-1.5">
                            카이저합계: {formatCurrencyInput(advanceMonthTotal(m, editingDoc.advancePayment?.people || []))}원
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-indigo-100 pt-2 space-y-1">
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                        {(editingDoc.advancePayment?.people || []).map((p) => (
                          <span key={p.id}>{p.name || '(이름 미입력)'}: <b className="text-slate-700">{formatCurrencyInput(advancePersonTotal(p.id, editingDoc.advancePayment?.months || []))}원</b></span>
                        ))}
                      </div>
                      <p className="text-right text-xs font-bold text-emerald-600">
                        전체 합계: {formatCurrencyInput(advanceGrandTotal(editingDoc.advancePayment))}원
                      </p>
                    </div>
                  </div>
                )}

                {/* [추가] 차량 과태료 내역 전용 입력. 건별로 여러 줄 입력하는 단순한 표
                (일자/차량/위반내용/금액/납부여부/비고). */}
                {activeCategory === 'vehicle_fine' && (
                  <div className="space-y-2.5 border border-indigo-100 bg-indigo-50/40 rounded-xl p-3">
                    <div className="flex items-center justify-between flex-wrap gap-1.5">
                      <label className="text-[11px] font-bold text-slate-600">차량 과태료 내역</label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleOpenVehicleFineImportPanel}
                          className="text-[11px] text-emerald-700 font-bold flex items-center gap-0.5 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200"
                        >
                          <RefreshCw className="w-3 h-3" /> 자동 불러오기
                        </button>
                        <button type="button" onClick={addVehicleFineEntry} className="text-[11px] text-indigo-600 font-bold flex items-center gap-0.5">
                          <Plus className="w-3 h-3" /> 항목 추가
                        </button>
                      </div>
                    </div>

                    {/* [추가] 통장 출금 내역에 이미 등록된 거래 중 실제 과태료인 건만 골라서
                    가져온다. 출금 내역엔 과태료 여부 표시가 없어 전부 후보로 보여준다. */}
                    {showVehicleFineImportPanel && (
                      <div className="bg-white border border-emerald-200 rounded-lg p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-emerald-700">통장 출금 내역에서 과태료 불러오기</span>
                          <button type="button" onClick={() => setShowVehicleFineImportPanel(false)} className="text-slate-400 hover:text-slate-600">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400">차량번호는 출금 내역에 없어 비어있는 채로 가져옵니다 - 가져온 뒤 직접 입력해주세요.</p>

                        {isLoadingVehicleFineCandidates ? (
                          <p className="text-[11px] text-slate-400 text-center py-3">불러오는 중...</p>
                        ) : (
                          <>
                            {(() => {
                              const available = vehicleFineImportCandidates.filter((c) => !alreadyImportedVehicleFineKeys.has(c.sourceKey));
                              if (available.length === 0) {
                                return <p className="text-[11px] text-slate-400 text-center py-3">새로 가져올 통장 출금 내역이 없습니다.</p>;
                              }
                              return (
                                <div className="space-y-1">
                                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 border-b border-slate-100 pb-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={available.every((c) => selectedVehicleFineImportKeys.has(c.sourceKey))}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedVehicleFineImportKeys(new Set(available.map((c) => c.sourceKey)));
                                        } else {
                                          setSelectedVehicleFineImportKeys(new Set());
                                        }
                                      }}
                                      className="w-3.5 h-3.5"
                                    />
                                    전체 선택 ({available.length}건)
                                  </label>
                                  <div className="max-h-56 overflow-y-auto space-y-1">
                                    {available.map((c) => (
                                      <label key={c.sourceKey} className="flex items-start gap-1.5 text-[11px] text-slate-600 hover:bg-slate-50 rounded-lg px-1.5 py-1 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={selectedVehicleFineImportKeys.has(c.sourceKey)}
                                          onChange={() => toggleVehicleFineImportKey(c.sourceKey)}
                                          className="w-3.5 h-3.5 mt-0.5"
                                        />
                                        <span className="flex-1">
                                          <span className="font-bold text-slate-700">{formatCurrencyInput(c.amount)}원</span>
                                          <span className="text-slate-400 mx-1">·</span>
                                          <span>{c.date}</span>
                                          {c.memo && <span className="text-slate-400"> · {c.memo}</span>}
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                            <button
                              type="button"
                              onClick={handleImportVehicleFineSelected}
                              disabled={selectedVehicleFineImportKeys.size === 0}
                              className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold disabled:opacity-40"
                            >
                              선택한 {selectedVehicleFineImportKeys.size}건 가져오기
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    <div className="space-y-1.5">
                      {(editingDoc.vehicleFine?.entries || []).map((e) => (
                        <div key={e.id} className="bg-white border border-slate-200 rounded-lg p-2 space-y-1">
                          {e.sourceLabel && (
                            <span className="inline-flex items-center gap-1 text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                              <RefreshCw className="w-2.5 h-2.5" /> {e.sourceLabel}에서 자동으로 가져옴
                            </span>
                          )}
                          <div className="flex flex-wrap items-center gap-1">
                            <div className="flex-1 min-w-[120px]">
                              <label className="block text-[9px] text-slate-400 mb-0.5">위반일자</label>
                              <input
                                type="date"
                                value={e.date}
                                onChange={(ev) => updateVehicleFineEntry(e.id, { date: ev.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-indigo-500"
                              />
                            </div>
                            <div className="flex-1 min-w-[100px]">
                              <label className="block text-[9px] text-slate-400 mb-0.5">위반차량</label>
                              {/* [수정] 통합 차량관리에 등록된 차량을 눈에 보이는 드롭다운으로 골라
                              쓸 수 있게 한다. 등록 안 된 차량(예: 렌터카)은 그대로 직접 입력 가능. */}
                              <VehicleSearchInput
                                vehicles={vehicles}
                                value={e.vehicle}
                                onChange={(v) => updateVehicleFineEntry(e.id, { vehicle: v })}
                                placeholder="예: 벤츠(8030)"
                              />
                            </div>
                            <div className="flex-1 min-w-[90px]">
                              <label className="block text-[9px] text-slate-400 mb-0.5">금액</label>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={e.amount ? formatCurrencyInput(e.amount) : ''}
                                onChange={(ev) => updateVehicleFineEntry(e.id, { amount: parseCurrencyInput(ev.target.value) })}
                                placeholder="금액"
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-right text-slate-700 outline-none focus:border-indigo-500"
                              />
                            </div>
                            <div className="flex-1 min-w-[120px]">
                              <label className="block text-[9px] text-slate-400 mb-0.5">처리일자</label>
                              <input
                                type="date"
                                value={e.processedDate || ''}
                                onChange={(ev) => updateVehicleFineEntry(e.id, { processedDate: ev.target.value })}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-indigo-500"
                              />
                            </div>
                            <button type="button" onClick={() => removeVehicleFineEntry(e.id)} className="shrink-0 self-end p-1.5 text-slate-400 hover:text-rose-500">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            {/* [수정] 자주 쓰는 위반 항목을 목록에서 고르거나 직접 입력할 수 있게
                            하고, 직접 입력한 값은 저장된 다른 문서에서 모아 다음부터 목록에
                            나타난다(vehicleFineDetailOptions). */}
                            <SuggestTextInput
                              options={vehicleFineDetailOptions}
                              value={e.detail}
                              onChange={(v) => updateVehicleFineEntry(e.id, { detail: v })}
                              placeholder="내용 (위반 상세)"
                              className="flex-[2] min-w-[140px]"
                            />
                            <input
                              type="text"
                              value={e.note || ''}
                              onChange={(ev) => updateVehicleFineEntry(e.id, { note: ev.target.value })}
                              placeholder="비고 (담당자 등)"
                              className="flex-1 min-w-[100px] bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="text-right text-xs font-bold text-emerald-600 border-t border-indigo-100 pt-2">
                      합계: {formatCurrencyInput((editingDoc.vehicleFine?.entries || []).reduce((s, e) => s + (Number(e.amount) || 0), 0))}원
                    </p>
                  </div>
                )}

                {/* [추가] 각종 세금 전용 입력. 건별로 여러 줄 입력하는 단순한 표
                (세목/귀속기간/신고기한/납부일/금액/납부여부/비고). */}
                {/* [수정] 공유해주신 "2026년 각종 세금 내역" 양식과 동일하게 내역/결재일자/
                금액/비고로 단순화. 결재일자는 "없음.", "2026.04.24완료"처럼 날짜가 아닌
                텍스트가 섞이는 실제 사용 패턴 때문에 날짜 선택기 대신 자유 텍스트로 둔다. */}
                {activeCategory === 'tax' && (
                  <div className="space-y-2.5 border border-indigo-100 bg-indigo-50/40 rounded-xl p-3">
                    <div className="flex items-center justify-between flex-wrap gap-1.5">
                      <label className="text-[11px] font-bold text-slate-600">각종 세금 내역</label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleOpenTaxImportPanel}
                          className="text-[11px] text-emerald-700 font-bold flex items-center gap-0.5 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200"
                        >
                          <RefreshCw className="w-3 h-3" /> 자동 불러오기
                        </button>
                        <button type="button" onClick={addTaxEntry} className="text-[11px] text-indigo-600 font-bold flex items-center gap-0.5">
                          <Plus className="w-3 h-3" /> 항목 추가
                        </button>
                      </div>
                    </div>

                    {/* [추가] 통장 출금 내역에 이미 등록된 거래 중 실제 세금 납부 건만 골라서
                    가져온다. 출금 내역엔 세금 여부 표시가 없어 전부 후보로 보여준다. */}
                    {showTaxImportPanel && (
                      <div className="bg-white border border-emerald-200 rounded-lg p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-emerald-700">통장 출금 내역에서 세금 불러오기</span>
                          <button type="button" onClick={() => setShowTaxImportPanel(false)} className="text-slate-400 hover:text-slate-600">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {isLoadingTaxCandidates ? (
                          <p className="text-[11px] text-slate-400 text-center py-3">불러오는 중...</p>
                        ) : (
                          <>
                            {(() => {
                              const available = taxImportCandidates.filter((c) => !alreadyImportedTaxKeys.has(c.sourceKey));
                              if (available.length === 0) {
                                return <p className="text-[11px] text-slate-400 text-center py-3">새로 가져올 통장 출금 내역이 없습니다.</p>;
                              }
                              return (
                                <div className="space-y-1">
                                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 border-b border-slate-100 pb-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={available.every((c) => selectedTaxImportKeys.has(c.sourceKey))}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedTaxImportKeys(new Set(available.map((c) => c.sourceKey)));
                                        } else {
                                          setSelectedTaxImportKeys(new Set());
                                        }
                                      }}
                                      className="w-3.5 h-3.5"
                                    />
                                    전체 선택 ({available.length}건)
                                  </label>
                                  <div className="max-h-56 overflow-y-auto space-y-1">
                                    {available.map((c) => (
                                      <label key={c.sourceKey} className="flex items-start gap-1.5 text-[11px] text-slate-600 hover:bg-slate-50 rounded-lg px-1.5 py-1 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={selectedTaxImportKeys.has(c.sourceKey)}
                                          onChange={() => toggleTaxImportKey(c.sourceKey)}
                                          className="w-3.5 h-3.5 mt-0.5"
                                        />
                                        <span className="flex-1">
                                          <span className="font-bold text-slate-700">{formatCurrencyInput(c.amount)}원</span>
                                          <span className="text-slate-400 mx-1">·</span>
                                          <span>{c.date}</span>
                                          {c.memo && <span className="text-slate-400"> · {c.memo}</span>}
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                            <button
                              type="button"
                              onClick={handleImportTaxSelected}
                              disabled={selectedTaxImportKeys.size === 0}
                              className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold disabled:opacity-40"
                            >
                              선택한 {selectedTaxImportKeys.size}건 가져오기
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    <div className="space-y-1.5">
                      {(editingDoc.taxPayment?.entries || []).map((e) => (
                        <div key={e.id} className="bg-white border border-slate-200 rounded-lg p-2 space-y-1">
                          {e.sourceLabel && (
                            <span className="inline-flex items-center gap-1 text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                              <RefreshCw className="w-2.5 h-2.5" /> {e.sourceLabel}에서 자동으로 가져옴
                            </span>
                          )}
                          <div className="flex flex-wrap items-center gap-1">
                            <input
                              type="text"
                              value={e.description}
                              onChange={(ev) => updateTaxEntry(e.id, { description: ev.target.value })}
                              placeholder="내역 (예: 부가가치세(26년1기분))"
                              className="flex-[2] min-w-[140px] bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] font-bold text-slate-700 outline-none focus:border-indigo-500"
                            />
                            <input
                              type="text"
                              value={e.paidDate || ''}
                              onChange={(ev) => updateTaxEntry(e.id, { paidDate: ev.target.value })}
                              placeholder="결재일자 (예: 2026.01.12)"
                              className="flex-1 min-w-[120px] bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-indigo-500"
                            />
                            <input
                              type="text"
                              inputMode="numeric"
                              value={e.amount ? formatCurrencyInput(e.amount) : ''}
                              onChange={(ev) => updateTaxEntry(e.id, { amount: parseCurrencyInput(ev.target.value) })}
                              placeholder="금액"
                              className="flex-1 min-w-[90px] bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-right text-slate-700 outline-none focus:border-indigo-500"
                            />
                            <input
                              type="text"
                              value={e.note || ''}
                              onChange={(ev) => updateTaxEntry(e.id, { note: ev.target.value })}
                              placeholder="비고 (예: 완료)"
                              className="flex-1 min-w-[90px] bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-indigo-500"
                            />
                            <button type="button" onClick={() => removeTaxEntry(e.id)} className="shrink-0 p-1 text-slate-400 hover:text-rose-500">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="text-right text-xs font-bold text-emerald-600 border-t border-indigo-100 pt-2">
                      합계: {formatCurrencyInput((editingDoc.taxPayment?.entries || []).reduce((s, e) => s + (Number(e.amount) || 0), 0))}원
                    </p>
                  </div>
                )}

                {/* [추가] 관리비내역 전용 입력. 가지급내역과 완전히 같은 구조(호실(열) × 월(행)
                표)를 그대로 쓴다. 관리비는 통장에서 보통 한 번에 통합 출금되므로, "자동
                불러오기"는 이름 자동 매칭 대신 사람이 먼저 대상 호실을 고르는 방식이다. */}
                {activeCategory === 'management_fee' && (
                  <div className="space-y-3 border border-indigo-100 bg-indigo-50/40 rounded-xl p-3">
                    <div className="flex items-center justify-between flex-wrap gap-1.5">
                      <label className="text-[11px] font-bold text-slate-600">호실별 월별 관리비내역</label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={handleOpenManagementImportPanel}
                          className="text-[11px] text-emerald-700 font-bold flex items-center gap-0.5 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200"
                        >
                          <RefreshCw className="w-3 h-3" /> 자동 불러오기
                        </button>
                        <button type="button" onClick={addManagementUnit} className="text-[11px] text-indigo-600 font-bold flex items-center gap-0.5">
                          <Plus className="w-3 h-3" /> 호실 추가
                        </button>
                        <button type="button" onClick={addManagementMonth} className="text-[11px] text-indigo-600 font-bold flex items-center gap-0.5">
                          <Plus className="w-3 h-3" /> 월 추가
                        </button>
                      </div>
                    </div>

                    {showManagementImportPanel && (
                      <div className="bg-white border border-emerald-200 rounded-lg p-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-emerald-700">통장 출금 내역에서 관리비 불러오기</span>
                          <button type="button" onClick={() => setShowManagementImportPanel(false)} className="text-slate-400 hover:text-slate-600">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-400 mb-0.5">가져올 대상 호실</label>
                          <select
                            value={managementImportTargetUnitId}
                            onChange={(e) => setManagementImportTargetUnitId(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                          >
                            {(editingDoc.managementFee?.units || []).map((u) => (
                              <option key={u.id} value={u.id}>{u.name || '(호실명 미입력)'}</option>
                            ))}
                          </select>
                        </div>

                        {isLoadingManagementCandidates ? (
                          <p className="text-[11px] text-slate-400 text-center py-3">불러오는 중...</p>
                        ) : (
                          <>
                            {(() => {
                              const available = managementImportCandidates.filter((c) => !alreadyImportedManagementKeys.has(c.sourceKey));
                              if (available.length === 0) {
                                return <p className="text-[11px] text-slate-400 text-center py-3">새로 가져올 통장 출금 내역이 없습니다.</p>;
                              }
                              return (
                                <div className="space-y-1">
                                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 border-b border-slate-100 pb-1.5 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={available.every((c) => selectedManagementImportKeys.has(c.sourceKey))}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedManagementImportKeys(new Set(available.map((c) => c.sourceKey)));
                                        } else {
                                          setSelectedManagementImportKeys(new Set());
                                        }
                                      }}
                                      className="w-3.5 h-3.5"
                                    />
                                    전체 선택 ({available.length}건)
                                  </label>
                                  <div className="max-h-56 overflow-y-auto space-y-1">
                                    {available.map((c) => (
                                      <label key={c.sourceKey} className="flex items-start gap-1.5 text-[11px] text-slate-600 hover:bg-slate-50 rounded-lg px-1.5 py-1 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={selectedManagementImportKeys.has(c.sourceKey)}
                                          onChange={() => toggleManagementImportKey(c.sourceKey)}
                                          className="w-3.5 h-3.5 mt-0.5"
                                        />
                                        <span className="flex-1">
                                          <span className="font-bold text-slate-700">{formatCurrencyInput(c.amount)}원</span>
                                          <span className="text-slate-400 mx-1">·</span>
                                          <span>{c.date}</span>
                                          {c.memo && <span className="text-slate-400"> · {c.memo}</span>}
                                        </span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                            <button
                              type="button"
                              onClick={handleImportManagementSelected}
                              disabled={selectedManagementImportKeys.size === 0 || !managementImportTargetUnitId}
                              className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold disabled:opacity-40"
                            >
                              선택한 {selectedManagementImportKeys.size}건 가져오기
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    <div className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-1.5">
                      <label className="block text-[10px] font-bold text-slate-500">호실 (이 표의 열)</label>
                      <div className="flex flex-wrap gap-1.5">
                        {(editingDoc.managementFee?.units || []).map((u) => (
                          <div key={u.id} className="flex items-center gap-0.5 bg-slate-50 border border-slate-200 rounded-lg pl-2 pr-0.5 py-0.5">
                            <input
                              type="text"
                              value={u.name}
                              onChange={(e) => updateManagementUnitName(u.id, e.target.value)}
                              placeholder="예: 518호"
                              className="w-20 bg-transparent text-[11px] font-bold text-slate-700 outline-none"
                            />
                            {(editingDoc.managementFee?.units.length || 0) > 1 && (
                              <button type="button" onClick={() => removeManagementUnit(u.id)} className="shrink-0 p-1 text-slate-400 hover:text-rose-500">
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      {(editingDoc.managementFee?.months || []).map((m) => (
                        <div key={m.id} className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-2">
                          <div className="flex flex-wrap items-center gap-1">
                            <input
                              type="text"
                              value={m.label}
                              onChange={(e) => updateManagementMonthField(m.id, { label: e.target.value })}
                              placeholder="구분 (예: 01월)"
                              className="w-24 shrink-0 bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] font-bold text-slate-700 outline-none focus:border-indigo-500"
                            />
                            <input
                              type="text"
                              value={m.paymentDate || ''}
                              onChange={(e) => updateManagementMonthField(m.id, { paymentDate: e.target.value })}
                              placeholder="납부일 (예: 03월 03일)"
                              className="flex-1 min-w-[110px] bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-indigo-500"
                            />
                            <input
                              type="text"
                              value={m.note || ''}
                              onChange={(e) => updateManagementMonthField(m.id, { note: e.target.value })}
                              placeholder="비고"
                              className="flex-[2] min-w-[120px] bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-slate-700 outline-none focus:border-indigo-500"
                            />
                            <button type="button" onClick={() => removeManagementMonth(m.id)} className="shrink-0 p-1 text-slate-400 hover:text-rose-500">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))' }}>
                            {(editingDoc.managementFee?.units || []).map((u) => {
                              const cell = m.amounts[u.id];
                              const importedSum = cell ? cell.imported.reduce((s, it) => s + (Number(it.amount) || 0), 0) : 0;
                              return (
                                <div key={u.id}>
                                  <label className="block text-[9px] text-slate-400 truncate mb-0.5">{u.name || '(호실명 미입력)'}</label>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={cell?.manual ? formatCurrencyInput(cell.manual) : ''}
                                    onChange={(e) => updateManagementCellManual(m.id, u.id, parseCurrencyInput(e.target.value))}
                                    placeholder="0"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1.5 text-[11px] text-right text-slate-700 outline-none focus:border-indigo-500"
                                  />
                                  {importedSum > 0 && (
                                    <p className="text-[9px] text-emerald-600 mt-0.5 text-right">+{formatCurrencyInput(importedSum)} 자동반영</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          <p className="text-right text-[11px] font-bold text-slate-700 border-t border-slate-100 pt-1.5">
                            합계: {formatCurrencyInput(managementMonthTotal(m, editingDoc.managementFee?.units || []))}원
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="border-t border-indigo-100 pt-2 space-y-1">
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                        {(editingDoc.managementFee?.units || []).map((u) => (
                          <span key={u.id}>{u.name || '(호실명 미입력)'}: <b className="text-slate-700">{formatCurrencyInput(managementUnitTotal(u.id, editingDoc.managementFee?.months || []))}원</b></span>
                        ))}
                      </div>
                      <p className="text-right text-xs font-bold text-emerald-600">
                        전체 합계: {formatCurrencyInput(managementGrandTotal(editingDoc.managementFee))}원
                      </p>
                    </div>
                  </div>
                )}

                {/* [추가] 근로계약서 전용 입력. 근로자 정보 + 급여 구성만 채우면, 근로시간/
                연차/퇴직/기밀유지 등 고정 조항은 인쇄할 때 자동으로 다 채워져서 나온다. */}
                {(activeCategory === 'labor_contract' || activeCategory === 'salary_agreement') && (
                  <div className="space-y-3 border border-indigo-100 bg-indigo-50/40 rounded-xl p-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">회사 정보 (사업체명·대표·사업자등록번호는 로그인 계정에서 자동 입력됨 / 사업종류·주소는 한 번 입력해두면 다음부터 자동으로 채워집니다)</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        <input
                          type="text"
                          value={editingDoc.laborContract?.companyBusinessType || ''}
                          onChange={(e) => updateLaborContractField({ companyBusinessType: e.target.value })}
                          onBlur={(e) => persistCompanySettings({ businessType: e.target.value })}
                          placeholder="사업 종류 (예: 제조업)"
                          className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                        />
                        <input
                          type="text"
                          value={editingDoc.laborContract?.companyAddress || ''}
                          onChange={(e) => updateLaborContractField({ companyAddress: e.target.value })}
                          onBlur={(e) => persistCompanySettings({ address: e.target.value })}
                          placeholder="사업체 주소"
                          className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        value={editingDoc.laborContract?.employeeName || ''}
                        onChange={(e) => updateLaborContractField({ employeeName: e.target.value })}
                        placeholder="근로자 성명"
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                      <input
                        type="date"
                        value={editingDoc.laborContract?.employeeBirthDate || ''}
                        onChange={(e) => updateLaborContractField({ employeeBirthDate: e.target.value })}
                        placeholder="생년월일"
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <input
                      type="text"
                      value={editingDoc.laborContract?.employeeAddress || ''}
                      onChange={(e) => updateLaborContractField({ employeeAddress: e.target.value })}
                      placeholder="근로자 주소"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                    />

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">고용형태</label>
                      <div className="flex gap-1.5">
                        {([['regular', '정규직'], ['contract', '계약직'], ['intern', '인턴']] as const).map(([val, label]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => updateLaborContractField({ employmentType: val })}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                              editingDoc.laborContract?.employmentType === val
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-slate-500 border-slate-200'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-bold text-slate-600">급여 구성 (월)</label>
                        <button type="button" onClick={addSalaryItem} className="text-[11px] text-indigo-600 font-bold flex items-center gap-0.5">
                          <Plus className="w-3 h-3" /> 항목 추가
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {(editingDoc.laborContract?.salaryItems || []).map((it) => (
                          <div key={it.id} className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={it.label}
                              onChange={(e) => updateSalaryItem(it.id, { label: e.target.value })}
                              placeholder="예: 기본급"
                              className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                            />
                            <input
                              type="text"
                              inputMode="numeric"
                              value={it.amount ? formatCurrencyInput(it.amount) : ''}
                              onChange={(e) => updateSalaryItem(it.id, { amount: parseCurrencyInput(e.target.value) })}
                              placeholder="0"
                              className="w-28 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                            />
                            <button type="button" onClick={() => removeSalaryItem(it.id)} className="p-1.5 text-slate-400 hover:text-rose-500">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="text-right text-[11px] text-slate-500 mt-1.5 space-y-0.5">
                        <p>월 급여 합계: <b className="text-slate-700">{formatCurrencyInput(sumItems(editingDoc.laborContract?.salaryItems))}원</b></p>
                        <p className="text-emerald-600 font-bold">연 총액(월×12): {formatCurrencyInput(sumItems(editingDoc.laborContract?.salaryItems) * 12)}원</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">계약 시작일</label>
                        <input
                          type="date"
                          value={editingDoc.laborContract?.contractStartDate || ''}
                          onChange={(e) => updateLaborContractField({ contractStartDate: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">계약 종료일 (기간 정함 없으면 비워둠)</label>
                        <input
                          type="date"
                          value={editingDoc.laborContract?.contractEndDate || ''}
                          onChange={(e) => updateLaborContractField({ contractEndDate: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">근무 장소</label>
                      <input
                        type="text"
                        value={editingDoc.laborContract?.workLocation || ''}
                        onChange={(e) => updateLaborContractField({ workLocation: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">담당 업무</label>
                      <input
                        type="text"
                        value={editingDoc.laborContract?.jobDuties || ''}
                        onChange={(e) => updateLaborContractField({ jobDuties: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">계약서 작성일 (서명 날짜)</label>
                      <input
                        type="date"
                        value={editingDoc.laborContract?.contractDate || ''}
                        onChange={(e) => updateLaborContractField({ contractDate: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}

                {/* [추가] 재직증명서 전용 입력. */}
                {activeCategory === 'employment_cert' && (
                  <div className="space-y-3 border border-indigo-100 bg-indigo-50/40 rounded-xl p-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">사업체 주소 (한 번 입력해두면 다음부터 자동으로 채워집니다)</label>
                      <input
                        type="text"
                        value={editingDoc.employmentCert?.companyAddress || ''}
                        onChange={(e) => updateEmploymentCertField({ companyAddress: e.target.value })}
                        onBlur={(e) => persistCompanySettings({ address: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        value={editingDoc.employmentCert?.employeeName || ''}
                        onChange={(e) => updateEmploymentCertField({ employeeName: e.target.value })}
                        placeholder="성명"
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        value={editingDoc.employmentCert?.residentNumberMasked || ''}
                        onChange={(e) => updateEmploymentCertField({ residentNumberMasked: e.target.value })}
                        placeholder="주민등록번호 (예: 000000-0******)"
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">재직자 주소</label>
                      <input
                        type="text"
                        value={editingDoc.employmentCert?.employeeAddress || ''}
                        onChange={(e) => updateEmploymentCertField({ employeeAddress: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">입사일</label>
                        <input
                          type="date"
                          value={editingDoc.employmentCert?.hireDate || ''}
                          onChange={(e) => updateEmploymentCertField({ hireDate: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">신청일</label>
                        <input
                          type="date"
                          value={editingDoc.employmentCert?.applicationDate || ''}
                          onChange={(e) => updateEmploymentCertField({ applicationDate: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        value={editingDoc.employmentCert?.purpose || ''}
                        onChange={(e) => updateEmploymentCertField({ purpose: e.target.value })}
                        placeholder="용도 (예: 제출용)"
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        value={editingDoc.employmentCert?.submitTo || ''}
                        onChange={(e) => updateEmploymentCertField({ submitTo: e.target.value })}
                        placeholder="제출처 (예: 노원구청)"
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        value={editingDoc.employmentCert?.department || ''}
                        onChange={(e) => updateEmploymentCertField({ department: e.target.value })}
                        placeholder="소속"
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        value={editingDoc.employmentCert?.position || ''}
                        onChange={(e) => updateEmploymentCertField({ position: e.target.value })}
                        placeholder="직위"
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">문서번호 (예: 제 2026-0001호)</label>
                        <input
                          type="text"
                          value={editingDoc.employmentCert?.documentNumber || ''}
                          onChange={(e) => updateEmploymentCertField({ documentNumber: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">증명 발급일</label>
                        <input
                          type="date"
                          value={editingDoc.employmentCert?.issueDate || ''}
                          onChange={(e) => updateEmploymentCertField({ issueDate: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* [추가] 위임장 전용 입력. */}
                {activeCategory === 'power_of_attorney' && (
                  <div className="space-y-3 border border-indigo-100 bg-indigo-50/40 rounded-xl p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        value={editingDoc.powerOfAttorney?.employeeName || ''}
                        onChange={(e) => updatePowerOfAttorneyField({ employeeName: e.target.value })}
                        placeholder="위임받는 사람 성명"
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        value={editingDoc.powerOfAttorney?.residentNumberMasked || ''}
                        onChange={(e) => updatePowerOfAttorneyField({ residentNumberMasked: e.target.value })}
                        placeholder="주민등록번호 (예: 000000-0******)"
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">위임받는 사람 주소</label>
                      <input
                        type="text"
                        value={editingDoc.powerOfAttorney?.employeeAddress || ''}
                        onChange={(e) => updatePowerOfAttorneyField({ employeeAddress: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        value={editingDoc.powerOfAttorney?.purpose || ''}
                        onChange={(e) => updatePowerOfAttorneyField({ purpose: e.target.value })}
                        placeholder="용도 (예: 법인지점 통장 개설)"
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        value={editingDoc.powerOfAttorney?.submitTo || ''}
                        onChange={(e) => updatePowerOfAttorneyField({ submitTo: e.target.value })}
                        placeholder="제출처 (예: 하나은행)"
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">위임 업무 내용 (예: 법인통장 개설)</label>
                      <input
                        type="text"
                        value={editingDoc.powerOfAttorney?.taskDescription || ''}
                        onChange={(e) => updatePowerOfAttorneyField({ taskDescription: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">작성일자</label>
                      <input
                        type="date"
                        value={editingDoc.powerOfAttorney?.issueDate || ''}
                        onChange={(e) => updatePowerOfAttorneyField({ issueDate: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}

                {activeCategory === 'sales_contract' && (
                  <div className="space-y-3 border border-indigo-100 bg-indigo-50/40 rounded-xl p-3">
                    <label className="block text-[11px] font-bold text-slate-600">갑 (영업 자문사) 정보</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        value={editingDoc.salesContract?.counterpartyName || ''}
                        onChange={(e) => updateSalesContractField({ counterpartyName: e.target.value })}
                        placeholder="상호"
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        value={editingDoc.salesContract?.counterpartyRepName || ''}
                        onChange={(e) => updateSalesContractField({ counterpartyRepName: e.target.value })}
                        placeholder="대표이사"
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <input
                      type="text"
                      value={editingDoc.salesContract?.counterpartyAddress || ''}
                      onChange={(e) => updateSalesContractField({ counterpartyAddress: e.target.value })}
                      placeholder="주소"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                    />
                    <input
                      type="text"
                      value={editingDoc.salesContract?.counterpartyBizNumber || ''}
                      onChange={(e) => updateSalesContractField({ counterpartyBizNumber: e.target.value })}
                      placeholder="사업자등록번호"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">계약일자</label>
                        <input
                          type="date"
                          value={editingDoc.salesContract?.contractDate || ''}
                          onChange={(e) => updateSalesContractField({ contractDate: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">계약 시작일</label>
                        <input
                          type="date"
                          value={editingDoc.salesContract?.contractStartDate || ''}
                          onChange={(e) => updateSalesContractField({ contractStartDate: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">계약 종료일</label>
                        <input
                          type="date"
                          value={editingDoc.salesContract?.contractEndDate || ''}
                          onChange={(e) => updateSalesContractField({ contractEndDate: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <label className="block text-[11px] font-bold text-slate-600 pt-1">매출액 기준 누진 수수료율</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">1구간 매출 상한(원)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={editingDoc.salesContract?.feeTier1Max ? formatCurrencyInput(editingDoc.salesContract.feeTier1Max) : ''}
                          onChange={(e) => updateSalesContractField({ feeTier1Max: parseCurrencyInput(e.target.value) })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">1구간 수수료율(%)</label>
                        <input
                          type="number"
                          value={editingDoc.salesContract?.feeTier1Rate ?? ''}
                          onChange={(e) => updateSalesContractField({ feeTier1Rate: Number(e.target.value) })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">2구간 매출 상한(원)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={editingDoc.salesContract?.feeTier2Max ? formatCurrencyInput(editingDoc.salesContract.feeTier2Max) : ''}
                          onChange={(e) => updateSalesContractField({ feeTier2Max: parseCurrencyInput(e.target.value) })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">2구간 수수료율(%)</label>
                        <input
                          type="number"
                          value={editingDoc.salesContract?.feeTier2Rate ?? ''}
                          onChange={(e) => updateSalesContractField({ feeTier2Rate: Number(e.target.value) })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">3구간(초과분) 수수료율(%)</label>
                        <input
                          type="number"
                          value={editingDoc.salesContract?.feeTier3Rate ?? ''}
                          onChange={(e) => updateSalesContractField({ feeTier3Rate: Number(e.target.value) })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">경상이익률 기준(%)</label>
                        <input
                          type="number"
                          value={editingDoc.salesContract?.lowProfitThreshold ?? ''}
                          onChange={(e) => updateSalesContractField({ lowProfitThreshold: Number(e.target.value) })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">기준 미만시 경상이익 대비(%)</label>
                        <input
                          type="number"
                          value={editingDoc.salesContract?.lowProfitRate ?? ''}
                          onChange={(e) => updateSalesContractField({ lowProfitRate: Number(e.target.value) })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">사후관리비용 한도(매출대비%)</label>
                        <input
                          type="number"
                          value={editingDoc.salesContract?.aftercareCapRate ?? ''}
                          onChange={(e) => updateSalesContractField({ aftercareCapRate: Number(e.target.value) })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">후속매출 보수인정 기간(개월)</label>
                        <input
                          type="number"
                          value={editingDoc.salesContract?.recognitionMonths ?? ''}
                          onChange={(e) => updateSalesContractField({ recognitionMonths: Number(e.target.value) })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">후속매출 누적 한도(원)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={editingDoc.salesContract?.recognitionCapAmount ? formatCurrencyInput(editingDoc.salesContract.recognitionCapAmount) : ''}
                          onChange={(e) => updateSalesContractField({ recognitionCapAmount: parseCurrencyInput(e.target.value) })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400">※ 원가계산서/손익계산서/보수율계산표/사업자등록증 등 첨부서류는 이 화면 아래 "첨부파일"에서 파일로 올려주세요 (프로젝트마다 내용이 달라 자동 생성하지 않습니다).</p>
                  </div>
                )}

                {/* [추가] 퇴직금 정산 전용 입력. */}
                {activeCategory === 'severance' && (
                  <div className="space-y-3 border border-indigo-100 bg-indigo-50/40 rounded-xl p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        value={editingDoc.severance?.employeeName || ''}
                        onChange={(e) => updateSeveranceField({ employeeName: e.target.value })}
                        placeholder="신청인(성명)"
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        value={editingDoc.severance?.residentNumberMasked || ''}
                        onChange={(e) => updateSeveranceField({ residentNumberMasked: e.target.value })}
                        placeholder="주민번호 (예: 000000-0000000)"
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">입사년월</label>
                      <input
                        type="month"
                        value={editingDoc.severance?.hireYearMonth || ''}
                        onChange={(e) => updateSeveranceField({ hireYearMonth: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">중간정산 대상기간 시작</label>
                        <input
                          type="date"
                          value={editingDoc.severance?.periodStart || ''}
                          onChange={(e) => updateSeveranceField({ periodStart: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">중간정산 대상기간 종료</label>
                        <input
                          type="date"
                          value={editingDoc.severance?.periodEnd || ''}
                          onChange={(e) => updateSeveranceField({ periodEnd: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                    <input
                      type="text"
                      value={editingDoc.severance?.reason || ''}
                      onChange={(e) => updateSeveranceField({ reason: e.target.value })}
                      placeholder="중간정산 사유 (예: 무주택자의 주택구입)"
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                    />

                    <label className="block text-[11px] font-bold text-slate-600 pt-1">정산금 내역</label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">① 회사 선지급 금액</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={editingDoc.severance?.companyAdvanceAmount ? formatCurrencyInput(editingDoc.severance.companyAdvanceAmount) : ''}
                          onChange={(e) => updateSeveranceField({ companyAdvanceAmount: parseCurrencyInput(e.target.value) })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">① 지급일</label>
                        <input
                          type="date"
                          value={editingDoc.severance?.companyAdvanceDate || ''}
                          onChange={(e) => updateSeveranceField({ companyAdvanceDate: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-400 mb-0.5">① 입금 은행</label>
                        <input
                          type="text"
                          value={editingDoc.severance?.companyAdvanceBank || ''}
                          onChange={(e) => updateSeveranceField({ companyAdvanceBank: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">② 은행 적립금(퇴직연금 등)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={editingDoc.severance?.bankAccrualAmount ? formatCurrencyInput(editingDoc.severance.bankAccrualAmount) : ''}
                        onChange={(e) => updateSeveranceField({ bankAccrualAmount: parseCurrencyInput(e.target.value) })}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-right text-slate-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                    <p className="text-right text-xs font-bold text-emerald-600 border-t border-indigo-100 pt-2">
                      ①+② 합계: {formatCurrencyInput((Number(editingDoc.severance?.companyAdvanceAmount) || 0) + (Number(editingDoc.severance?.bankAccrualAmount) || 0))}원
                      <br />
                      <span className="text-[11px] text-slate-400 font-normal">
                        ({numberToKoreanMoney((Number(editingDoc.severance?.companyAdvanceAmount) || 0) + (Number(editingDoc.severance?.bankAccrualAmount) || 0))}원)
                      </span>
                    </p>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-0.5">수령일 (서명 날짜)</label>
                      <input
                        type="date"
                        value={editingDoc.severance?.receiveDate || ''}
                        onChange={(e) => updateSeveranceField({ receiveDate: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}

                {activeConfig.showAmount && activeCategory !== 'payslip' && activeCategory !== 'monthly_cashflow' && activeCategory !== 'bank_withdrawal' && activeCategory !== 'bank_deposit' && activeCategory !== 'loan_repayment' && activeCategory !== 'card_usage' && activeCategory !== 'corp_card' && activeCategory !== 'labor_contract' && activeCategory !== 'salary_agreement' && activeCategory !== 'sales_contract' && activeCategory !== 'severance' && activeCategory !== 'advance_payment' && activeCategory !== 'vehicle_fine' && activeCategory !== 'tax' && activeCategory !== 'management_fee' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">금액</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={editingDoc.amount ? formatCurrencyInput(editingDoc.amount) : ''}
                      onChange={(e) => setEditingDoc({ ...editingDoc, amount: String(parseCurrencyInput(e.target.value)) })}
                      placeholder="예: 3,000,000"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">메모</label>
                  <textarea
                    value={editingDoc.memo || ''}
                    onChange={(e) => setEditingDoc({ ...editingDoc, memo: e.target.value })}
                    rows={3}
                    placeholder="참고사항을 자유롭게 적어주세요."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-indigo-500 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">첨부파일 (계약서, 명세서 등)</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(editingDoc.attachments || []).map((a) => (
                      <span key={a.id} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-[11px] text-indigo-700">
                        <Paperclip className="w-3 h-3" />
                        <span className="max-w-[140px] truncate">{a.name}</span>
                        <button type="button" onClick={() => removeAttachment(a.id)} className="text-indigo-400 hover:text-rose-500">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <label className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-xs text-slate-500 hover:bg-slate-100 cursor-pointer">
                    <Paperclip className="w-3.5 h-3.5" />
                    파일 선택 (PDF, 이미지 등 여러 개 가능)
                    <input type="file" multiple onChange={handleFileAttach} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setEditingDoc(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-md transition-all disabled:opacity-50"
                >
                  {isSaving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* 인쇄 전 미리보기 + 인쇄 실행 바 (화면에는 보이지만 인쇄될 때는 안 보임) */}
    {printingDoc && (
      <div className="fixed inset-0 z-50 bg-slate-900/70 overflow-y-auto py-8 print:hidden">
        <div className="max-w-3xl mx-auto flex items-center justify-end gap-2 mb-3 px-4">
          <button
            onClick={() => setPrintingDoc(null)}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold"
          >
            닫기
          </button>
          {/* [추가] "카드별 월 사용 내역"(법인카드 관리)/"차량 과태료 내역"은 화면 표
          그대로(노란 헤더/합계 행 색상 포함) 엑셀로도 받을 수 있게 버튼을 추가한다. */}
          {printingDoc.category === 'corp_card' && (
            <button
              onClick={handleExportCorpCardExcel}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-md"
            >
              <Download className="w-4 h-4" />
              엑셀 출력
            </button>
          )}
          {printingDoc.category === 'vehicle_fine' && (
            <button
              onClick={handleExportVehicleFineExcel}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-md"
            >
              <Download className="w-4 h-4" />
              엑셀 출력
            </button>
          )}
          <button
            onClick={() => {
              // [추가] 이 인쇄는 #print-root 포털 내용을 쓰므로, 인쇄할 때만 body에
              // print-portal-mode를 붙여서 #root(화면에 보이는 나머지 앱)를 감춘다.
              // 인쇄가 끝나면(취소해도) 바로 원래대로 되돌린다.
              document.body.classList.add('print-portal-mode');
              window.addEventListener('afterprint', () => document.body.classList.remove('print-portal-mode'), { once: true });
              window.print();
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-md"
          >
            <Printer className="w-4 h-4" />
            인쇄 / PDF 저장
          </button>
        </div>
        {/* [수정] 미리보기 화면(이 바깥 흰색 A4 박스)의 폭이 그동안 세로(210mm)로 고정돼
        있어서, 가로(.print-landscape, 297mm)로 그리는 화면들(자금 현황/통장 출금·입금
        내역/대출 현황/법인카드 사용내역/카드별 월 사용 내역)은 실제 인쇄와 달리 미리보기에서만
        표가 흰 박스 폭을 넘어가 화면 밖으로 삐져나와 보였다. 실제 인쇄(#print-root)는 이
        바깥 박스와 무관하게 항상 올바르게 나왔던 것이라, 가로로 그리는 카테고리를 전부
        여기에도 반영해서 미리보기와 실제 인쇄가 항상 같은 폭으로 보이게 맞춘다. */}
        <div
          className="bg-white shadow-2xl mx-auto"
          style={{
            width: ['monthly_cashflow', 'bank_withdrawal', 'bank_deposit', 'loan_repayment', 'card_usage', 'corp_card'].includes(printingDoc.category)
              ? '297mm'
              : '210mm',
          }}
        >
          {renderActivePrintable()}
        </div>
      </div>
    )}

    {/* 실제 인쇄 시에는 위 미리보기 대신 앱 트리 밖의 #print-root에 그려진 내용만 단독으로
    인쇄된다 (다른 화면 요소의 영향을 받지 않기 위함). */}
    {typeof document !== 'undefined' && document.getElementById('print-root') &&
      createPortal(renderActivePrintable(), document.getElementById('print-root')!)}
    </>
  );
};
