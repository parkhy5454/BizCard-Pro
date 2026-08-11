import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X, Trash2, Edit2, Paperclip, Download, FileText, Search, ShieldAlert, Printer, Percent, Calculator } from 'lucide-react';
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
    { id: 'loan_repayment', label: '대출이자 및 원금 상환 내역', personLabel: '금융기관', showAmount: true }
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
      accounts: [{ id: `acc-${Date.now()}`, name: '', broughtForward: 0, deposit: 0, withdrawal: 0, note: '' }]
    };
  })() : undefined
});

// 급여명세서 지급/공제 내역 합계 계산
function sumItems(items?: AdminDocLineItem[]): number {
  return (items || []).reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
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
                <td style={{ border: '1px solid #000', padding: '6px' }}>{a.name}</td>
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
                  {((d.category === 'payslip' && d.payslip) || (d.category === 'monthly_cashflow' && d.cashflow)) && (
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

                <div className="grid grid-cols-2 gap-3">
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
                    <div className="grid grid-cols-2 gap-3">
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
                        <div className="p-2.5 bg-white border-t border-slate-200 grid grid-cols-2 gap-2">
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
                    <div className="grid grid-cols-2 gap-3">
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
                        {(editingDoc.cashflow?.accounts || []).map((a) => (
                          <div key={a.id} className="bg-white border border-slate-200 rounded-lg p-2 space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={a.name}
                                onChange={(e) => updateCashflowAccount(a.id, { name: e.target.value })}
                                placeholder="예: 하나(13004)_급여/외화송금/카드대금"
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-indigo-500"
                              />
                              <button type="button" onClick={() => removeCashflowAccount(a.id)} className="p-1.5 text-slate-400 hover:text-rose-500 shrink-0">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
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
                            <input
                              type="text"
                              value={a.note || ''}
                              onChange={(e) => updateCashflowAccount(a.id, { note: e.target.value })}
                              placeholder="비고 (예: *은민_만기 08.28)"
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600 outline-none focus:border-indigo-500"
                            />
                            <p className="text-right text-[11px] text-slate-500">통장잔액: <b className="text-emerald-600">{formatCurrencyInput(accountBalance(a))}원</b></p>
                          </div>
                        ))}
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

                {activeConfig.showAmount && activeCategory !== 'payslip' && activeCategory !== 'monthly_cashflow' && (
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
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-md"
          >
            <Printer className="w-4 h-4" />
            인쇄 / PDF 저장
          </button>
        </div>
        <div className="bg-white shadow-2xl mx-auto" style={{ width: printingDoc.category === 'monthly_cashflow' ? '297mm' : '210mm' }}>
          {printingDoc.category === 'monthly_cashflow' ? renderPrintableCashflow() : renderPrintablePayslip()}
        </div>
      </div>
    )}

    {/* 실제 인쇄 시에는 위 미리보기 대신 앱 트리 밖의 #print-root에 그려진 내용만 단독으로
    인쇄된다 (다른 화면 요소의 영향을 받지 않기 위함). */}
    {typeof document !== 'undefined' && document.getElementById('print-root') &&
      createPortal(printingDoc?.category === 'monthly_cashflow' ? renderPrintableCashflow() : renderPrintablePayslip(), document.getElementById('print-root')!)}
    </>
  );
};
