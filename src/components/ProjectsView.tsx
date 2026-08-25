import React, { useState, useEffect, useRef } from 'react';
import { Briefcase, Plus, Calendar, DollarSign, Users, CheckCircle2, Circle, Clock, ChevronDown, ChevronUp, Trash2, Tag, Edit2, Mic, Volume2, Play, Pause, User, Music, Activity, Headphones, AlertTriangle, Sparkles, Paperclip, Download, FileText, Search, Receipt, Camera, X, Printer, FileSpreadsheet, ArrowDownUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Project, BusinessCard, ProjectFollowUp, ProjectFollowUpAttachment, MeetingExpenseItem, ProjectCostSheet, ProjectCostSheetAmount, ProjectCostCategory, PROJECT_COST_CATEGORY_LABELS, PROJECT_COST_CATEGORY_ORDER } from '../types.js';
import { CropAdjustModal, warpDataUrlWithNormalizedCorners, isValidNormalizedCorners } from './CropAdjustModal.js';
import { LiveCameraCapture } from './LiveCameraCapture.js';
import { formatCurrencyInput, parseCurrencyInput } from '../currencyFormat.js';
import { getTodayLocalStr } from '../dateUtils.js';
import { formatPhoneNumber } from '../phoneFormat.js';
import { ContactMultiSearchSelect } from './ContactPicker.js';
import { AttendeeContactSearchAdd } from './AttendeeContactSearchAdd.js';

// [추가] 전체 프로젝트 목록 인쇄는 공유 CSS(index.css)의 named page(@page 커스텀 이름 +
// page 속성) 방식 대신, 별도의 새 창(window.open)에 이 표만 담긴 완전히 독립된 HTML
// 문서를 열어서 그 창에서 인쇄한다. named page 방식은 브라우저별로 실제 인쇄(파일 인쇄
// 미리보기)에서 안정적으로 적용되지 않는 경우가 있어("A4 가로"로 지정했는데도 실제로는
// 세로로 좁게 인쇄되는 문제), 이 문서 하나에만 적용되는 단일 @page 규칙만 갖는 새 창을
// 열어 인쇄하는, VehicleView.tsx의 문서/이미지 인쇄와 같은 방식(window.open +
// printWin.print())을 써서 다른 CSS와 절대 충돌하지 않도록 한다.
// 이 문서 문자열에 프로젝트명/담당자/시행사 등 사용자가 직접 입력한 값을 그대로 꽂아
// 넣으므로, VehicleView.tsx의 운행기록부 인쇄와 동일한 이유로 XSS 방지를 위해 반드시
// 이 함수로 이스케이프한 뒤에 넣는다.
const escapeHtml = (value: unknown): string => {
  const str = value === null || value === undefined ? '' : String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

// [추가] "프로젝트 원가계산서" 계산 로직. 공유해주신 양식(매출액/직접원가/간접원가/
// 일반관리비/사후관리비용을 직접 입력하면 소계·총원가·경상이익·경상이익율을 자동
// 계산)을 그대로 반영한 순수 함수들 - 개별 보기(입력폼)와 전체 보기(요약표) 양쪽에서
// 똑같은 계산식을 써야 하므로 한 곳에 모아둔다. AdminDocsView.tsx의 cfCellTotal 등과
// 같은 패턴(컴포넌트 바깥의 순수 함수, 저장은 입력값만 하고 합계는 항상 다시 계산).
// [추가] 직접원가/간접원가/일반관리비 세부 항목의 빈 값 - manual(직접 입력) 0에 자동
// 불러온 내역(imported) 없음으로 시작한다.
const emptyCostAmount = (): ProjectCostSheetAmount => ({ manual: 0, imported: [] });
const emptyCostSheet = (): ProjectCostSheet => ({
  orderer: '',
  contractNumber: '',
  contractDate: '',
  deliveryDeadline: '',
  preparedDate: getTodayLocalStr(),
  preparedDept: '',
  contractRevenue: 0,
  additionalRevenue: 0,
  rawMaterialCost: emptyCostAmount(),
  outsourcingCost: emptyCostAmount(),
  directLaborCost: emptyCostAmount(),
  directExpense: emptyCostAmount(),
  indirectLaborCost: emptyCostAmount(),
  depreciationCost: emptyCostAmount(),
  qualityControlCost: emptyCostAmount(),
  logisticsCost: emptyCostAmount(),
  laborAllocationCost: emptyCostAmount(),
  rentCost: emptyCostAmount(),
  commsItCost: emptyCostAmount(),
  legalAccountingCost: emptyCostAmount(),
  otherAdminCost: emptyCostAmount(),
  appliedPostSalesCost: 0,
  contractRevenueNote: 'VAT 별도',
  totalRevenueNote: '손익 기준',
  appliedPostSalesNote: '낮은 금액 적용'
});

// [추가] 통장 출금내역/카드사용내역에서 이 프로젝트 이 항목으로 태그된 거래를 "자동
// 불러오기"로 채우는 대상 13개 필드 키. 관리비내역/가지급내역과 같은 이유로 순서/이름을
// 한 곳(types.ts)에서 관리한다.
const COST_SHEET_CATEGORY_FIELDS = PROJECT_COST_CATEGORY_ORDER;

// [추가] 위 13개 항목은 예전엔 그냥 숫자(number)로 저장했는데, "자동 불러오기"를 다시
// 눌러도 직접 입력해둔 값을 잃지 않으려면 manual+imported 구조가 필요해서 타입을
// 바꿨다. 예전에 저장된 문서는 여전히 숫자일 수 있으므로, 숫자/객체/undefined 세 가지
// 형태를 모두 안전하게 합계 내는 헬퍼로만 이 필드들을 읽는다 - 절대 cs.xxx를 직접
// 숫자로 취급하지 않는다.
const csFieldTotal = (v: ProjectCostSheetAmount | number | undefined | null): number => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const imported = (v.imported || []).reduce((s, it) => s + (Number(it.amount) || 0), 0);
  return (Number(v.manual) || 0) + imported;
};
// 위와 같은 이유로, 기존 저장 데이터(숫자)를 새 화면에서 편집할 때는 manual 칸에 그
// 숫자를 그대로 옮겨서 시작한다(자동 불러온 내역은 없는 것으로 취급 - 처음부터 없었으므로).
const normalizeCostAmount = (v: ProjectCostSheetAmount | number | undefined | null): ProjectCostSheetAmount => {
  if (v == null) return emptyCostAmount();
  if (typeof v === 'number') return { manual: v, imported: [] };
  return { manual: Number(v.manual) || 0, imported: v.imported || [] };
};
const normalizeCostSheet = (cs: ProjectCostSheet): ProjectCostSheet => {
  const normalized: any = { ...cs };
  for (const field of COST_SHEET_CATEGORY_FIELDS) {
    normalized[field] = normalizeCostAmount((cs as any)[field]);
  }
  return normalized as ProjectCostSheet;
};

// 프로젝트에 원가계산서가 아직 없을 때, 처음 열면 프로젝트 자체 정보(발주처=최종고객,
// 납품기한=마감일)로 미리 채워서 시작하게 한다 - 그 뒤로는 원가계산서 쪽 값만 독립적으로
// 수정된다(프로젝트 원본 필드에 다시 영향을 주지 않음).
const costSheetFromProject = (p: Project): ProjectCostSheet => ({
  ...emptyCostSheet(),
  orderer: p.endCustomer || '',
  deliveryDeadline: p.dueDate || ''
});

const num = (v: number | undefined | null): number => Number(v) || 0;
const csRevenueTotal = (cs: ProjectCostSheet): number => num(cs.contractRevenue) + num(cs.additionalRevenue); // 합계(A)
const csDirectCostSubtotal = (cs: ProjectCostSheet): number => // 소계(B)
  csFieldTotal(cs.rawMaterialCost) + csFieldTotal(cs.outsourcingCost) + csFieldTotal(cs.directLaborCost) + csFieldTotal(cs.directExpense);
const csIndirectCostSubtotal = (cs: ProjectCostSheet): number => // 소계(C)
  csFieldTotal(cs.indirectLaborCost) + csFieldTotal(cs.depreciationCost) + csFieldTotal(cs.qualityControlCost) + csFieldTotal(cs.logisticsCost);
const csAdminCostSubtotal = (cs: ProjectCostSheet): number => // 소계(D)
  csFieldTotal(cs.laborAllocationCost) + csFieldTotal(cs.rentCost) + csFieldTotal(cs.commsItCost) + csFieldTotal(cs.legalAccountingCost) + csFieldTotal(cs.otherAdminCost);
const csExpectedPostSales = (cs: ProjectCostSheet): number => Math.round(csRevenueTotal(cs) * 0.05); // 예상 사후 관리비 = 매출액×5%
const csPostSalesCap = (cs: ProjectCostSheet): number => Math.round(csRevenueTotal(cs) * 0.06); // 사후 관리비 한도 = 매출액×6%
const csTotalCost = (cs: ProjectCostSheet): number => // 총원가(F = B+C+D+E)
  csDirectCostSubtotal(cs) + csIndirectCostSubtotal(cs) + csAdminCostSubtotal(cs) + num(cs.appliedPostSalesCost);
const csProfit = (cs: ProjectCostSheet): number => csRevenueTotal(cs) - csTotalCost(cs); // 경상 이익(G = A-F)
const csProfitMargin = (cs: ProjectCostSheet): number | null => { // 경상 이익율(%) = G/A
  const a = csRevenueTotal(cs);
  return a > 0 ? (csProfit(cs) / a) * 100 : null;
};

// [추가] "프로젝트 원가계산서"(개별 보기)도 엑셀 출력/인쇄(PDF 저장)를 지원하기 위해, 화면
// 표와 완전히 같은 내용(헤더 정보/항목별 그룹/최종 합계 행)을 한 번만 계산해두는 순수 함수.
// 엑셀 내보내기와 인쇄용 HTML 둘 다 이 데이터를 그대로 재사용하므로, 화면에 보이는 값과
// 다른 값이 나올 걱정이 없다(rowSpan으로 묶이는 대분류 구조까지 groups로 그대로 반영).
interface CostSheetExportRow {
  label: string;
  value: number;
  basis?: string;
  note?: string;
  isSubtotal?: boolean;
}
interface CostSheetExportGroup {
  category: string;
  rows: CostSheetExportRow[];
}
interface CostSheetExportFinalRow {
  label: string;
  value?: number;
  valueText?: string;
}
interface CostSheetExportData {
  headerInfo: [string, string][];
  groups: CostSheetExportGroup[];
  finalRows: CostSheetExportFinalRow[];
}

const getCostSheetExportData = (project: Project, cs: ProjectCostSheet): CostSheetExportData => {
  const A = csRevenueTotal(cs);
  const B = csDirectCostSubtotal(cs);
  const C = csIndirectCostSubtotal(cs);
  const D = csAdminCostSubtotal(cs);
  const expectedPostSales = csExpectedPostSales(cs);
  const postSalesCap = csPostSalesCap(cs);
  const E = num(cs.appliedPostSalesCost);
  const F = csTotalCost(cs);
  const G = csProfit(cs);
  const margin = csProfitMargin(cs);

  return {
    headerInfo: [
      ['프로젝트 명', project.name],
      ['발 주 처', cs.orderer || ''],
      ['계 약 번 호', cs.contractNumber || ''],
      ['계 약 일 자', cs.contractDate || ''],
      ['납 품 기 한', cs.deliveryDeadline || ''],
      ['작 성 일', cs.preparedDate || ''],
      ['작 성 부 서', cs.preparedDept || '']
    ],
    groups: [
      {
        category: '매 출 액', rows: [
          { label: '계약 매출액(원)', value: num(cs.contractRevenue), note: cs.contractRevenueNote || '' },
          { label: '추가 매출액(원)', value: num(cs.additionalRevenue) },
          { label: '합 계 ( A )', value: A, note: cs.totalRevenueNote || '', isSubtotal: true }
        ]
      },
      {
        category: '직접 원가', rows: [
          { label: '원 재료비', value: csFieldTotal(cs.rawMaterialCost), basis: '자재 BOM 기준' },
          { label: '외주 가공비', value: csFieldTotal(cs.outsourcingCost), basis: '제작, 조립, 가공 등' },
          { label: '직접 노무비', value: csFieldTotal(cs.directLaborCost), basis: '투입 인원 × 공수' },
          { label: '직접 경비', value: csFieldTotal(cs.directExpense), basis: '운송, 설치, 시운전 등' },
          { label: '소 계 ( B )', value: B, isSubtotal: true }
        ]
      },
      {
        category: '간접 원가', rows: [
          { label: '간접 노무비', value: csFieldTotal(cs.indirectLaborCost), basis: '관리, 기술 지원 인력 등' },
          { label: '감가 상각비', value: csFieldTotal(cs.depreciationCost), basis: '장비, 금형 등' },
          { label: '품질 관리비', value: csFieldTotal(cs.qualityControlCost), basis: '검사, 시험 등' },
          { label: '물류, 보관비', value: csFieldTotal(cs.logisticsCost), basis: '창고, 운송 등' },
          { label: '소 계 ( C )', value: C, isSubtotal: true }
        ]
      },
      {
        category: '일반관리비', rows: [
          { label: '인건비 배부', value: csFieldTotal(cs.laborAllocationCost), basis: '관리부서' },
          { label: '임차료', value: csFieldTotal(cs.rentCost), basis: '사무실, 공장' },
          { label: '통신, 전산비', value: csFieldTotal(cs.commsItCost), basis: '시스템' },
          { label: '법무, 회계비', value: csFieldTotal(cs.legalAccountingCost), basis: '외주' },
          { label: '기타 관리비', value: csFieldTotal(cs.otherAdminCost) },
          { label: '소 계 ( D )', value: D, isSubtotal: true }
        ]
      },
      {
        category: '사후관리비용', rows: [
          { label: '예상 사후 관리비', value: expectedPostSales, basis: '매출액 × 5%' },
          { label: '사후 관리비 한도', value: postSalesCap, basis: '매출액 × 6%' },
          { label: '적용 사후 관리비', value: num(cs.appliedPostSalesCost) },
          { label: '적 용 ( E )', value: E, note: cs.appliedPostSalesNote || '', isSubtotal: true }
        ]
      }
    ],
    finalRows: [
      { label: '총 원가 ( F = B+C+D+E )', value: F },
      { label: '경상 이익 ( G = A - F )', value: G },
      { label: '경상 이익율 (%) ( G / A )', valueText: margin === null ? '집계 전' : `${margin.toFixed(1)}%` }
    ]
  };
};

// [추가] "프로젝트명, 시행사, 시공사로 검색..." 검색창이 카드형/리스트 출력/원가계산서(전체)
// 등 여러 곳에서 똑같은 기준으로 걸러지도록 한 곳에 모아둔 순수 함수. 프로젝트명/최종고객
// (endCustomer)/시행사(developer)/시공사(contractor) 중 하나라도 일치하면 통과.
const matchesProjectSearch = (p: Project, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    p.name.toLowerCase().includes(q) ||
    (p.endCustomer || '').toLowerCase().includes(q) ||
    (p.developer || '').toLowerCase().includes(q) ||
    (p.contractor || '').toLowerCase().includes(q)
  );
};

interface Props {
  contacts: BusinessCard[];
  setContacts: React.Dispatch<React.SetStateAction<BusinessCard[]>>;
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  filterStatus: 'all' | Project['status'];
  setFilterStatus: (status: 'all' | Project['status']) => void;
  currentUser?: import('../types.js').User | null;
  triggerNewProject?: number;
  // [수정] "새 프로젝트 등록" 버튼과 같은 위치(Navigation 상단바)에서 엑셀/PDF 버튼을 눌렀을 때
  // 신호를 받기 위한 트리거. triggerNewProject와 동일한 방식(숫자가 바뀔 때마다 실행)이다.
  triggerExcelExport?: number;
  triggerPrintPreview?: number;
  // [수정] "리스트 출력"/"파이프라인" 탭 전환을 위한 화면 모드
  viewMode?: 'cards' | 'listOutput' | 'pipeline' | 'pnl';
  // [추가] 전역 검색에서 특정 프로젝트를 눌렀을 때, 그 프로젝트를 펼쳐서 바로 보여주기 위한
  // 신호. focusProjectId만으로는 같은 프로젝트를 다시 눌러도 값이 안 바뀌어 useEffect가
  // 반응하지 않으므로, 누를 때마다 값이 바뀌는 focusProjectSignal을 함께 쓴다
  // (triggerNewProject 등 기존 트리거 프롭들과 동일한 패턴).
  focusProjectId?: string;
  focusProjectSignal?: number;
  // [추가] "리스트 출력" 표에서 프로젝트명을 눌렀을 때, "프로젝트 리스트"(카드형 화면)의
  // 해당 프로젝트로 이동시켜 펼쳐 보여주기 위한 콜백. App.tsx가 전역 검색에서 프로젝트를
  // 눌렀을 때와 동일한 핸들러(handleOpenProjectFromSearch)를 그대로 넘겨준다 - 화면 모드를
  // "카드형"으로 바꾸고 focusProjectId/focusProjectSignal을 갱신하는 역할을 이미 하고 있어
  // 따로 새 로직을 만들 필요가 없다.
  onFocusProject?: (projectId: string) => void;
}

