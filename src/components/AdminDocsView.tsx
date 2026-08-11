import React, { useEffect, useState } from 'react';
import { Plus, X, Trash2, Edit2, Paperclip, Download, FileText, Search, ShieldAlert } from 'lucide-react';
import { AdminDoc, AdminDocCategory, AdminDocSection, ProjectFollowUpAttachment, User } from '../types.js';
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

const emptyForm = (category: AdminDocCategory): Partial<AdminDoc> => ({
  category,
  title: '',
  date: new Date().toISOString().split('T')[0],
  personName: '',
  amount: '',
  memo: '',
  attachments: []
});

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

  return (
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

                {activeConfig.showAmount && (
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
  );
};
