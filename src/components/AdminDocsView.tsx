import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Trash2, Edit2, Paperclip, Download, FileText, Search, ShieldAlert, Printer, Percent, Calculator, RefreshCw } from 'lucide-react';
import { AdminDoc, AdminDocCategory, AdminDocLineItem, AdminDocSection, ProjectFollowUpAttachment, User } from '../types.js';
import { formatCurrencyInput, parseCurrencyInput } from '../currencyFormat.js';

interface Props {
  section: AdminDocSection;
  currentUser: User | null;
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
    { id: 'card_usage', label: '카드사용내역', personLabel: '카드 소지자', showAmount: true }
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
      cardCompany: '', cardNumber: '', user: '', periodLabel: '', paymentDay: '',
      amount: 0, withdrawBank: '', withdrawAccount: '', note: ''
    }]
  } : undefined,
  // [추가] 근로계약서 기본값. 급여 구성 항목을 실제 회사 양식(기본급/연장근로수당/
  // 차량유지비/식대)에 맞춰 미리 채워두고, 필요하면 항목을 더 추가/삭제할 수 있다.
  laborContract: category === 'labor_contract' ? {
    companyBusinessType: '', companyAddress: '',
    employeeName: '', employeeBirthDate: '', employeeAddress: '', employmentType: 'regular',
    salaryItems: [
      { id: `sal-${Date.now()}-1`, label: '기본급', amount: 0 },
      { id: `sal-${Date.now()}-2`, label: '연장근로수당', amount: 0 },
      { id: `sal-${Date.now()}-3`, label: '차량 유지비', amount: 0 },
      { id: `sal-${Date.now()}-4`, label: '식대', amount: 0 }
    ],
    contractStartDate: new Date().toISOString().split('T')[0],
    contractEndDate: '',
    workLocation: '주소지 회사(회사 사정이 있을 시 변경 가능) 및 프로젝트 현장',
    jobDuties: '기술 영업 및 기술 지원(회사 사정이 있을 시 변경 가능)',
    contractDate: new Date().toISOString().split('T')[0]
  } : undefined
});