export const ProjectsView: React.FC<Props> = ({ 
  contacts,
  setContacts,
  projects,
  setProjects,
  filterStatus,
  setFilterStatus,
  currentUser,
  triggerNewProject,
  triggerExcelExport,
  triggerPrintPreview,
  viewMode = 'cards',
  focusProjectId,
  focusProjectSignal,
  onFocusProject
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // [수정] 영수증 썸네일을 눌렀을 때 크게 볼 수 있는 팝업(라이트박스)용 상태
  const [enlargedReceiptUrl, setEnlargedReceiptUrl] = useState<string | null>(null);
  // [수정] 팔로우업 알림 배너를 닫을 수 있게: 닫으면 "오늘 하루만" 숨기고, 완전히 사라지지 않도록
  // 작은 뱃지로 흔적을 남겨서 다시 펼쳐볼 수 있게 한다. 날짜가 바뀌면 자동으로 다시 배너가 뜬다.
  const [followupBannerDismissedDate, setFollowupBannerDismissedDate] = useState<string>(() => {
    try { return localStorage.getItem('bizcard_followup_banner_dismissed_date') || ''; } catch { return ''; }
  });
  const todayStr = getTodayLocalStr();
  const isFollowupBannerDismissed = followupBannerDismissedDate === todayStr;
  const dismissFollowupBannerForToday = () => {
    try { localStorage.setItem('bizcard_followup_banner_dismissed_date', todayStr); } catch {}
    setFollowupBannerDismissedDate(todayStr);
  };
  const reopenFollowupBanner = () => {
    try { localStorage.removeItem('bizcard_followup_banner_dismissed_date'); } catch {}
    setFollowupBannerDismissedDate('');
  };
  const [companyStaff, setCompanyStaff] = useState<{ id: string; name: string }[]>([]);

  // [수정] "손익계산서"(회계관리 데이터 자동 집계) → "원가계산서"(공유해주신 정식 양식에
  // 맞춰 프로젝트별로 직접 입력)로 전면 교체. 검색/선택으로 프로젝트 하나를 고르면 그
  // 프로젝트의 원가계산서를 입력/수정하는 "개별" 모드와, 전체 프로젝트를 한 표로 요약해
  // 보여주는 "전체" 모드를 오간다.
  const [pnlSelectedProjectId, setPnlSelectedProjectId] = useState<string>('');
  const [costSheetMode, setCostSheetMode] = useState<'individual' | 'all'>('individual');
  // 선택한 프로젝트의 원가계산서를 편집 중인 임시 값. 프로젝트에 저장된 값(projects 프롭)과
  // 분리해두고 "저장" 버튼을 눌러야 실제로 반영되게 한다 - 다른 프로젝트로 바꾸거나 탭을
  // 나가도 실수로 반쯤 입력한 값이 그대로 저장되지 않도록.
  const [costSheetDraft, setCostSheetDraft] = useState<ProjectCostSheet | null>(null);
  const [isSavingCostSheet, setIsSavingCostSheet] = useState<boolean>(false);
  // [추가] 원가계산서 "자동 불러오기"(통장 출금내역·카드사용내역에서 태그된 거래를
  // 가져오는 중) 로딩 상태
  const [isImportingCostSheet, setIsImportingCostSheet] = useState<boolean>(false);
  const [costSheetSaveError, setCostSheetSaveError] = useState<string>('');

  // [수정] 예전엔 상단 공통 검색창(카드형/리스트 출력용)과, 원가계산서(개별) 전용
  // 프로젝트 선택창(ProjectPnlPicker)이 위아래로 따로 있어서 검색창이 두 개로 겹쳐
  // 보였다. 이제 상단 검색창 하나만 남기고, 원가계산서 탭에서는 이 검색창이 모드에 따라
  // 역할을 바꾼다 - "개별" 모드에서는 타이핑하면 목록이 펼쳐지는 검색+선택창(예전
  // ProjectPnlPicker와 동일한 동작)으로, "전체" 모드에서는 요약표를 좁혀서 보여주는
  // 필터로 동작한다. pnlPickerOpen은 "개별" 모드일 때만 그 드롭다운의 열림 상태를 관리한다.
  const [pnlPickerOpen, setPnlPickerOpen] = useState<boolean>(false);
  const pnlPickerWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (pnlPickerWrapRef.current && !pnlPickerWrapRef.current.contains(e.target as Node)) setPnlPickerOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);
  // 화면(카드형/리스트 출력/원가계산서-개별/원가계산서-전체)이 바뀌면, 검색창의 역할이
  // 완전히 달라지므로(자유 필터 ↔ 프로젝트 선택) 이전 화면에서 입력하던 검색어를 그대로
  // 들고 가면 혼란스럽다 - 화면이 바뀔 때마다 검색어를 비우고 드롭다운도 닫는다.
  useEffect(() => {
    setProjectSearchQuery('');
    setPnlPickerOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, costSheetMode]);

  useEffect(() => {
    if (!pnlSelectedProjectId) { setCostSheetDraft(null); return; }
    const p = projects.find((pr) => pr.id === pnlSelectedProjectId);
    if (!p) { setCostSheetDraft(null); return; }
    // [수정] p.costSheet가 이 기능이 생기기 전에 저장된 문서라면 13개 항목이 그냥 숫자일 수
    // 있어서, 화면에서 편집 가능한 manual+imported 구조로 정규화(normalizeCostSheet)해서
    // 담는다 - 기존 숫자값은 manual로 그대로 옮겨지고, 자동 불러온 내역은 없는 것으로
    // 시작한다(예전엔 그 개념 자체가 없었으므로).
    setCostSheetDraft(p.costSheet ? normalizeCostSheet(p.costSheet) : costSheetFromProject(p));
    setCostSheetSaveError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pnlSelectedProjectId]);

  const updateCostSheetField = <K extends keyof ProjectCostSheet>(field: K, value: ProjectCostSheet[K]) => {
    setCostSheetDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const handleSaveCostSheet = async () => {
    if (!pnlSelectedProjectId || !costSheetDraft) return;
    const project = projects.find((p) => p.id === pnlSelectedProjectId);
    if (!project) return;
    const updated: Project = { ...project, costSheet: costSheetDraft };
    setIsSavingCostSheet(true);
    setCostSheetSaveError('');
    // 다른 프로젝트 수정(handleUpdateProjectDetails)과 같은 패턴 - 화면은 먼저 반영하고,
    // 서버 저장이 실패하면 에러를 보여준다.
    setProjects(projects.map((p) => (p.id === updated.id ? updated : p)));
    try {
      const res = await fetch(`/api/projects/${updated.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(currentUser ? { 'x-user-id': currentUser.id } : {})
        },
        body: JSON.stringify(updated)
      });
      if (!res.ok) throw new Error(`원가계산서 저장에 실패했습니다 (상태: ${res.status}).`);
    } catch (err: any) {
      setCostSheetSaveError(err?.message || '원가계산서 저장에 실패했습니다. 화면에는 반영됐지만 서버에는 저장 안 됐을 수 있으니 다시 시도해주세요.');
    } finally {
      setIsSavingCostSheet(false);
    }
  };

  // [추가] 원가계산서 "자동 불러오기" - 회계관리 > 통장 출금내역·카드사용내역에서 이
  // 프로젝트로 연결되고 원가 항목(costCategory)이 태그된 거래를 찾아, 아직 반영 안 된
  // 것만 골라 각 항목의 imported 목록에 더한다. 직접 입력해둔 manual 값은 절대 건드리지
  // 않고, 이미 가져온 거래(sourceKey로 판단)도 다시 더하지 않는다 - 그래서 이 버튼은
  // 몇 번을 다시 눌러도 안전하다(관리비내역/가지급내역과 같은 원칙). 회계관리 데이터라
  // 서버가 관리자 계정만 허용한다(requireAdmin) - 관리자가 아니면 안내만 보여준다.
  const handleImportCostSheetFromLedger = async () => {
    if (!pnlSelectedProjectId || !costSheetDraft || !currentUser) return;
    setIsImportingCostSheet(true);
    try {
      const res = await fetch(`/api/admin-docs/project-cost-candidates?projectId=${encodeURIComponent(pnlSelectedProjectId)}`, {
        headers: { 'x-user-id': currentUser.id }
      });
      if (!res.ok) {
        alert(res.status === 403
          ? '통장 출금내역/카드사용내역은 관리자 계정만 불러올 수 있습니다.'
          : '통장 출금내역/카드사용내역을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        return;
      }
      const candidates: { sourceKey: string; sourceLabel: string; date: string; amount: number; category: string; memo?: string }[] = await res.json();

      const alreadyImported = new Set<string>();
      for (const field of COST_SHEET_CATEGORY_FIELDS) {
        normalizeCostAmount((costSheetDraft as any)[field]).imported.forEach((it) => alreadyImported.add(it.sourceKey));
      }

      const categorySet = new Set<string>(COST_SHEET_CATEGORY_FIELDS as string[]);
      const fresh = candidates.filter((c) => categorySet.has(c.category) && !alreadyImported.has(c.sourceKey));
      if (fresh.length === 0) {
        alert('새로 가져올 내역이 없습니다.\n통장 출금내역·카드사용내역에서 이 프로젝트를 연결하고 원가 항목을 태그해주세요.');
        return;
      }

      const byCategory: Record<string, { count: number; total: number }> = {};
      fresh.forEach((c) => {
        const b = byCategory[c.category] || { count: 0, total: 0 };
        b.count += 1;
        b.total += Number(c.amount) || 0;
        byCategory[c.category] = b;
      });
      const summary = COST_SHEET_CATEGORY_FIELDS
        .filter((f) => byCategory[f])
        .map((f) => `${PROJECT_COST_CATEGORY_LABELS[f]}: ${byCategory[f].count}건 ${formatCurrencyInput(byCategory[f].total)}원`)
        .join('\n');
      const ok = window.confirm(`통장 출금내역·카드사용내역에서 새로 가져올 내역입니다.\n\n${summary}\n\n총 ${fresh.length}건을 원가계산서에 반영할까요?\n(이미 직접 입력해둔 금액은 그대로 유지되고, 위 내역이 추가로 더해집니다)`);
      if (!ok) return;

      setCostSheetDraft((prev) => {
        if (!prev) return prev;
        const next: any = { ...prev };
        for (const field of COST_SHEET_CATEGORY_FIELDS) {
          const matched = fresh.filter((c) => c.category === field);
          if (matched.length === 0) continue;
          const cell = normalizeCostAmount(next[field]);
          next[field] = {
            ...cell,
            imported: [...cell.imported, ...matched.map((c) => ({ sourceKey: c.sourceKey, sourceLabel: c.sourceLabel, amount: c.amount }))]
          };
        }
        return next;
      });
    } catch (err) {
      console.error('원가계산서 자동 불러오기 실패:', err);
      alert('통장 출금내역/카드사용내역을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsImportingCostSheet(false);
    }
  };

  // [추가] 원가계산서(개별) 엑셀 출력 - 위 getCostSheetExportData가 만들어준 데이터를
  // 그대로 셀에 채워 넣는다. 화면 표와 동일하게 대분류(구분) 칸은 세로로 병합한다.
  const handleExportCostSheetExcel = async () => {
    const project = projects.find((p) => p.id === pnlSelectedProjectId);
    if (!project || !costSheetDraft) return;
    const { headerInfo, groups, finalRows } = getCostSheetExportData(project, costSheetDraft);

    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('원가계산서', {
      pageSetup: {
        orientation: 'portrait', paperSize: 9 /* A4 */, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.79, right: 0.79, top: 0.79, bottom: 0.79, header: 0.3, footer: 0.3 }
      }
    });
    const colCount = 5;
    const thin = { style: 'thin' as const, color: { argb: 'FF000000' } };
    const fullBorder = { top: thin, left: thin, right: thin, bottom: thin };
    const yellow = 'FFFDE68A';
    const orange = 'FFFFEDD5';
    const gray = 'FFF9FAFB';

    ws.mergeCells(1, 1, 1, colCount);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = '프로젝트 원가 계산서';
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 26;

    let r = 2;
    headerInfo.forEach(([label, value]) => {
      const labelCell = ws.getCell(r, 1);
      labelCell.value = label;
      labelCell.font = { bold: true };
      labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: gray } };
      labelCell.alignment = { vertical: 'middle' };
      labelCell.border = fullBorder;
      ws.mergeCells(r, 2, r, colCount);
      const valueCell = ws.getCell(r, 2);
      valueCell.value = value;
      valueCell.alignment = { vertical: 'middle' };
      valueCell.border = fullBorder;
      r++;
    });

    ws.mergeCells(r, 1, r, 2);
    const catHeaderCell = ws.getCell(r, 1);
    catHeaderCell.value = '구 분';
    const amtHeaderCell = ws.getCell(r, 3);
    amtHeaderCell.value = '금액(원)';
    const basisHeaderCell = ws.getCell(r, 4);
    basisHeaderCell.value = '산출근거';
    const noteHeaderCell = ws.getCell(r, 5);
    noteHeaderCell.value = '비고';
    [catHeaderCell, amtHeaderCell, basisHeaderCell, noteHeaderCell].forEach((c) => {
      c.font = { bold: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yellow } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
      c.border = fullBorder;
    });
    r++;

    groups.forEach((g) => {
      const groupStartRow = r;
      g.rows.forEach((row) => {
        const labelCell = ws.getCell(r, 2);
        labelCell.value = row.label;
        labelCell.border = fullBorder;
        const amtCell = ws.getCell(r, 3);
        amtCell.value = row.value;
        amtCell.numFmt = '#,##0';
        amtCell.alignment = { horizontal: 'right' };
        amtCell.border = fullBorder;
        const basisCell = ws.getCell(r, 4);
        basisCell.value = row.basis || '';
        basisCell.alignment = { horizontal: 'center' };
        basisCell.border = fullBorder;
        const noteCell = ws.getCell(r, 5);
        noteCell.value = row.note || '';
        noteCell.border = fullBorder;
        if (row.isSubtotal) {
          [labelCell, amtCell].forEach((c) => {
            c.font = { bold: true };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: orange } };
          });
        }
        r++;
      });
      const groupEndRow = r - 1;
      ws.mergeCells(groupStartRow, 1, groupEndRow, 1);
      const catCell = ws.getCell(groupStartRow, 1);
      catCell.value = g.category;
      catCell.font = { bold: true };
      catCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      catCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yellow } };
      for (let rr = groupStartRow; rr <= groupEndRow; rr++) {
        ws.getCell(rr, 1).border = fullBorder;
      }
    });

    finalRows.forEach((row) => {
      ws.mergeCells(r, 1, r, 2);
      const labelCell = ws.getCell(r, 1);
      labelCell.value = row.label;
      labelCell.font = { bold: true };
      labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: yellow } };
      labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
      labelCell.border = fullBorder;
      ws.mergeCells(r, 3, r, colCount);
      const valueCell = ws.getCell(r, 3);
      if (row.valueText) {
        valueCell.value = row.valueText;
      } else {
        valueCell.value = row.value;
        valueCell.numFmt = '#,##0';
      }
      valueCell.font = { bold: true };
      valueCell.alignment = { horizontal: 'right', vertical: 'middle' };
      valueCell.border = fullBorder;
      r++;
    });

    ws.getColumn(1).width = 13;
    ws.getColumn(2).width = 22;
    ws.getColumn(3).width = 16;
    ws.getColumn(4).width = 20;
    ws.getColumn(5).width = 20;

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `원가계산서_${project.name}_${getTodayLocalStr()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // [추가] 원가계산서(개별) 인쇄/PDF 저장 - "프로젝트 파이프라인" 인쇄와 동일하게, 이 표
  // 하나만 담긴 완전히 독립된 새 창을 열어서 그 창 안에서 인쇄한다(브라우저 인쇄 대화상자의
  // "PDF로 저장"을 고르면 그대로 PDF 저장도 된다).
  const handlePrintCostSheet = () => {
    const project = projects.find((p) => p.id === pnlSelectedProjectId);
    if (!project || !costSheetDraft) return;
    const { headerInfo, groups, finalRows } = getCostSheetExportData(project, costSheetDraft);
    const fmt = (n: number) => `${formatCurrencyInput(String(Math.round(n)))}원`;

    const headerRowsHtml = headerInfo.map(([label, value]) => `
      <tr><td class="label">${escapeHtml(label)}</td><td colspan="4">${escapeHtml(value)}</td></tr>`).join('');

    const groupsHtml = groups.map((g) => g.rows.map((row, idx) => `
      <tr>
        ${idx === 0 ? `<td class="cat" rowspan="${g.rows.length}">${escapeHtml(g.category)}</td>` : ''}
        <td class="${row.isSubtotal ? 'sub' : 'itemlabel'}">${escapeHtml(row.label)}</td>
        <td class="${row.isSubtotal ? 'sub amt' : 'amt'}">${escapeHtml(fmt(row.value))}</td>
        <td class="basis">${escapeHtml(row.basis || '')}</td>
        <td>${escapeHtml(row.note || '')}</td>
      </tr>`).join('')).join('');

    const finalRowsHtml = finalRows.map((row) => `
      <tr class="final">
        <td colspan="2" class="sub">${escapeHtml(row.label)}</td>
        <td colspan="3" class="amt">${escapeHtml(row.valueText || fmt(row.value || 0))}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>프로젝트 원가 계산서 - ${escapeHtml(project.name)}</title>
<style>
  @page { size: A4 portrait; margin: 15mm 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; color: #000; }
  .title { text-align: center; margin-bottom: 16px; }
  .title h1 { display: inline-block; border-bottom: 4px double #000; padding-bottom: 4px; margin: 0; font-size: 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; table-layout: fixed; }
  th, td { border: 1px solid #000; padding: 5px 6px; vertical-align: middle; }
  td.label { background: #f3f4f6; font-weight: 700; width: 110px; }
  td.itemlabel { background: #f9fafb; }
  td.cat { text-align: center; font-weight: 700; background: #fef3c7; width: 70px; }
  td.sub { text-align: center; font-weight: 700; background: #ffedd5; }
  td.amt { text-align: right; font-family: monospace; }
  td.basis { text-align: center; color: #6b7280; }
  th.colhead { background: #fde68a; font-weight: 700; text-align: center; }
  tr.final td { background: #fde68a; font-weight: 700; text-align: right; }
  tr.final td.sub { text-align: center; }
</style>
</head>
<body>
  <div class="title"><h1>프로젝트 원가 계산서</h1></div>
  <table>
    <tbody>
      ${headerRowsHtml}
      <tr>
        <th class="colhead" colspan="2">구 분</th>
        <th class="colhead">금액(원)</th>
        <th class="colhead">산출근거</th>
        <th class="colhead">비고</th>
      </tr>
      ${groupsHtml}
      ${finalRowsHtml}
    </tbody>
  </table>
  <script>window.onload = function () { window.focus(); window.print(); };</script>
</body>
</html>`;

    const printWin = window.open('', '_blank');
    if (!printWin) {
      alert('팝업이 차단되어 인쇄 창을 열 수 없습니다. 브라우저의 팝업 차단을 해제한 뒤 다시 시도해주세요.');
      return;
    }
    printWin.document.write(html);
    printWin.document.close();
  };

  // [추가] 원가계산서(전체) 엑셀 출력 - 화면의 "프로젝트별 원가 계산서" 요약표와 동일한
  // 컬럼 구성(No./프로젝트명/발주처/…/경상이익율/비고)에 합계 행까지 그대로 반영한다.
  const handleExportAllCostSheetsExcel = async () => {
    // [수정] 화면에 지금 보이는 표(검색어로 좁혀진 결과)와 항상 같은 내용이 나오도록,
    // 상단 검색창(전체 모드일 때는 필터로 동작)의 검색어를 여기서도 그대로 적용한다.
    const allRows = [...projects].filter((p) => matchesProjectSearch(p, projectSearchQuery)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const headers = ['No.', '프로젝트명', '발주처', '계약번호', '계약일자', '납품기한', '작성일', '작성부서', '매출(원)', '총원가(원)', '경상이익(원)', '경상이익율(%)', '비고'];
    const colCount = headers.length;

    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('전체_원가계산서', {
      pageSetup: {
        orientation: 'landscape', paperSize: 9 /* A4 */,
        margins: { left: 0.79, right: 0.79, top: 0.79, bottom: 0.79, header: 0.3, footer: 0.3 }
      }
    });
    const thin = { style: 'thin' as const, color: { argb: 'FF000000' } };
    const fullBorder = { top: thin, left: thin, right: thin, bottom: thin };

    ws.mergeCells(1, 1, 1, colCount);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = '프로젝트별 원가 계산서';
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 26;

    ws.mergeCells(2, 1, 2, colCount);
    const dateCell = ws.getCell(2, 1);
    dateCell.value = `출력일: ${new Date().toLocaleDateString('ko-KR')}`;
    dateCell.font = { size: 9, color: { argb: 'FF6B7280' } };
    dateCell.alignment = { horizontal: 'center' };

    const headerRowIdx = 4;
    const headerRow = ws.getRow(headerRowIdx);
    headers.forEach((h, colIdx) => {
      const cell = headerRow.getCell(colIdx + 1);
      cell.value = h;
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = fullBorder;
    });
    headerRow.height = 20;

    let grandRevenue = 0, grandCost = 0, grandProfit = 0;
    allRows.forEach((p, idx) => {
      const cs = p.costSheet;
      const revenue = cs ? csRevenueTotal(cs) : 0;
      const cost = cs ? csTotalCost(cs) : 0;
      const profit = cs ? csProfit(cs) : 0;
      const marginPct = cs ? csProfitMargin(cs) : null;
      if (cs) { grandRevenue += revenue; grandCost += cost; grandProfit += profit; }
      const row = ws.getRow(headerRowIdx + 1 + idx);
      const values: (string | number)[] = [
        idx + 1, p.name, cs?.orderer || '-', cs?.contractNumber || '-', cs?.contractDate || '-',
        cs?.deliveryDeadline || '-', cs?.preparedDate || '-', cs?.preparedDept || '-',
        cs ? revenue : '-', cs ? cost : '-', cs ? profit : '-',
        marginPct === null ? '-' : `${marginPct.toFixed(1)}%`, cs ? '' : '미작성'
      ];
      values.forEach((v, colIdx) => {
        const cell = row.getCell(colIdx + 1);
        cell.value = v;
        cell.border = fullBorder;
        cell.alignment = { horizontal: colIdx === 1 ? 'left' : (colIdx >= 8 && colIdx <= 10 ? 'right' : 'center'), vertical: 'middle' };
        if (colIdx >= 8 && colIdx <= 10 && typeof v === 'number') cell.numFmt = '#,##0';
      });
    });

    const totalsRowIdx = headerRowIdx + 1 + allRows.length;
    if (allRows.length > 0) {
      ws.mergeCells(totalsRowIdx, 1, totalsRowIdx, 8);
      const labelCell = ws.getCell(totalsRowIdx, 1);
      labelCell.value = '합계';
      labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
      const revenueCell = ws.getCell(totalsRowIdx, 9);
      revenueCell.value = grandRevenue; revenueCell.numFmt = '#,##0'; revenueCell.alignment = { horizontal: 'right' };
      const costCell = ws.getCell(totalsRowIdx, 10);
      costCell.value = grandCost; costCell.numFmt = '#,##0'; costCell.alignment = { horizontal: 'right' };
      const profitCell = ws.getCell(totalsRowIdx, 11);
      profitCell.value = grandProfit; profitCell.numFmt = '#,##0'; profitCell.alignment = { horizontal: 'right' };
      const marginCell = ws.getCell(totalsRowIdx, 12);
      marginCell.value = grandRevenue > 0 ? `${((grandProfit / grandRevenue) * 100).toFixed(1)}%` : '-';
      marginCell.alignment = { horizontal: 'center' };
      const totalsRow = ws.getRow(totalsRowIdx);
      for (let c = 1; c <= colCount; c++) {
        const cell = totalsRow.getCell(c);
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        cell.border = fullBorder;
      }
    }

    headers.forEach((h, colIdx) => {
      ws.getColumn(colIdx + 1).width = colIdx === 1 ? 26 : Math.max(h.length + 4, 12);
    });
    ws.views = [{ state: 'frozen', ySplit: headerRowIdx }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `전체_프로젝트_원가계산서_${getTodayLocalStr()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // [추가] 원가계산서(전체) 인쇄/PDF 저장 - 위 엑셀과 같은 요약표를 새 창에 띄워 인쇄한다.
  const handlePrintAllCostSheets = () => {
    const allRows = [...projects].filter((p) => matchesProjectSearch(p, projectSearchQuery)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const headers = ['No.', '프로젝트명', '발주처', '계약번호', '계약일자', '납품기한', '작성일', '작성부서', '매출(원)', '총원가(원)', '경상이익(원)', '경상이익율(%)', '비고'];
    const fmtWon = (n: number) => `${formatCurrencyInput(String(Math.round(n)))}원`;

    let grandRevenue = 0, grandCost = 0, grandProfit = 0;
    const rowsHtml = allRows.length === 0
      ? `<tr><td colspan="${headers.length}" style="text-align:center;color:#9ca3af;padding:24px 8px;">등록된 프로젝트가 없습니다.</td></tr>`
      : allRows.map((p, idx) => {
        const cs = p.costSheet;
        const revenue = cs ? csRevenueTotal(cs) : 0;
        const cost = cs ? csTotalCost(cs) : 0;
        const profit = cs ? csProfit(cs) : 0;
        const marginPct = cs ? csProfitMargin(cs) : null;
        if (cs) { grandRevenue += revenue; grandCost += cost; grandProfit += profit; }
        return `<tr>
          <td style="text-align:center;">${idx + 1}</td>
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(cs?.orderer || '-')}</td>
          <td>${escapeHtml(cs?.contractNumber || '-')}</td>
          <td>${escapeHtml(cs?.contractDate || '-')}</td>
          <td>${escapeHtml(cs?.deliveryDeadline || '-')}</td>
          <td>${escapeHtml(cs?.preparedDate || '-')}</td>
          <td>${escapeHtml(cs?.preparedDept || '-')}</td>
          <td style="text-align:right;">${cs ? escapeHtml(fmtWon(revenue)) : '-'}</td>
          <td style="text-align:right;">${cs ? escapeHtml(fmtWon(cost)) : '-'}</td>
          <td style="text-align:right;">${cs ? escapeHtml(fmtWon(profit)) : '-'}</td>
          <td style="text-align:center;">${marginPct === null ? '-' : `${marginPct.toFixed(1)}%`}</td>
          <td>${cs ? '' : '미작성'}</td>
        </tr>`;
      }).join('');

    const totalsHtml = allRows.length === 0 ? '' : `
      <tr style="background:#fef3c7;font-weight:700;">
        <td colspan="8" style="text-align:center;">합계</td>
        <td style="text-align:right;">${escapeHtml(fmtWon(grandRevenue))}</td>
        <td style="text-align:right;">${escapeHtml(fmtWon(grandCost))}</td>
        <td style="text-align:right;">${escapeHtml(fmtWon(grandProfit))}</td>
        <td style="text-align:center;">${grandRevenue > 0 ? `${((grandProfit / grandRevenue) * 100).toFixed(1)}%` : '-'}</td>
        <td></td>
      </tr>`;

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>프로젝트별 원가 계산서</title>
<style>
  @page { size: A4 landscape; margin: 15mm 18mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; color: #000; }
  .title { text-align: center; margin-bottom: 16px; }
  .title h1 { display: inline-block; border-bottom: 4px double #000; padding-bottom: 4px; margin: 0; font-size: 20px; }
  .title p { font-size: 10px; color: #666; margin: 4px 0 0; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; table-layout: auto; }
  th, td { border: 1px solid #000; padding: 4px 5px; }
  th { background: #fde68a; font-weight: 700; }
</style>
</head>
<body>
  <div class="title">
    <h1>프로젝트별 원가 계산서</h1>
    <p>출력일: ${escapeHtml(new Date().toLocaleDateString('ko-KR'))}</p>
  </div>
  <table>
    <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${rowsHtml}${totalsHtml}</tbody>
  </table>
  <script>window.onload = function () { window.focus(); window.print(); };</script>
</body>
</html>`;

    const printWin = window.open('', '_blank');
    if (!printWin) {
      alert('팝업이 차단되어 인쇄 창을 열 수 없습니다. 브라우저의 팝업 차단을 해제한 뒤 다시 시도해주세요.');
      return;
    }
    printWin.document.write(html);
    printWin.document.close();
  };

  // 같은 회사(사업자번호)로 가입한 다른 계정들을 "우리 회사 직원" 목록으로 불러옴
  useEffect(() => {
    if (!currentUser || currentUser.type !== 'company' || !currentUser.companyName || !currentUser.businessNumber) {
      setCompanyStaff([]);
      return;
    }
    fetch('/api/auth/users')
      .then((res) => res.json())
      .then((allUsers: import('../types.js').User[]) => {
        const staff = allUsers.filter(
          (u) =>
            u.type === 'company' &&
            (u.companyName || '').trim() === (currentUser.companyName || '').trim() &&
            (u.businessNumber || '').trim() === (currentUser.businessNumber || '').trim()
        );
        setCompanyStaff(staff.map((u) => ({ id: u.id, name: u.name })));
        if (!meetingStaffName && currentUser.name) setMeetingStaffName(currentUser.name);
      })
      .catch((err) => console.error('Failed to load company staff:', err));
  }, [currentUser]);

  // 프로젝트 상태 필터 좌우 쓸어넘겨서 전환하기 위한 터치 제스처 상태 및 핸들러
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEndX(null);
    setTouchStartX(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEndX(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (touchStartX === null || touchEndX === null) return;
    const distance = touchStartX - touchEndX;
    const minSwipeDistance = 70; // 70px 이상 스와이프 시 변경

    const tabs: ('all' | Project['status'])[] = ['all', 'opportunity', 'progress', 'completed', 'failed'];
    const currentIndex = tabs.indexOf(filterStatus);

    if (distance > minSwipeDistance) {
      // 왼쪽으로 쓸기 (Swipe Left) -> 다음 상태 필터로 이동
      if (currentIndex < tabs.length - 1) {
        setFilterStatus(tabs[currentIndex + 1]);
      }
    } else if (distance < -minSwipeDistance) {
      // 오른쪽으로 쓸기 (Swipe Right) -> 이전 상태 필터로 이동
      if (currentIndex > 0) {
        setFilterStatus(tabs[currentIndex - 1]);
      }
    }
  };

  // 미팅 기록 전용 상태 (최초 미팅, 2번째, 3번째 등 차수, 미팅자, 미팅일자, 미팅 내용 및 음성메모)
  const [meetingDegree, setMeetingDegree] = useState<number>(1);
  const [meetingType, setMeetingType] = useState<'meeting' | 'followup'>('meeting');
  const [meetingAttendee, setMeetingAttendee] = useState<string>('');
  const [meetingStaffName, setMeetingStaffName] = useState<string>('');
  const [attendeeNameInput, setAttendeeNameInput] = useState<string>('');
  const [attendeeOfficeInput, setAttendeeOfficeInput] = useState<string>('');
  const [attendeeMobileInput, setAttendeeMobileInput] = useState<string>('');
  const [meetingDate, setMeetingDate] = useState<string>('');
  const [meetingContent, setMeetingContent] = useState<string>('');
  const [meetingAttachments, setMeetingAttachments] = useState<ProjectFollowUpAttachment[]>([]);
  const [meetingExpenses, setMeetingExpenses] = useState<MeetingExpenseItem[]>([]);
  const [scanningExpenseId, setScanningExpenseId] = useState<string | null>(null);
  
  // 음성 메모 녹음 관련 상태
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [voiceAttached, setVoiceAttached] = useState<boolean>(false);
  const [attachedVoiceDuration, setAttachedVoiceDuration] = useState<string>('');
  const [attachedVoiceUrl, setAttachedVoiceUrl] = useState<string>('');

  // [수정] AI 회의록 자동화: 음성 인식으로 두서없이 받아적힌 텍스트를 AI가 정리해주고
  // 액션 아이템/언급된 금액까지 뽑아주는 기능
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [meetingAISuggestion, setMeetingAISuggestion] = useState<{
    summary: string; actionItems: string[]; mentionedAmounts: { amount: number; context: string }[];
  } | null>(null);

  // 음성 재생 시뮬레이션 상태
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState<{ [key: string]: number }>({});

  const [recognition, setRecognition] = useState<any>(null);

  // 브라우저 음성 인식 API 바인딩
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'ko-KR';
      
      rec.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setMeetingContent(prev => prev ? prev + ' ' + finalTranscript : finalTranscript);
        }
      };
      
      setRecognition(rec);
    }
  }, []);

  // 녹음 타이머 작동
  useEffect(() => {
    let timer: any;
    if (isRecording) {
      timer = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => clearInterval(timer);
  }, [isRecording]);

  // 음성 재생 바 시뮬레이션
  useEffect(() => {
    let playTimer: any;
    if (playingVoiceId) {
      playTimer = setInterval(() => {
        setPlaybackProgress(prev => {
          const current = prev[playingVoiceId] || 0;
          if (current >= 100) {
            setPlayingVoiceId(null);
            return { ...prev, [playingVoiceId]: 0 };
          }
          return { ...prev, [playingVoiceId]: current + 5 };
        });
      }, 200);
    }
    return () => clearInterval(playTimer);
  }, [playingVoiceId]);

  // 프로젝트 카드가 확장될 때 미팅 폼 초기 설정 자동화
  // [수정] 예전엔 의존성 배열에 projects/contacts까지 들어있어서, 카드를 펼친 채로 다른
  // 동작(예: 다른 팔로우업 저장, 명함 추가 등)이 일어나 projects나 contacts 배열이
  // 업데이트될 때마다 이 effect가 다시 실행됐다. 그 결과 사용자가 검색해서 미팅 참여자를
  // 직접 추가해도, 곧바로 이 effect가 재실행되면서 "관련 거래처 기본값"으로 덮어써버려
  // 방금 추가한 참여자가 사라지는 버그가 있었다 (겉보기엔 "선택해도 안 됨"처럼 보임).
  // 이 초기화는 카드가 "새로 펼쳐질 때" 딱 한 번만 필요하므로, expandedId가 바뀔 때만
  // 실행되도록 의존성을 좁혔다. projects/contacts는 effect 실행 시점의 최신값을 그대로
  // 참조하면 되고, 값이 바뀔 때마다 재실행될 필요는 없다.
  useEffect(() => {
    if (expandedId) {
      const proj = projects.find(p => p.id === expandedId);
      if (proj) {
        const nextDegree = (proj.followUps || []).length + 1;
        setMeetingDegree(nextDegree);
        
        // 관련 거래처 담당자명을 미팅참석자(미팅자) 기본값으로 입력
        const related = contacts.filter((c) => (proj.contactIds || []).includes(c.id));
        const names = related.map(r => r.name).join(', ');
        setMeetingAttendee(names);
        
        setMeetingDate(getTodayLocalStr());
        setMeetingContent('');
        
        // 녹음 초기화
        setIsRecording(false);
        setRecordingSeconds(0);
        setVoiceAttached(false);
        setAttachedVoiceDuration('');
        setAttachedVoiceUrl('');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId]);

  const startRecording = () => {
    setIsRecording(true);
    setRecordingSeconds(0);
    setVoiceAttached(false);
    
    if (recognition) {
      try {
        recognition.start();
      } catch (e) {
        console.warn('SpeechRecognition start error:', e);
      }
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (recognition) {
      try {
        recognition.stop();
      } catch (e) {
        console.warn('SpeechRecognition stop error:', e);
      }
    }
    
    setVoiceAttached(true);
    const m = Math.floor(recordingSeconds / 60);
    const s = recordingSeconds % 60;
    const durStr = `${m}:${s < 10 ? '0' + s : s}`;
    setAttachedVoiceDuration(durStr === '0:00' ? '0:06' : durStr);
    
    // 만약 타이핑된 텍스트가 없고, 음성인식도 안되었다면, 미팅 맥락에 맞는 시뮬레이션 한국어 텍스트 제공
    if (!meetingContent.trim()) {
      const sampleTranscripts = [
        "오늘 미팅 진행했습니다. 전체적인 비즈니스 요건에 대해 설명했고 담당 임원분께 긍정적인 평가를 받았습니다.",
        "스펙 사양과 공급 계약 조건에 대해 자세히 협의를 마쳤습니다. 다음 미팅에서 구체적인 계약 초안 일정을 정하기로 했습니다.",
        "시스템 연동 방안에 대해 양사 개발팀과 세부 조율을 완료했습니다. 후속 검토 결과가 고무적입니다."
      ];
      const randomText = sampleTranscripts[Math.floor(Math.random() * sampleTranscripts.length)];
      setMeetingContent(randomText);
    }
    
    setAttachedVoiceUrl('simulated-voice-memo');
  };

  // [수정] AI 회의록 자동화: 음성 인식으로 두서없이 받아적힌 meetingContent를 AI에게 보내
  // 깔끔한 회의록 + 액션 아이템 + 언급된 금액을 뽑아온다.
  const handleSummarizeMeeting = async () => {
    if (!meetingContent.trim()) return;
    setIsSummarizing(true);
    setMeetingAISuggestion(null);
    try {
      const res = await fetch('/api/summarize-meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: meetingContent })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMeetingAISuggestion(data);
    } catch (err: any) {
      alert(err.message || 'AI 정리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsSummarizing(false);
    }
  };

  // AI가 정리해준 요약 + 액션 아이템을 실제 미팅 내용 칸에 반영
  const applyMeetingSummary = () => {
    if (!meetingAISuggestion) return;
    let finalText = meetingAISuggestion.summary;
    if (meetingAISuggestion.actionItems.length > 0) {
      finalText += '\n\n[다음 액션]\n' + meetingAISuggestion.actionItems.map((a) => `- ${a}`).join('\n');
    }
    setMeetingContent(finalText);
    setMeetingAISuggestion(null);
  };

  // AI가 감지한 언급 금액을 지출 항목으로 바로 추가
  const addSuggestedExpense = (amount: number, context: string) => {
    setMeetingExpenses((prev) => [
      ...prev,
      {
        id: `me-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        category: 'custom' as const,
        categoryCustom: '',
        amount,
        payMethod: 'company_card' as const,
        memo: context
      }
    ]);
    setMeetingAISuggestion((prev) =>
      prev ? { ...prev, mentionedAmounts: prev.mentionedAmounts.filter((m) => !(m.amount === amount && m.context === context)) } : prev
    );
  };

  // 마지막 미팅(또는 프로젝트 생성일)로부터 경과된 일수 계산 함수
  const getDaysSinceLastActivity = (proj: Project): { days: number; lastDate: string; reason: 'createdAt' | 'followUp' } => {
    let lastDateStr = proj.createdAt ? proj.createdAt.split('T')[0] : getTodayLocalStr();
    let reason: 'createdAt' | 'followUp' = 'createdAt';

    if (proj.followUps && proj.followUps.length > 0) {
      let maxDateStr = proj.followUps[0].date;
      proj.followUps.forEach(f => {
        if (f.date > maxDateStr) {
          maxDateStr = f.date;
        }
      });
      lastDateStr = maxDateStr.split('T')[0];
      reason = 'followUp';
    }

    const parseLocalDate = (str: string) => {
      const parts = str.split('-');
      if (parts.length === 3) {
        return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      }
      return new Date(str);
    };

    const lastDateObj = parseLocalDate(lastDateStr);
    const todayStr = getTodayLocalStr();
    const todayObj = parseLocalDate(todayStr);

    const diffTime = todayObj.getTime() - lastDateObj.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    return {
      days: diffDays >= 0 ? diffDays : 0,
      lastDate: lastDateStr,
      reason
    };
  };
  
  // 새 프로젝트 생성 모달 상태
  const [isNewOpen, setIsNewOpen] = useState<boolean>(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState<string>('');
  // [수정] 프로젝트가 몇백 개로 늘어나도 카드 목록 화면이 느려지지 않도록, 처음엔 50개만
  // 화면에 그린다. 엑셀/PDF/리스트 출력은 이 제한과 무관하게 항상 전체(filteredProjects)를 쓴다.
  const [visibleProjectCount, setVisibleProjectCount] = useState<number>(50);
  useEffect(() => {
    setVisibleProjectCount(50);
  }, [filterStatus, projectSearchQuery]);
  // [수정] 등록된 전체 프로젝트를 엑셀/PDF로 다운로드하기 위한 상태
  const [showProjectsPrintPreview, setShowProjectsPrintPreview] = useState<boolean>(false);
  // [추가] "리스트 출력" 표에서 개별/전체 선택 삭제를 위한 선택된 프로젝트 id 목록.
  // 필터가 바뀌어 화면에서 사라진 프로젝트의 선택은 굳이 자동으로 풀지 않아도 되지만
  // (다시 필터를 풀면 여전히 선택돼 있는 게 자연스럽다), 실제로 삭제된 항목은
  // handleDeleteProject/handleBulkDeleteProjects에서 선택 목록에서도 함께 제거한다.
  const [selectedListIds, setSelectedListIds] = useState<Set<string>>(new Set());

  // [추가] 전역 검색에서 특정 프로젝트로 이동해왔을 때: 필터/검색어 때문에 그 프로젝트가
  // 목록에서 가려져 있거나 "더 보기" 제한 밖에 있을 수 있으므로, 필터를 전체로 풀고
  // 검색어를 비운 뒤, 그 프로젝트가 보이는 순번까지 visibleProjectCount를 늘리고 펼친다.
  useEffect(() => {
    if (!focusProjectId || !focusProjectSignal) return;
    setFilterStatus('all');
    setProjectSearchQuery('');
    setExpandedId(focusProjectId);
    const idx = projects.findIndex((p) => p.id === focusProjectId);
    if (idx >= 0) setVisibleProjectCount((prev) => Math.max(prev, idx + 1));
    setTimeout(() => {
      document.getElementById(`project-card-${focusProjectId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusProjectSignal]);

  // 상단 메뉴의 '새 프로젝트 등록' 버튼에서 신호가 오면 등록 모달을 엽니다.
  useEffect(() => {
    if (triggerNewProject) setIsNewOpen(true);
  }, [triggerNewProject]);
  const [newName, setNewName] = useState<string>('');
  // [수정] 영업자(담당자) - 기본값은 지금 로그인한 사람(등록자) 이름, 직접 수정 가능
  const [newSalesRep, setNewSalesRep] = useState<string>(currentUser?.name || '');
  // [수정] 사용자 지적으로 "최종고객(발주처)"와 "시행사(발주처)"가 사실상 같은 개념이라
  // 입력칸을 하나로 합쳤다. newDeveloper라는 별도 입력 state는 없애고, 저장 시 항상
  // newEndCustomer 값을 그대로 developer 칸에도 같이 써서(최종고객=시행사) 카드 뱃지·
  // 거래처 회사명 매칭 등 기존에 developer 필드를 참조하던 기능이 계속 동작하게 한다.
  const [newContractor, setNewContractor] = useState<string>('');
  const [newArchitect, setNewArchitect] = useState<string>('');
  const [newElectricalDesigner, setNewElectricalDesigner] = useState<string>('');
  const [newInteriorDesigner, setNewInteriorDesigner] = useState<string>('');
  const [newMechanicalDesigner, setNewMechanicalDesigner] = useState<string>('');
  const [newSupervisor, setNewSupervisor] = useState<string>('');
  const [newOperator, setNewOperator] = useState<string>('');
  const [newStatus, setNewStatus] = useState<Project['status']>('opportunity');
  const [newPriority, setNewPriority] = useState<Project['priority']>('high');
  // [수정] "마감 기한" 대신 "프로젝트 등록일" 개념으로 변경 - 기본값을 오늘 날짜로
  const [newDueDate, setNewDueDate] = useState<string>(getTodayLocalStr());
  const [newBudget, setNewBudget] = useState<string>('');
  // [추가] 새 프로젝트 등록 시 메모를 남길 수 있는 칸. Project 타입에는 description
  // 필드가 이미 있었는데, 등록 폼에는 입력 칸이 빠져 있어서 등록할 때 메모를 못 남기고
  // 있었다.
  const [newDescription, setNewDescription] = useState<string>('');
  // [추가] "프로젝트 파이프라인" 양식에 맞춘 영업 파이프라인 관리 필드들 (등록 폼 입력용)
  const [newEndCustomer, setNewEndCustomer] = useState<string>('');
  const [newSiteLocation, setNewSiteLocation] = useState<string>('');
  const [newProductGroup, setNewProductGroup] = useState<string>('');
  const [newMainItemsSpec, setNewMainItemsSpec] = useState<string>('');
  const [newExpectedTiming, setNewExpectedTiming] = useState<string>('');
  const [newWinProbability, setNewWinProbability] = useState<string>('');
  const [newPipelineStage, setNewPipelineStage] = useState<NonNullable<Project['pipelineStage']> | ''>('');
  const [newCompetitor, setNewCompetitor] = useState<string>('');
  const [newSupportNeeded, setNewSupportNeeded] = useState<string>('');
  const [newRemarks, setNewRemarks] = useState<string>('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  // [추가] "시공사/건축설계사/…" 등 참여사 칸을 프로젝트명·최종고객·현장지역 정보를 바탕으로
  // 구글 검색(AI Intelligence의 기업 인텔리전스와 동일한 Gemini+googleSearch 방식)으로
  // 찾아서 자동으로 채워주는 기능. 이미 직접 입력한 칸은 덮어쓰지 않고 비어있는 칸만
  // 채우며, 채워진 뒤에도 언제든 직접 수정할 수 있다.
  const [isSearchingNewRelations, setIsSearchingNewRelations] = useState(false);
  const [newRelationsSearchNote, setNewRelationsSearchNote] = useState<string | null>(null);
  const [isSearchingEditRelations, setIsSearchingEditRelations] = useState(false);
  const [editRelationsSearchNote, setEditRelationsSearchNote] = useState<string | null>(null);

  // 프로젝트 정보 수정용 상태
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // 미팅 기록(팔로우업) 수정용 상태
  const [editingFollowup, setEditingFollowup] = useState<{ projectId: string; followup: ProjectFollowUp } | null>(null);
  const [editAttendeeNameInput, setEditAttendeeNameInput] = useState<string>('');
  const [editAttendeeOfficeInput, setEditAttendeeOfficeInput] = useState<string>('');
  const [editAttendeeMobileInput, setEditAttendeeMobileInput] = useState<string>('');

  // 거래처 직접 입력 상태
  const [useDirectContact, setUseDirectContact] = useState<boolean>(false);
  const [directContactName, setDirectContactName] = useState<string>('');
  const [directContactCompany, setDirectContactCompany] = useState<string>('');
  const [directContactDept, setDirectContactDept] = useState<string>('');
  const [directContactTitle, setDirectContactTitle] = useState<string>('');
  const [directContactPhoneOffice, setDirectContactPhoneOffice] = useState<string>('');
  const [directContactPhoneMobile, setDirectContactPhoneMobile] = useState<string>('');
  const [directContactEmail, setDirectContactEmail] = useState<string>('');

  // 새 팔로우업 노트 입력 폼 상태
  const [followupInput, setFollowupInput] = useState<{ [key: string]: string }>({});

  // 프로젝트 생성 핸들러
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    let finalContactIds = [...selectedContacts];

    if (useDirectContact && directContactName.trim()) {
      const newCardData = {
        name: directContactName.trim(),
        company: directContactCompany.trim() || newName || '직접 입력',
        department: directContactDept.trim(),
        title: directContactTitle.trim(),
        phoneOffice: directContactPhoneOffice.trim(),
        phoneMobile: directContactPhoneMobile.trim(),
        email: directContactEmail.trim(),
        address: '',
        groupId: 'all'
      };

      try {
        const contactRes = await fetch('/api/contacts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(currentUser ? { 'x-user-id': currentUser.id } : {})
          },
          body: JSON.stringify(newCardData)
        });
        if (contactRes.ok) {
          const savedContact = await contactRes.json();
          setContacts(prev => [savedContact, ...prev]);
          finalContactIds.push(savedContact.id);
        } else {
          throw new Error(`직접 입력한 연락처 저장에 실패했습니다 (상태: ${contactRes.status}).`);
        }
      } catch (err: any) {
        // [수정] 예전엔 실패해도 화면에만 존재하는 가짜 연락처를 만들어서 프로젝트를 계속
        // 저장했다 — 새로고침하면 그 연락처 연결이 사라지는 문제였다. 이제는 프로젝트
        // 저장 자체를 중단해서 사용자가 무슨 일이 있었는지 알고 다시 시도할 수 있게 한다.
        console.error('Failed to save direct contact:', err);
        alert(`직접 입력한 연락처 저장에 실패했습니다.\n${err.message || '다시 시도해주세요.'}\n\n프로젝트 저장이 중단되었습니다.`);
        return;
      }
    }

    const newProj: Partial<Project> = {
      name: newName,
      description: newDescription,
      salesRep: newSalesRep,
      developer: newEndCustomer,
      contractor: newContractor,
      architect: newArchitect,
      electricalDesigner: newElectricalDesigner,
      interiorDesigner: newInteriorDesigner,
      mechanicalDesigner: newMechanicalDesigner,
      supervisor: newSupervisor,
      operator: newOperator,
      status: newStatus,
      priority: newPriority,
      dueDate: newDueDate,
      budget: newBudget,
      endCustomer: newEndCustomer,
      siteLocation: newSiteLocation,
      productGroup: newProductGroup,
      mainItemsSpec: newMainItemsSpec,
      expectedTiming: newExpectedTiming,
      winProbability: newWinProbability ? Number(newWinProbability) : undefined,
      pipelineStage: newPipelineStage || undefined,
      competitor: newCompetitor,
      supportNeeded: newSupportNeeded,
      remarks: newRemarks,
      contactIds: finalContactIds
    };

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(currentUser ? { 'x-user-id': currentUser.id } : {})
        },
        body: JSON.stringify(newProj)
      });
      if (!res.ok) throw new Error(`프로젝트 저장에 실패했습니다 (상태: ${res.status}).`);
      const created = await res.json();
      setProjects([created, ...projects]);
    } catch (err: any) {
      // [수정] 예전엔 저장 실패해도 화면에만 존재하는 가짜 프로젝트를 만들어서 보여줬다 —
      // 새로고침하거나 다른 기기에서 보면 사라지는 유령 데이터였다. 이제는 명확히 알리고
      // 폼 입력값은 그대로 남겨서 다시 시도할 수 있게 한다.
      console.error('Failed to create project:', err);
      alert(`프로젝트 저장에 실패했습니다.\n${err.message || '다시 시도해주세요.'}`);
      return;
    }

    // 초기화
    setNewName('');
    setNewDescription('');
    setNewSalesRep(currentUser?.name || '');
    setNewDueDate(getTodayLocalStr());
    setNewContractor('');
    setNewArchitect('');
    setNewElectricalDesigner('');
    setNewInteriorDesigner('');
    setNewMechanicalDesigner('');
    setNewSupervisor('');
    setNewOperator('');
    setNewBudget('');
    setNewEndCustomer('');
    setNewSiteLocation('');
    setNewProductGroup('');
    setNewMainItemsSpec('');
    setNewExpectedTiming('');
    setNewWinProbability('');
    setNewPipelineStage('');
    setNewCompetitor('');
    setNewSupportNeeded('');
    setNewRemarks('');
    setSelectedContacts([]);
    setUseDirectContact(false);
    setDirectContactName('');
    setDirectContactCompany('');
    setDirectContactDept('');
    setDirectContactTitle('');
    setDirectContactPhoneOffice('');
    setDirectContactPhoneMobile('');
    setDirectContactEmail('');
    setNewRelationsSearchNote(null);
    setIsNewOpen(false);
  };

  // [수정] 새 프로젝트 등록 폼에서 "AI로 참여사 찾기" 버튼 핸들러. 프로젝트명(+최종고객/
  // 현장지역이 있으면 같이)을 바탕으로 서버가 구글 검색으로 시공사/설계사/감리사/운영사를
  // 찾아서 돌려주면, 비어있는 칸은 바로 채우고, 이미 직접 입력해둔 칸은 검색 결과와 값이
  // 다를 때만 한 번 물어보고(window.confirm) 확인해야 덮어쓴다 - 실수로 직접 입력한
  // 내용이 조용히 사라지는 걸 막기 위함.
  const handleSearchNewProjectRelations = async () => {
    if (!newName.trim() || isSearchingNewRelations) return;
    setIsSearchingNewRelations(true);
    setNewRelationsSearchNote(null);
    try {
      const res = await fetch('/api/projects/relations-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: newName, endCustomer: newEndCustomer, siteLocation: newSiteLocation })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '검색에 실패했습니다.');
      const f = data.fields || {};

      const fieldDefs: { label: string; current: string; found: string | null | undefined; setter: (v: string) => void }[] = [
        { label: '시공사', current: newContractor, found: f.contractor, setter: setNewContractor },
        { label: '건축설계사', current: newArchitect, found: f.architect, setter: setNewArchitect },
        { label: '인테리어설계사', current: newInteriorDesigner, found: f.interiorDesigner, setter: setNewInteriorDesigner },
        { label: '전기설계사', current: newElectricalDesigner, found: f.electricalDesigner, setter: setNewElectricalDesigner },
        { label: '기계설계사', current: newMechanicalDesigner, found: f.mechanicalDesigner, setter: setNewMechanicalDesigner },
        { label: '감리사', current: newSupervisor, found: f.supervisor, setter: setNewSupervisor },
        { label: '운영사', current: newOperator, found: f.operator, setter: setNewOperator }
      ];

      let filledCount = 0;
      const conflicts: { label: string; current: string; found: string; setter: (v: string) => void }[] = [];

      fieldDefs.forEach((fd) => {
        if (!fd.found) return;
        const current = fd.current.trim();
        if (!current) {
          fd.setter(fd.found);
          filledCount++;
        } else if (fd.found !== current) {
          conflicts.push({ label: fd.label, current, found: fd.found, setter: fd.setter });
        }
      });

      if (conflicts.length > 0) {
        const msg = `이미 입력된 아래 항목을 검색 결과로 바꿀까요?\n\n` +
          conflicts.map((c) => `${c.label}: "${c.current}" → "${c.found}"`).join('\n') +
          `\n\n확인을 누르면 검색 결과로 바뀌고, 취소를 누르면 기존 입력값이 그대로 유지됩니다.`;
        if (window.confirm(msg)) {
          conflicts.forEach((c) => c.setter(c.found));
          filledCount += conflicts.length;
        }
      }

      setNewRelationsSearchNote(
        filledCount > 0
          ? `${filledCount}건을 채웠습니다. 내용은 직접 수정할 수 있어요.`
          : '검색 결과에서 확인 가능한 참여사를 찾지 못했습니다. 직접 입력해주세요.'
      );
    } catch (err: any) {
      console.error('Failed to search project relations:', err);
      setNewRelationsSearchNote(err.message || '검색에 실패했습니다.');
    } finally {
      setIsSearchingNewRelations(false);
    }
  };

  // 프로젝트 정보(예산 등) 수정 핸들러
  const handleUpdateProjectDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;

    // [수정] "최종고객(발주처)"와 "시행사(발주처)"를 하나로 합치면서, 별도 입력칸 없이도
    // developer 필드가 항상 endCustomer 값을 그대로 따라가게 한다 (카드 뱃지·거래처 회사명
    // 매칭 등 기존에 developer를 참조하던 기능이 계속 동작하도록 유지).
    let updated: Project = { ...editingProject, developer: editingProject.endCustomer };

    // 새로운 담당자를 직접 입력했으면 먼저 명함으로 저장하고 프로젝트에 연결
    if (useDirectContact && directContactName.trim()) {
      const newCardData = {
        name: directContactName.trim(),
        company: directContactCompany.trim() || editingProject.name || '직접 입력',
        department: directContactDept.trim(),
        title: directContactTitle.trim(),
        phoneOffice: directContactPhoneOffice.trim(),
        phoneMobile: directContactPhoneMobile.trim(),
        email: directContactEmail.trim(),
        address: '',
        groupId: 'all'
      };
      try {
        const contactRes = await fetch('/api/contacts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(currentUser ? { 'x-user-id': currentUser.id } : {})
          },
          body: JSON.stringify(newCardData)
        });
        if (contactRes.ok) {
          const savedContact = await contactRes.json();
          setContacts((prev) => [savedContact, ...prev]);
          updated = { ...updated, contactIds: [...(updated.contactIds || []), savedContact.id] };
        }
      } catch (err) {
        console.error('Failed to save direct contact:', err);
      }
    }

    setProjects(projects.map((p) => (p.id === updated.id ? updated : p)));
    setEditingProject(null);
    setUseDirectContact(false);
    setDirectContactName('');
    setDirectContactCompany('');
    setDirectContactDept('');
    setDirectContactTitle('');
    setDirectContactPhoneOffice('');
    setDirectContactPhoneMobile('');
    setDirectContactEmail('');

    try {
      const res = await fetch(`/api/projects/${updated.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(currentUser ? { 'x-user-id': currentUser.id } : {})
        },
        body: JSON.stringify(updated)
      });
      if (!res.ok) throw new Error(`프로젝트 수정에 실패했습니다 (상태: ${res.status}).`);
    } catch (err: any) {
      console.error('Failed to update project:', err);
      alert(`프로젝트 수정에 실패했습니다.\n${err.message || '다시 시도해주세요.'}\n\n화면에는 반영됐지만 서버에는 저장 안 됐을 수 있으니, 새로고침 후 다시 확인해주세요.`);
    }
  };

  // [수정] 프로젝트 수정 폼에서 "AI로 참여사 찾기" 버튼 핸들러. 등록 폼과 동일하게, 비어있는
  // 칸은 바로 채우고 이미 값이 있는 칸은 검색 결과와 다를 때만 한 번 물어보고 확인해야
  // 덮어쓴다. editingProject를 대상으로 하며, 저장(수정 완료) 전까지는 아직 서버에 반영되지
  // 않고 폼 값만 채운다 - 확인 후 직접 수정하거나 그대로 "저장"을 눌러야 실제 반영된다.
  const handleSearchEditProjectRelations = async () => {
    if (!editingProject || !editingProject.name.trim() || isSearchingEditRelations) return;
    const base = editingProject;
    setIsSearchingEditRelations(true);
    setEditRelationsSearchNote(null);
    try {
      const res = await fetch('/api/projects/relations-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName: base.name, endCustomer: base.endCustomer, siteLocation: base.siteLocation })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '검색에 실패했습니다.');
      const f = data.fields || {};

      const fieldDefs: { key: 'contractor' | 'architect' | 'interiorDesigner' | 'electricalDesigner' | 'mechanicalDesigner' | 'supervisor' | 'operator'; label: string }[] = [
        { key: 'contractor', label: '시공사' },
        { key: 'architect', label: '건축설계사' },
        { key: 'interiorDesigner', label: '인테리어설계사' },
        { key: 'electricalDesigner', label: '전기설계사' },
        { key: 'mechanicalDesigner', label: '기계설계사' },
        { key: 'supervisor', label: '감리사' },
        { key: 'operator', label: '운영사' }
      ];

      const toFill: Partial<Project> = {};
      let filledCount = 0;
      const conflicts: { key: typeof fieldDefs[number]['key']; label: string; current: string; found: string }[] = [];

      fieldDefs.forEach((fd) => {
        const found = f[fd.key];
        if (!found) return;
        const current = (base[fd.key] || '').trim();
        if (!current) {
          (toFill as any)[fd.key] = found;
          filledCount++;
        } else if (found !== current) {
          conflicts.push({ key: fd.key, label: fd.label, current, found });
        }
      });

      if (conflicts.length > 0) {
        const msg = `이미 입력된 아래 항목을 검색 결과로 바꿀까요?\n\n` +
          conflicts.map((c) => `${c.label}: "${c.current}" → "${c.found}"`).join('\n') +
          `\n\n확인을 누르면 검색 결과로 바뀌고, 취소를 누르면 기존 입력값이 그대로 유지됩니다.`;
        if (window.confirm(msg)) {
          conflicts.forEach((c) => { (toFill as any)[c.key] = c.found; });
          filledCount += conflicts.length;
        }
      }

      if (Object.keys(toFill).length > 0) {
        setEditingProject((prev) => (prev ? { ...prev, ...toFill } : prev));
      }

      setEditRelationsSearchNote(
        filledCount > 0
          ? `${filledCount}건을 채웠습니다. 내용은 직접 수정할 수 있어요.`
          : '검색 결과에서 확인 가능한 참여사를 찾지 못했습니다. 직접 입력해주세요.'
      );
    } catch (err: any) {
      console.error('Failed to search project relations:', err);
      setEditRelationsSearchNote(err.message || '검색에 실패했습니다.');
    } finally {
      setIsSearchingEditRelations(false);
    }
  };

  // 미팅 기록(팔로우업) 수정 핸들러
  const [followupSaveError, setFollowupSaveError] = useState<string>('');
  const [isSavingFollowup, setIsSavingFollowup] = useState<boolean>(false);
  const handleUpdateFollowup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFollowup) return;
    const { projectId, followup } = editingFollowup;

    // [수정] 예전에는 화면부터 먼저 "저장된 것처럼" 바꾸고 나서 서버로 보냈는데, 서버 저장이
    // 실패해도(특히 용량 큰 PDF/PPT 첨부 시 자주 실패) 아무 표시가 안 나서 사용자는 저장된
    // 줄 알고 넘어가고, 새로고침하면 그대로 사라지는 "조용한 데이터 손실"이 있었다. 이제는
    // 서버 저장이 성공한 뒤에만 화면을 갱신하고 모달을 닫는다. 실패하면 모달은 그대로 열어둬서
    // 입력한 내용을 잃지 않고, 실패 이유를 명확히 보여준다.
    setFollowupSaveError('');
    setIsSavingFollowup(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/followups/${followup.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(currentUser ? { 'x-user-id': currentUser.id } : {})
        },
        body: JSON.stringify({
          content: followup.content,
          date: followup.date,
          meetingDegree: followup.meetingDegree,
          meetingType: followup.meetingType,
          attendee: followup.attendee,
          internalStaffName: followup.internalStaffName,
          attachments: followup.attachments || [],
          expenses: followup.expenses || []
        })
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        if (res.status === 413) {
          throw new Error('첨부파일 용량이 너무 커서 저장에 실패했습니다. 파일 크기를 줄이거나 나눠서 첨부해주세요.');
        }
        throw new Error(`저장에 실패했습니다 (상태: ${res.status}). 잠시 후 다시 시도해주세요.`);
      }

      const updated = await res.json();
      setProjects(projects.map((p) => (p.id === projectId ? updated : p)));
      setEditingFollowup(null);
    } catch (err: any) {
      console.error('Failed to update followup:', err);
      setFollowupSaveError(err.message || '저장 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsSavingFollowup(false);
    }
  };

  // 프로젝트 삭제 핸들러
  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('이 프로젝트 및 관련 팔로우업 기록을 완전히 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'DELETE',
        headers: currentUser ? { 'x-user-id': currentUser.id } : undefined
      });
      // [수정] 예전엔 삭제 요청이 실패해도(finally 블록이라) 무조건 화면에서 지워버렸다 —
      // 사용자는 지워진 줄 알지만 서버에는 그대로 남아있어서, 새로고침하면 다시 나타나거나
      // 동료 화면에는 계속 보이는 혼란이 있었다. 이제는 서버 삭제가 실제로 성공했을 때만
      // 화면에서 지운다.
      if (!res.ok) throw new Error(`삭제에 실패했습니다 (상태: ${res.status}).`);
      setProjects(projects.filter((p) => p.id !== id));
      // [추가] "리스트 출력" 표에서 이 프로젝트가 선택돼 있었다면 선택 목록에서도 제거한다.
      setSelectedListIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err: any) {
      alert(`삭제에 실패했습니다.\n${err.message || '다시 시도해주세요.'}`);
    }
  };

  // [추가] "리스트 출력" 표에서 선택한(또는 전체) 프로젝트를 한 번에 삭제하는 핸들러.
  // 서버의 일괄 삭제 API(/api/projects/bulk-delete)를 한 번만 호출해 처리한다.
  // 카드형 화면(프로젝트 리스트)과 같은 projects 상태를 쓰므로, 여기서 삭제하면
  // 카드형 화면에서도 동일하게 사라진다.
  const handleBulkDeleteProjects = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!confirm(`선택한 프로젝트 ${ids.length}건과 관련 팔로우업 기록을 완전히 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    try {
      const res = await fetch('/api/projects/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(currentUser ? { 'x-user-id': currentUser.id } : {})
        },
        body: JSON.stringify({ ids })
      });
      if (!res.ok) throw new Error(`삭제에 실패했습니다 (상태: ${res.status}).`);
      const idSet = new Set(ids);
      setProjects(projects.filter((p) => !idSet.has(p.id)));
      setSelectedListIds(new Set());
    } catch (err: any) {
      alert(`삭제에 실패했습니다.\n${err.message || '다시 시도해주세요.'}`);
    }
  };

  // 상태 변경 핸들러
  const handleStatusChange = async (id: string, newSt: Project['status'], e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    const target = projects.find((p) => p.id === id);
    if (!target) return;
    const updated = { ...target, status: newSt };
    setProjects(projects.map((p) => (p.id === id ? updated : p)));
    fetch(`/api/projects/${id}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        ...(currentUser ? { 'x-user-id': currentUser.id } : {})
      },
      body: JSON.stringify({ status: newSt })
    });
  };

  // 팔로우업 노트 및 미팅 정보 추가
  // [수정] 명함 검색해서 미팅자를 추가할 때, 예전엔 이름만 저장하고 전화번호는 화면에 표시할 때만
  // 명함에서 실시간으로 찾아 붙였다. 이제는 추가하는 시점에 회사명·전화번호(핸드폰 우선, 없으면
  // 사무실)를 함께 텍스트로 채워 넣는다. 예) "주현우(와고코리아, 010-0000-0000)".
  // 전화번호가 없으면 회사명만, 회사명도 없으면 이름만 저장한다.
  const formatAttendeeEntry = (c: BusinessCard): string => {
    const parts: string[] = [];
    if (c.company) parts.push(c.company);
    const phone = c.phoneMobile || c.phoneOffice;
    if (phone) parts.push(phone);
    return parts.length ? `${c.name.trim()}(${parts.join(', ')})` : c.name.trim();
  };

  // 미팅/팔로우업 차수 시퀀스: 1차 미팅 → 1차 팔로우업 → 2차 미팅 → 2차 팔로우업 → ... 순서로 값을 만들고,
  // 이미 기록된 차수/구분은 건너뛰어 "다음에 기록해야 할 차수"를 계산합니다.
  const buildMeetingSequenceLabel = (degree: number, type: 'meeting' | 'followup'): string =>
    `${degree}차 ${type === 'meeting' ? '미팅' : '팔로우업'}`;

  const getNextMeetingSlot = (followUps: ProjectFollowUp[]): { degree: number; type: 'meeting' | 'followup' } => {
    const used = new Set(
      followUps
        .filter((f) => f.meetingDegree)
        .map((f) => `${f.meetingDegree}-${f.meetingType || 'meeting'}`)
    );
    for (let degree = 1; degree <= 500; degree++) {
      if (!used.has(`${degree}-meeting`)) return { degree, type: 'meeting' };
      if (!used.has(`${degree}-followup`)) return { degree, type: 'followup' };
    }
    return { degree: 1, type: 'meeting' };
  };

  // 드롭다운에 보여줄 차수 목록: 이미 쓰인 차수 + 앞으로 선택 가능한 여유분(10개)까지 생성
  const buildMeetingSequenceOptions = (followUps: ProjectFollowUp[]): { degree: number; type: 'meeting' | 'followup'; label: string; used: boolean }[] => {
    const used = new Set(
      followUps
        .filter((f) => f.meetingDegree)
        .map((f) => `${f.meetingDegree}-${f.meetingType || 'meeting'}`)
    );
    const maxUsedDegree = followUps.reduce((max, f) => Math.max(max, f.meetingDegree || 0), 0);
    const upperBound = Math.max(maxUsedDegree + 10, 10);
    const options: { degree: number; type: 'meeting' | 'followup'; label: string; used: boolean }[] = [];
    for (let degree = 1; degree <= upperBound; degree++) {
      (['meeting', 'followup'] as const).forEach((type) => {
        const key = `${degree}-${type}`;
        options.push({ degree, type, label: buildMeetingSequenceLabel(degree, type), used: used.has(key) });
      });
    }
    return options;
  };

  // 프로젝트를 펼치면(expandedId 변경), 그 프로젝트의 다음 기록 차수/구분을 자동으로 미리 선택해 둠
  useEffect(() => {
    if (!expandedId) return;
    const proj = projects.find((p) => p.id === expandedId);
    if (!proj) return;
    const next = getNextMeetingSlot(proj.followUps || []);
    setMeetingDegree(next.degree);
    setMeetingType(next.type);
  }, [expandedId]);

  // 파일을 base64로 읽어서 첨부파일 목록에 추가 (제안서, 견적서, 발송자료 등)
  const readFilesAsAttachments = (files: FileList, onAdd: (att: ProjectFollowUpAttachment) => void) => {
    // [수정] 특히 아이폰/아이패드에서 용량이 큰 PPT/엑셀 파일을 그대로 base64로 읽으면
    // 메모리 부담으로 브라우저가 멈추거나 업로드가 조용히 실패하는 경우가 있어서,
    // 20MB가 넘는 파일은 미리 안내하고 건너뛴다.
    const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024; // 20MB
    Array.from(files).forEach((file) => {
      if (file.size > MAX_ATTACHMENT_SIZE) {
        alert(`"${file.name}" 파일이 너무 큽니다(${formatFileSize(file.size)}). 20MB 이하 파일만 첨부할 수 있어요.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        onAdd({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          dataUrl: ev.target?.result as string,
          size: file.size
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  // 비용 카테고리 한글 라벨
  const expenseCategoryLabel = (item: MeetingExpenseItem): string => {
    const labels: Record<string, string> = {
      meal: '식대',
      drinks: '음료(커피)',
      purchase: '물품 구입',
      service_fee: '식사 서비스 비용',
      custom: item.categoryCustom || '직접 입력'
    };
    return labels[item.category] || item.category;
  };

  // /api/scan-receipt가 반환하는 범용 카테고리를, 미팅 비용에서 쓰는 카테고리로 변환
  const mapReceiptCategoryToMeeting = (cat: string): { category: MeetingExpenseItem['category']; categoryCustom?: string } => {
    if (cat === 'meal') return { category: 'meal' };
    if (cat === 'beverage') return { category: 'drinks' };
    if (cat === 'supplies') return { category: 'purchase' };
    const otherLabels: Record<string, string> = {
      fuel: '주유비', parking: '주차비', toll: '통행료', maintenance: '차량 정비', agency_drive: '대리운전', other: '기타'
    };
    return { category: 'custom', categoryCustom: otherLabels[cat] || '기타' };
  };

  const addMeetingExpense = (setter: React.Dispatch<React.SetStateAction<MeetingExpenseItem[]>>) => {
    setter((prev) => [...prev, {
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      category: 'meal',
      amount: 0,
      payMethod: 'company_card',
      memo: ''
    }]);
  };
  const updateMeetingExpense = (setter: React.Dispatch<React.SetStateAction<MeetingExpenseItem[]>>, id: string, patch: Partial<MeetingExpenseItem>) => {
    setter((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };
  const removeMeetingExpense = (setter: React.Dispatch<React.SetStateAction<MeetingExpenseItem[]>>, id: string) => {
    setter((prev) => prev.filter((e) => e.id !== id));
  };

  // 영수증 크롭 조정 모달 대상 (미팅 비용은 등록/수정 화면 어느 쪽 setter를 쓸지도 같이 기억해둠)
  const [receiptCropTarget, setReceiptCropTarget] = useState<{
    tempId: string;
    rawImage: string;
    setter: React.Dispatch<React.SetStateAction<MeetingExpenseItem[]>>;
  } | null>(null);
  const [receiptCameraTarget, setReceiptCameraTarget] = useState<{
    setter: React.Dispatch<React.SetStateAction<MeetingExpenseItem[]>>;
  } | null>(null);

  const meetingReceiptFallbackInputRef = React.useRef<HTMLInputElement>(null);
  const meetingReceiptFallbackRef = React.useRef<React.Dispatch<React.SetStateAction<MeetingExpenseItem[]>> | null>(null);

  // 영수증 사진을 선택하면 우선 항목으로 추가해두고, 크롭 조정 모달을 띄움
  const scanReceiptAndAddExpense = (file: File, setter: React.Dispatch<React.SetStateAction<MeetingExpenseItem[]>>) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rawDataUrl = ev.target?.result as string;
      const tempId = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setter((prev) => [...prev, { id: tempId, category: 'custom', amount: 0, payMethod: 'company_card', memo: '', receiptImage: rawDataUrl }]);
      setReceiptCropTarget({ tempId, rawImage: rawDataUrl, setter });
    };
    reader.readAsDataURL(file);
  };

  // 크롭이 확정된 영수증을 AI로 인식해서 해당 비용 항목에 반영
  const runMeetingReceiptOcr = async (target: NonNullable<typeof receiptCropTarget>, dataUrl: string) => {
    const { tempId, setter } = target;
    updateMeetingExpense(setter, tempId, { receiptImage: dataUrl });
    setScanningExpenseId(tempId);
    try {
      const res = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl })
      });
      const data = await res.json();
      if (res.ok) {
        const mapped = mapReceiptCategoryToMeeting(data.category);
        // [수정] AI가 함께 알려준 "영수증 실물의 네 꼭짓점 좌표"로 사진을 다시 한번 정밀하게 잘라낸다.
        let finalReceiptImage = dataUrl;
        if (isValidNormalizedCorners(data.corners)) {
          try {
            finalReceiptImage = await warpDataUrlWithNormalizedCorners(dataUrl, data.corners);
          } catch (err) {
            console.error('AI 좌표 기반 영수증 재크롭 실패, 기존 사진 유지:', err);
          }
        }
        updateMeetingExpense(setter, tempId, {
          category: mapped.category,
          categoryCustom: mapped.categoryCustom,
          amount: data.amount || 0,
          payMethod: data.payMethod === 'personal_card' ? 'personal_card' : data.payMethod === 'cash' ? 'cash' : 'company_card',
          memo: [data.merchantName, data.memo].filter(Boolean).join(' · '),
          receiptImage: finalReceiptImage
        });
      }
    } catch (err) {
      console.error('영수증 스캔 실패:', err);
    } finally {
      setScanningExpenseId(null);
    }
  };


  // 이름 + 사무실/핸드폰 번호를 직접 입력해서 미팅자 항목을 만듭니다 (예: "김대리(H.010-..., O.02-...)")
  const buildAttendeeEntry = (name: string, office: string, mobile: string): string => {
    const parts: string[] = [];
    if (mobile) parts.push(`H.${mobile}`);
    if (office) parts.push(`O.${office}`);
    return parts.length ? `${name.trim()}(${parts.join(', ')})` : name.trim();
  };

  // 미팅자 문자열을 콤마로 나누되, "이름(전화번호)" 처럼 괄호 안의 콤마는 나누지 않습니다.
  const splitAttendeeEntries = (attendee: string): string[] => {
    const result: string[] = [];
    let depth = 0;
    let current = '';
    for (const ch of attendee) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        if (current.trim()) result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim()) result.push(current.trim());
    return result;
  };

  // "이름(전화번호)" 형식이면 이름과 직접입력 전화번호를 분리해서 반환
  // [수정] 예전엔 정규식 `/^(.+?)\s*\(([^)]*)\)\s*$/`으로 파싱했는데, `[^)]*`가 괄호 중첩을
  // 허용하지 않아서 "주현우((주)와고코리아, 010-...)"처럼 회사명 자체에 괄호가 들어간 경우
  // (한국 회사명에 흔한 "(주)" 표기) 매칭이 아예 실패했다. 그러면 이름을 못 뽑아내고 전체
  // 문자열을 통째로 "이름"으로 취급해버려서, "이미 추가됐는지" 비교가 항상 실패하고 —
  // 화면에 체크 표시/칩이 안 뜨고, 클릭할 때마다 중복으로 계속 추가되는 버그로 이어졌다.
  // 이제 문자열 끝에서부터 괄호 깊이를 세어, 맨 끝 ")"와 짝이 맞는 가장 바깥쪽 "("을 찾는
  // 방식으로 파싱해서, 괄호가 중첩돼 있어도 이름만 정확히 분리한다.
  const parseAttendeeEntry = (entry: string): { name: string; manualPhone: string | null } => {
    const trimmed = entry.trim();
    if (!trimmed.endsWith(')')) return { name: trimmed, manualPhone: null };
    let depth = 0;
    let openIdx = -1;
    for (let i = trimmed.length - 1; i >= 0; i--) {
      const ch = trimmed[i];
      if (ch === ')') depth++;
      else if (ch === '(') {
        depth--;
        if (depth === 0) { openIdx = i; break; }
      }
    }
    if (openIdx <= 0) return { name: trimmed, manualPhone: null };
    const name = trimmed.slice(0, openIdx).trim();
    const phone = trimmed.slice(openIdx + 1, trimmed.length - 1).trim();
    if (!name) return { name: trimmed, manualPhone: null };
    return { name, manualPhone: phone };
  };

  // 미팅자 문자열에서 특정 명함 이름의 항목을 제거 (괄호 안 전화번호 포함해서 통째로 제거)
  const removeAttendeeEntry = (current: string, c: BusinessCard): string => {
    const entries = splitAttendeeEntries(current);
    return entries
      .filter((entry) => parseAttendeeEntry(entry).name !== c.name)
      .join(', ');
  };

  // [수정] 특정 명함이 이미 미팅자로 추가돼 있는지 확인. 예전엔 `attendee.includes(c.name)`처럼
  // 전체 문자열에 대한 단순 부분 문자열 포함 여부로 판단해서, 다른 참여자 이름/전화번호 안에
  // 우연히 같은 글자가 들어있으면 잘못 "추가됨"으로 표시되는 버그가 있었다. 이제 콤마로 분리한
  // 항목 단위로, 이름이 정확히 일치하는지 확인한다 (전화번호로 직접 입력한 참여자도 포함해서 비교).
  const isAttendeeAdded = (current: string, c: BusinessCard): boolean => {
    if (!current) return false;
    return splitAttendeeEntries(current).some((entry) => parseAttendeeEntry(entry).name === c.name);
  };

  // 읽기 전용 화면에 미팅자를 표시할 때, 각 참여자마다:
  // 1) "이름(전화번호)" 형식으로 직접 입력한 번호가 있으면 그대로 표시
  // 2) 아니면 명함(주소록)에서 이름이 일치하는 연락처를 찾아 자동 표시
  // 3) 둘 다 없으면 이름만 표시
  const renderAttendeeWithPhone = (attendee?: string) => {
    if (!attendee) return null;
    const entries = splitAttendeeEntries(attendee);
    return entries.map((entry, idx) => {
      const { name, manualPhone } = parseAttendeeEntry(entry);
      let phoneDisplay = manualPhone || '';
      if (!phoneDisplay) {
        const c = contacts.find((x) => x.name === name);
        const phoneParts: string[] = [];
        if (c?.phoneMobile) phoneParts.push(`H.${c.phoneMobile}`);
        if (c?.phoneOffice) phoneParts.push(`O.${c.phoneOffice}`);
        phoneDisplay = phoneParts.join(', ');
      }
      return (
        <span key={idx}>
          {idx > 0 && ', '}
          {name}
          {phoneDisplay && <span className="text-slate-400"> ({phoneDisplay})</span>}
        </span>
      );
    });
  };

  // 미팅 비용 지출 UI 섹션 (등록/수정 화면 공용)
  const renderExpenseSection = (expenses: MeetingExpenseItem[], setter: React.Dispatch<React.SetStateAction<MeetingExpenseItem[]>>) => (
    <div className="space-y-1.5">
      <label className="block text-[10px] text-slate-500 font-bold flex items-center gap-1">
        <Receipt className="w-3 h-3" /> 비용 지출 (영수증 스캔 가능)
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setReceiptCameraTarget({ setter })}
          className="flex-1 flex items-center justify-center gap-1.5 border border-dashed border-slate-200 rounded-xl py-2.5 hover:border-emerald-500 text-slate-400 hover:text-emerald-400 text-[11px] font-semibold transition-colors"
        >
          <Camera className="w-3.5 h-3.5" />
          <span>영수증 촬영</span>
        </button>
        <button
          type="button"
          onClick={() => addMeetingExpense(setter)}
          className="px-3 rounded-xl border border-dashed border-slate-200 text-slate-400 hover:text-indigo-400 hover:border-indigo-500 text-[11px] font-semibold transition-colors shrink-0"
        >
          + 직접 입력
        </button>
      </div>

      {expenses.length > 0 && (
        <div className="space-y-2">
          {expenses.map((exp) => (
            <div key={exp.id} className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1.5">
              <div className="flex items-start gap-2">
                {exp.receiptImage && (
                  <img
                    src={exp.receiptImage}
                    alt="영수증"
                    onClick={() => setEnlargedReceiptUrl(exp.receiptImage!)}
                    className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                  />
                )}
                <div className="flex-1 grid grid-cols-2 gap-1.5">
                  <select
                    value={exp.category}
                    onChange={(e) => updateMeetingExpense(setter, exp.id, { category: e.target.value as MeetingExpenseItem['category'] })}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] text-slate-700 outline-none focus:border-indigo-500"
                  >
                    <option value="meal">식대</option>
                    <option value="drinks">음료(커피)</option>
                    <option value="purchase">물품 구입</option>
                    <option value="service_fee">식사 서비스 비용</option>
                    <option value="custom">직접 입력</option>
                  </select>
                  <select
                    value={exp.payMethod}
                    onChange={(e) => updateMeetingExpense(setter, exp.id, { payMethod: e.target.value as MeetingExpenseItem['payMethod'] })}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] text-slate-700 outline-none focus:border-indigo-500"
                  >
                    <option value="company_card">법인(회사)카드</option>
                    <option value="personal_card">개인카드</option>
                    <option value="cash">현금</option>
                  </select>
                  {exp.category === 'custom' && (
                    <input
                      type="text"
                      value={exp.categoryCustom || ''}
                      onChange={(e) => updateMeetingExpense(setter, exp.id, { categoryCustom: e.target.value })}
                      placeholder="카테고리명 직접 입력"
                      className="col-span-2 bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] text-slate-700 placeholder:text-slate-400 outline-none focus:border-indigo-500"
                    />
                  )}
                  <input
                    type="text"
                    inputMode="numeric"
                    value={exp.amount ? formatCurrencyInput(exp.amount) : ''}
                    onChange={(e) => updateMeetingExpense(setter, exp.id, { amount: parseCurrencyInput(e.target.value) })}
                    placeholder="금액 (원)"
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] text-slate-700 placeholder:text-slate-400 font-mono outline-none focus:border-indigo-500"
                  />
                  <input
                    type="text"
                    value={exp.memo || ''}
                    onChange={(e) => updateMeetingExpense(setter, exp.id, { memo: e.target.value })}
                    placeholder="지출 상세 사유/메모"
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[11px] text-slate-700 placeholder:text-slate-400 outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeMeetingExpense(setter, exp.id)}
                  className="text-rose-500 hover:text-rose-700 font-bold shrink-0 px-1"
                >
                  ✕
                </button>
              </div>
              {scanningExpenseId === exp.id && (
                <div className="text-[10px] text-indigo-400 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> 영수증 스캔 중...
                </div>
              )}
            </div>
          ))}
          <div className="text-right text-[11px] text-slate-500 font-bold">
            합계: <span className="text-emerald-400 font-mono">{formatCurrencyInput(expenses.reduce((s, e) => s + e.amount, 0))}원</span>
          </div>
        </div>
      )}
    </div>
  );

  // 수정 모달에서 editingFollowup.followup.expenses 를 다루기 위한 setState 어댑터
  const editExpensesSetter: React.Dispatch<React.SetStateAction<MeetingExpenseItem[]>> = (updater) => {
    setEditingFollowup((prev) => {
      if (!prev) return prev;
      const current = prev.followup.expenses || [];
      const next = typeof updater === 'function' ? (updater as (p: MeetingExpenseItem[]) => MeetingExpenseItem[])(current) : updater;
      return { ...prev, followup: { ...prev.followup, expenses: next } };
    });
  };

  const handleAddFollowup = async (projectId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingContent.trim() && !voiceAttached && meetingAttachments.length === 0 && meetingExpenses.length === 0) return;

    const payload = {
      content: meetingContent,
      date: meetingDate || getTodayLocalStr(),
      status: 'done' as const,
      meetingDegree: meetingDegree || undefined,
      meetingType: meetingDegree ? meetingType : undefined,
      attendee: meetingAttendee,
      internalStaffName: meetingStaffName,
      hasVoice: voiceAttached,
      voiceUrl: voiceAttached ? attachedVoiceUrl : undefined,
      voiceDuration: voiceAttached ? attachedVoiceDuration : undefined,
      attachments: meetingAttachments,
      expenses: meetingExpenses
    };

    // [수정] 예전에는 서버 저장이 실패하면(특히 용량 큰 PDF/PPT 첨부 시) 아무 에러도 없이
    // 화면에만 로컬로 추가해두고 끝냈다 — 사용자는 저장된 줄 알지만 새로고침하면 사라지는
    // "조용한 데이터 손실"이었다. 이제는 실패하면 명확히 알리고, 입력 내용은 그대로 남겨서
    // 사용자가 다시 저장을 시도할 수 있게 한다.
    setFollowupSaveError('');
    setIsSavingFollowup(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/followups`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(currentUser ? { 'x-user-id': currentUser.id } : {})
        },
        body: JSON.stringify(payload)
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        if (res.status === 413) {
          throw new Error('첨부파일 용량이 너무 커서 저장에 실패했습니다. 파일 크기를 줄이거나 나눠서 첨부해주세요.');
        }
        throw new Error(`저장에 실패했습니다 (상태: ${res.status}). 잠시 후 다시 시도해주세요.`);
      }

      const updated = await res.json();
      setProjects(projects.map((p) => (p.id === projectId ? updated : p)));

      // [수정] 저장에 성공했을 때만 입력폼을 비우고 차수를 전진시킨다. 실패 시 이 블록까지
      // 오지 않으므로(위에서 throw), 사용자가 입력했던 내용이 그대로 남아 다시 저장을 시도할 수 있다.
      setMeetingContent('');
      setVoiceAttached(false);
      setAttachedVoiceDuration('');
      setAttachedVoiceUrl('');
      setMeetingAttachments([]);
      setMeetingExpenses([]);
      // 다음 기록을 위해 차수/구분을 순서대로 한 단계 전진 (1차 미팅 → 1차 팔로우업 → 2차 미팅 → ...)
      if (meetingDegree > 0) {
        if (meetingType === 'meeting') {
          setMeetingType('followup');
        } else {
          setMeetingDegree(meetingDegree + 1);
          setMeetingType('meeting');
        }
      }
    } catch (err: any) {
      console.error('Failed to add followup:', err);
      alert(`미팅 기록 저장에 실패했습니다.\n${err.message || '잠시 후 다시 시도해주세요.'}`);
    } finally {
      setIsSavingFollowup(false);
    }
  };

  // 팔로우업 상태 토글 (완료/진행중)
  const handleToggleFollowupStatus = async (projectId: string, followupId: string) => {
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) return;
    const f = proj.followUps.find((item) => item.id === followupId);
    if (!f) return;
    const nextSt = f.status === 'done' ? 'planned' : 'done';

    const updatedFollowups = proj.followUps.map((item) => (item.id === followupId ? { ...item, status: nextSt } : item));
    const updatedProj = { ...proj, followUps: updatedFollowups };
    setProjects(projects.map((p) => (p.id === projectId ? updatedProj : p)));

    fetch(`/api/projects/${projectId}/followups/${followupId}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        ...(currentUser ? { 'x-user-id': currentUser.id } : {})
      },
      body: JSON.stringify({ status: nextSt })
    });
  };

  const getStatusBadge = (st: Project['status']) => {
    switch (st) {
      case 'opportunity': return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-500/30">💡 기회</span>;
      case 'progress': return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-500/30">⚡ 진행</span>;
      case 'completed': return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-500/30">✅ 완료</span>;
      case 'failed': return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-500/30">❌ 실패</span>;
    }
  };

  const filteredProjects = projects
    .filter((p) => filterStatus === 'all' || p.status === filterStatus)
    .filter((p) => matchesProjectSearch(p, projectSearchQuery));

  // [수정] 카드 목록 화면에서만 "50개씩 더 보기"를 적용하기 위한 파생 목록.
  // 엑셀 다운로드/리스트 출력/PDF는 이 제한과 무관하게 항상 filteredProjects 전체를 쓴다.
  const visibleProjects = filteredProjects.slice(0, visibleProjectCount);

  // [수정] 전체 프로젝트 목록을 엑셀(.xls)로 다운로드. 현재 화면에 적용된 상태 필터/검색어를 그대로 반영한다.
  const STATUS_LABEL_KO: Record<Project['status'], string> = { opportunity: '기회', progress: '진행', completed: '완료', failed: '실패' };
  // [수정] 출력 양식(엑셀/화면표/PDF)에서 예산이 숫자로만 되어 있으면 천단위 콤마를 붙여서 보여준다 (카드에서 쓰던 방식과 동일)
  const formatBudgetDisplay = (budget?: string): string => {
    if (!budget) return '-';
    return /^\d+$/.test(budget) ? `${formatCurrencyInput(budget)}원` : budget;
  };
  const PRIORITY_LABEL_KO: Record<Project['priority'], string> = { high: '높음', medium: '보통', low: '낮음' };

  // [추가] 프로젝트 리스트 출력(화면 표/PDF 인쇄/엑셀)을 "프로젝트 파이프라인" 양식에 맞춰
  // 통일하면서 추가된 값들. 세 출력 방식(화면 표, 인쇄, 엑셀)이 서로 다른 헤더/순서로
  // 어긋나지 않도록, 아래 PIPELINE_COLUMNS 하나로 컬럼 구성과 각 셀 값을 정의해서 세
  // 군데(리스트 출력 표, 인쇄 미리보기/실제 인쇄, 엑셀)에서 모두 그대로 가져다 쓴다.
  const PIPELINE_STAGE_LABEL_KO: Record<NonNullable<Project['pipelineStage']>, string> = {
    lead: '발굴(Lead)',
    quotation: '견적(Quotation)',
    negotiation: '협상(Negotiation)',
    closing: '수주예정(Closing)',
    hold: '보류(Hold)'
  };
  const PIPELINE_STAGE_OPTIONS: Array<{ value: NonNullable<Project['pipelineStage']>; label: string }> = [
    { value: 'lead', label: '발굴 (Lead)' },
    { value: 'quotation', label: '견적 (Quotation)' },
    { value: 'negotiation', label: '협상 (Negotiation)' },
    { value: 'closing', label: '수주예정 (Closing)' },
    { value: 'hold', label: '보류 (Hold)' }
  ];
  // 가중 예상금액 = 예상 수주금액(순수 숫자인 경우) × 성사확률(%) / 100. 둘 중 하나라도
  // 없으면 계산할 수 없으므로 null을 돌려준다.
  const computeWeightedAmount = (budget?: string, winProbability?: number): number | null => {
    if (!budget || !/^\d+$/.test(budget)) return null;
    if (winProbability === undefined || winProbability === null || isNaN(winProbability)) return null;
    return Math.round(Number(budget) * (winProbability / 100));
  };
  const formatKRW = (n: number): string => `₩${n.toLocaleString('ko-KR')}`;

  interface PipelineColumn {
    label: string;
    align: 'left' | 'center' | 'right';
    getValue: (p: Project, idx: number) => string;
    excelValue: (p: Project, idx: number) => string | number;
  }
  const PIPELINE_COLUMNS: PipelineColumn[] = [
    { label: '번호', align: 'center', getValue: (_p, idx) => String(idx + 1), excelValue: (_p, idx) => idx + 1 },
    { label: '프로젝트명', align: 'left', getValue: (p) => p.name, excelValue: (p) => p.name },
    { label: '영업자', align: 'center', getValue: (p) => p.salesRep || '-', excelValue: (p) => p.salesRep || '' },
    { label: '최종고객(발주처)', align: 'left', getValue: (p) => p.endCustomer || '-', excelValue: (p) => p.endCustomer || '' },
    { label: '현장/지역', align: 'center', getValue: (p) => p.siteLocation || '-', excelValue: (p) => p.siteLocation || '' },
    { label: '제품군', align: 'center', getValue: (p) => p.productGroup || '-', excelValue: (p) => p.productGroup || '' },
    { label: '주요 품목·사양', align: 'left', getValue: (p) => p.mainItemsSpec || '-', excelValue: (p) => p.mainItemsSpec || '' },
    {
      label: '예상 수주금액(KRW)', align: 'right',
      getValue: (p) => formatBudgetDisplay(p.budget),
      excelValue: (p) => (p.budget && /^\d+$/.test(p.budget)) ? Number(p.budget) : (p.budget || '')
    },
    { label: '예상 수주시기', align: 'center', getValue: (p) => p.expectedTiming || '미정', excelValue: (p) => p.expectedTiming || '' },
    {
      label: '성사확률(%)', align: 'center',
      getValue: (p) => (p.winProbability !== undefined && p.winProbability !== null) ? `${p.winProbability}%` : '-',
      excelValue: (p) => (p.winProbability !== undefined && p.winProbability !== null) ? p.winProbability : ''
    },
    {
      label: '가중 예상금액(KRW)', align: 'right',
      getValue: (p) => { const w = computeWeightedAmount(p.budget, p.winProbability); return w !== null ? formatKRW(w) : '-'; },
      excelValue: (p) => { const w = computeWeightedAmount(p.budget, p.winProbability); return w !== null ? w : ''; }
    },
    { label: '진행단계', align: 'center', getValue: (p) => p.pipelineStage ? PIPELINE_STAGE_LABEL_KO[p.pipelineStage] : '-', excelValue: (p) => p.pipelineStage ? PIPELINE_STAGE_LABEL_KO[p.pipelineStage] : '' },
    { label: '경쟁사', align: 'center', getValue: (p) => p.competitor || '-', excelValue: (p) => p.competitor || '' },
    { label: 'ABB 지원요청', align: 'left', getValue: (p) => p.supportNeeded || '-', excelValue: (p) => p.supportNeeded || '' },
    { label: '비고', align: 'left', getValue: (p) => p.remarks || '-', excelValue: (p) => p.remarks || '' }
  ];
  // 인쇄/엑셀 하단 "합계" 행에서 예상 수주금액·가중 예상금액을 더할 때 쓰는 컬럼 위치
  const PIPELINE_BUDGET_COL_IDX = 7;
  const PIPELINE_WEIGHTED_COL_IDX = 10;
  const pipelineTotals = (() => {
    let budgetSum = 0;
    let weightedSum = 0;
    filteredProjects.forEach((p) => {
      if (p.budget && /^\d+$/.test(p.budget)) budgetSum += Number(p.budget);
      const w = computeWeightedAmount(p.budget, p.winProbability);
      if (w !== null) weightedSum += w;
    });
    return { budgetSum, weightedSum };
  })();

  // [수정] 예전엔 이 내보내기가 HTML 표를 확장자만 .xls로 바꿔서 내려주는 방식이었다가,
  // 이후 진짜 xlsx(숫자 셀 포함)로 바꿨었다. 이번엔 인쇄/화면 리스트 출력과 똑같이 제목
  // ("프로젝트 파이프라인 (Project Pipeline)")과 출력일 줄을 넣고 제목에 색을 넣어달라는
  // 요청이 있었는데, 지금까지 쓰던 xlsx 패키지(SheetJS 커뮤니티 버전)는 "새 파일 저장" 시
  // 글자색/배경색 등 셀 서식을 전혀 쓰지 못한다(직접 실험해서 확인함 - .s에 스타일을 넣어도
  // 결과 파일에는 반영되지 않음, 유료 Pro 버전에서만 지원). 그래서 이 내보내기만 셀 서식
  // 쓰기를 지원하는 exceljs 라이브러리로 바꾼다.
  const handleExportProjectsExcel = async () => {
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('전체_프로젝트', {
      pageSetup: {
        // [추가] 인쇄와 동일하게 A4 가로, 위/아래 20mm·좌/우 25mm 여백으로 설정.
        // (SheetJS와 달리 exceljs는 용지 방향까지 실제로 써서 저장할 수 있다.)
        orientation: 'landscape', paperSize: 9 /* A4 */,
        margins: { left: 0.98, right: 0.98, top: 0.79, bottom: 0.79, header: 0.3, footer: 0.3 }
      }
    });
    const colCount = PIPELINE_COLUMNS.length;

    // 제목 줄 - 인디고 배경 + 흰 글씨로 색을 넣어 인쇄물의 굵은 제목과 대응되게 함
    ws.mergeCells(1, 1, 1, colCount);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = '프로젝트 파이프라인 (Project Pipeline)';
    titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 26;

    // 출력일 줄
    ws.mergeCells(2, 1, 2, colCount);
    const dateCell = ws.getCell(2, 1);
    dateCell.value = `출력일: ${new Date().toLocaleDateString('ko-KR')}`;
    dateCell.font = { size: 9, color: { argb: 'FF6B7280' } };
    dateCell.alignment = { horizontal: 'center' };

    const thinBorder = { style: 'thin' as const, color: { argb: 'FF000000' } };
    const fullBorder = { top: thinBorder, left: thinBorder, right: thinBorder, bottom: thinBorder };

    // 헤더 행 (3번째 줄은 비워서 제목 영역과 표 사이 여백을 둠)
    const headerRowIdx = 4;
    const headerRow = ws.getRow(headerRowIdx);
    PIPELINE_COLUMNS.forEach((c, colIdx) => {
      const cell = headerRow.getCell(colIdx + 1);
      cell.value = c.label;
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = fullBorder;
    });
    headerRow.height = 20;

    filteredProjects.forEach((p, idx) => {
      const row = ws.getRow(headerRowIdx + 1 + idx);
      PIPELINE_COLUMNS.forEach((c, colIdx) => {
        const cell = row.getCell(colIdx + 1);
        const value = c.excelValue(p, idx);
        cell.value = value;
        cell.alignment = { horizontal: c.align, vertical: 'middle', wrapText: true };
        cell.border = fullBorder;
        if ((colIdx === PIPELINE_BUDGET_COL_IDX || colIdx === PIPELINE_WEIGHTED_COL_IDX) && typeof value === 'number') {
          cell.numFmt = '#,##0';
        }
      });
    });

    // 합계 행 - 예상 수주금액·가중 예상금액 열에만 합계를 넣고, 나머지는 "합계" 라벨과 빈 칸으로 병합
    const totalsRowIdx = headerRowIdx + 1 + filteredProjects.length;
    if (filteredProjects.length > 0) {
      ws.mergeCells(totalsRowIdx, 1, totalsRowIdx, PIPELINE_BUDGET_COL_IDX);
      const labelCell = ws.getCell(totalsRowIdx, 1);
      labelCell.value = '합계';
      labelCell.alignment = { horizontal: 'center', vertical: 'middle' };

      const budgetCell = ws.getCell(totalsRowIdx, PIPELINE_BUDGET_COL_IDX + 1);
      budgetCell.value = pipelineTotals.budgetSum;
      budgetCell.numFmt = '#,##0';
      budgetCell.alignment = { horizontal: 'right', vertical: 'middle' };

      if (PIPELINE_WEIGHTED_COL_IDX - PIPELINE_BUDGET_COL_IDX > 1) {
        ws.mergeCells(totalsRowIdx, PIPELINE_BUDGET_COL_IDX + 2, totalsRowIdx, PIPELINE_WEIGHTED_COL_IDX);
      }
      const weightedCell = ws.getCell(totalsRowIdx, PIPELINE_WEIGHTED_COL_IDX + 1);
      weightedCell.value = pipelineTotals.weightedSum;
      weightedCell.numFmt = '#,##0';
      weightedCell.alignment = { horizontal: 'right', vertical: 'middle' };

      if (colCount - PIPELINE_WEIGHTED_COL_IDX > 1) {
        ws.mergeCells(totalsRowIdx, PIPELINE_WEIGHTED_COL_IDX + 2, totalsRowIdx, colCount);
      }

      const totalsRow = ws.getRow(totalsRowIdx);
      for (let c = 1; c <= colCount; c++) {
        const cell = totalsRow.getCell(c);
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
        cell.border = fullBorder;
      }
    }

    // 열 너비 - 제목/출력일 줄은 병합 셀이라 건너뛰고, 헤더/데이터 기준으로 계산
    PIPELINE_COLUMNS.forEach((c, colIdx) => {
      let maxLen = c.label.length;
      filteredProjects.forEach((p, idx) => {
        const val = c.excelValue(p, idx);
        if (val !== null && val !== undefined && val !== '') {
          maxLen = Math.min(Math.max(maxLen, val.toString().length), 40);
        }
      });
      ws.getColumn(colIdx + 1).width = maxLen + 3;
    });

    // 제목/헤더 행이 스크롤해도 항상 보이도록 고정
    ws.views = [{ state: 'frozen', ySplit: headerRowIdx }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `전체_프로젝트_목록_${getTodayLocalStr()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // [수정] 화면 미리보기는 실제 인쇄와 별개로, 모달 안에서 넓게(가로로 꽉 차게) 보여주기만
  // 하면 되므로 액자처럼 감싸던 검은 테두리는 없애고, 표 자체가 모달 폭(297mm까지)을 그대로
  // 채우도록 한다.
  const renderPrintableProjectsList = () => (
    <div className="shrink-0 text-black text-xs font-sans leading-tight" style={{ width: '100%', maxWidth: '297mm', margin: '0 auto', padding: '10mm 0' }}>
      <div className="text-center mb-6">
        <span className="inline-block border-b-4 border-double border-black pb-1 px-4 text-xl sm:text-2xl font-extrabold text-black">프로젝트 파이프라인 (Project Pipeline)</span>
        <p className="text-[10px] text-gray-500 mt-1">출력일: {new Date().toLocaleDateString('ko-KR')}</p>
      </div>

        <table className="w-full border-collapse border-[1.5px] border-black text-[9px]">
          <thead>
            <tr className="bg-gray-100">
              {PIPELINE_COLUMNS.map(c => (
                <th key={c.label} className="border border-black px-1.5 py-1.5 font-bold">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredProjects.map((p, idx) => (
              <tr key={p.id}>
                {PIPELINE_COLUMNS.map(c => (
                  <td key={c.label} className={`border border-black px-1.5 py-1.5 text-${c.align}`}>{c.getValue(p, idx)}</td>
                ))}
              </tr>
            ))}
            {filteredProjects.length === 0 && (
              <tr><td colSpan={PIPELINE_COLUMNS.length} className="border border-black px-2 py-6 text-center text-gray-400">표시할 프로젝트가 없습니다.</td></tr>
            )}
            {filteredProjects.length > 0 && (
              <tr className="bg-gray-100 font-bold">
                <td colSpan={PIPELINE_BUDGET_COL_IDX} className="border border-black px-1.5 py-1.5 text-center">합계</td>
                <td className="border border-black px-1.5 py-1.5 text-right">{formatKRW(pipelineTotals.budgetSum)}</td>
                <td colSpan={PIPELINE_WEIGHTED_COL_IDX - PIPELINE_BUDGET_COL_IDX - 1} className="border border-black px-1.5 py-1.5" />
                <td className="border border-black px-1.5 py-1.5 text-right">{formatKRW(pipelineTotals.weightedSum)}</td>
                <td colSpan={PIPELINE_COLUMNS.length - PIPELINE_WEIGHTED_COL_IDX - 1} className="border border-black px-1.5 py-1.5" />
              </tr>
            )}
          </tbody>
        </table>
    </div>
  );

  // [수정] index.css 공용 스타일시트에 있는 named page(@page 커스텀 이름 + page 속성) 방식은
  // 실제 브라우저의 인쇄 미리보기에서 안정적으로 적용되지 않아("A4 가로"로 지정했는데도
  // 실제 인쇄 결과는 세로로 좁게 나오는 문제가 있었다), VehicleView.tsx의 문서 인쇄와 동일하게
  // 이 표 하나만 담긴 완전히 독립된 새 창을 열어서 그 창 안에서 인쇄한다. 이 창의 스타일시트에는
  // "@page { size: A4 landscape; margin: 20mm 25mm; }" 단 하나의 페이지 규칙만 있으므로, 다른
  // 문서의 세로 인쇄 설정과 절대 충돌하지 않고 항상 A4 가로로 인쇄된다.
  const handlePrintProjectsList = () => {
    const headers = PIPELINE_COLUMNS.map(c => c.label);
    const rowsHtml = filteredProjects.length === 0
      ? `<tr><td colspan="${PIPELINE_COLUMNS.length}" style="text-align:center;color:#9ca3af;padding:24px 8px;">표시할 프로젝트가 없습니다.</td></tr>`
      : filteredProjects.map((p, idx) => `
        <tr>${PIPELINE_COLUMNS.map(c => `<td style="text-align:${c.align};">${escapeHtml(c.getValue(p, idx))}</td>`).join('')}</tr>`).join('');
    const totalsHtml = filteredProjects.length === 0 ? '' : `
      <tr style="background:#f3f4f6;font-weight:700;">
        <td colspan="${PIPELINE_BUDGET_COL_IDX}" style="text-align:center;">합계</td>
        <td style="text-align:right;">${escapeHtml(formatKRW(pipelineTotals.budgetSum))}</td>
        <td colspan="${PIPELINE_WEIGHTED_COL_IDX - PIPELINE_BUDGET_COL_IDX - 1}"></td>
        <td style="text-align:right;">${escapeHtml(formatKRW(pipelineTotals.weightedSum))}</td>
        <td colspan="${PIPELINE_COLUMNS.length - PIPELINE_WEIGHTED_COL_IDX - 1}"></td>
      </tr>`;

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>프로젝트 파이프라인</title>
<style>
  @page { size: A4 landscape; margin: 20mm 25mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; color: #000; }
  .title { text-align: center; margin-bottom: 16px; }
  .title h1 { display: inline-block; border-bottom: 4px double #000; padding-bottom: 4px; margin: 0; font-size: 20px; }
  .title p { font-size: 10px; color: #666; margin: 4px 0 0; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; table-layout: auto; }
  th, td { border: 1px solid #000; padding: 4px 5px; }
  th { background: #f3f4f6; font-weight: 700; }
</style>
</head>
<body>
  <div class="title">
    <h1>프로젝트 파이프라인 (Project Pipeline)</h1>
    <p>출력일: ${escapeHtml(new Date().toLocaleDateString('ko-KR'))}</p>
  </div>
  <table>
    <thead><tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${rowsHtml}${totalsHtml}</tbody>
  </table>
  <script>window.onload = function () { window.focus(); window.print(); };</script>
</body>
</html>`;

    const printWin = window.open('', '_blank');
    if (!printWin) {
      alert('팝업이 차단되어 인쇄 창을 열 수 없습니다. 브라우저의 팝업 차단을 해제한 뒤 다시 시도해주세요.');
      return;
    }
    printWin.document.write(html);
    printWin.document.close();
  };

  // [추가] "OO 특약점 프로젝트 파이프라인" 엑셀 일괄 가져오기 상태/입력 참조
  const projectImportInputRef = useRef<HTMLInputElement>(null);
  const [isImportingProjects, setIsImportingProjects] = useState(false);

  // [추가] 엑셀(특약점 프로젝트 파이프라인 형식)을 읽어서 프로젝트를 한 번에 여러 건
  // 등록한다. 예전엔 이런 표에 정리해둔 프로젝트도 하나하나 "새 프로젝트 등록" 폼을
  // 열어 손으로 옮겨 적어야 했다.
  //
  // 이 템플릿의 열 구성(A~N): 번호 | 프로젝트명 | 최종고객 | 현장/지역 | 제품군 | 주요
  // 품목·사양 | 예상 수주금액 | 예상 수주시기 | 성사확률(%) | 가중 예상금액(자동계산, 무시) |
  // 진행단계 | 경쟁사 | ABB 지원요청 | 비고.
  //
  // 매핑 규칙:
  // - 이제 최종고객/현장·지역/제품군/주요품목·사양/예상수주시기/성사확률/진행단계/경쟁사/
  //   지원요청/비고가 모두 Project 타입에 전용 칸(endCustomer 등)으로 생기면서, 예전처럼
  //   최종고객을 시행사(developer)에 욱여넣거나 나머지를 전부 메모(description)에 몰아
  //   적을 필요가 없어졌다. 각 열을 대응되는 칸에 그대로 넣는다.
  // - 다만 프로젝트 관리(칸반 보드/필터)에 쓰이는 기존 status·priority는 이 파이프라인
  //   양식에 없는 값이라, 하위 호환을 위해 진행단계·성사확률로부터 대략 추정해서 같이
  //   채워준다(발굴/견적/보류 -> opportunity, 협상/수주예정 -> progress).
  // - "예상 수주시기"는 "2026 Q3", "미정"처럼 실제 날짜가 아니라서 마감일(dueDate, 날짜
  //   선택 칸)에는 넣지 않고 전용 칸(expectedTiming)에 그대로 보존한다.
  const mapPipelineStageToStatus = (stage: string): Project['status'] => {
    const s = (stage || '').toLowerCase();
    if (s.includes('negotiation') || s.includes('협상')) return 'progress';
    if (s.includes('closing') || s.includes('수주예정')) return 'progress';
    // 발굴(Lead), 견적(Quotation), 보류(Hold), 그 외 알 수 없는 값은 모두 진행중으로 분류
    return 'opportunity';
  };

  const mapPipelineStageToPipelineStage = (stage: string): Project['pipelineStage'] => {
    const s = (stage || '').toLowerCase();
    if (s.includes('lead') || s.includes('발굴')) return 'lead';
    if (s.includes('quotation') || s.includes('견적')) return 'quotation';
    if (s.includes('negotiation') || s.includes('협상')) return 'negotiation';
    if (s.includes('closing') || s.includes('수주예정')) return 'closing';
    if (s.includes('hold') || s.includes('보류')) return 'hold';
    return undefined;
  };

  const mapWinPctToPriority = (winPct: number | null): Project['priority'] => {
    if (winPct === null || isNaN(winPct)) return 'medium';
    if (winPct >= 70) return 'high';
    if (winPct >= 40) return 'medium';
    return 'low';
  };

  const handleImportProjectsExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // 같은 파일을 다시 선택해도 onChange가 다시 발생하도록 초기화

    setIsImportingProjects(true);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      // header:1 -> 각 행을 배열로, 셀 병합/서식과 무관하게 값만 뽑아온다.
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

      // 헤더 행("프로젝트명"이 B열에 있는 행)을 찾아서, 그 다음부터를 데이터로 본다.
      // 행 번호를 고정으로 가정하지 않고 라벨로 찾아서, 파일마다 위쪽 안내문 줄 수가
      // 살짝 달라져도 안정적으로 동작하게 한다.
      const headerRowIdx = rows.findIndex((r) => typeof r[1] === 'string' && r[1].includes('프로젝트명'));
      if (headerRowIdx === -1) {
        alert('엑셀에서 "프로젝트명" 열을 찾지 못했습니다. "특약점 프로젝트 파이프라인" 형식의 파일인지 확인해주세요.');
        return;
      }

      // 작성자(있으면) 기본 영업자로 사용 - 상단 안내 영역 어딘가에 "작성자" 라벨과 함께 있음.
      // 각 행에 "영업자" 열 값이 따로 있으면 그 값을 우선 쓰고, 비어있는 행에 한해서만
      // 이 기본값으로 채워준다 (아래 fallback 처리 참고).
      let defaultSalesRep = '';
      for (const r of rows.slice(0, headerRowIdx)) {
        const idx = r.findIndex((v) => typeof v === 'string' && v.replace(/\s/g, '') === '작성자');
        if (idx !== -1 && typeof r[idx + 1] === 'string') { defaultSalesRep = r[idx + 1]; break; }
      }

      // [수정] 아래 열 순서는 PIPELINE_COLUMNS(화면 리스트 출력/인쇄/엑셀 내보내기가 실제로
      // 쓰는 열 순서: 번호·프로젝트명·영업자·최종고객(발주처)·현장/지역·제품군·주요 품목·사양·
      // 예상 수주금액·예상 수주시기·성사확률·가중 예상금액(자동계산이라 읽지 않음)·진행단계·
      // 경쟁사·ABB 지원요청·비고)와 정확히 맞춘 것이다. 예전 코드는 "영업자" 열이 추가되기
      // 전 기준으로 짜여 있어서 최종고객부터 한 칸씩 밀려 읽혔고(영업자를 최종고객으로,
      // 최종고객을 현장/지역으로 잘못 읽는 식) 맨 마지막 "비고" 열은 아예 읽지도 못했다.
      const dataRows = rows.slice(headerRowIdx + 2); // 헤더 다음 줄은 "예시" 행이라 건너뜀
      const toImport: Partial<Project>[] = [];
      for (const r of dataRows) {
        const name = typeof r[1] === 'string' ? r[1].trim() : '';
        if (!name) continue; // 프로젝트명이 빈 행은 빈 템플릿 줄이므로 건너뜀

        const salesRepCell = (r[2] ?? '').toString().trim();
        const endCustomer = (r[3] ?? '').toString().trim();
        const site = (r[4] ?? '').toString().trim();
        const productGroup = (r[5] ?? '').toString().trim();
        const mainItems = (r[6] ?? '').toString().trim();
        const expectedValue = r[7];
        const timing = (r[8] ?? '').toString().trim();
        const winPctRaw = r[9];
        const winPct = typeof winPctRaw === 'number' ? winPctRaw : (winPctRaw ? parseFloat(String(winPctRaw)) : null);
        // r[10]은 "가중 예상금액(KRW)" 열 - 저장하지 않는 자동 계산값이라 그냥 건너뜀
        const stage = (r[11] ?? '').toString().trim();
        const competitor = (r[12] ?? '').toString().trim();
        const supportNeeded = (r[13] ?? '').toString().trim();
        const remarks = (r[14] ?? '').toString().trim();

        toImport.push({
          name,
          salesRep: salesRepCell || defaultSalesRep,
          // 최종고객은 전용 칸(endCustomer)에 넣되, 카드 화면의 "시행: OOO" 뱃지·거래처
          // 회사명 매칭 기능이 계속 동작하도록 시행사(developer) 칸에도 같이 채워준다.
          endCustomer,
          developer: endCustomer,
          siteLocation: site,
          productGroup,
          mainItemsSpec: mainItems,
          expectedTiming: timing,
          winProbability: (winPct !== null && !isNaN(winPct)) ? winPct : undefined,
          pipelineStage: mapPipelineStageToPipelineStage(stage),
          competitor,
          supportNeeded,
          remarks,
          status: mapPipelineStageToStatus(stage),
          priority: mapWinPctToPriority(winPct),
          dueDate: '',
          budget: typeof expectedValue === 'number' ? String(expectedValue) : (expectedValue ? String(expectedValue) : '')
        });
      }

      if (toImport.length === 0) {
        alert('가져올 프로젝트가 없습니다. 엑셀에 작성된 프로젝트명이 있는지 확인해주세요.');
        return;
      }

      const res = await fetch('/api/projects/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(currentUser ? { 'x-user-id': currentUser.id } : {})
        },
        body: JSON.stringify({ importedProjects: toImport })
      });
      if (!res.ok) throw new Error(`가져오기에 실패했습니다 (상태: ${res.status}).`);
      const data = await res.json();
      setProjects(data.projects || projects);
      alert(`✅ ${data.count}건의 프로젝트를 성공적으로 가져왔습니다.`);
    } catch (err: any) {
      console.error('Failed to import projects excel:', err);
      alert(`엑셀 가져오기에 실패했습니다.\n${err.message || '파일 형식을 확인하고 다시 시도해주세요.'}`);
    } finally {
      setIsImportingProjects(false);
    }
  };


  useEffect(() => {
    if (triggerExcelExport) handleExportProjectsExcel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerExcelExport]);

  useEffect(() => {
    if (triggerPrintPreview) setShowProjectsPrintPreview(true);
  }, [triggerPrintPreview]);

  return (
    <div className="space-y-3 animate-fadeIn max-w-6xl mx-auto">
      
      {/* ⚠️ 팔로우업 알림 배너 */}
      {(() => {
        const needyProjs = projects.filter(p => {
          if (p.status !== 'opportunity' && p.status !== 'progress') return false;
          const { days } = getDaysSinceLastActivity(p);
          return days >= 5;
        });

        if (needyProjs.length > 0) {
          // 오늘 이미 닫은 상태면, 완전히 숨기지 않고 작은 뱃지로 흔적을 남긴다
          if (isFollowupBannerDismissed) {
            return (
              <button
                onClick={reopenFollowupBanner}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-50 hover:bg-rose-500/20 border border-rose-500/30 text-rose-700 text-xs font-semibold transition-all animate-fadeIn"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>팔로우업 필요 {needyProjs.length}건</span>
              </button>
            );
          }
          return (
            <div className="relative bg-gradient-to-r from-rose-950/40 to-amber-950/30 border border-rose-500/30 rounded-3xl p-5 md:p-6 shadow-xl flex items-start gap-4 animate-fadeIn">
              <button
                onClick={dismissFollowupBannerForToday}
                className="absolute top-3 right-3 p-1.5 rounded-lg text-rose-400 hover:text-rose-700 hover:bg-rose-100 transition-colors"
                title="오늘 하루 닫기"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="p-2.5 bg-rose-50 text-rose-700 rounded-xl border border-rose-500/30 shrink-0">
                <AlertTriangle className="w-5 h-5 animate-bounce" />
              </div>
              <div className="space-y-1.5 flex-1 pr-6">
                <h4 className="text-sm font-bold text-rose-600 flex items-center gap-1.5">
                  <span>신속한 팔로우업이 필요한 활성 프로젝트가 {needyProjs.length}개 있습니다!</span>
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed">
                  마지막 미팅 또는 비즈니스 프로젝트 등록 후 <span className="text-rose-400 font-bold">5일 이상</span> 경과하여 연락이 뜸해진 건들입니다. 신속하게 안부 연락이나 차기 미팅 조율을 진행해 보세요.
                </p>
                <div className="flex flex-wrap gap-2 pt-1.5">
                  {needyProjs.map(p => {
                    const { days } = getDaysSinceLastActivity(p);
                    return (
                      <button
                        key={p.id}
                        onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-1.5 ${expandedId === p.id ? 'bg-rose-500 text-white border-rose-400 shadow animate-pulse' : 'bg-slate-50 hover:bg-white border-rose-500/20 hover:border-rose-500/40 text-rose-600'}`}
                      >
                        <span className="font-bold">{p.name}</span>
                        <span className="text-[10px] opacity-80 font-mono">({days}일 경과)</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* 프로젝트 리스트 */}
      <div 
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="touch-pan-y space-y-4"
      >
        {/* [수정] 프로젝트 검색 - 파이프라인(집계 화면)은 걸러볼 개별 목록이 없어 검색창
        자체를 숨긴다. 원가계산서는 예전엔 이 검색창 아래에 프로젝트 선택창
        (ProjectPnlPicker)이 따로 하나 더 있어서 검색창이 두 개로 겹쳐 보였는데, 이제
        이 검색창 하나로 통일했다 - "개별" 모드에서는 타이핑하면 목록이 펼쳐지는
        검색+선택창으로, "전체" 모드에서는 요약표를 좁혀 보여주는 필터로 동작한다. */}
        {viewMode !== 'pipeline' && (
          viewMode === 'pnl' && costSheetMode === 'individual' ? (
            <div ref={pnlPickerWrapRef} className="max-w-md mx-auto relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type="text"
                placeholder="프로젝트명으로 검색 또는 목록에서 선택..."
                value={pnlPickerOpen ? projectSearchQuery : (projects.find((p) => p.id === pnlSelectedProjectId)?.name || '')}
                onFocus={() => { setPnlPickerOpen(true); setProjectSearchQuery(''); }}
                onChange={(e) => { setProjectSearchQuery(e.target.value); setPnlPickerOpen(true); }}
                className="w-full pl-11 pr-4 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 transition-all placeholder:text-slate-400 shadow-inner"
              />
              {pnlPickerOpen && (
                <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">
                  <div className="max-h-72 overflow-y-auto">
                    {(() => {
                      const filtered = projects.filter((p) => matchesProjectSearch(p, projectSearchQuery));
                      if (filtered.length === 0) return <p className="text-xs text-slate-400 text-center py-4">일치하는 프로젝트가 없습니다</p>;
                      return filtered.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { setPnlSelectedProjectId(p.id); setProjectSearchQuery(''); setPnlPickerOpen(false); }}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 flex items-center justify-between gap-2 ${p.id === pnlSelectedProjectId ? 'bg-indigo-50' : ''}`}
                        >
                          <span className="font-semibold text-slate-700 truncate">{p.name}</span>
                          {p.id === pnlSelectedProjectId && <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />}
                        </button>
                      ));
                    })()}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="max-w-md mx-auto relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="프로젝트명, 시행사, 시공사로 검색..."
                value={projectSearchQuery}
                onChange={(e) => setProjectSearchQuery(e.target.value)}
                className="w-full pl-11 pr-16 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 transition-all placeholder:text-slate-400 shadow-inner"
              />
              {projectSearchQuery && (
                <button
                  onClick={() => setProjectSearchQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-500 hover:text-indigo-700 transition-colors bg-indigo-50 px-2 py-1 rounded-lg cursor-pointer"
                >
                  지우기
                </button>
              )}
            </div>
          )
        )}

        {viewMode === 'pnl' ? (
          (() => {
            const fmtWon = (n: number) => `${formatCurrencyInput(String(Math.round(n)))}원`;
            const selectedProject = projects.find((p) => p.id === pnlSelectedProjectId) || null;
            const draft = costSheetDraft;

            // 헤더 정보(발주처/계약번호 등) 입력칸 - 전부 문자열 필드
            const headerField = (field: 'orderer' | 'contractNumber' | 'preparedDept', type: 'text' = 'text') => (
              <input
                type={type}
                value={(draft?.[field] as string) || ''}
                onChange={(e) => updateCostSheetField(field, e.target.value)}
                className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
              />
            );
            const headerDateField = (field: 'contractDate' | 'deliveryDeadline' | 'preparedDate') => (
              <input
                type="date"
                value={(draft?.[field] as string) || ''}
                onChange={(e) => updateCostSheetField(field, e.target.value)}
                className="w-full bg-white border border-slate-300 rounded px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
              />
            );
            // 원가 항목 금액 입력칸 - 매출액/적용 사후관리비처럼 자동 불러오기 대상이
            // 아닌, 항상 직접 입력만 하는 순수 숫자 필드용(천단위 콤마 자동).
            const moneyField = (field: 'contractRevenue' | 'additionalRevenue' | 'appliedPostSalesCost') => {
              const v = num(draft?.[field] as number);
              return (
                <input
                  type="text"
                  inputMode="numeric"
                  value={v ? formatCurrencyInput(String(v)) : ''}
                  onChange={(e) => updateCostSheetField(field, parseCurrencyInput(e.target.value))}
                  placeholder="0"
                  className="w-full text-right bg-white border border-slate-300 rounded px-2 py-1 text-xs outline-none focus:border-indigo-500 font-mono"
                />
              );
            };
            // [추가] 직접원가/간접원가/일반관리비 13개 항목 전용 입력칸 - manual(직접 입력)
            // 금액을 수정하는 숫자 입력칸 아래에, 통장 출금내역·카드사용내역에서 "자동
            // 불러오기"로 이미 반영된 금액이 있으면 "+N건 자동반영" 안내를 작게 보여준다
            // (관리비내역 칸 입력과 같은 패턴). 직접 입력값과 자동 반영값은 항상 따로
            // 보관되므로, "자동 불러오기"를 다시 눌러도 여기 직접 고친 값은 안 사라진다.
            const costCategoryField = (field: ProjectCostCategory) => {
              const cell = normalizeCostAmount(draft?.[field]);
              const importedSum = cell.imported.reduce((s, it) => s + (Number(it.amount) || 0), 0);
              return (
                <div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cell.manual ? formatCurrencyInput(String(cell.manual)) : ''}
                    onChange={(e) => updateCostSheetField(field, { ...cell, manual: parseCurrencyInput(e.target.value) })}
                    placeholder="0"
                    className="w-full text-right bg-white border border-slate-300 rounded px-2 py-1 text-xs outline-none focus:border-indigo-500 font-mono"
                  />
                  {importedSum > 0 && (
                    <p className="text-[10px] text-emerald-600 mt-0.5 text-right">+{formatCurrencyInput(importedSum)} 자동반영({cell.imported.length}건)</p>
                  )}
                </div>
              );
            };
            const noteField = (field: 'contractRevenueNote' | 'totalRevenueNote' | 'appliedPostSalesNote') => (
              <input
                type="text"
                value={(draft?.[field] as string) || ''}
                onChange={(e) => updateCostSheetField(field, e.target.value)}
                className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs outline-none focus:border-indigo-500"
              />
            );
            // 읽기 전용 계산값 셀 (합계/소계/총원가 등)
            const computedCell = (n: number, extraClass = '') => (
              <span className={`font-mono font-bold ${extraClass}`}>{fmtWon(n)}</span>
            );

            const A = draft ? csRevenueTotal(draft) : 0;
            const B = draft ? csDirectCostSubtotal(draft) : 0;
            const C = draft ? csIndirectCostSubtotal(draft) : 0;
            const D = draft ? csAdminCostSubtotal(draft) : 0;
            const expectedPostSales = draft ? csExpectedPostSales(draft) : 0;
            const postSalesCap = draft ? csPostSalesCap(draft) : 0;
            const E = num(draft?.appliedPostSalesCost);
            const F = draft ? csTotalCost(draft) : 0;
            const G = draft ? csProfit(draft) : 0;
            const margin = draft ? csProfitMargin(draft) : null;

            // th/td 공통 테두리 - 정식 서류 양식이라 다른 탭보다 진한 테두리를 쓴다
            const td = 'border border-slate-400 px-2 py-1.5 align-middle';
            const tdCat = `${td} text-center font-bold text-slate-700 bg-amber-50`;
            const tdLabel = `${td} text-slate-700 bg-slate-50`;
            const tdSub = `${td} text-center font-bold text-slate-700 bg-orange-100`;

            // 전체 프로젝트 요약(image 2) - 원가계산서가 있으면 그 값을, 없으면 0으로 계산.
            // "전체" 모드에서는 상단 검색창이 이 표를 좁혀 보여주는 필터로 동작한다.
            const allRows = [...projects].filter((p) => matchesProjectSearch(p, projectSearchQuery)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
            const grandTotal = allRows.reduce((acc, p) => {
              const cs = p.costSheet;
              if (!cs) return acc;
              return {
                revenue: acc.revenue + csRevenueTotal(cs),
                cost: acc.cost + csTotalCost(cs),
                profit: acc.profit + csProfit(cs)
              };
            }, { revenue: 0, cost: 0, profit: 0 });

            return (
              <div className="space-y-4">
                {/* [수정] 프로젝트 선택은 이제 위 공통 검색창(개별 모드일 때 검색+선택창으로
                동작)에서 하므로, 여기는 개별/전체 모드 전환 토글만 남기고 오른쪽으로 정렬한다. */}
                <div className="flex items-center justify-end gap-3">
                  <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-xl p-1">
                    <button
                      onClick={() => setCostSheetMode('individual')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${costSheetMode === 'individual' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      개별
                    </button>
                    <button
                      onClick={() => setCostSheetMode('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${costSheetMode === 'all' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      전체
                    </button>
                  </div>
                </div>

                {costSheetMode === 'individual' ? (
                  !selectedProject ? (
                    <p className="text-sm text-slate-400 text-center py-14">위에서 프로젝트를 검색하거나 선택하면 원가계산서가 여기에 표시됩니다.</p>
                  ) : !draft ? (
                    <p className="text-sm text-slate-400 text-center py-10">불러오는 중...</p>
                  ) : (
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <h3 className="text-base font-bold text-slate-800 underline underline-offset-4">프로젝트 원가 계산서</h3>
                        <div className="flex items-center gap-2">
                          {costSheetSaveError && <span className="text-xs text-rose-500">{costSheetSaveError}</span>}
                          {/* [추가] 통장 출금내역·카드사용내역에서 이 프로젝트+원가 항목으로
                          태그해둔 거래를 직접원가/간접원가/일반관리비 칸에 자동으로 채워준다. */}
                          <button
                            type="button"
                            onClick={handleImportCostSheetFromLedger}
                            disabled={isImportingCostSheet}
                            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white border border-indigo-200 hover:bg-indigo-50 disabled:opacity-50 text-indigo-600 text-xs font-bold transition-all active:scale-95"
                          >
                            <ArrowDownUp className="w-3.5 h-3.5" />
                            <span>{isImportingCostSheet ? '불러오는 중...' : '자동 불러오기'}</span>
                          </button>
                          {/* [추가] 원가계산서(개별)도 프로젝트 파이프라인과 동일하게 엑셀 출력/
                          인쇄(PDF 저장)를 지원한다. */}
                          <button
                            type="button"
                            onClick={handleExportCostSheetExcel}
                            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all active:scale-95"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            <span>엑셀 출력</span>
                          </button>
                          <button
                            type="button"
                            onClick={handlePrintCostSheet}
                            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold shadow-md shadow-slate-700/20 transition-all active:scale-95"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>인쇄 / PDF 저장</span>
                          </button>
                          <button
                            onClick={handleSaveCostSheet}
                            disabled={isSavingCostSheet}
                            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold transition-colors"
                          >
                            {isSavingCostSheet ? '저장 중...' : '저장'}
                          </button>
                        </div>
                      </div>

                      {/* [수정] 표 전체가 실제로는 5개 물리 컬럼이다: 대분류(구분, rowSpan으로
                          묶임) | 세부 항목명 | 금액(원) | 산출근거 | 비고. 헤더에서는 앞의 두
                          컬럼을 "구 분" 하나로 합쳐 보여주지만(colSpan=2), 본문에서는 각 대분류의
                          첫 행에서만 대분류 셀을 rowSpan으로 그리고, 그 아래 행들(소계 포함)은
                          세부 항목명부터 시작하는 4칸이다 - 그래서 모든 행이 합쳐서 5칸을
                          채우도록 꼭 맞춰야 표가 어긋나지 않는다. */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse min-w-[680px]">
                          <tbody>
                            <tr><td className={`${tdLabel} w-28`}>프로젝트 명</td><td className={`${td} bg-white`} colSpan={4}>{selectedProject.name}</td></tr>
                            <tr><td className={tdLabel}>발 주 처</td><td className={`${td} bg-white`} colSpan={4}>{headerField('orderer')}</td></tr>
                            <tr><td className={tdLabel}>계 약 번 호</td><td className={`${td} bg-white`} colSpan={4}>{headerField('contractNumber')}</td></tr>
                            <tr><td className={tdLabel}>계 약 일 자</td><td className={`${td} bg-white`} colSpan={4}>{headerDateField('contractDate')}</td></tr>
                            <tr><td className={tdLabel}>납 품 기 한</td><td className={`${td} bg-white`} colSpan={4}>{headerDateField('deliveryDeadline')}</td></tr>
                            <tr><td className={tdLabel}>작 성 일</td><td className={`${td} bg-white`} colSpan={4}>{headerDateField('preparedDate')}</td></tr>
                            <tr><td className={tdLabel}>작 성 부 서</td><td className={`${td} bg-white`} colSpan={4}>{headerField('preparedDept')}</td></tr>

                            <tr className="bg-yellow-300">
                              <th className={`${td} text-center`} colSpan={2}>구 분</th>
                              <th className={`${td} text-center`}>금액(원)</th>
                              <th className={`${td} text-center`}>산출근거</th>
                              <th className={`${td} text-center`}>비고</th>
                            </tr>

                            {/* 매출액 */}
                            <tr>
                              <td className={tdCat} rowSpan={3}>매 출 액</td>
                              <td className={tdLabel}>계약 매출액(원)</td>
                              <td className={td}>{moneyField('contractRevenue')}</td>
                              <td className={td}></td>
                              <td className={td}>{noteField('contractRevenueNote')}</td>
                            </tr>
                            <tr>
                              <td className={tdLabel}>추가 매출액(원)</td>
                              <td className={td}>{moneyField('additionalRevenue')}</td>
                              <td className={td}></td>
                              <td className={td}></td>
                            </tr>
                            <tr>
                              <td className={tdSub}>합 계 ( A )</td>
                              <td className={`${td} bg-orange-50 text-right`}>{computedCell(A)}</td>
                              <td className={td}></td>
                              <td className={td}>{noteField('totalRevenueNote')}</td>
                            </tr>

                            {/* 직접원가 */}
                            <tr>
                              <td className={tdCat} rowSpan={5}>직접 원가</td>
                              <td className={tdLabel}>원 재료비</td>
                              <td className={td}>{costCategoryField('rawMaterialCost')}</td>
                              <td className={`${td} text-center text-slate-500`}>자재 BOM 기준</td>
                              <td className={td}></td>
                            </tr>
                            <tr>
                              <td className={tdLabel}>외주 가공비</td>
                              <td className={td}>{costCategoryField('outsourcingCost')}</td>
                              <td className={`${td} text-center text-slate-500`}>제작, 조립, 가공 등</td>
                              <td className={td}></td>
                            </tr>
                            <tr>
                              <td className={tdLabel}>직접 노무비</td>
                              <td className={td}>{costCategoryField('directLaborCost')}</td>
                              <td className={`${td} text-center text-slate-500`}>투입 인원 × 공수</td>
                              <td className={td}></td>
                            </tr>
                            <tr>
                              <td className={tdLabel}>직접 경비</td>
                              <td className={td}>{costCategoryField('directExpense')}</td>
                              <td className={`${td} text-center text-slate-500`}>운송, 설치, 시운전 등</td>
                              <td className={td}></td>
                            </tr>
                            <tr>
                              <td className={tdSub}>소 계 ( B )</td>
                              <td className={`${td} bg-orange-50 text-right`}>{computedCell(B)}</td>
                              <td className={td}></td>
                              <td className={td}></td>
                            </tr>

                            {/* 간접원가 */}
                            <tr>
                              <td className={tdCat} rowSpan={5}>간접 원가</td>
                              <td className={tdLabel}>간접 노무비</td>
                              <td className={td}>{costCategoryField('indirectLaborCost')}</td>
                              <td className={`${td} text-center text-slate-500`}>관리, 기술 지원 인력 등</td>
                              <td className={td}></td>
                            </tr>
                            <tr>
                              <td className={tdLabel}>감가 상각비</td>
                              <td className={td}>{costCategoryField('depreciationCost')}</td>
                              <td className={`${td} text-center text-slate-500`}>장비, 금형 등</td>
                              <td className={td}></td>
                            </tr>
                            <tr>
                              <td className={tdLabel}>품질 관리비</td>
                              <td className={td}>{costCategoryField('qualityControlCost')}</td>
                              <td className={`${td} text-center text-slate-500`}>검사, 시험 등</td>
                              <td className={td}></td>
                            </tr>
                            <tr>
                              <td className={tdLabel}>물류, 보관비</td>
                              <td className={td}>{costCategoryField('logisticsCost')}</td>
                              <td className={`${td} text-center text-slate-500`}>창고, 운송 등</td>
                              <td className={td}></td>
                            </tr>
                            <tr>
                              <td className={tdSub}>소 계 ( C )</td>
                              <td className={`${td} bg-orange-50 text-right`}>{computedCell(C)}</td>
                              <td className={td}></td>
                              <td className={td}></td>
                            </tr>

                            {/* 일반관리비 */}
                            <tr>
                              <td className={tdCat} rowSpan={6}>일반관리비</td>
                              <td className={tdLabel}>인건비 배부</td>
                              <td className={td}>{costCategoryField('laborAllocationCost')}</td>
                              <td className={`${td} text-center text-slate-500`}>관리부서</td>
                              <td className={td}></td>
                            </tr>
                            <tr>
                              <td className={tdLabel}>임차료</td>
                              <td className={td}>{costCategoryField('rentCost')}</td>
                              <td className={`${td} text-center text-slate-500`}>사무실, 공장</td>
                              <td className={td}></td>
                            </tr>
                            <tr>
                              <td className={tdLabel}>통신, 전산비</td>
                              <td className={td}>{costCategoryField('commsItCost')}</td>
                              <td className={`${td} text-center text-slate-500`}>시스템</td>
                              <td className={td}></td>
                            </tr>
                            <tr>
                              <td className={tdLabel}>법무, 회계비</td>
                              <td className={td}>{costCategoryField('legalAccountingCost')}</td>
                              <td className={`${td} text-center text-slate-500`}>외주</td>
                              <td className={td}></td>
                            </tr>
                            <tr>
                              <td className={tdLabel}>기타 관리비</td>
                              <td className={td}>{costCategoryField('otherAdminCost')}</td>
                              <td className={td}></td>
                              <td className={td}></td>
                            </tr>
                            <tr>
                              <td className={tdSub}>소 계 ( D )</td>
                              <td className={`${td} bg-orange-50 text-right`}>{computedCell(D)}</td>
                              <td className={td}></td>
                              <td className={td}></td>
                            </tr>

                            {/* 사후관리비용 */}
                            <tr>
                              <td className={tdCat} rowSpan={4}>사후관리비용</td>
                              <td className={tdLabel}>예상 사후 관리비</td>
                              <td className={`${td} text-right`}>{computedCell(expectedPostSales)}</td>
                              <td className={`${td} text-center text-slate-500`}>매출액 × 5%</td>
                              <td className={td}></td>
                            </tr>
                            <tr>
                              <td className={tdLabel}>사후 관리비 한도</td>
                              <td className={`${td} text-right`}>{computedCell(postSalesCap)}</td>
                              <td className={`${td} text-center text-slate-500`}>매출액 × 6%</td>
                              <td className={td}></td>
                            </tr>
                            <tr>
                              <td className={tdLabel}>적용 사후 관리비</td>
                              <td className={td}>{moneyField('appliedPostSalesCost')}</td>
                              <td className={td}></td>
                              <td className={td}></td>
                            </tr>
                            <tr>
                              <td className={tdSub}>적 용 ( E )</td>
                              <td className={`${td} bg-orange-50 text-right`}>{computedCell(E)}</td>
                              <td className={td}></td>
                              <td className={td}>{noteField('appliedPostSalesNote')}</td>
                            </tr>

                            {/* 총원가 / 경상이익 */}
                            <tr>
                              <td className={tdSub} colSpan={2}>총 원가 ( F = B+C+D+E )</td>
                              <td className={`${td} bg-orange-50 text-right`} colSpan={3}>{computedCell(F)}</td>
                            </tr>
                            <tr className="bg-yellow-300">
                              <td className={`${td} text-center font-bold`} colSpan={2}>경상 이익 ( G = A - F )</td>
                              <td className={`${td} text-right`} colSpan={3}>{computedCell(G, G >= 0 ? 'text-emerald-700' : 'text-rose-600')}</td>
                            </tr>
                            <tr className="bg-yellow-300">
                              <td className={`${td} text-center font-bold`} colSpan={2}>경상 이익율 (%) ( G / A )</td>
                              <td className={`${td} text-right font-mono font-bold`} colSpan={3}>{margin === null ? '집계 전' : `${margin.toFixed(1)}%`}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 overflow-x-auto">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h3 className="text-base font-bold text-slate-800 underline underline-offset-4">프로젝트별 원가 계산서</h3>
                      {/* [추가] 원가계산서(전체) 엑셀 출력/인쇄(PDF 저장) */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleExportAllCostSheetsExcel}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all active:scale-95"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          <span>엑셀 출력</span>
                        </button>
                        <button
                          type="button"
                          onClick={handlePrintAllCostSheets}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold shadow-md shadow-slate-700/20 transition-all active:scale-95"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>인쇄 / PDF 저장</span>
                        </button>
                      </div>
                    </div>
                    <table className="w-full text-xs border-collapse min-w-[900px]">
                      <thead>
                        <tr className="bg-yellow-300">
                          {['No.', '프로젝트명', '발주처', '계약번호', '계약일자', '납품기한', '작성일', '작성부서', '매출(원)', '총원가(원)', '경상이익(원)', '경상이익율(%)', '비고'].map((h) => (
                            <th key={h} className="border border-slate-400 px-2 py-1.5 text-center whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {allRows.map((p, i) => {
                          const cs = p.costSheet;
                          const revenue = cs ? csRevenueTotal(cs) : 0;
                          const cost = cs ? csTotalCost(cs) : 0;
                          const profit = cs ? csProfit(cs) : 0;
                          const marginPct = cs ? csProfitMargin(cs) : null;
                          return (
                            <tr key={p.id} className="hover:bg-indigo-50">
                              <td className="border border-slate-300 px-2 py-1.5 text-center text-slate-500">{i + 1}</td>
                              <td className="border border-slate-300 px-2 py-1.5">
                                <button
                                  onClick={() => { setPnlSelectedProjectId(p.id); setCostSheetMode('individual'); }}
                                  className="font-semibold text-indigo-600 hover:underline text-left"
                                >
                                  {p.name}
                                </button>
                              </td>
                              <td className="border border-slate-300 px-2 py-1.5">{cs?.orderer || '-'}</td>
                              <td className="border border-slate-300 px-2 py-1.5">{cs?.contractNumber || '-'}</td>
                              <td className="border border-slate-300 px-2 py-1.5">{cs?.contractDate || '-'}</td>
                              <td className="border border-slate-300 px-2 py-1.5">{cs?.deliveryDeadline || '-'}</td>
                              <td className="border border-slate-300 px-2 py-1.5">{cs?.preparedDate || '-'}</td>
                              <td className="border border-slate-300 px-2 py-1.5">{cs?.preparedDept || '-'}</td>
                              <td className="border border-slate-300 px-2 py-1.5 text-right font-mono text-indigo-600">{cs ? fmtWon(revenue) : '-'}</td>
                              <td className="border border-slate-300 px-2 py-1.5 text-right font-mono text-rose-500">{cs ? fmtWon(cost) : '-'}</td>
                              <td className={`border border-slate-300 px-2 py-1.5 text-right font-mono font-bold ${profit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{cs ? fmtWon(profit) : '-'}</td>
                              <td className="border border-slate-300 px-2 py-1.5 text-right text-slate-500">{marginPct === null ? '-' : `${marginPct.toFixed(1)}%`}</td>
                              <td className="border border-slate-300 px-2 py-1.5 text-slate-400">{cs ? '' : '미작성'}</td>
                            </tr>
                          );
                        })}
                        {allRows.length === 0 && (
                          <tr><td colSpan={13} className="border border-slate-300 px-2 py-6 text-center text-slate-400">등록된 프로젝트가 없습니다.</td></tr>
                        )}
                        {allRows.length > 0 && (
                          <tr className="bg-yellow-100 font-bold">
                            <td className="border border-slate-400 px-2 py-1.5 text-center" colSpan={8}>합계</td>
                            <td className="border border-slate-400 px-2 py-1.5 text-right font-mono text-indigo-600">{fmtWon(grandTotal.revenue)}</td>
                            <td className="border border-slate-400 px-2 py-1.5 text-right font-mono text-rose-500">{fmtWon(grandTotal.cost)}</td>
                            <td className={`border border-slate-400 px-2 py-1.5 text-right font-mono ${grandTotal.profit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>{fmtWon(grandTotal.profit)}</td>
                            <td className="border border-slate-400 px-2 py-1.5 text-right text-slate-500">{grandTotal.revenue > 0 ? `${((grandTotal.profit / grandTotal.revenue) * 100).toFixed(1)}%` : '-'}</td>
                            <td className="border border-slate-400 px-2 py-1.5"></td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()
        ) : viewMode === 'pipeline' ? (
          (() => {
            const parseAmt = (b?: string) => (b && /^\d+$/.test(b) ? parseInt(b, 10) : 0);
            const byStatus = {
              opportunity: projects.filter((p) => p.status === 'opportunity'),
              progress: projects.filter((p) => p.status === 'progress'),
              completed: projects.filter((p) => p.status === 'completed'),
              failed: projects.filter((p) => p.status === 'failed')
            };
            const valueOf = (arr: Project[]) => arr.reduce((s, p) => s + parseAmt(p.budget), 0);
            const pipelineValue = valueOf(byStatus.opportunity) + valueOf(byStatus.progress);
            const winRateBase = byStatus.completed.length + byStatus.failed.length;
            const winRate = winRateBase > 0 ? Math.round((byStatus.completed.length / winRateBase) * 100) : null;

            const now = new Date();
            const dueThisMonth = projects.filter((p) => {
              if (p.status !== 'opportunity' && p.status !== 'progress') return false;
              const d = new Date(p.dueDate);
              return !isNaN(d.getTime()) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            });

            // 영업자별 집계 (담당 건수 / 파이프라인 가치 / 완료 건수)
            const repMap = new Map<string, { count: number; value: number; completed: number }>();
            projects.forEach((p) => {
              const rep = p.salesRep?.trim() || '미지정';
              if (!repMap.has(rep)) repMap.set(rep, { count: 0, value: 0, completed: 0 });
              const entry = repMap.get(rep)!;
              entry.count += 1;
              if (p.status === 'opportunity' || p.status === 'progress') entry.value += parseAmt(p.budget);
              if (p.status === 'completed') entry.completed += 1;
            });
            const repRows = Array.from(repMap.entries()).sort((a, b) => b[1].value - a[1].value);

            const funnelStages: { key: 'opportunity' | 'progress' | 'completed' | 'failed'; label: string; color: string; barColor: string }[] = [
              { key: 'opportunity', label: '💡 기회', color: 'text-blue-400', barColor: 'bg-blue-500' },
              { key: 'progress', label: '⚡ 진행', color: 'text-amber-400', barColor: 'bg-amber-500' },
              { key: 'completed', label: '✅ 완료', color: 'text-emerald-400', barColor: 'bg-emerald-500' },
              { key: 'failed', label: '❌ 실패', color: 'text-rose-400', barColor: 'bg-rose-500' }
            ];
            const maxCount = Math.max(1, ...funnelStages.map((s) => byStatus[s.key].length));

            return (
              <div className="space-y-5">
                {/* 핵심 지표 카드 */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4 space-y-1">
                    <span className="text-[11px] text-slate-400 font-medium">전체 파이프라인 가치 (기회+진행)</span>
                    <p className="text-xl font-extrabold text-indigo-600">{formatBudgetDisplay(String(pipelineValue))}</p>
                  </div>
                  <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4 space-y-1">
                    <span className="text-[11px] text-slate-400 font-medium">이번 달 마감 예정</span>
                    <p className="text-xl font-extrabold text-amber-600">{dueThisMonth.length}건</p>
                  </div>
                  <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4 space-y-1">
                    <span className="text-[11px] text-slate-400 font-medium">성사율 (완료 ÷ 완료+실패)</span>
                    <p className="text-xl font-extrabold text-emerald-600">{winRate === null ? '집계 전' : `${winRate}%`}</p>
                  </div>
                </div>

                {/* 영업 단계별 현황 */}
                <div className="bg-slate-100 border border-slate-200 rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-700">영업 단계별 현황</h3>
                  <div className="space-y-2.5">
                    {funnelStages.map((stage) => {
                      const list = byStatus[stage.key];
                      const widthPct = Math.max(6, Math.round((list.length / maxCount) * 100));
                      return (
                        <div key={stage.key} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className={`font-bold ${stage.color}`}>{stage.label}</span>
                            <span className="text-slate-500 font-mono">
                              {list.length}건 · {formatBudgetDisplay(String(valueOf(list)))}
                            </span>
                          </div>
                          <div className="h-3 bg-slate-50 rounded-full overflow-hidden border border-slate-200">
                            <div className={`h-full ${stage.barColor} rounded-full transition-all`} style={{ width: `${widthPct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 영업자별 현황 */}
                <div className="bg-slate-100 border border-slate-200 rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-700">영업자별 현황</h3>
                  {repRows.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">등록된 프로젝트가 없습니다.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-slate-400 border-b border-slate-200">
                            <th className="text-left font-bold py-2">영업자</th>
                            <th className="text-right font-bold py-2">담당 건수</th>
                            <th className="text-right font-bold py-2">파이프라인 가치</th>
                            <th className="text-right font-bold py-2">완료 건수</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {repRows.map(([rep, stat]) => (
                            <tr key={rep}>
                              <td className="py-2 font-semibold text-slate-700">{rep}</td>
                              <td className="py-2 text-right text-slate-500">{stat.count}건</td>
                              <td className="py-2 text-right text-indigo-600 font-mono">{formatBudgetDisplay(String(stat.value))}</td>
                              <td className="py-2 text-right text-emerald-400">{stat.completed}건</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })()
        ) : viewMode === 'listOutput' ? (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-700">
                전체 프로젝트 리스트 ({filteredProjects.length}건)
                {selectedListIds.size > 0 && (
                  <span className="ml-2 text-indigo-600 font-semibold">{selectedListIds.size}건 선택됨</span>
                )}
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                {/* [추가] "리스트 출력" 표에서 선택/전체 삭제. 카드형 화면(프로젝트 리스트)과
                같은 projects 상태를 공유하므로, 여기서 지우면 카드형 화면에서도 함께 사라진다. */}
                {selectedListIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => handleBulkDeleteProjects(Array.from(selectedListIds))}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-600/20 transition-all active:scale-95"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>선택 삭제 ({selectedListIds.size}건)</span>
                  </button>
                )}
                {filteredProjects.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleBulkDeleteProjects(filteredProjects.map((p) => p.id))}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 text-xs font-bold transition-all active:scale-95"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>전체 삭제</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleExportProjectsExcel}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/20 transition-all active:scale-95"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>엑셀 다운로드</span>
                </button>
                {/* [추가] "OO 특약점 프로젝트 파이프라인" 형식의 엑셀을 올리면, 한 건씩 등록할
                필요 없이 안에 있는 프로젝트를 한 번에 전부 등록한다. */}
                <button
                  type="button"
                  onClick={() => projectImportInputRef.current?.click()}
                  disabled={isImportingProjects}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md shadow-amber-600/20 transition-all active:scale-95 disabled:opacity-50"
                >
                  <ArrowDownUp className="w-3.5 h-3.5" />
                  <span>{isImportingProjects ? '가져오는 중...' : '엑셀로 프로젝트 가져오기'}</span>
                </button>
                <input
                  ref={projectImportInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleImportProjectsExcel}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowProjectsPrintPreview(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all active:scale-95"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>PDF 인쇄 / 다운로드</span>
                </button>
              </div>
            </div>

            {filteredProjects.length === 0 ? (
              <div className="bg-slate-100 border border-slate-200 rounded-3xl p-16 text-center space-y-4">
                <Briefcase className="w-12 h-12 text-slate-400 mx-auto" />
                <h3 className="text-lg font-bold text-slate-800">해당하는 프로젝트가 없습니다.</h3>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-xs text-slate-600 whitespace-nowrap">
                  <thead className="bg-white text-slate-500">
                    <tr>
                      {/* [추가] 전체 선택 체크박스. PIPELINE_COLUMNS는 화면표/인쇄/엑셀이 공유하는
                      배열이라 그대로 두고, 선택/삭제용 칸은 그 바깥(맨 앞/맨 뒤)에 따로 둔다. */}
                      <th className="px-3 py-2.5 font-bold border-b border-slate-200 w-8">
                        <input
                          type="checkbox"
                          checked={filteredProjects.length > 0 && selectedListIds.size === filteredProjects.length}
                          ref={(el) => {
                            if (el) el.indeterminate = selectedListIds.size > 0 && selectedListIds.size < filteredProjects.length;
                          }}
                          onChange={() => {
                            if (selectedListIds.size === filteredProjects.length) {
                              setSelectedListIds(new Set());
                            } else {
                              setSelectedListIds(new Set(filteredProjects.map((p) => p.id)));
                            }
                          }}
                          className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer"
                        />
                      </th>
                      {PIPELINE_COLUMNS.map(c => (
                        <th key={c.label} className={`px-3 py-2.5 font-bold border-b border-slate-200 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}>{c.label}</th>
                      ))}
                      <th className="px-3 py-2.5 font-bold border-b border-slate-200 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredProjects.map((p, idx) => (
                      <tr key={p.id} className={`hover:bg-slate-100 transition-colors ${selectedListIds.has(p.id) ? 'bg-indigo-50/60' : ''}`}>
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={selectedListIds.has(p.id)}
                            onChange={() => {
                              setSelectedListIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(p.id)) next.delete(p.id);
                                else next.add(p.id);
                                return next;
                              });
                            }}
                            className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer"
                          />
                        </td>
                        {PIPELINE_COLUMNS.map((c, colIdx) => (
                          colIdx === 1 ? (
                            // [추가] 프로젝트명을 누르면 "프로젝트 리스트"(카드형 화면)의 해당
                            // 프로젝트로 이동해 펼쳐서 보여준다(전역 검색에서 프로젝트를 눌렀을
                            // 때와 동일한 동작).
                            <td key={c.label} className="px-3 py-2.5 text-left">
                              <button
                                type="button"
                                onClick={() => onFocusProject?.(p.id)}
                                className="font-semibold text-indigo-600 hover:text-indigo-500 hover:underline text-left"
                                title="프로젝트 리스트에서 보기"
                              >
                                {c.getValue(p, idx)}
                              </button>
                            </td>
                          ) : (
                            <td
                              key={c.label}
                              className={`px-3 py-2.5 ${colIdx === 2 ? 'text-indigo-600 font-semibold' : ''} ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}
                            >
                              {c.getValue(p, idx)}
                            </td>
                          )
                        ))}
                        {/* [추가] 개별 삭제 버튼. 기존 카드형 화면의 handleDeleteProject를 그대로
                        재사용해 삭제 로직/확인창/에러 처리를 중복 없이 공유한다. */}
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={(e) => handleDeleteProject(p.id, e)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="이 프로젝트 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold text-slate-700">
                      <td />
                      <td colSpan={PIPELINE_BUDGET_COL_IDX} className="px-3 py-2.5 text-center">합계</td>
                      <td className="px-3 py-2.5 text-right">{formatKRW(pipelineTotals.budgetSum)}</td>
                      <td colSpan={PIPELINE_WEIGHTED_COL_IDX - PIPELINE_BUDGET_COL_IDX - 1} />
                      <td className="px-3 py-2.5 text-right">{formatKRW(pipelineTotals.weightedSum)}</td>
                      <td colSpan={PIPELINE_COLUMNS.length - PIPELINE_WEIGHTED_COL_IDX - 1} />
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        ) : loading ? (
          <div className="py-24 text-center text-slate-400 text-sm">프로젝트 히스토리 불러오는 중...</div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={filterStatus}
              initial={{ opacity: 0, x: filterStatus === 'all' ? -15 : 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: filterStatus === 'all' ? 15 : -15 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              {filteredProjects.length === 0 ? (
                <div className="bg-slate-100 border border-slate-200 rounded-3xl p-16 text-center space-y-4">
                  <Briefcase className="w-12 h-12 text-slate-400 mx-auto" />
                  <h3 className="text-lg font-bold text-slate-800">해당하는 프로젝트가 없습니다.</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">상단의 '새 프로젝트 등록' 버튼을 눌러 중요한 거래처 영업 및 제안 일정을 새롭게 기록해보세요.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
          {visibleProjects.map((proj) => {
            const isExpanded = expandedId === proj.id;
            const relatedContacts = contacts.filter((c) => (proj.contactIds || []).includes(c.id));

            // 시행사/시공사/설계사 등 회사명과, 이 프로젝트에 연결된 명함의 회사명이 일치하면
            // 그 담당자(이름/직급/연락처)를 같이 보여주기 위한 매칭 함수
            const findContactsForCompany = (companyName?: string) => {
              const target = (companyName || '').trim();
              if (!target) return [];
              return relatedContacts.filter((c) => {
                const cCompany = (c.company || '').trim();
                if (!cCompany) return false;
                return cCompany.includes(target) || target.includes(cCompany);
              });
            };

            return (
              <div
                key={proj.id}
                id={`project-card-${proj.id}`}
                className="bg-white border border-slate-200 rounded-3xl overflow-hidden hover:border-slate-200 transition-all shadow-xl"
              >
                {/* 프로젝트 카드 메인 상단바 */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : proj.id)}
                  className="p-6 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/90"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded font-bold ${proj.priority === 'high' ? 'bg-red-50 text-red-700 border border-red-500/30' : 'bg-slate-100 text-slate-500'}`}>
                        {proj.priority === 'high' ? '🔥 우선순위 높음' : '보통'}
                      </span>
                      {getStatusBadge(proj.status)}
                      {(() => {
                        if (proj.status === 'opportunity' || proj.status === 'progress') {
                          const { days } = getDaysSinceLastActivity(proj);
                          if (days >= 5) {
                            return (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-500/30 flex items-center gap-1 animate-pulse">
                                <AlertTriangle className="w-3 h-3" />
                                <span>팔로우업 필요 ({days}일째)</span>
                              </span>
                            );
                          }
                        }
                        return null;
                      })()}
                      <h3 className="text-lg font-bold text-slate-900 tracking-tight">{proj.name}</h3>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {proj.salesRep && <span className="text-[10px] bg-indigo-50 border border-indigo-500/30 text-indigo-700 px-2 py-0.5 rounded-md font-bold">영업자: {proj.salesRep}</span>}
                      {/* [수정] "최종고객(발주처)"와 "시행사(발주처)"를 하나로 합쳐서 endCustomer
                      값을 직접 보여준다 (developer는 이제 endCustomer를 그대로 미러링하는
                      내부용 값이라 화면 표시는 endCustomer 기준으로 통일). */}
                      {proj.endCustomer && <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-md font-medium">발주처: {proj.endCustomer}</span>}
                      {proj.contractor && <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-md font-medium">시공: {proj.contractor}</span>}
                      {proj.architect && <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-md font-medium">건축설계: {proj.architect}</span>}
                      {proj.interiorDesigner && <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-md font-medium">인테리어: {proj.interiorDesigner}</span>}
                      {proj.electricalDesigner && <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-md font-medium">전기설계: {proj.electricalDesigner}</span>}
                      {proj.mechanicalDesigner && <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-md font-medium">기계설계: {proj.mechanicalDesigner}</span>}
                      {proj.supervisor && <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-md font-medium">감리: {proj.supervisor}</span>}
                      {proj.operator && <span className="text-[10px] bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-md font-medium">운영: {proj.operator}</span>}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 pt-1 font-mono">
                      <span className="flex items-center gap-1 text-slate-600">
                        <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                        등록일: {proj.dueDate}
                      </span>
                      {proj.budget && (
                        <span className="flex items-center gap-1 text-emerald-600">
                          <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                          예산: {/^\d+$/.test(proj.budget) ? `${formatCurrencyInput(proj.budget)}원` : proj.budget}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-blue-600">
                        <Users className="w-3.5 h-3.5 text-blue-400" />
                        관련 명함 {relatedContacts.length}명
                      </span>
                      {(() => {
                        if (proj.status === 'opportunity' || proj.status === 'progress') {
                          const { days, reason } = getDaysSinceLastActivity(proj);
                          const isOverdue = days >= 5;
                          const iconColor = isOverdue ? 'text-rose-400' : 'text-amber-400';
                          const textColor = isOverdue ? 'text-rose-600 font-bold' : 'text-slate-500';
                          return (
                            <span className={`flex items-center gap-1 ${textColor}`}>
                              <Clock className={`w-3.5 h-3.5 ${iconColor}`} />
                              <span>
                                {reason === 'followUp' ? `마지막 미팅: ${days === 0 ? '오늘' : `${days}일 전`}` : `등록/시작일: ${days === 0 ? '오늘' : `${days}일 전`}`}
                              </span>
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>

                  {/* 우측 컨트롤 */}
                  <div className="flex items-center gap-3 shrink-0 self-end md:self-center" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={proj.status}
                      onChange={(e) => handleStatusChange(proj.id, e.target.value as any, e)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-500 shadow-inner"
                    >
                      <option value="opportunity">💡 기회</option>
                      <option value="progress">⚡ 진행</option>
                      <option value="completed">✅ 완료</option>
                      <option value="failed">❌ 실패</option>
                    </select>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingProject(proj);
                        setEditRelationsSearchNote(null);
                        setUseDirectContact(false);
                        setDirectContactName('');
                        setDirectContactCompany('');
                        setDirectContactDept('');
                        setDirectContactTitle('');
                        setDirectContactPhoneOffice('');
                        setDirectContactPhoneMobile('');
                        setDirectContactEmail('');
                      }}
                      className="p-2.5 rounded-xl bg-slate-50 hover:bg-indigo-50 text-slate-500 hover:text-indigo-700 border border-slate-200 transition-colors"
                      title="프로젝트 정보 수정"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      onClick={(e) => handleDeleteProject(proj.id, e)}
                      className="p-2.5 rounded-xl bg-slate-50 hover:bg-red-50 text-slate-500 hover:text-red-700 border border-slate-200 transition-colors"
                      title="프로젝트 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <div onClick={() => setExpandedId(isExpanded ? null : proj.id)} className="p-2.5 rounded-xl bg-slate-100 text-slate-600 cursor-pointer">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                {/* 전개된 상세 & 팔로우업 노트 섹션 */}
                {isExpanded && (
                  <div className="p-6 bg-slate-50 border-t border-slate-200 space-y-6 animate-fadeIn">
                    
                    {/* 프로젝트 관계사 / 참여사 정보 */}
                    <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 uppercase tracking-wider font-mono">
                        <Briefcase className="w-3.5 h-3.5 text-indigo-400" /> 프로젝트 관계사 / 참여사 정보
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        {/* [수정] "최종고객(발주처)"와 "시행사(발주처)"를 하나로 합쳐서
                        endCustomer 값을 보여준다 (거래처 회사명 매칭도 endCustomer 기준). */}
                        {([
                          ['최종고객(발주처)', proj.endCustomer],
                          ['시공사', proj.contractor],
                          ['건축설계사', proj.architect],
                          ['인테리어설계사', proj.interiorDesigner],
                          ['전기설계사', proj.electricalDesigner],
                          ['기계설계사', proj.mechanicalDesigner],
                          ['감리사', proj.supervisor],
                          ['운영사', proj.operator]
                        ] as [string, string | undefined][]).map(([label, companyName]) => {
                          const matched = findContactsForCompany(companyName);
                          return (
                            <div key={label} className="bg-slate-100 p-2.5 rounded-xl border border-slate-200">
                              <div className="text-[10px] text-slate-400 font-semibold mb-0.5">{label}</div>
                              <div className="text-slate-700 font-medium">{companyName || '-'}</div>
                              {matched.length > 0 && (
                                <div className="mt-1.5 pt-1.5 border-t border-slate-200 space-y-1">
                                  {matched.map((c) => (
                                    <div key={c.id} className="text-[10px] text-indigo-600 leading-relaxed">
                                      <span className="font-bold text-indigo-200">{c.name}</span>
                                      {c.department && <span className="text-slate-500"> · {c.department}</span>}
                                      {c.title && <span className="text-slate-500"> · {c.title}</span>}
                                      {c.phoneMobile && <div className="text-slate-500 font-mono">{c.phoneMobile}</div>}
                                      {!c.phoneMobile && c.phoneOffice && <div className="text-slate-500 font-mono">{c.phoneOffice}</div>}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* [추가] 영업 파이프라인 정보 - 최종고객/현장·지역/제품군/주요품목·사양/
                    예상 수주시기/성사확률/가중 예상금액/파이프라인 단계/경쟁사/ABB 지원요청/비고.
                    아무 값도 입력되지 않은 프로젝트(기존에 등록된 프로젝트 등)에서는 굳이
                    빈 칸들만 나열하지 않도록, 하나라도 값이 있을 때만 보여준다. */}
                    {(proj.siteLocation || proj.productGroup || proj.mainItemsSpec || proj.expectedTiming || proj.winProbability !== undefined || proj.pipelineStage || proj.competitor || proj.supportNeeded || proj.remarks) && (
                      <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4 space-y-3">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-400 uppercase tracking-wider font-mono">
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> 영업 파이프라인 정보
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          {/* [수정] 최종고객(발주처)은 위 "프로젝트 관계사/참여사 정보" 카드에서
                          이미 보여주므로(시행사(발주처)와 통합됨) 여기서는 중복 표시하지 않는다. */}
                          {([
                            ['현장/지역', proj.siteLocation],
                            ['제품군', proj.productGroup],
                            ['주요 품목·사양', proj.mainItemsSpec],
                            ['예상 수주시기', proj.expectedTiming],
                            ['성사확률', proj.winProbability !== undefined && proj.winProbability !== null ? `${proj.winProbability}%` : undefined],
                            ['가중 예상금액', (() => { const w = computeWeightedAmount(proj.budget, proj.winProbability); return w !== null ? formatKRW(w) : undefined; })()],
                            ['파이프라인 단계', proj.pipelineStage ? PIPELINE_STAGE_LABEL_KO[proj.pipelineStage] : undefined],
                            ['경쟁사', proj.competitor],
                            ['ABB 지원요청', proj.supportNeeded],
                            ['비고', proj.remarks]
                          ] as [string, string | undefined][]).map(([label, value]) => (
                            <div key={label} className="bg-slate-100 p-2.5 rounded-xl border border-slate-200">
                              <div className="text-[10px] text-slate-400 font-semibold mb-0.5">{label}</div>
                              <div className="text-slate-700 font-medium">{value || '-'}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 1. 연관된 거래처 명함 칩즈 */}
                    {relatedContacts.length > 0 && (
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-blue-400" /> 연관 거래처 담당자 명함
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {relatedContacts.map((rc) => (
                            <div key={rc.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-700">
                              <span className="font-bold">{rc.name}</span>
                              <span className="text-[11px] text-slate-500">{rc.company} ({rc.title})</span>
                              <span className="text-[10px] text-indigo-600 font-mono">{rc.phoneMobile}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 2. 미팅 및 후속 업무 타임라인 */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-indigo-400" /> 히스토리별 미팅 & 업무 기록 (최초 미팅 ~ N차 미팅)
                        </span>
                        <span className="text-[11px] text-slate-400">체계적인 미팅 관리</span>
                      </div>

                      {/* 미팅 입력 폼 */}
                      <form onSubmit={(e) => handleAddFollowup(proj.id, e)} className="bg-slate-100 border border-slate-200 p-4 rounded-2xl space-y-3.5">
                        <span className="text-xs font-bold text-slate-600 block">📝 새로운 미팅/팔로우업 기록 추가</span>
                        
                        <div className="flex flex-col md:flex-row gap-3">
                          {/* 미팅/팔로우업 차수 (제한 없음, 이미 기록된 차수는 건너뛰고 다음 차수를 자동 선택) */}
                          <div className="w-full md:w-1/4">
                            <label className="block text-[10px] text-slate-500 font-bold mb-1">미팅/팔로우업 차수 (선택, 제한 없음)</label>
                            <select
                              value={`${meetingDegree}-${meetingType}`}
                              onChange={(e) => {
                                const [d, t] = e.target.value.split('-');
                                setMeetingDegree(Number(d));
                                setMeetingType(t as 'meeting' | 'followup');
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 font-medium outline-none focus:border-indigo-500"
                            >
                              <option value="0-meeting">업무 기록 (차수 없음)</option>
                              {buildMeetingSequenceOptions(proj.followUps || []).map((opt) => (
                                <option key={`${opt.degree}-${opt.type}`} value={`${opt.degree}-${opt.type}`}>
                                  {opt.label}{opt.used ? ' (기록됨)' : ''}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* 미팅일자 */}
                          <div className="w-full md:w-1/4">
                            <label className="block text-[10px] text-slate-500 font-bold mb-1">미팅일자</label>
                            <input
                              type="date"
                              value={meetingDate}
                              onChange={(e) => setMeetingDate(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-medium outline-none focus:border-indigo-500"
                            />
                          </div>

                          {/* 우리 회사 담당 직원 */}
                          <div className="w-full md:w-1/4">
                            <label className="block text-[10px] text-slate-500 font-bold mb-1">담당 직원 (우리 회사)</label>
                            {companyStaff.length > 0 ? (
                              <select
                                value={meetingStaffName}
                                onChange={(e) => setMeetingStaffName(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 font-medium outline-none focus:border-indigo-500"
                              >
                                <option value="">선택 안함</option>
                                {companyStaff.map((s) => (
                                  <option key={s.id} value={s.name}>{s.name}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={meetingStaffName}
                                onChange={(e) => setMeetingStaffName(e.target.value)}
                                placeholder="담당 직원명"
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 font-medium outline-none focus:border-indigo-500"
                              />
                            )}
                          </div>

                          {/* [수정] 예전엔 여기 "미팅 참여자" 텍스트 칸이 따로 있었는데, 아래
                          "전체 명함에서 검색해서 추가"와 역할이 겹쳤다. 이제는 검색해서 여러 명을
                          연속으로 추가하는 칸을 여기(맨 위)로 옮겼다 — 명함에 없는 분은 이 아래
                          "이름·연락처 입력해서 추가" 칸을 쓰면 된다. */}
                          <div className="flex-1">
                            <label className="block text-[10px] text-slate-500 font-bold mb-1 flex items-center justify-between">
                              <span>미팅 참여자 (미팅자) — 명함 검색</span>
                              {relatedContacts.length > 0 && <span className="text-[9px] text-indigo-400 font-normal">아래 명함 클릭 시 자동 추가</span>}
                            </label>
                            <AttendeeContactSearchAdd
                              contacts={contacts}
                              isAdded={(c) => isAttendeeAdded(meetingAttendee, c)}
                              onToggle={(c) => {
                                if (isAttendeeAdded(meetingAttendee, c)) {
                                  setMeetingAttendee((prev) => removeAttendeeEntry(prev, c));
                                } else {
                                  setMeetingAttendee((prev) => (prev ? `${prev}, ${formatAttendeeEntry(c)}` : formatAttendeeEntry(c)));
                                }
                              }}
                            />
                          </div>
                        </div>

                        {/* 미팅자 이름·연락처 직접 입력해서 추가 (명함 연동 없이도 바로 입력 가능) */}
                        <div className="border border-slate-200 bg-slate-50 rounded-xl p-3 space-y-2">
                          <span className="text-[10px] text-slate-500 font-bold block">📇 미팅자 이름 · 연락처 입력해서 추가</span>
                          <div className="flex flex-col md:flex-row gap-2">
                            <input
                              type="text"
                              value={attendeeNameInput}
                              onChange={(e) => setAttendeeNameInput(e.target.value)}
                              placeholder="이름 (필수)"
                              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 outline-none focus:border-indigo-500"
                            />
                            <input
                              type="text"
                              inputMode="numeric"
                              value={attendeeOfficeInput}
                              onChange={(e) => setAttendeeOfficeInput(formatPhoneNumber(e.target.value))}
                              placeholder="사무실 전화"
                              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 outline-none focus:border-indigo-500"
                            />
                            <input
                              type="text"
                              inputMode="numeric"
                              value={attendeeMobileInput}
                              onChange={(e) => setAttendeeMobileInput(formatPhoneNumber(e.target.value))}
                              placeholder="핸드폰"
                              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 outline-none focus:border-indigo-500"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (!attendeeNameInput.trim()) return;
                                const entry = buildAttendeeEntry(attendeeNameInput, attendeeOfficeInput, attendeeMobileInput);
                                setMeetingAttendee((prev) => (prev ? `${prev}, ${entry}` : entry));
                                setAttendeeNameInput('');
                                setAttendeeOfficeInput('');
                                setAttendeeMobileInput('');
                              }}
                              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shrink-0 transition-colors"
                            >
                              + 추가
                            </button>
                          </div>
                        </div>

                        {/* 연관 명함 클릭 추가 */}
                        {relatedContacts.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <span className="text-[10px] text-slate-400 mr-1">빠른 미팅자 지정:</span>
                            {relatedContacts.map(c => {
                              const isAdded = isAttendeeAdded(meetingAttendee, c);
                              return (
                                <button
                                  type="button"
                                  key={c.id}
                                  onClick={() => {
                                    if (isAdded) {
                                      setMeetingAttendee(prev => removeAttendeeEntry(prev, c));
                                    } else {
                                      setMeetingAttendee(prev => prev ? `${prev}, ${formatAttendeeEntry(c)}` : formatAttendeeEntry(c));
                                    }
                                  }}
                                  className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all ${isAdded ? 'bg-indigo-600/30 text-indigo-600 border-indigo-500/50 font-bold' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-200'}`}
                                >
                                  + {c.name}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* 미팅 메모 입력 영역 (음성 지원) */}
                        <div className="space-y-1.5">
                          <label className="block text-[10px] text-slate-500 font-bold">미팅 내용 (타이핑 또는 음성 메모 가능)</label>
                          <div className="relative bg-slate-50 border border-slate-200 rounded-2xl p-3 focus-within:border-indigo-500 transition-all">
                            <textarea
                              value={meetingContent}
                              onChange={(e) => setMeetingContent(e.target.value)}
                              placeholder="오늘 논의된 미팅 상세 안건 및 피드백을 기록하세요..."
                              rows={3}
                              className="w-full bg-transparent text-xs text-slate-800 outline-none placeholder:text-slate-400 resize-none font-medium leading-relaxed"
                            />
                            
                            {/* 음성 녹음 중 오버레이 */}
                            {isRecording ? (
                              <div className="absolute inset-0 bg-white/95 rounded-2xl flex items-center justify-between px-5 animate-pulse border border-rose-500/40">
                                <div className="flex items-center gap-2.5">
                                  <div className="relative flex items-center justify-center">
                                    <span className="absolute inline-flex h-4 w-4 rounded-full bg-rose-400 opacity-75 animate-ping"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                                  </div>
                                  <div className="space-y-0.5">
                                    <span className="text-[11px] font-bold text-rose-400">🎤 음성 메모 녹음 및 한글 음성 인식 가동 중...</span>
                                    <div className="flex items-center gap-1">
                                      {/* 애니메이션 오디오 파형 */}
                                      {[...Array(6)].map((_, i) => (
                                        <span 
                                          key={i} 
                                          className="w-1 bg-rose-500 rounded-full animate-bounce" 
                                          style={{ 
                                            height: `${8 + Math.floor(Math.random() * 12)}px`,
                                            animationDelay: `${i * 0.08}s`,
                                            animationDuration: '0.5s'
                                          }}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-slate-600 font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                                    {Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60) < 10 ? '0' + (recordingSeconds % 60) : (recordingSeconds % 60)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={stopRecording}
                                    className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold transition-all shadow-md shadow-rose-600/30"
                                  >
                                    녹음 종료
                                  </button>
                                </div>
                              </div>
                            ) : voiceAttached ? (
                              <div className="mt-2 p-2 bg-indigo-950/40 border border-indigo-500/20 rounded-xl flex items-center justify-between text-[11px] text-indigo-600">
                                <div className="flex items-center gap-2">
                                  <Volume2 className="w-3.5 h-3.5 text-indigo-400 animate-pulse animate-duration-1000" />
                                  <span className="font-semibold text-slate-700">🎤 음성 메모 녹음 첨부됨 ({attachedVoiceDuration})</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVoiceAttached(false);
                                    setAttachedVoiceUrl('');
                                    setAttachedVoiceDuration('');
                                  }}
                                  className="text-[10px] text-rose-500 hover:text-rose-700 font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200"
                                >
                                  삭제
                                </button>
                              </div>
                            ) : null}

                            {/* 컨트롤 바 */}
                            {!isRecording && (
                              <div className="flex items-center justify-between pt-2 border-t border-slate-200 mt-2">
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {meetingContent.length}자 입력됨
                                </span>
                                <div className="flex items-center gap-2">
                                  {/* [수정] AI 회의록 자동화: 받아적힌 두서없는 텍스트를 AI가 정리해줌 */}
                                  {meetingContent.trim().length > 10 && (
                                    <button
                                      type="button"
                                      onClick={handleSummarizeMeeting}
                                      disabled={isSummarizing}
                                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-950/30 border border-slate-200 hover:border-indigo-500/30 text-indigo-600 text-[10px] font-semibold transition-colors disabled:opacity-50"
                                    >
                                      {isSummarizing ? (
                                        <div className="w-3 h-3 border-2 border-indigo-400/40 border-t-indigo-400 rounded-full animate-spin" />
                                      ) : (
                                        <Sparkles className="w-3 h-3 text-indigo-400" />
                                      )}
                                      <span>{isSummarizing ? 'AI 정리 중...' : '✨ AI로 정리하기'}</span>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={startRecording}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-rose-950/30 border border-slate-200 hover:border-rose-900/30 text-rose-400 text-[10px] font-semibold transition-colors"
                                  >
                                    <Mic className="w-3 h-3 text-rose-400" />
                                    <span>🎤 음성 메모 녹음</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* [수정] AI 정리 결과 제안 패널: 요약 적용 + 액션아이템 + 언급된 금액을 지출로 바로 추가 */}
                          {meetingAISuggestion && (
                            <div className="bg-indigo-950/20 border border-indigo-500/30 rounded-2xl p-3.5 space-y-2.5 animate-fadeIn">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-indigo-600 flex items-center gap-1.5">
                                  <Sparkles className="w-3.5 h-3.5" />
                                  AI가 정리한 회의록
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setMeetingAISuggestion(null)}
                                  className="text-[10px] text-slate-400 hover:text-slate-600"
                                >
                                  닫기
                                </button>
                              </div>

                              <p className="text-xs text-slate-700 bg-slate-100 p-2.5 rounded-xl border border-slate-200 leading-relaxed whitespace-pre-wrap">
                                {meetingAISuggestion.summary}
                              </p>

                              {meetingAISuggestion.actionItems.length > 0 && (
                                <div className="space-y-1">
                                  <span className="text-[10px] font-bold text-slate-500">📌 다음 액션</span>
                                  <ul className="space-y-0.5">
                                    {meetingAISuggestion.actionItems.map((item, idx) => (
                                      <li key={idx} className="text-[11px] text-slate-600 flex items-start gap-1.5">
                                        <span className="text-indigo-400">-</span>
                                        <span>{item}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {meetingAISuggestion.mentionedAmounts.length > 0 && (
                                <div className="space-y-1.5">
                                  <span className="text-[10px] font-bold text-slate-500">💰 언급된 금액 (눌러서 지출로 바로 추가)</span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {meetingAISuggestion.mentionedAmounts.map((m, idx) => (
                                      <button
                                        key={idx}
                                        type="button"
                                        onClick={() => addSuggestedExpense(m.amount, m.context)}
                                        className="text-[11px] px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-700 font-semibold transition-colors"
                                      >
                                        {formatCurrencyInput(String(m.amount))}원 · {m.context}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <button
                                type="button"
                                onClick={applyMeetingSummary}
                                className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
                              >
                                이 요약으로 미팅 내용 교체하기
                              </button>
                            </div>
                          )}
                        </div>

                        {/* 첨부파일 (제안서, 견적서, 발송자료 등) */}
                        <div className="space-y-1.5">
                          <label className="block text-[10px] text-slate-500 font-bold flex items-center gap-1">
                            <Paperclip className="w-3 h-3" /> 첨부파일 (제안서, 견적서, 발송자료 등)
                          </label>
                          <label className="flex items-center justify-center gap-1.5 border border-dashed border-slate-200 rounded-xl py-2.5 cursor-pointer hover:border-indigo-500 text-slate-400 hover:text-indigo-400 text-[11px] font-semibold transition-colors">
                            <Paperclip className="w-3.5 h-3.5" />
                            <span>파일 선택 (여러 개 가능)</span>
                            <input
                              type="file"
                              multiple
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files) readFilesAsAttachments(e.target.files, (att) => setMeetingAttachments((prev) => [...prev, att]));
                                e.target.value = '';
                              }}
                            />
                          </label>
                          {meetingAttachments.length > 0 && (
                            <div className="space-y-1">
                              {meetingAttachments.map((att) => (
                                <div key={att.id} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px]">
                                  <span className="flex items-center gap-1.5 text-slate-600 truncate">
                                    <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                    <span className="truncate">{att.name}</span>
                                    <span className="text-slate-400 shrink-0">({formatFileSize(att.size)})</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setMeetingAttachments((prev) => prev.filter((x) => x.id !== att.id))}
                                    className="text-rose-500 hover:text-rose-700 font-bold shrink-0"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {renderExpenseSection(meetingExpenses, setMeetingExpenses)}

                        {/* 전송 버튼 */}
                        <div className="flex justify-end pt-1">
                          <button
                            type="submit"
                            disabled={isSavingFollowup}
                            className="px-4.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md transition-all active:scale-95"
                          >
                            {isSavingFollowup ? '저장 중...' : '미팅 및 업무 기록 추가'}
                          </button>
                        </div>
                      </form>

                      {/* 히스토리 아이템들 */}
                      <div className="space-y-3 pt-1 max-h-96 overflow-y-auto pr-1">
                        {proj.followUps && proj.followUps.length > 0 ? (
                          [...proj.followUps]
                            .sort((a, b) => {
                              // 차수 기준 내림차순, 같은 차수면 팔로우업이 미팅보다 위로 오도록 정렬
                              const aVal = a.meetingDegree || 0;
                              const bVal = b.meetingDegree || 0;
                              if (bVal !== aVal) return bVal - aVal; // 최신 차수가 맨 위로
                              const aType = a.meetingType === 'followup' ? 1 : 0;
                              const bType = b.meetingType === 'followup' ? 1 : 0;
                              return bType - aType;
                            })
                            .map((fu) => (
                              <div
                                key={fu.id}
                                className="group/meeting p-4 rounded-2xl bg-white border border-slate-200 text-slate-700 hover:border-slate-200 hover:bg-white/90 transition-all shadow-md relative flex flex-col justify-between space-y-2.5"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-center gap-2.5 flex-wrap">
                                    {/* 차수 뱃지 */}
                                    <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-500/30 font-bold text-[10px]">
                                      {fu.meetingDegree ? buildMeetingSequenceLabel(fu.meetingDegree, fu.meetingType || 'meeting') : '업무 기록'}
                                    </span>
                                    
                                    {/* 미팅 일자 */}
                                    <span className="text-[10px] font-mono text-slate-500 font-semibold">{fu.date}</span>

                                    {/* 담당 직원 (우리 회사) */}
                                    {fu.internalStaffName && (
                                      <span className="text-[11px] text-emerald-600 flex items-center gap-1 font-medium bg-emerald-950/30 px-2 py-0.5 rounded border border-emerald-500/20">
                                        <User className="w-3 h-3 text-emerald-400 shrink-0" />
                                        <span className="text-[10px] text-emerald-400/80 mr-0.5">담당:</span> {fu.internalStaffName}
                                      </span>
                                    )}

                                    {/* 미팅자 */}
                                    {fu.attendee && (
                                      <span className="text-[11px] text-slate-600 flex items-center gap-1 font-medium bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                        <User className="w-3 h-3 text-indigo-400 shrink-0" />
                                        <span className="text-[10px] text-slate-500 mr-0.5">참석자:</span> {renderAttendeeWithPhone(fu.attendee)}
                                      </span>
                                    )}

                                    {/* 첨부파일 개수 */}
                                    {(fu.attachments || []).length > 0 && (
                                      <span className="text-[10px] text-indigo-600 flex items-center gap-1 font-bold bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-500/20">
                                        <Paperclip className="w-3 h-3" />
                                        첨부 {(fu.attachments || []).length}개
                                      </span>
                                    )}
                                  </div>

                                  {/* [수정] 예전에는 opacity-0 + hover에서만 보이게 돼 있어서, 마우스 호버가
                                  없는 모바일/터치 환경에서는 이 수정/삭제 버튼이 사실상 보이지도 눌리지도
                                  않았다(그래서 "팔로우업 내용 수정이 안 된다"는 문의가 들어왔다). 항상 보이게 바꾼다. */}
                                  <div className="flex items-center gap-1.5 transition-all">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingFollowup({ projectId: proj.id, followup: { ...fu } });
                                        setEditAttendeeNameInput('');
                                        setEditAttendeeOfficeInput('');
                                        setEditAttendeeMobileInput('');
                                      }}
                                      className="p-1.5 rounded bg-slate-50 hover:bg-indigo-50 text-slate-400 hover:text-indigo-700 border border-slate-200 hover:border-indigo-900/30 transition-all shadow"
                                      title="기록 수정"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        if (confirm('이 미팅 및 팔로우업 기록을 삭제하시겠습니까?')) {
                                          try {
                                            const res = await fetch(`/api/projects/${proj.id}/followups/${fu.id}`, {
                                              method: 'DELETE',
                                              headers: currentUser ? { 'x-user-id': currentUser.id } : undefined
                                            });
                                            if (!res.ok) throw new Error(`삭제에 실패했습니다 (상태: ${res.status}).`);
                                            setProjects(projects.map(p => {
                                              if (p.id === proj.id) {
                                                return { ...p, followUps: p.followUps.filter(f => f.id !== fu.id) };
                                              }
                                              return p;
                                            }));
                                          } catch (err: any) {
                                            alert(`삭제에 실패했습니다.\n${err.message || '다시 시도해주세요.'}`);
                                          }
                                        }
                                      }}
                                      className="p-1.5 rounded bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-700 border border-slate-200 hover:border-red-900/30 transition-all shadow"
                                      title="기록 삭제"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* 미팅 메모 본문 */}
                                <div className="text-xs text-slate-700 leading-relaxed font-medium whitespace-pre-line pl-1">
                                  {fu.content || <span className="text-slate-400 italic">내용 메모 없음</span>}
                                </div>

                                {/* 첨부파일 목록 (제안서, 견적서, 발송자료 등) */}
                                {(fu.attachments || []).length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 pl-1" onClick={(e) => e.stopPropagation()}>
                                    {(fu.attachments || []).map((att) => (
                                      <a
                                        key={att.id}
                                        href={att.dataUrl}
                                        download={att.name}
                                        className="flex items-center gap-1.5 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-lg px-2.5 py-1 text-[11px] text-indigo-600 hover:text-indigo-700 font-semibold transition-colors"
                                      >
                                        <Paperclip className="w-3 h-3" />
                                        <span className="max-w-[160px] truncate">{att.name}</span>
                                        <Download className="w-3 h-3 opacity-60" />
                                      </a>
                                    ))}
                                  </div>
                                )}

                                {/* 비용 지출 내역 */}
                                {(fu.expenses || []).length > 0 && (
                                  <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-2.5 space-y-1" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold">
                                      <Receipt className="w-3 h-3" />
                                      <span>비용 지출 {(fu.expenses || []).length}건</span>
                                      <span className="ml-auto font-mono">{formatCurrencyInput((fu.expenses || []).reduce((s, e) => s + e.amount, 0))}원</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {(fu.expenses || []).map((exp) => (
                                        <span key={exp.id} className="text-[10px] text-slate-600 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 flex items-center gap-1">
                                          {exp.receiptImage && (
                                            <img
                                              src={exp.receiptImage}
                                              alt="영수증"
                                              onClick={(e) => { e.stopPropagation(); setEnlargedReceiptUrl(exp.receiptImage!); }}
                                              className="w-4 h-4 rounded object-cover border border-emerald-500/40 cursor-pointer hover:opacity-80 transition-opacity shrink-0"
                                            />
                                          )}
                                          <span>{expenseCategoryLabel(exp)}</span>
                                          <span className="font-mono text-slate-500">{formatCurrencyInput(exp.amount)}원</span>
                                          <span className="text-slate-400">
                                            ({exp.payMethod === 'company_card' ? '법인카드' : exp.payMethod === 'personal_card' ? '개인카드' : '현금'})
                                          </span>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* 음성메모가 있을 경우 재생 플레이어 렌더링 */}
                                {fu.hasVoice && (
                                  <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl max-w-sm space-y-2 mt-1" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-3">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (playingVoiceId === fu.id) {
                                            setPlayingVoiceId(null);
                                          } else {
                                            setPlayingVoiceId(fu.id);
                                          }
                                        }}
                                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 shadow-lg ${playingVoiceId === fu.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-indigo-400 hover:bg-slate-200'}`}
                                      >
                                        {playingVoiceId === fu.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                                      </button>
                                      
                                      <div className="flex-1 space-y-1 overflow-hidden">
                                        <div className="flex items-center justify-between text-[10px]">
                                          <span className="text-slate-500 font-semibold flex items-center gap-1 truncate">
                                            <Headphones className="w-3 h-3 text-indigo-400 shrink-0" /> 음성 메모 녹음본
                                          </span>
                                          <span className="font-mono text-slate-400 shrink-0">{playingVoiceId === fu.id ? '재생 중' : '정지'} ({fu.voiceDuration || '0:06'})</span>
                                        </div>

                                        {/* 커스텀 오디오 파형 */}
                                        <div className="flex items-end gap-0.5 h-4 pt-0.5">
                                          {Array.from({ length: 24 }).map((_, index) => {
                                            const progress = playbackProgress[fu.id] || 0;
                                            const isPlayed = (index / 24) * 100 <= progress;
                                            const height = [8, 12, 6, 10, 12, 14, 4, 10, 12, 11, 6, 8, 11, 14, 10, 6, 8, 12, 10, 4, 11, 8, 10, 6][index % 24];
                                            
                                            // 재생중일 때 바가 위아래로 춤추는 애니메이션 효과
                                            const isPlaying = playingVoiceId === fu.id;
                                            const animatedHeight = isPlaying 
                                              ? Math.max(3, Math.round(height * (0.3 + Math.random() * 0.8))) 
                                              : height;

                                            return (
                                              <div
                                                key={index}
                                                className={`flex-1 rounded-t transition-all duration-150 ${isPlayed ? 'bg-indigo-500' : 'bg-slate-100'}`}
                                                style={{ height: `${animatedHeight}px` }}
                                              />
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))
                        ) : (
                          <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-2xl">아직 작성된 미팅 기록이 없습니다.</div>
                        )}
                      </div>
                    </div>

                  </div>
                )}
              </div>
            );
          })}

          {/* [수정] 필터 조건에 더 남은 프로젝트가 있으면 "더 보기" 버튼으로 이어서 로딩 */}
          {visibleProjectCount < filteredProjects.length && (
            <button
              type="button"
              onClick={() => setVisibleProjectCount((prev) => Math.min(prev + 50, filteredProjects.length))}
              className="flex items-center justify-center gap-2 py-4 rounded-2xl border border-dashed border-slate-300 hover:border-indigo-400 bg-slate-100 hover:bg-white text-slate-500 hover:text-indigo-600 text-xs font-bold transition-all"
            >
              <span className="text-lg">＋</span>
              <span>{filteredProjects.length - visibleProjectCount}건 더 보기</span>
            </button>
          )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* 모달: 새 프로젝트 생성 */}
      {isNewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h3 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-indigo-400" /> 신규 영업/제안 프로젝트 등록
              </h3>
              <button onClick={() => setIsNewOpen(false)} className="text-slate-400 hover:text-slate-800">✕</button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">프로젝트 타이틀 *</label>
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="예: 삼성전자 온디바이스 B2B 라이선스 공급 제안" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" required />
              </div>

              {/* [추가] 등록 시 바로 메모를 남길 수 있는 칸 */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">메모</label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="이 프로젝트에 대한 참고사항, 배경, 진행 메모 등을 자유롭게 적어주세요."
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              {/* [수정] 영업자(담당자): 기본값은 등록자 본인 이름이며 직접 수정 가능 */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">영업자(담당자)</label>
                <input type="text" value={newSalesRep} onChange={(e) => setNewSalesRep(e.target.value)} placeholder="예: 홍길동" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
              </div>

              {/* [수정] 사용자 요청에 따라 "영업자(담당자)" 아래로는 회사/설계사 정보부터
              경쟁사/비고까지 모든 선택 입력 필드를 "영업 파이프라인 정보 (선택)" 한 섹션으로
              통합했다. 순서는 최종고객(발주처)(=시행사(발주처), 입력칸 통합) → 시공사 → 건축/인테리어/
              전기/기계설계사 → 감리사 → 운영사 → 현장/지역 → 제품군(PG) → 주요 품목·사양 →
              예상 수주금액 → 예상 수주시기 → 성사확률 → 가중 예상금액(자동계산, 읽기전용) →
              파이프라인 단계 → 경쟁사 → ABB 지원요청 → 비고 → (칸반)진행 단계/프로젝트
              등록일/중요도. 그 아래 "연관된 명함 담당자 선택"/"새로운 담당자 직접 입력"은
              기존과 동일하게 이 섹션 다음에 이어진다. 출력(화면 리스트 출력/인쇄/엑셀)은
              여전히 PIPELINE_COLUMNS에 정의된 필드만 사용하므로 이 폼 재구성과 무관하게
              그대로 유지된다. */}
              <div className="pt-2 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wide">영업 파이프라인 정보 (선택)</p>
                  {/* [추가] 프로젝트 타이틀(+최종고객/현장지역이 입력돼 있으면 같이)을 바탕으로
                  시공사·설계사·감리사·운영사를 구글 검색으로 찾아서 비어있는 칸만 자동으로
                  채워주는 버튼. 채워진 뒤에도 아래 칸에서 언제든 직접 수정할 수 있다. */}
                  <button
                    type="button"
                    onClick={handleSearchNewProjectRelations}
                    disabled={!newName.trim() || isSearchingNewRelations}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-[11px] font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title={!newName.trim() ? '프로젝트 타이틀을 먼저 입력해주세요' : undefined}
                  >
                    {isSearchingNewRelations ? (
                      <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    <span>{isSearchingNewRelations ? '검색 중...' : 'AI로 참여사 찾기'}</span>
                  </button>
                </div>
                {newRelationsSearchNote && <p className="text-[11px] text-indigo-500">{newRelationsSearchNote}</p>}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    {/* [수정] "최종고객(발주처)"와 "시행사(발주처)"는 같은 개념이라 입력칸을
                    하나로 합쳤다. 저장 시 developer 필드에도 이 값을 그대로 같이 써서(위
                    handleCreateProject 참고) 기존 카드 뱃지·거래처 회사명 매칭 기능은
                    그대로 동작한다. */}
                    <label className="block text-slate-600 font-semibold mb-1">최종고객(발주처)</label>
                    <input type="text" value={newEndCustomer} onChange={(e) => setNewEndCustomer(e.target.value)} placeholder="예: HL리츠운용(주)" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">시공사</label>
                    <input type="text" value={newContractor} onChange={(e) => setNewContractor(e.target.value)} placeholder="예: 현대건설" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">건축설계사</label>
                    <input type="text" value={newArchitect} onChange={(e) => setNewArchitect(e.target.value)} placeholder="예: 희림건축" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">인테리어설계사</label>
                    <input type="text" value={newInteriorDesigner} onChange={(e) => setNewInteriorDesigner(e.target.value)} placeholder="예: 원오디자인" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">전기설계사</label>
                    <input type="text" value={newElectricalDesigner} onChange={(e) => setNewElectricalDesigner(e.target.value)} placeholder="예: 나라설계" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">기계설계사</label>
                    <input type="text" value={newMechanicalDesigner} onChange={(e) => setNewMechanicalDesigner(e.target.value)} placeholder="예: 우원엠앤이" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">감리사</label>
                    <input type="text" value={newSupervisor} onChange={(e) => setNewSupervisor(e.target.value)} placeholder="예: 한미글로벌" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">운영사</label>
                    <input type="text" value={newOperator} onChange={(e) => setNewOperator(e.target.value)} placeholder="예: 에스원" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">현장/지역</label>
                    <input type="text" value={newSiteLocation} onChange={(e) => setNewSiteLocation(e.target.value)} placeholder="예: 서울" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">제품군(PG)</label>
                    <input type="text" value={newProductGroup} onChange={(e) => setNewProductGroup(e.target.value)} placeholder="예: 조명/전력 제어 외" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">주요 품목·사양</label>
                  <input type="text" value={newMainItemsSpec} onChange={(e) => setNewMainItemsSpec(e.target.value)} placeholder="예: Wiring device, DIN rail device, etc." className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">예상 수주 금액 (원)</label>
                    <input type="text" inputMode="numeric" value={newBudget ? formatCurrencyInput(newBudget) : ''} onChange={(e) => setNewBudget(e.target.value.replace(/[^\d]/g, ''))} placeholder="예: 50,000,000" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">예상 수주시기</label>
                    <input type="text" value={newExpectedTiming} onChange={(e) => setNewExpectedTiming(e.target.value)} placeholder="예: 2026 Q3, 미정" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">성사확률(%)</label>
                    <input type="number" min={0} max={100} value={newWinProbability} onChange={(e) => setNewWinProbability(e.target.value)} placeholder="예: 60" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    {/* [추가] 가중 예상금액은 예산×성사확률로 항상 자동 계산되는 값이라 별도로
                    저장하지 않고, 현재 입력값 기준으로 미리보기만 읽기 전용으로 보여준다. */}
                    <label className="block text-slate-600 font-semibold mb-1">가중 예상금액(KRW)</label>
                    <div className="w-full bg-slate-100 border border-slate-200 rounded-xl p-3 text-slate-500 font-medium">
                      {(() => {
                        const w = computeWeightedAmount(newBudget, newWinProbability === '' ? undefined : Number(newWinProbability));
                        return w === null ? '자동 계산됨' : formatKRW(w);
                      })()}
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">파이프라인 단계</label>
                    <select value={newPipelineStage} onChange={(e) => setNewPipelineStage(e.target.value as any)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500">
                      <option value="">선택 안 함</option>
                      {PIPELINE_STAGE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">경쟁사</label>
                    <input type="text" value={newCompetitor} onChange={(e) => setNewCompetitor(e.target.value)} placeholder="예: S사" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">ABB 지원요청</label>
                    <input type="text" value={newSupportNeeded} onChange={(e) => setNewSupportNeeded(e.target.value)} placeholder="예: 기술지원·현장데모" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">비고</label>
                  <textarea value={newRemarks} onChange={(e) => setNewRemarks(e.target.value)} placeholder="예: 재견적 예정" rows={2} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500 resize-none" />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">진행 단계</label>
                    <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as any)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500">
                      <option value="opportunity">기회 (Opportunity)</option>
                      <option value="progress">진행 (Progress)</option>
                      <option value="completed">완료 (Completed)</option>
                      <option value="failed">실패 (Failed)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">프로젝트 등록일</label>
                    <input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">중요도</label>
                    <select value={newPriority} onChange={(e) => setNewPriority(e.target.value as any)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500">
                      <option value="high">🔥 높음</option>
                      <option value="medium">⚡ 보통</option>
                      <option value="low">🌱 낮음</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 연관 명함 체크 */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">연관된 명함 담당자 선택 (다중선택 가능)</label>
                <ContactMultiSearchSelect
                  contacts={contacts}
                  value={selectedContacts}
                  onChange={setSelectedContacts}
                />
              </div>

              {/* 거래처 인맥 직접 추가 */}
              <div className="border border-slate-200 bg-slate-50 rounded-xl p-3.5 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useDirectContact}
                    onChange={(e) => setUseDirectContact(e.target.checked)}
                    className="rounded border-slate-200 bg-white text-indigo-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="text-slate-600 font-semibold">새로운 담당자 직접 입력하여 연결</span>
                </label>

                {useDirectContact && (
                  <div className="grid grid-cols-2 gap-3.5 pt-2 animate-fadeIn">
                    <div>
                      <label className="block text-slate-500 text-[10px] font-semibold mb-1">담당자 성함 *</label>
                      <input
                        type="text"
                        value={directContactName}
                        onChange={(e) => setDirectContactName(e.target.value)}
                        placeholder="예: 홍길동"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                        required={useDirectContact}
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 text-[10px] font-semibold mb-1">회사/기관명</label>
                      <input
                        type="text"
                        value={directContactCompany}
                        onChange={(e) => setDirectContactCompany(e.target.value)}
                        placeholder="예: 현대건설"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 text-[10px] font-semibold mb-1">부서</label>
                      <input
                        type="text"
                        value={directContactDept}
                        onChange={(e) => setDirectContactDept(e.target.value)}
                        placeholder="예: 구매팀"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 text-[10px] font-semibold mb-1">직책</label>
                      <input
                        type="text"
                        value={directContactTitle}
                        onChange={(e) => setDirectContactTitle(e.target.value)}
                        placeholder="예: 과장"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 text-[10px] font-semibold mb-1">연락처(직장)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={directContactPhoneOffice}
                        onChange={(e) => setDirectContactPhoneOffice(formatPhoneNumber(e.target.value))}
                        placeholder="예: 02-1234-5678"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 text-[10px] font-semibold mb-1">연락처(핸드폰)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={directContactPhoneMobile}
                        onChange={(e) => setDirectContactPhoneMobile(formatPhoneNumber(e.target.value))}
                        placeholder="예: 010-1234-5678"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-slate-500 text-[10px] font-semibold mb-1">이메일 주소</label>
                      <input
                        type="email"
                        value={directContactEmail}
                        onChange={(e) => setDirectContactEmail(e.target.value)}
                        placeholder="예: buyer@company.com"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button type="button" onClick={() => setIsNewOpen(false)} className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold">취소</button>
                <button type="submit" className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-600/30">프로젝트 생성</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 모달: 프로젝트 정보 수정 (예산 등 등록 내용 수정) */}
      {editingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h3 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-indigo-400" /> 프로젝트 정보 수정
              </h3>
              <button onClick={() => setEditingProject(null)} className="text-slate-400 hover:text-slate-800">✕</button>
            </div>

            <form onSubmit={handleUpdateProjectDetails} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">프로젝트 타이틀 *</label>
                <input type="text" value={editingProject.name} onChange={(e) => setEditingProject({ ...editingProject, name: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" required />
              </div>

              {/* [추가] 등록 폼과 동일하게, 여기서도 메모를 남기거나 고칠 수 있게 */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">메모</label>
                <textarea
                  value={editingProject.description || ''}
                  onChange={(e) => setEditingProject({ ...editingProject, description: e.target.value })}
                  placeholder="이 프로젝트에 대한 참고사항, 배경, 진행 메모 등을 자유롭게 적어주세요."
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              {/* [수정] 영업자(담당자) 수정 가능 */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">영업자(담당자)</label>
                <input type="text" value={editingProject.salesRep || ''} onChange={(e) => setEditingProject({ ...editingProject, salesRep: e.target.value })} placeholder="예: 홍길동" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
              </div>

              {/* [수정] 등록 폼과 동일하게, 영업자(담당자) 아래로는 회사/설계사 정보부터
              경쟁사/비고까지 모든 선택 입력 필드를 "영업 파이프라인 정보 (선택)" 한 섹션으로
              통합했다 (수정 가능). 순서는 등록 폼과 동일하다. */}
              <div className="pt-2 border-t border-slate-200 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wide">영업 파이프라인 정보 (선택)</p>
                  {/* [추가] 등록 폼과 동일한 "AI로 참여사 찾기" 버튼 - 여기서는 editingProject
                  값(프로젝트명/최종고객/현장지역)을 기준으로 검색하고, 비어있는 칸만 채운다. */}
                  <button
                    type="button"
                    onClick={handleSearchEditProjectRelations}
                    disabled={!editingProject.name.trim() || isSearchingEditRelations}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-[11px] font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSearchingEditRelations ? (
                      <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    <span>{isSearchingEditRelations ? '검색 중...' : 'AI로 참여사 찾기'}</span>
                  </button>
                </div>
                {editRelationsSearchNote && <p className="text-[11px] text-indigo-500">{editRelationsSearchNote}</p>}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    {/* [수정] "최종고객(발주처)"와 "시행사(발주처)"는 같은 개념이라 입력칸을
                    하나로 합쳤다. 저장 시(handleUpdateProjectDetails) developer 필드에도
                    이 값을 그대로 같이 써서 기존 카드 뱃지·거래처 회사명 매칭 기능은 그대로
                    동작한다. */}
                    <label className="block text-slate-600 font-semibold mb-1">최종고객(발주처)</label>
                    <input type="text" value={editingProject.endCustomer || ''} onChange={(e) => setEditingProject({ ...editingProject, endCustomer: e.target.value })} placeholder="예: HL리츠운용(주)" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">시공사</label>
                    <input type="text" value={editingProject.contractor || ''} onChange={(e) => setEditingProject({ ...editingProject, contractor: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">건축설계사</label>
                    <input type="text" value={editingProject.architect || ''} onChange={(e) => setEditingProject({ ...editingProject, architect: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">인테리어설계사</label>
                    <input type="text" value={editingProject.interiorDesigner || ''} onChange={(e) => setEditingProject({ ...editingProject, interiorDesigner: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">전기설계사</label>
                    <input type="text" value={editingProject.electricalDesigner || ''} onChange={(e) => setEditingProject({ ...editingProject, electricalDesigner: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">기계설계사</label>
                    <input type="text" value={editingProject.mechanicalDesigner || ''} onChange={(e) => setEditingProject({ ...editingProject, mechanicalDesigner: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">감리사</label>
                    <input type="text" value={editingProject.supervisor || ''} onChange={(e) => setEditingProject({ ...editingProject, supervisor: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">운영사</label>
                    <input type="text" value={editingProject.operator || ''} onChange={(e) => setEditingProject({ ...editingProject, operator: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">현장/지역</label>
                    <input type="text" value={editingProject.siteLocation || ''} onChange={(e) => setEditingProject({ ...editingProject, siteLocation: e.target.value })} placeholder="예: 서울" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">제품군(PG)</label>
                    <input type="text" value={editingProject.productGroup || ''} onChange={(e) => setEditingProject({ ...editingProject, productGroup: e.target.value })} placeholder="예: 조명/전력 제어 외" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">주요 품목·사양</label>
                  <input type="text" value={editingProject.mainItemsSpec || ''} onChange={(e) => setEditingProject({ ...editingProject, mainItemsSpec: e.target.value })} placeholder="예: Wiring device, DIN rail device, etc." className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">예상 수주 금액 (원)</label>
                    <input type="text" inputMode="numeric" value={editingProject.budget ? formatCurrencyInput(editingProject.budget) : ''} onChange={(e) => setEditingProject({ ...editingProject, budget: e.target.value.replace(/[^\d]/g, '') })} placeholder="예: 50,000,000" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">예상 수주시기</label>
                    <input type="text" value={editingProject.expectedTiming || ''} onChange={(e) => setEditingProject({ ...editingProject, expectedTiming: e.target.value })} placeholder="예: 2026 Q3, 미정" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">성사확률(%)</label>
                    <input type="number" min={0} max={100} value={editingProject.winProbability ?? ''} onChange={(e) => setEditingProject({ ...editingProject, winProbability: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="예: 60" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    {/* [추가] 가중 예상금액은 예산×성사확률로 항상 자동 계산되는 값이라 별도로
                    저장하지 않고, 현재 값 기준으로 미리보기만 읽기 전용으로 보여준다. */}
                    <label className="block text-slate-600 font-semibold mb-1">가중 예상금액(KRW)</label>
                    <div className="w-full bg-slate-100 border border-slate-200 rounded-xl p-3 text-slate-500 font-medium">
                      {(() => {
                        const w = computeWeightedAmount(editingProject.budget, editingProject.winProbability);
                        return w === null ? '자동 계산됨' : formatKRW(w);
                      })()}
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">파이프라인 단계</label>
                    <select value={editingProject.pipelineStage || ''} onChange={(e) => setEditingProject({ ...editingProject, pipelineStage: (e.target.value || undefined) as any })} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500">
                      <option value="">선택 안 함</option>
                      {PIPELINE_STAGE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">경쟁사</label>
                    <input type="text" value={editingProject.competitor || ''} onChange={(e) => setEditingProject({ ...editingProject, competitor: e.target.value })} placeholder="예: S사" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">ABB 지원요청</label>
                    <input type="text" value={editingProject.supportNeeded || ''} onChange={(e) => setEditingProject({ ...editingProject, supportNeeded: e.target.value })} placeholder="예: 기술지원·현장데모" className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">비고</label>
                  <textarea value={editingProject.remarks || ''} onChange={(e) => setEditingProject({ ...editingProject, remarks: e.target.value })} placeholder="예: 재견적 예정" rows={2} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500 resize-none" />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">진행 단계</label>
                    <select value={editingProject.status} onChange={(e) => setEditingProject({ ...editingProject, status: e.target.value as any })} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500">
                      <option value="opportunity">기회 (Opportunity)</option>
                      <option value="progress">진행 (Progress)</option>
                      <option value="completed">완료 (Completed)</option>
                      <option value="failed">실패 (Failed)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">프로젝트 등록일</label>
                    <input type="date" value={editingProject.dueDate} onChange={(e) => setEditingProject({ ...editingProject, dueDate: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-slate-600 font-semibold mb-1">중요도</label>
                    <select value={editingProject.priority} onChange={(e) => setEditingProject({ ...editingProject, priority: e.target.value as any })} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500">
                      <option value="high">🔥 높음</option>
                      <option value="medium">⚡ 보통</option>
                      <option value="low">🌱 낮음</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 연관 명함 체크 (등록 화면과 동일하게 수정 가능) */}
              <div>
                <label className="block text-slate-600 font-semibold mb-1">연관된 명함 담당자 선택 (다중선택 가능)</label>
                <ContactMultiSearchSelect
                  contacts={contacts}
                  value={editingProject.contactIds || []}
                  onChange={(ids) => setEditingProject({ ...editingProject, contactIds: ids })}
                />
              </div>

              {/* 거래처 인맥 직접 추가 */}
              <div className="border border-slate-200 bg-slate-50 rounded-xl p-3.5 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useDirectContact}
                    onChange={(e) => setUseDirectContact(e.target.checked)}
                    className="rounded border-slate-200 bg-white text-indigo-500 focus:ring-0 focus:ring-offset-0"
                  />
                  <span className="text-slate-600 font-semibold">새로운 담당자 직접 입력하여 연결</span>
                </label>

                {useDirectContact && (
                  <div className="grid grid-cols-2 gap-3.5 pt-2 animate-fadeIn">
                    <div>
                      <label className="block text-slate-500 text-[10px] font-semibold mb-1">담당자 성함 *</label>
                      <input
                        type="text"
                        value={directContactName}
                        onChange={(e) => setDirectContactName(e.target.value)}
                        placeholder="예: 홍길동"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                        required={useDirectContact}
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 text-[10px] font-semibold mb-1">회사/기관명</label>
                      <input
                        type="text"
                        value={directContactCompany}
                        onChange={(e) => setDirectContactCompany(e.target.value)}
                        placeholder="예: 현대건설"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 text-[10px] font-semibold mb-1">부서</label>
                      <input
                        type="text"
                        value={directContactDept}
                        onChange={(e) => setDirectContactDept(e.target.value)}
                        placeholder="예: 구매팀"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 text-[10px] font-semibold mb-1">직책</label>
                      <input
                        type="text"
                        value={directContactTitle}
                        onChange={(e) => setDirectContactTitle(e.target.value)}
                        placeholder="예: 과장"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 text-[10px] font-semibold mb-1">연락처(직장)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={directContactPhoneOffice}
                        onChange={(e) => setDirectContactPhoneOffice(formatPhoneNumber(e.target.value))}
                        placeholder="예: 02-1234-5678"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 text-[10px] font-semibold mb-1">연락처(핸드폰)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={directContactPhoneMobile}
                        onChange={(e) => setDirectContactPhoneMobile(formatPhoneNumber(e.target.value))}
                        placeholder="예: 010-1234-5678"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-slate-500 text-[10px] font-semibold mb-1">이메일 주소</label>
                      <input
                        type="email"
                        value={directContactEmail}
                        onChange={(e) => setDirectContactEmail(e.target.value)}
                        placeholder="예: buyer@company.com"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-700 outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button type="button" onClick={() => setEditingProject(null)} className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold">취소</button>
                <button type="submit" className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-600/30">저장하기</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 모달: 미팅 기록(팔로우업) 수정 */}
      {editingFollowup && (() => {
        const targetProject = projects.find((p) => p.id === editingFollowup.projectId);
        const relatedContactsForEdit = targetProject ? contacts.filter((c) => (targetProject.contactIds || []).includes(c.id)) : [];
        const fu = editingFollowup.followup;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
            <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 md:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <h3 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-indigo-400" /> 미팅 기록 수정
                </h3>
                <button onClick={() => setEditingFollowup(null)} className="text-slate-400 hover:text-slate-800">✕</button>
              </div>

              <form onSubmit={handleUpdateFollowup} className="space-y-4 text-xs">
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="w-full md:w-1/3">
                    <label className="block text-slate-600 font-semibold mb-1">미팅/팔로우업 차수 (선택, 제한 없음)</label>
                    <select
                      value={`${fu.meetingDegree || 0}-${fu.meetingType || 'meeting'}`}
                      onChange={(e) => {
                        const [d, t] = e.target.value.split('-');
                        setEditingFollowup({ ...editingFollowup, followup: { ...fu, meetingDegree: Number(d) || undefined, meetingType: t as 'meeting' | 'followup' } });
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500"
                    >
                      <option value="0-meeting">업무 기록 (차수 없음)</option>
                      {buildMeetingSequenceOptions((targetProject?.followUps || []).filter((f) => f.id !== fu.id)).map((opt) => (
                        <option key={`${opt.degree}-${opt.type}`} value={`${opt.degree}-${opt.type}`}>
                          {opt.label}{opt.used ? ' (기록됨)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-full md:w-1/3">
                    <label className="block text-slate-600 font-semibold mb-1">미팅일자</label>
                    <input
                      type="date"
                      value={fu.date}
                      onChange={(e) => setEditingFollowup({ ...editingFollowup, followup: { ...fu, date: e.target.value } })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="w-full md:w-1/3">
                    <label className="block text-slate-600 font-semibold mb-1">담당 직원 (우리 회사)</label>
                    {companyStaff.length > 0 ? (
                      <select
                        value={fu.internalStaffName || ''}
                        onChange={(e) => setEditingFollowup({ ...editingFollowup, followup: { ...fu, internalStaffName: e.target.value } })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 font-medium outline-none focus:border-indigo-500"
                      >
                        <option value="">선택 안함</option>
                        {companyStaff.map((s) => (
                          <option key={s.id} value={s.name}>{s.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={fu.internalStaffName || ''}
                        onChange={(e) => setEditingFollowup({ ...editingFollowup, followup: { ...fu, internalStaffName: e.target.value } })}
                        placeholder="담당 직원명"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 placeholder:text-slate-400 font-medium outline-none focus:border-indigo-500"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1 flex items-center justify-between">
                    <span>미팅 참여자 (미팅자) — 명함 검색</span>
                    {relatedContactsForEdit.length > 0 && <span className="text-[10px] text-indigo-400 font-normal">아래 명함 클릭 시 자동 추가/제거</span>}
                  </label>
                  {/* [수정] 예전엔 여기 직접 타이핑하는 텍스트 칸이 있었는데, 아래 "전체 명함
                  검색" 칸과 역할이 겹쳤다. 이제는 검색해서 여러 명을 연속으로 추가하는 칸을
                  맨 위로 옮겼다 — 명함에 없는 분은 아래 "이름·연락처 입력해서 추가" 칸을 쓴다. */}
                  <AttendeeContactSearchAdd
                    contacts={contacts}
                    isAdded={(c) => isAttendeeAdded(fu.attendee || '', c)}
                    onToggle={(c) => {
                      const current = fu.attendee || '';
                      const next = isAttendeeAdded(current, c)
                        ? removeAttendeeEntry(current, c)
                        : (current ? `${current}, ${formatAttendeeEntry(c)}` : formatAttendeeEntry(c));
                      setEditingFollowup({ ...editingFollowup, followup: { ...fu, attendee: next } });
                    }}
                  />

                  {/* 미팅자 이름·연락처 직접 입력해서 추가 */}
                  <div className="border border-slate-200 bg-slate-50 rounded-xl p-3 space-y-2 mt-2">
                    <span className="text-[10px] text-slate-500 font-bold block">📇 미팅자 이름 · 연락처 입력해서 추가</span>
                    <div className="flex flex-col md:flex-row gap-2">
                      <input
                        type="text"
                        value={editAttendeeNameInput}
                        onChange={(e) => setEditAttendeeNameInput(e.target.value)}
                        placeholder="이름 (필수)"
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 outline-none focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={editAttendeeOfficeInput}
                        onChange={(e) => setEditAttendeeOfficeInput(formatPhoneNumber(e.target.value))}
                        placeholder="사무실 전화"
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 outline-none focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={editAttendeeMobileInput}
                        onChange={(e) => setEditAttendeeMobileInput(formatPhoneNumber(e.target.value))}
                        placeholder="핸드폰"
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 outline-none focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!editAttendeeNameInput.trim()) return;
                          const entry = buildAttendeeEntry(editAttendeeNameInput, editAttendeeOfficeInput, editAttendeeMobileInput);
                          const current = fu.attendee || '';
                          setEditingFollowup({ ...editingFollowup, followup: { ...fu, attendee: current ? `${current}, ${entry}` : entry } });
                          setEditAttendeeNameInput('');
                          setEditAttendeeOfficeInput('');
                          setEditAttendeeMobileInput('');
                        }}
                        className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shrink-0 transition-colors"
                      >
                        + 추가
                      </button>
                    </div>
                  </div>

                  {relatedContactsForEdit.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-2">
                      <span className="text-[10px] text-slate-400 mr-1">이 프로젝트의 연관 명함:</span>
                      {relatedContactsForEdit.map((c) => {
                        const isAdded = isAttendeeAdded(fu.attendee || '', c);
                        return (
                          <button
                            type="button"
                            key={c.id}
                            onClick={() => {
                              const current = fu.attendee || '';
                              const next = isAdded
                                ? removeAttendeeEntry(current, c)
                                : (current ? `${current}, ${formatAttendeeEntry(c)}` : formatAttendeeEntry(c));
                              setEditingFollowup({ ...editingFollowup, followup: { ...fu, attendee: next } });
                            }}
                            className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all ${isAdded ? 'bg-indigo-600/30 text-indigo-600 border-indigo-500/50 font-bold' : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-200'}`}
                          >
                            + {c.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1">미팅 내용</label>
                  <textarea
                    value={fu.content}
                    onChange={(e) => setEditingFollowup({ ...editingFollowup, followup: { ...fu, content: e.target.value } })}
                    rows={5}
                    placeholder="미팅 내용을 입력하세요"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 placeholder:text-slate-400 outline-none focus:border-indigo-500 font-medium resize-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-semibold mb-1 flex items-center gap-1">
                    <Paperclip className="w-3.5 h-3.5" /> 첨부파일 (제안서, 견적서, 발송자료 등)
                  </label>
                  <label className="flex items-center justify-center gap-1.5 border border-dashed border-slate-200 rounded-xl py-2.5 cursor-pointer hover:border-indigo-500 text-slate-400 hover:text-indigo-400 font-semibold transition-colors">
                    <Paperclip className="w-3.5 h-3.5" />
                    <span>파일 선택 (여러 개 가능)</span>
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) {
                          readFilesAsAttachments(e.target.files, (att) => {
                            setEditingFollowup((prevEdit) => {
                              if (!prevEdit) return prevEdit;
                              const prevAttachments = prevEdit.followup.attachments || [];
                              return { ...prevEdit, followup: { ...prevEdit.followup, attachments: [...prevAttachments, att] } };
                            });
                          });
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {(fu.attachments || []).length > 0 && (
                    <div className="space-y-1 mt-2">
                      {(fu.attachments || []).map((att) => (
                        <div key={att.id} className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                          <span className="flex items-center gap-1.5 text-slate-600 truncate">
                            <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span className="truncate">{att.name}</span>
                            <span className="text-slate-400 shrink-0">({formatFileSize(att.size)})</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditingFollowup({ ...editingFollowup, followup: { ...fu, attachments: (fu.attachments || []).filter((x) => x.id !== att.id) } })}
                            className="text-rose-500 hover:text-rose-700 font-bold shrink-0"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {renderExpenseSection(fu.expenses || [], editExpensesSetter)}

                {followupSaveError && (
                  <div className="text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2 text-[11px]">
                    ⚠️ {followupSaveError}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                  <button type="button" onClick={() => setEditingFollowup(null)} className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold">취소</button>
                  <button type="submit" disabled={isSavingFollowup} className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold shadow-lg shadow-indigo-600/30">
                    {isSavingFollowup ? '저장 중...' : '저장하기'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* [수정] 영수증 썸네일 확대보기 라이트박스 - 닫기 버튼이 휴대폰 상태바(배터리 등)와
      겹쳐 안 눌리는 문제가 있어, env(safe-area-inset-top)만큼 아래로 내려서 배치한다. */}
      {enlargedReceiptUrl && (
        <div
          className="fixed inset-0 bg-slate-900/85 backdrop-blur-md z-[110] flex items-center justify-center p-4"
          onClick={() => setEnlargedReceiptUrl(null)}
        >
          <button
            onClick={() => setEnlargedReceiptUrl(null)}
            className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition-all"
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

      {receiptCropTarget && (
        <CropAdjustModal
          imageDataUrl={receiptCropTarget.rawImage}
          title="영수증 테두리 확인"
          onConfirm={(cropped) => {
            runMeetingReceiptOcr(receiptCropTarget, cropped);
            setReceiptCropTarget(null);
          }}
          onCancel={() => setReceiptCropTarget(null)}
        />
      )}

      {receiptCameraTarget && (
        <LiveCameraCapture
          title="영수증 촬영"
          docLabel="영수증"
          guideAspectRatio={0.62}
          onCapture={(dataUrl) => {
            const { setter } = receiptCameraTarget;
            const tempId = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            setter((prev) => [...prev, { id: tempId, category: 'custom', amount: 0, payMethod: 'company_card', memo: '', receiptImage: dataUrl }]);
            runMeetingReceiptOcr({ tempId, rawImage: dataUrl, setter }, dataUrl);
            setReceiptCameraTarget(null);
          }}
          onCancel={() => setReceiptCameraTarget(null)}
          onFallbackToFile={() => {
            const setter = receiptCameraTarget.setter;
            setReceiptCameraTarget(null);
            meetingReceiptFallbackRef.current = setter;
            meetingReceiptFallbackInputRef.current?.click();
          }}
        />
      )}
      <input
        ref={meetingReceiptFallbackInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const setter = meetingReceiptFallbackRef.current;
          if (file && setter) scanReceiptAndAddExpense(file, setter);
          e.target.value = '';
        }}
      />

      {/* [수정] 전체 프로젝트 목록 PDF 인쇄/미리보기 모달 */}
      {showProjectsPrintPreview && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center overflow-y-auto p-4">
          {/* [수정] 이 모달의 max-width가 세로(A4 portrait, 210mm) 문서 기준(215mm)으로 남아있어서,
          가로(297mm)로 바뀐 미리보기 내용이 이 좁은 폭 안에 억지로 눌려 들어가 컬럼 헤더가
          여러 줄로 꺾이는 등 실제로는 넓게 나와야 할 표가 좁고 찌그러진 모습으로 보였다.
          가로 문서 폭(297mm)이 다 들어가도록 max-width를 늘리고, 그래도 화면(브라우저 창)이
          더 좁은 경우에는 내용이 눌리지 않고 가로 스크롤로 보이도록 처리한다. */}
          <div className="w-full max-w-[320mm] h-[92vh] mx-auto bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
            <div className="no-print p-4 sm:p-5 border-b border-slate-200 bg-white/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-500/20 text-indigo-700">
                  <FileText className="w-5 h-5" />
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight">전체 프로젝트 목록 미리보기 (총 {filteredProjects.length}건)</h2>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={handleExportProjectsExcel} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-500/15 active:scale-95 transition-all">
                  <FileSpreadsheet className="w-3.5 h-3.5" /><span>엑셀 다운로드</span>
                </button>
                <button onClick={handlePrintProjectsList} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-500/15 active:scale-95 transition-all">
                  <Printer className="w-3.5 h-3.5" /><span>인쇄 / PDF 저장</span>
                </button>
                <button onClick={() => setShowProjectsPrintPreview(false)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 border border-slate-200 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-50 p-4 sm:p-8 overflow-auto flex justify-center">
              {renderPrintableProjectsList()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
