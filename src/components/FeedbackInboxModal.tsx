import React, { useState, useEffect } from 'react';
import { X, Bug, Lightbulb, MessageSquare, RefreshCw, CheckCircle2, Clock, Loader2, BarChart3, Building2, Users, Activity, Inbox as InboxIcon, Download } from 'lucide-react';
import { FeedbackItem, User } from '../types.js';

interface Props {
  currentUser?: User | null;
  onClose: () => void;
}

interface Member {
  name: string;
  email: string;
  phone?: string;
  position?: string;
  createdAt?: string;
}

interface CompanyStat {
  scopeId: string;
  companyName: string;
  businessNumber: string;
  userCount: number;
  members: Member[];
  itemCounts: Record<string, number>;
  totalItems: number;
  lastActivity: string | null;
}

interface IndividualUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  createdAt?: string;
}

interface PlatformStats {
  totalUsers: number;
  totalCompanies: number;
  individualAccountCount: number;
  companies: CompanyStat[];
  individuals: IndividualUser[];
  featureTotals: Record<string, number>;
}

// scoped_items의 collection 이름을 사람이 읽기 좋은 한글 라벨로 매핑
const FEATURE_LABELS: Record<string, string> = {
  contacts: '명함', projects: '프로젝트', vehicles: '차량', drivingLogs: '운행기록',
  expenses: '차량비용', maintenances: '정비기록', dailyLogs: '일일업무일지', weeklyLogs: '주간업무일지',
  advanceSettlements: '가지급금정산서', leaveRequests: '휴가신청서', invites: '명함초대', feedback: '문의'
};
const featureLabel = (key: string) => FEATURE_LABELS[key] || key;