// 급여명세서 지급/공제 내역 합계 계산
function sumItems(items?: AdminDocLineItem[]): number {
  return (items || []).reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
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
  const norm = (s: string) => s.replace(/\s/g, '');
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

// [추가] 법인카드 관리의 "사용일수" 표기(대개 "전월 01일~전월 말일")를 그대로 파싱하기는
// 어려워서, corpCard.yearMonth를 기준으로 그 "전월" 전체 기간(YYYY-MM-01 ~ 그 달 마지막 날)을
// 계산한다. 회사에서 흔히 쓰는 "전월 사용분을 이번 달에 결제" 관행에 맞춘 기본값이다.
function getPrevMonthRange(yearMonth?: string): { start?: string; end?: string } {
  if (!yearMonth) return {};
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m) return {};
  const prevMonthDate = new Date(y, m - 2, 1); // m은 1~12, JS Date month는 0~11이므로 m-1이 이번달, m-2가 전달
  const start = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0).getDate();
  const end = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
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

  const activeConfig = categories.find((c) => c.id === activeCategory) || categories[0];

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
      cardCompany: '', cardNumber: '', user: '', periodLabel: '', paymentDay: '',
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
      // [추가] 근로계약서는 월 급여 합계를 amount 칸에 표시하고, 근로자 이름을 검색 대상인
      // personName에도 반영해서 다른 서류들처럼 이름으로 검색할 수 있게 한다.
      if (payload.category === 'labor_contract' && payload.laborContract) {
        const total = sumItems(payload.laborContract.salaryItems);
        payload.amount = String(total);
        if (payload.laborContract.employeeName) payload.personName = payload.laborContract.employeeName;
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
      <div className="print-landscape" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', padding: '12mm', fontFamily: 'sans-serif', color: '#111', boxSizing: 'border-box' }}>
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
      <div className="print-landscape" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', padding: '10mm', fontFamily: 'sans-serif', color: '#111', boxSizing: 'border-box' }}>
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
      <div className="print-landscape" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', padding: '10mm', fontFamily: 'sans-serif', color: '#111', boxSizing: 'border-box' }}>
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

    return (
      <div className="print-landscape" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', padding: '12mm', fontFamily: 'sans-serif', color: '#111', boxSizing: 'border-box' }}>
        <h1 style={{ textAlign: 'center', fontSize: '18px', fontWeight: 700, textDecoration: 'underline', marginBottom: '14px' }}>
          {year && month ? `${year}년도 카드별 월 사용 내역(${Number(month)}월)` : printingDoc.title}
        </h1>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', border: '1px solid #000' }}>
          <thead>
            <tr style={{ background: '#ffe600', fontWeight: 700, textAlign: 'center' }}>
              <td style={{ border: '1px solid #000', padding: '5px' }}>번호</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>카드사</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>카드번호</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>사용자</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>사용일수</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>출금일자</td>
              <td style={{ border: '1px solid #000', padding: '5px' }}>금 액</td>
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

  // [추가] 근로계약서 인쇄용 화면. 공유해주신 실제 계약서 전문(고정 조항 포함)을 그대로
  // 재현하고, 근로자 정보/급여 구성/계약기간처럼 사람마다 달라지는 부분만 채워 넣는다.
  const renderPrintableLaborContract = () => {
    if (!printingDoc || !printingDoc.laborContract) return null;
    const lc = printingDoc.laborContract;
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
    const labelCellStyle: React.CSSProperties = { ...cellStyle, background: '#f5f5f5', fontWeight: 700, width: '18%' };

    return (
      <div style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', padding: '15mm', fontFamily: 'sans-serif', color: '#111', boxSizing: 'border-box', fontSize: '11px', lineHeight: 1.6 }}>
        <h1 style={{ textAlign: 'center', fontSize: '20px', fontWeight: 700, marginBottom: '20px' }}>근로 계약서</h1>

        <p style={{ fontWeight: 700, margin: '14px 0 6px' }}>1. 계약 당사자</p>
        <p style={{ fontWeight: 700, margin: '4px 0' }}>사용자</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '8px' }}><tbody>
          <tr><td style={labelCellStyle}>사업체명</td><td style={cellStyle}>{companyName}</td><td style={labelCellStyle}>대표</td><td style={cellStyle}>{repName}</td></tr>
          <tr><td style={labelCellStyle}>사업종류</td><td style={cellStyle}>{lc.companyBusinessType}</td><td style={labelCellStyle}>사업자등록번호</td><td style={cellStyle}>{bizNumber}</td></tr>
          <tr><td style={labelCellStyle}>주 소</td><td style={cellStyle} colSpan={3}>{lc.companyAddress}</td></tr>
        </tbody></table>
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

        <p style={{ fontWeight: 700, margin: '14px 0 6px' }}>2. 근로 조건</p>
        <p style={{ margin: '4px 0' }}>1) 급여 : 상여금을 포함한 포괄 연봉제이며, 급여는 매월 말일에 계좌로 입금하거나 본인이 현금 지급을 원할 시 현금으로 지급한다.</p>
        <p style={{ margin: '4px 0 6px', paddingLeft: '10px' }}>가. 임금계산 원칙 - 구체적인 항목 및 지급액은 다음과 같다</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6px' }}>
          <thead><tr>
            <td style={{ ...labelCellStyle, width: '25%', textAlign: 'center' }}>지급 항목</td>
            <td style={{ ...cellStyle, textAlign: 'center', fontWeight: 700, background: '#f5f5f5' }}>금액(원)</td>
          </tr></thead>
          <tbody>
            {lc.salaryItems.map((it) => (
              <tr key={it.id}><td style={cellStyle}>{it.label}</td><td style={{ ...cellStyle, textAlign: 'right' }}>{fmt(it.amount)}</td></tr>
            ))}
            <tr><td style={{ ...cellStyle, fontWeight: 700 }}>지급 합계 (월 급여)</td><td style={{ ...cellStyle, textAlign: 'right', fontWeight: 700 }}>{fmt(monthlyTotal)}</td></tr>
            <tr><td style={{ ...cellStyle, fontWeight: 700, background: '#fff7cc' }}>총 액 (연봉)</td><td style={{ ...cellStyle, textAlign: 'right', fontWeight: 700, background: '#fff7cc' }}>{fmt(annualTotal)}</td></tr>
          </tbody>
        </table>
        <p style={{ margin: '4px 0', paddingLeft: '10px' }}>나. 계산기간 및 계산방법 - 월 급여의 계산기간은 초일부터 기산하여 당월 말일로 마감한다.</p>
        <p style={{ margin: '4px 0 8px', paddingLeft: '10px' }}>다. 지급일 및 지급방법 - 월 급여의 지급일은 매월 말일 근로자의 통장으로 지급한다.</p>
        <p style={{ margin: '4px 0' }}>2) 급여 외 수당 : 없음 - 주 12시간의 연장 근로를 할 수 있음에 동의하고 이에 해당하는 수당은 급여에 포함한 금액으로 한다.</p>
        <p style={{ margin: '4px 0' }}>3) 근로 시간 : 매주 월요일 ~ 금요일 09:00~18:00(휴게시간 : 12:00~13:00) - 주간 40시간 만근 시 일요일 유급 휴일, 토요일 무급 휴일</p>
        <p style={{ margin: '4px 0' }}>4) 근무 장소 : {lc.workLocation}</p>
        <p style={{ margin: '4px 0' }}>5) 담당 업무 : {lc.jobDuties}</p>
        <p style={{ margin: '4px 0 8px' }}>6) 근무 지침 : 당사 직원 수첩 규정에 동의하고 이에 따름</p>

        <p style={{ fontWeight: 700, margin: '14px 0 6px' }}>3. 고용 기간</p>
        <p style={{ margin: '4px 0' }}>- 계약 기간은 {fmtDateKo(lc.contractStartDate)} ~ {lc.contractEndDate ? fmtDateKo(lc.contractEndDate) : '(기간의 정함 없음)'}</p>
        <p style={{ margin: '4px 0 8px' }}>- 계약 후 1년은 업무 적응 기간으로 당사의 업무에 적합하지 않다고 판단될 시 이 기간 내에라도 계약 종료 가능</p>

        <p style={{ fontWeight: 700, margin: '14px 0 6px' }}>4. 연차 휴가</p>
        <p style={{ margin: '4px 0' }}>- 1년간 8할 이상 출근 시 15일의 유급 휴가 부여(2년에 1개씩 가산)</p>
        <p style={{ margin: '4px 0 8px' }}>- 또한, 별도의 서면 합의로 특정 근로일을 연차 휴가로 대체 가능</p>

        <p style={{ fontWeight: 700, margin: '14px 0 6px' }}>5. 퇴직 시 준수 사항</p>
        <p style={{ margin: '4px 0 8px' }}>- 퇴직 1개월 이전까지 회사에 퇴사 의사를 알리고 업무 인수 인계서를 작성하여 제출하고, 후임자를 선임하여 업무 인수인계를 완료할 때까지 성실하게 근무하여야 한다.</p>

        <p style={{ fontWeight: 700, margin: '14px 0 6px' }}>6. 근로 계약 해지 사유</p>
        <p style={{ margin: '4px 0' }}>- 정당한 사유 없이 무단 결근 시</p>
        <p style={{ margin: '4px 0' }}>- 업무 태만, 업무 수행 능력 부족 또는 건강상 장애로 업무 수행이 곤란 시</p>
        <p style={{ margin: '4px 0' }}>- 정당한 사유 없이 상사의 업무 지시 또는 작업 지시를 이행하지 않을 시</p>
        <p style={{ margin: '4px 0' }}>- 회사의 명예를 손상시켰거나 고의 또는 중과실로 회사에 손해를 입혔을 시</p>
        <p style={{ margin: '4px 0 8px' }}>- 당사 직원 수첩의 취업 규칙 또는 기타 사회통념 상 더 이상 근로관계 유지 어렵다고 판단될 시</p>

        <p style={{ fontWeight: 700, margin: '14px 0 6px' }}>7. 지적 자산의 소유, 기밀 유지(비밀 보호) 및 손해 배상</p>
        <p style={{ margin: '4px 0' }}>- 근로자는 업무를 수행함에 있어 지적 자산에 관한 권리는 회사에 귀속된다는 점에 동의한다.</p>
        <p style={{ margin: '4px 0' }}>- 근로자는 계약서에 명시된 연봉 및 월 급여에 대하여 상호 간에 비교·공개하거나 타인에게 누설하여서는 아니 되며, 이를 위반한 경우 이로 인한 모든 불이익을 감수한다.</p>
        <p style={{ margin: '4px 0' }}>- 근로자는 근로 계약 기간을 포함하여 퇴사 후에라도 회사의 서면 허가 없이는 회사에서 지득한 업무상 기밀사항 또는 고객의 비밀 사항에 대해 그 경중을 막론하고 외부에 유출하여서는 아니 되며, 만일 위반할 경우 민·형사상의 모든 책임을 진다.</p>
        <p style={{ margin: '4px 0 8px' }}>- 근로자는 고의 또는 과실로 갑에 손해를 입힌 경우 그 손해의 한도 내에서 배상 책임을 진다.</p>

        <p style={{ fontWeight: 700, margin: '14px 0 6px' }}>8. 기타 조건</p>
        <p style={{ margin: '4px 0 8px' }}>- 상기 조건 이외의 개별약정이 있는 경우 그 약정을 본 계약에 우선하여 적용.</p>

        <p style={{ fontWeight: 700, margin: '14px 0 6px' }}>9. 준용</p>
        <p style={{ margin: '4px 0 8px' }}>- 본 계약서에 명시되지 않은 사항은 근로기준법 등 노동관계법령, 취업규칙을 준용한다.</p>

        <p style={{ textAlign: 'center', margin: '20px 0 6px' }}>양 당사자는 상기 계약 조건을 성실히 준수할 것을 약속하며 본 근로계약을 체결합니다.</p>
        <p style={{ textAlign: 'center', margin: '10px 0 20px', fontWeight: 700 }}>{fmtDateKo(lc.contractDate)}</p>

        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '20px' }}>
          <p>사용자 : {repName} (인)</p>
          <p>근로자 : {lc.employeeName} (인)</p>
        </div>
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
    if (printingDoc.category === 'labor_contract') return renderPrintableLaborContract();
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
          onClick={() => setEditingDoc(emptyForm(activeCategory))}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-md shadow-indigo-600/20 transition-all active:scale-95 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>{activeConfig.label} 추가</span>
        </button>
      </div>

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
                  {((d.category === 'payslip' && d.payslip) || (d.category === 'monthly_cashflow' && d.cashflow) || ((d.category === 'bank_withdrawal' || d.category === 'bank_deposit') && d.bankLedger) || (d.category === 'loan_repayment' && d.loanRepayment) || (d.category === 'card_usage' && d.cardUsage) || (d.category === 'corp_card' && d.corpCard) || (d.category === 'labor_contract' && d.laborContract)) && (
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
                    <input
                      type="text"
                      value={editingDoc.personName || ''}
                      onChange={(e) => setEditingDoc({ ...editingDoc, personName: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700 outline-none focus:border-indigo-500"
                    />
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
                            value={c.cardNumber || ''}
                            onChange={(e) => updateCardField(c.id, { cardNumber: e.target.value })}
                            placeholder="카드번호"
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
                    <p className="text-[10px] text-slate-400">※ 회계관리 &gt; 카드사용내역과 대조할 때는 "대상 연월의 전월(前月)" 사용분 합계를 기준으로 비교합니다 (사용일수가 보통 "전월 01일~전월 말일"이기 때문).</p>

                    {(editingDoc.corpCard?.cards || []).map((c) => (
                      <div key={c.id} className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={c.cardCompany}
                            onChange={(e) => updateCorpCard(c.id, { cardCompany: e.target.value })}
                            placeholder="카드사 (예: 국민카드)"
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-indigo-500"
                          />
                          <input
                            type="text"
                            value={c.cardNumber}
                            onChange={(e) => updateCorpCard(c.id, { cardNumber: e.target.value })}
                            placeholder="카드번호"
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                          />
                          <input
                            type="text"
                            value={c.user}
                            onChange={(e) => updateCorpCard(c.id, { user: e.target.value })}
                            placeholder="사용자"
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                          />
                          {(editingDoc.corpCard?.cards.length || 0) > 1 && (
                            <button type="button" onClick={() => removeCorpCard(c.id)} className="p-1.5 text-slate-400 hover:text-rose-500 shrink-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
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
                          const { start, end } = getPrevMonthRange(editingDoc.corpCard?.yearMonth);
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

                {/* [추가] 근로계약서 전용 입력. 근로자 정보 + 급여 구성만 채우면, 근로시간/
                연차/퇴직/기밀유지 등 고정 조항은 인쇄할 때 자동으로 다 채워져서 나온다. */}
                {activeCategory === 'labor_contract' && (
                  <div className="space-y-3 border border-indigo-100 bg-indigo-50/40 rounded-xl p-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">회사 정보 (사업체명·대표·사업자등록번호는 로그인 계정에서 자동 입력됨)</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        <input
                          type="text"
                          value={editingDoc.laborContract?.companyBusinessType || ''}
                          onChange={(e) => updateLaborContractField({ companyBusinessType: e.target.value })}
                          placeholder="사업 종류 (예: 제조업)"
                          className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                        />
                        <input
                          type="text"
                          value={editingDoc.laborContract?.companyAddress || ''}
                          onChange={(e) => updateLaborContractField({ companyAddress: e.target.value })}
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

                {activeConfig.showAmount && activeCategory !== 'payslip' && activeCategory !== 'monthly_cashflow' && activeCategory !== 'bank_withdrawal' && activeCategory !== 'bank_deposit' && activeCategory !== 'loan_repayment' && activeCategory !== 'card_usage' && activeCategory !== 'corp_card' && activeCategory !== 'labor_contract' && (
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
        <div className="bg-white shadow-2xl mx-auto" style={{ width: printingDoc.category === 'monthly_cashflow' ? '297mm' : '210mm' }}>
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