const CATEGORY_META: Record<FeedbackItem['category'], { label: string; icon: React.ReactNode; color: string }> = {
  bug: { label: '버그 신고', icon: <Bug className="w-3.5 h-3.5" />, color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
  feature: { label: '기능 제안', icon: <Lightbulb className="w-3.5 h-3.5" />, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  other: { label: '기타 문의', icon: <MessageSquare className="w-3.5 h-3.5" />, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30' }
};

const STATUS_META: Record<FeedbackItem['status'], { label: string; color: string }> = {
  new: { label: '신규', color: 'text-rose-600 bg-rose-500/10 border-rose-500/30' },
  in_progress: { label: '처리중', color: 'text-amber-600 bg-amber-500/10 border-amber-500/30' },
  resolved: { label: '완료', color: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/30' }
};

export const FeedbackInboxModal: React.FC<Props> = ({ currentUser, onClose }) => {
  const [activeTab, setActiveTab] = useState<'feedback' | 'dashboard'>('feedback');
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<'all' | FeedbackItem['status']>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [statsLoading, setStatsLoading] = useState<boolean>(false);
  // [추가] 사업자번호는 같은데 회사명 표기가 갈린 사례들 (운영자 전용)
  interface CompanyMismatch { businessNumber: string; variants: { companyName: string; count: number }[]; }
  const [companyMismatches, setCompanyMismatches] = useState<CompanyMismatch[] | null>(null);
  const [normalizingBizNum, setNormalizingBizNum] = useState<string | null>(null);
  const [expandedScopeId, setExpandedScopeId] = useState<string | null>(null);
  const [showIndividuals, setShowIndividuals] = useState<boolean>(false);

  // [추가] 고아 데이터(사업자번호 표기 오류 등으로 엉뚱한 스코프에 쌓인 데이터)를
  // 올바른 스코프로 병합하기 위한 도구 상태.
  const [mergeFrom, setMergeFrom] = useState<string>('');
  const [mergeTo, setMergeTo] = useState<string>('');
  const [mergeLoading, setMergeLoading] = useState<boolean>(false);
  const [mergeMessage, setMergeMessage] = useState<string>('');
  const [mergeError, setMergeError] = useState<string>('');

  const fetchFeedback = async () => {
    setLoading(true);
    try {
      const headers: any = {};
      if (currentUser) headers['x-user-id'] = currentUser.id;
      const res = await fetch('/api/feedback', { headers });
      const data = await res.json();
      if (Array.isArray(data)) setItems(data);
    } catch (err) {
      console.error('문의 목록 조회 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const headers: any = {};
      if (currentUser) headers['x-user-id'] = currentUser.id;
      const res = await fetch('/api/admin/platform-stats', { headers });
      if (!res.ok) throw new Error('통계 조회 실패');
      const data = await res.json();
      setStats(data);

      // [추가] 통계와 같이 회사명 표기 불일치 목록도 불러온다
      const mismatchRes = await fetch('/api/admin/company-name-mismatches', { headers });
      if (mismatchRes.ok) setCompanyMismatches(await mismatchRes.json());
    } catch (err) {
      console.error('운영 현황 조회 실패:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  // 표기 하나를 골라서 그 사업자번호에 속한 모든 사용자의 회사명을 그걸로 통일한다
  const handleNormalizeCompanyName = async (businessNumber: string, canonicalName: string) => {
    if (!window.confirm(`이 사업자번호(${businessNumber})에 속한 모든 회원의 회사명을 "${canonicalName}"으로 통일할까요?`)) return;
    setNormalizingBizNum(businessNumber);
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      if (currentUser) headers['x-user-id'] = currentUser.id;
      const res = await fetch('/api/admin/normalize-company-name', {
        method: 'POST',
        headers,
        body: JSON.stringify({ businessNumber, canonicalName })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '정정에 실패했습니다.');
      setCompanyMismatches((prev) => (prev || []).filter((m) => m.businessNumber !== businessNumber));
      alert(`${data.updatedCount}명의 회사명을 "${canonicalName}"으로 통일했습니다.`);
    } catch (err: any) {
      alert(err.message || '정정 중 오류가 발생했습니다.');
    } finally {
      setNormalizingBizNum(null);
    }
  };

  useEffect(() => {
    if (activeTab === 'dashboard' && !stats) {
      fetchStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // [추가] "가져올 스코프(from)"의 모든 데이터를 "옮길 대상 스코프(to)"로 병합한다.
  // 되돌릴 수 없는 작업이라 실행 전 반드시 확인창을 띄운다.
  const doMergeScopes = async () => {
    setMergeMessage('');
    setMergeError('');
    if (!mergeFrom || !mergeTo) {
      setMergeError('가져올 스코프와 옮길 대상 스코프를 먼저 선택(또는 입력)해주세요.');
      return;
    }
    if (mergeFrom === mergeTo) {
      setMergeError('두 스코프가 서로 같습니다. 다른 스코프를 선택해주세요.');
      return;
    }
    const ok = window.confirm(
      `되돌릴 수 없는 작업입니다.\n\n[${mergeFrom}]\n의 모든 데이터를\n\n[${mergeTo}]\n로 옮깁니다.\n\n계속할까요?`
    );
    if (!ok) return;

    setMergeLoading(true);
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      if (currentUser) headers['x-user-id'] = currentUser.id;
      const res = await fetch('/api/admin/migrate-scope', {
        method: 'POST',
        headers,
        body: JSON.stringify({ fromScopeId: mergeFrom, toScopeId: mergeTo })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || '병합 중 오류가 발생했습니다.');

      const migratedList = Object.entries(data.migratedCounts || {})
        .map(([key, count]) => `${featureLabel(key)} ${count}건`)
        .join(', ');
      setMergeMessage(migratedList ? `병합 완료: ${migratedList}` : '병합 완료 (옮길 데이터가 없었습니다)');
      setMergeFrom('');
      setMergeTo('');
      fetchStats(); // 최신 상태로 새로고침
    } catch (err: any) {
      setMergeError(err.message || '병합 중 오류가 발생했습니다.');
    } finally {
      setMergeLoading(false);
    }
  };

  // [추가] 운영 현황을 엑셀(CSV)로 다운로드하는 기능. 별도 라이브러리 없이 브라우저 기능만으로 동작.
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

  // 회사 하나의 요약 + 직원 상세를 CSV 행으로 변환
  const companyRows = (c: CompanyStat): (string | number)[][] => {
    const rows: (string | number)[][] = [];
    rows.push(['[회사 요약]']);
    rows.push(['회사명', '사업자번호', '직원수', '총데이터', '마지막활동']);
    rows.push([c.companyName, c.businessNumber, c.userCount, c.totalItems, c.lastActivity ? formatDate(c.lastActivity) : '활동 없음']);
    rows.push([]);
    if (Object.keys(c.itemCounts).length > 0) {
      rows.push(['[기능별 사용 건수]']);
      rows.push(['기능', '건수']);
      for (const [k, v] of Object.entries(c.itemCounts)) rows.push([featureLabel(k), v]);
      rows.push([]);
    }
    rows.push(['[직원 상세]']);
    rows.push(['이름', '이메일', '전화번호', '직책', '가입일']);
    for (const m of c.members) rows.push([m.name, m.email, m.phone || '', m.position || '', m.createdAt ? formatDate(m.createdAt) : '']);
    return rows;
  };

  // 이 회사만 다운로드
  const exportCompanyCsv = (c: CompanyStat) => {
    downloadCsv(`${c.companyName}_운영현황.csv`, companyRows(c));
  };

  // 전체 다운로드 (회사별 요약표 + 회사별로 모아서 상세까지)
  const exportAllStatsCsv = () => {
    if (!stats) return;
    const rows: (string | number)[][] = [];
    rows.push(['[전체 회사 요약]']);
    rows.push(['회사명', '사업자번호', '직원수', '총데이터', '마지막활동']);
    for (const c of stats.companies) {
      rows.push([c.companyName, c.businessNumber, c.userCount, c.totalItems, c.lastActivity ? formatDate(c.lastActivity) : '활동 없음']);
    }
    rows.push([]);
    for (const c of stats.companies) {
      rows.push([`=== ${c.companyName} ===`]);
      rows.push(...companyRows(c));
      rows.push([]);
    }
    downloadCsv('전체_운영현황.csv', rows);
  };

  const updateStatus = async (id: string, status: FeedbackItem['status']) => {
    setUpdatingId(id);
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      if (currentUser) headers['x-user-id'] = currentUser.id;
      const res = await fetch(`/api/feedback/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        const updated = await res.json();
        setItems((prev) => prev.map((it) => (it.id === id ? updated : it)));
      }
    } catch (err) {
      console.error('문의 상태 변경 실패:', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      return `${y}.${m}.${day} ${h}:${min}`;
    } catch {
      return iso;
    }
  };

  const filtered = items.filter((it) => statusFilter === 'all' || it.status === statusFilter);
  const counts = {
    all: items.length,
    new: items.filter((it) => it.status === 'new').length,
    in_progress: items.filter((it) => it.status === 'in_progress').length,
    resolved: items.filter((it) => it.status === 'resolved').length
  };

  return (
    <div className="fixed inset-0 z-[90] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[88vh] bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-800">{activeTab === 'feedback' ? '문의함' : '운영 현황'}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {activeTab === 'feedback' ? '앱 전체에서 접수된 문의를 모아 확인합니다.' : '회사별 가입/사용 현황을 한눈에 확인합니다.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'dashboard' && (
              <button
                onClick={exportAllStatsCsv}
                disabled={!stats || stats.companies.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-700 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="회사별로 모아서 전체 엑셀 다운로드"
              >
                <Download className="w-3.5 h-3.5" />
                전체 다운로드
              </button>
            )}
            <button
              onClick={activeTab === 'feedback' ? fetchFeedback : fetchStats}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
              title="새로고침"
            >
              <RefreshCw className={`w-4 h-4 ${(loading || statsLoading) ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* [수정] 문의함 ↔ 운영 현황(대시보드) 탭 전환 */}
        <div className="px-4 pt-3 flex items-center gap-2 shrink-0">
          <button
            onClick={() => setActiveTab('feedback')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              activeTab === 'feedback' ? 'bg-indigo-600/20 text-indigo-600 border border-indigo-500/40' : 'bg-slate-100 text-slate-500 border border-slate-200'
            }`}
          >
            <InboxIcon className="w-3.5 h-3.5" />
            문의함
          </button>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              activeTab === 'dashboard' ? 'bg-indigo-600/20 text-indigo-600 border border-indigo-500/40' : 'bg-slate-100 text-slate-500 border border-slate-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            운영 현황
          </button>
        </div>

        {activeTab === 'feedback' && (
        <div className="p-4 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto shrink-0">
          {([
            ['all', '전체'],
            ['new', '신규'],
            ['in_progress', '처리중'],
            ['resolved', '완료']
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                statusFilter === key
                  ? 'bg-indigo-600/20 text-indigo-600 border border-indigo-500/40'
                  : 'bg-slate-100 text-slate-500 border border-slate-200 hover:text-slate-700'
              }`}
            >
              {label} ({counts[key]})
            </button>
          ))}
        </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activeTab === 'feedback' ? (
            loading ? (
              <div className="py-16 flex flex-col items-center gap-2 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-xs">문의 목록 불러오는 중...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs">해당하는 문의가 없습니다.</div>
            ) : (
              filtered.map((item) => {
                const cat = CATEGORY_META[item.category] || CATEGORY_META.other;
                const status = STATUS_META[item.status] || STATUS_META.new;
                return (
                  <div key={item.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${cat.color}`}>
                          {cat.icon}
                          {cat.label}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${status.color}`}>
                          {status.label}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDate(item.createdAt)}
                      </span>
                    </div>

                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-100 p-3 rounded-xl border border-slate-200">
                      {item.content}
                    </p>

                    {/* [수정] 답변/연락하기 편하도록 이메일·핸드폰 번호를 바로 누를 수 있는 링크로 표시 */}
                    {(item.authorEmail || item.authorPhone) && (
                      <div className="flex items-center flex-wrap gap-1.5">
                        {item.authorEmail && (
                          <a
                            href={`mailto:${item.authorEmail}`}
                            className="text-[11px] bg-blue-50 border border-blue-500/25 text-blue-700 hover:text-blue-800 hover:bg-blue-500/20 px-2.5 py-1 rounded-full transition-colors"
                          >
                            ✉️ {item.authorEmail}
                          </a>
                        )}
                        {item.authorPhone && (
                          <a
                            href={`tel:${item.authorPhone}`}
                            className="text-[11px] bg-emerald-50 border border-emerald-500/25 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-500/20 px-2.5 py-1 rounded-full transition-colors"
                          >
                            📞 {item.authorPhone}
                          </a>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] text-slate-400">
                      <span>
                        {item.authorName || '알 수 없음'}
                        {item.companyName ? ` · ${item.companyName}` : ' · 개인 계정'}
                        {item.pageContext ? ` · ${item.pageContext} 화면` : ''}
                      </span>

                      <div className="flex items-center gap-1.5">
                        {(['new', 'in_progress', 'resolved'] as const).map((s) => (
                          <button
                            key={s}
                            disabled={updatingId === item.id || item.status === s}
                            onClick={() => updateStatus(item.id, s)}
                            className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors disabled:opacity-40 ${
                              item.status === s
                                ? STATUS_META[s].color
                                : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'
                            }`}
                          >
                            {STATUS_META[s].label}
                          </button>
                        ))}
                        {item.status === 'resolved' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                      </div>
                    </div>
                  </div>
                );
              })
            )
          ) : statsLoading || !stats ? (
            <div className="py-16 flex flex-col items-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-xs">운영 현황 불러오는 중...</span>
            </div>
          ) : (
            <div className="space-y-5">
              {/* 상단 요약 카드 */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="bg-indigo-600 rounded-2xl p-3.5 flex flex-col items-center gap-1">
                  <Building2 className="w-4 h-4 text-white/80" />
                  <span className="text-lg font-extrabold text-white">{stats.totalCompanies}</span>
                  <span className="text-[10px] text-white/80">가입 회사</span>
                </div>
                <div className="bg-emerald-500 rounded-2xl p-3.5 flex flex-col items-center gap-1">
                  <Users className="w-4 h-4 text-white/80" />
                  <span className="text-lg font-extrabold text-white">{stats.totalUsers}</span>
                  <span className="text-[10px] text-white/80">전체 가입자</span>
                </div>
                <div className="bg-amber-500 rounded-2xl p-3.5 flex flex-col items-center gap-1">
                  <Activity className="w-4 h-4 text-white/80" />
                  <span className="text-lg font-extrabold text-white">{stats.individualAccountCount}</span>
                  <span className="text-[10px] text-white/80">개인 계정</span>
                </div>
              </div>

              {/* [추가] 사업자번호는 같은데 회사명 표기가 갈린 사례 (운영자 전용 정정 도구) */}
              {companyMismatches && companyMismatches.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-rose-600 flex items-center gap-1">
                    ⚠️ 회사명 표기가 갈린 사례 ({companyMismatches.length}건)
                  </span>
                  <p className="text-[11px] text-slate-400 -mt-1">
                    같은 사업자번호인데 회사명 표기가 달라 화면에 별도 회사로 나뉘어 보이는 경우입니다.
                    실제 데이터는 이미 공유되고 있으니, 아래에서 표기만 하나로 통일해주면 됩니다.
                  </p>
                  {companyMismatches.map((m) => (
                    <div key={m.businessNumber} className="bg-rose-50 border border-rose-100 rounded-2xl p-3.5 space-y-2">
                      <p className="text-[11px] font-mono text-slate-500">사업자번호: {m.businessNumber}</p>
                      <div className="space-y-1.5">
                        {m.variants.map((v) => (
                          <div key={v.companyName} className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                            <span className="text-xs font-semibold text-slate-800">
                              {v.companyName} <span className="text-slate-400 font-normal">({v.count}명)</span>
                            </span>
                            <button
                              type="button"
                              disabled={normalizingBizNum === m.businessNumber}
                              onClick={() => handleNormalizeCompanyName(m.businessNumber, v.companyName)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[11px] font-bold transition-colors shrink-0"
                            >
                              이걸로 통일
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 기능별 전체 사용 빈도 */}
              {Object.keys(stats.featureTotals).length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-500">기능별 전체 사용 빈도</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.entries(stats.featureTotals) as [string, number][])
                      .sort((a, b) => b[1] - a[1])
                      .map(([key, count]) => (
                        <span key={key} className="text-[11px] bg-slate-50 border border-slate-200 text-slate-600 px-2.5 py-1 rounded-full">
                          {featureLabel(key)} <span className="font-mono text-indigo-400 font-bold">{count}</span>
                        </span>
                      ))}
                  </div>
                </div>
              )}

              {/* 회사별 현황 목록 */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-500">회사별 가입/사용 현황 (최근 활동순)</span>
                {stats.companies.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs">아직 가입한 회사가 없습니다.</div>
                ) : (
                  <div className="space-y-2">
                    {stats.companies.map((c) => (
                      <div key={c.scopeId} className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-1.5">
                        <div className="flex items-center justify-between flex-wrap gap-1.5">
                          <span className="text-sm font-bold text-slate-800">{c.companyName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {c.lastActivity ? formatDate(c.lastActivity) + ' 마지막 활동' : '아직 활동 없음'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setExpandedScopeId((prev) => (prev === c.scopeId ? null : c.scopeId))}
                            className="underline underline-offset-2 hover:text-slate-600"
                          >
                            직원 {c.userCount}명 {expandedScopeId === c.scopeId ? '▲' : '▾'}
                          </button>
                          <span>·</span>
                          <span>총 데이터 {c.totalItems}건</span>
                          <span>·</span>
                          <span className="font-mono text-slate-400">{c.scopeId}</span>
                        </div>
                        {/* [추가] 이 회사를 스코프 병합 도구의 from/to로 바로 채워넣는 단축 버튼 */}
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => { setMergeFrom(c.scopeId); setMergeMessage(''); setMergeError(''); }}
                            className="text-[10px] px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-500/20 hover:bg-rose-500/20 transition-colors"
                          >
                            병합도구: 여기서 가져오기(from)
                          </button>
                          <button
                            type="button"
                            onClick={() => { setMergeTo(c.scopeId); setMergeMessage(''); setMergeError(''); }}
                            className="text-[10px] px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                          >
                            병합도구: 여기로 옮기기(to)
                          </button>
                          <button
                            type="button"
                            onClick={() => exportCompanyCsv(c)}
                            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 transition-colors"
                          >
                            <Download className="w-3 h-3" />
                            이 회사만 다운로드
                          </button>
                        </div>
                        {expandedScopeId === c.scopeId && c.members.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {c.members.map((m, idx) => (
                              <span key={idx} className="text-[10px] bg-indigo-50 border border-indigo-500/20 text-indigo-700 px-2 py-0.5 rounded-full">
                                {m.name}{m.position ? ` (${m.position})` : ''} · {m.email}{m.phone ? ` · ${m.phone}` : ''}{m.createdAt ? ` · ${formatDate(m.createdAt)} 가입` : ''}
                              </span>
                            ))}
                          </div>
                        )}
                        {Object.keys(c.itemCounts).length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {Object.entries(c.itemCounts).map(([key, count]) => (
                              <span key={key} className="text-[10px] bg-white border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded-md">
                                {featureLabel(key)} {count}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 개인 가입자 목록 */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowIndividuals((v) => !v)}
                  className="text-xs font-bold text-slate-500 underline underline-offset-2 hover:text-slate-600"
                >
                  개인 가입자 목록 ({stats.individuals.length}명) {showIndividuals ? '▲' : '▾'}
                </button>
                {showIndividuals && (
                  stats.individuals.length === 0 ? (
                    <div className="py-6 text-center text-slate-400 text-xs">개인으로 가입한 사람이 없습니다.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {stats.individuals.map((u) => (
                        <span key={u.id} className="text-[11px] bg-slate-50 border border-slate-200 text-slate-600 px-2.5 py-1 rounded-full">
                          {u.name} · {u.email}{u.phone ? ` · ${u.phone}` : ''}{u.createdAt ? ` · ${formatDate(u.createdAt)} 가입` : ' · 가입일 정보 없음'}
                        </span>
                      ))}
                    </div>
                  )
                )}
              </div>

              {/* [추가] 스코프 병합 도구 — 고아 데이터(잘못된 사업자번호로 엉뚱한 곳에 쌓인 데이터)를
                  올바른 스코프로 옮기는 일회성 도구. 위 회사 카드의 단축 버튼으로 채우거나 직접 입력. */}
              <div className="bg-rose-50 border border-rose-900/40 rounded-2xl p-4 space-y-3">
                <div>
                  <p className="text-xs font-bold text-rose-600">⚠️ 스코프 병합 도구 (되돌릴 수 없음)</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                    사업자번호 오기입 등으로 데이터가 엉뚱한 스코프에 쌓였을 때, 위 회사 카드의 버튼으로 from/to를 채운 뒤 실행하면 모든 데이터를 옮기고 예전 스코프는 비웁니다.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-semibold">가져올 스코프 (from) — 예전/잘못된 곳</label>
                    <input
                      type="text"
                      value={mergeFrom}
                      onChange={(e) => setMergeFrom(e.target.value)}
                      placeholder="예: company:알앤씨_212-06-76430"
                      className="w-full bg-slate-50 text-slate-700 text-[11px] font-mono px-2.5 py-2 rounded-lg border border-slate-200 focus:border-rose-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-semibold">옮길 대상 스코프 (to) — 현재 올바른 곳</label>
                    <input
                      type="text"
                      value={mergeTo}
                      onChange={(e) => setMergeTo(e.target.value)}
                      placeholder="예: company:212-06-76430"
                      className="w-full bg-slate-50 text-slate-700 text-[11px] font-mono px-2.5 py-2 rounded-lg border border-slate-200 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={doMergeScopes}
                  disabled={mergeLoading}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-600 border border-rose-500/40 text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {mergeLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {mergeLoading ? '병합 중...' : '병합 실행'}
                </button>
                {mergeMessage && (
                  <p className="text-[11px] text-emerald-400 bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-2.5 py-1.5">{mergeMessage}</p>
                )}
                {mergeError && (
                  <p className="text-[11px] text-rose-400 bg-rose-500/5 border border-rose-500/20 rounded-lg px-2.5 py-1.5">{mergeError}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
