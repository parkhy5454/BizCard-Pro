import React, { useRef, useState, useEffect } from 'react';
import { Phone, Building2, Printer, Mail, MapPin, History, Eye, Trash2, Edit3, ChevronLeft, ChevronRight, Sparkles, Navigation, Search, AlertTriangle, X, Brain, ArrowRight, ArrowDownUp } from 'lucide-react';
import { BusinessCard, ContactGroup, Project } from '../types.js';
import { getContactGroupIds } from '../groupUtils.js';

interface Props {
  contacts: BusinessCard[];
  groups: ContactGroup[];
  // [수정] "관계 인텔리전스" 패널에서 명함과 프로젝트/팔로우업을 엮어서 분석하기 위해 필요
  projects?: Project[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onSelectContact: (contact: BusinessCard) => void;
  onEditContact: (contact: BusinessCard) => void;
  onDeleteContact: (id: string, e: React.MouseEvent) => void;
  // [수정] 인텔리전스 패널에서 "프로젝트 보기"를 누르면 프로젝트 탭으로 이동시키기 위한 콜백 (선택)
  onNavigateToProjects?: () => void;
  // [추가] "관계 인텔리전스" 패널의 전화 버튼에서도, 눌렀을 때 자동으로 통화 시도 기록을
  // 남기기 위해 필요. 선택값이라, 이 prop을 안 넘겨도 기존처럼 그냥 전화만 걸린다.
  onAddCallHistory?: (contactId: string, record: { type: 'incoming' | 'outgoing' | 'missed'; note?: string }) => void;
  // [추가] 정렬 방식 — 부모(App.tsx)가 실제 정렬을 처리하고, 여기서는 드롭다운 UI만 보여준다.
  sortOrder?: 'recent' | 'name';
  setSortOrder?: (order: 'recent' | 'name') => void;
}

const formatCallDate = (isoStr: string) => {
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}년 ${month}월 ${date}일 ${hours}시 ${minutes}분`;
  } catch {
    return isoStr;
  }
};

export const CardGrid: React.FC<Props> = ({ contacts, groups, projects = [], searchQuery, setSearchQuery, onSelectContact, onEditContact, onDeleteContact, onNavigateToProjects, onAddCallHistory, sortOrder = 'recent', setSortOrder }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  // [수정] 명함이 몇백~몇천 개로 늘어나도 느려지지 않도록, 처음엔 50개만 화면에 그리고
  // 스크롤해서 끝에 가까워지면 50개씩 더 그린다. 데이터 자체는 그대로 다 갖고 있고
  // (검색/지도/중복감지 등 다른 기능에 영향 없음), "화면에 그리는" 개수만 제한한다.
  const [visibleCount, setVisibleCount] = useState<number>(50);
  useEffect(() => {
    setVisibleCount(50);
  }, [searchQuery]);
  const visibleContacts = contacts.slice(0, Math.max(visibleCount, 50));
  const [expandedCallsId, setExpandedCallsId] = useState<string | null>(null);
  const [expandedNavId, setExpandedNavId] = useState<string | null>(null);
  const [cardImageSide, setCardImageSide] = useState<Record<string, 'front' | 'back'>>({});
  const todayStr = new Date().toISOString().split('T')[0];
  // [수정] "관계 인텔리전스" 패널의 닫기 상태 (오늘 하루만 닫기, 날짜 바뀌면 자동 재표시)
  const [intelDismissedDate, setIntelDismissedDate] = useState<string>(() => {
    try { return localStorage.getItem('bizcard_relationship_intel_dismissed_date') || ''; } catch { return ''; }
  });
  const isIntelDismissed = intelDismissedDate === todayStr;
  const dismissIntelForToday = () => {
    try { localStorage.setItem('bizcard_relationship_intel_dismissed_date', todayStr); } catch {}
    setIntelDismissedDate(todayStr);
  };
  const reopenIntel = () => {
    try { localStorage.removeItem('bizcard_relationship_intel_dismissed_date'); } catch {}
    setIntelDismissedDate('');
  };
  const swipeStartX = useRef<number>(0);

  const handleImageSwipeStart = (e: React.TouchEvent) => {
    swipeStartX.current = e.touches[0].clientX;
  };

  const handleImageSwipeEnd = (contactId: string, hasBack: boolean) => (e: React.TouchEvent) => {
    if (!hasBack) return;
    const deltaX = e.changedTouches[0].clientX - swipeStartX.current;
    if (Math.abs(deltaX) < 40) return; // 스와이프로 인정할 최소 이동거리
    setCardImageSide((prev) => ({
      ...prev,
      [contactId]: (prev[contactId] || 'front') === 'front' ? 'back' : 'front'
    }));
  };

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 10);
      setShowRightArrow(scrollLeft + clientWidth < scrollWidth - 10);

      // Estimate current index based on item size
      const cardWidth = scrollRef.current.firstElementChild?.clientWidth || 380;
      const index = Math.min(
        Math.max(0, Math.round(scrollLeft / (cardWidth + 24))),
        contacts.length - 1
      );
      setCurrentIndex(index);

      // [수정] 오른쪽 끝(카드 약 2장 정도 남았을 때)에 가까워지면 50개씩 더 그린다.
      const nearEnd = scrollLeft + clientWidth > scrollWidth - (cardWidth + 24) * 2;
      if (nearEnd) {
        setVisibleCount((prev) => (prev < contacts.length ? Math.min(prev + 50, contacts.length) : prev));
      }
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.addEventListener('scroll', checkScroll, { passive: true });
      // Run on next tick once dimensions are computed
      const timer = setTimeout(checkScroll, 100);
      return () => {
        el.removeEventListener('scroll', checkScroll);
        clearTimeout(timer);
      };
    }
  }, [contacts]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const cardWidth = scrollRef.current.firstElementChild?.clientWidth || 380;
      const amount = direction === 'left' ? -(cardWidth + 24) : (cardWidth + 24);
      scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  if (contacts.length === 0 && !searchQuery) {
    return (
      <div className="py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400">
          <Building2 className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-700 mb-1">등록된 명함이 없습니다</h3>
        <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
          상단의 '명함 스캔/등록' 버튼을 눌러 카메라 사진이나 이미지를 업로드하고 AI OCR 자동 파싱을 체험해보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* [추가] 참고하신 병원 근무표 앱처럼, 화면 맨 위에 한눈에 들어오는 요약 통계 카드를 둔다.
      다크 테마는 그대로 유지하면서(전체 톤 통일성 위해), 카드마다 포인트 컬러를 줘서
      정보가 한눈에 구분되게 했다. */}
      {(() => {
        const now = new Date();
        const thisMonthCount = contacts.filter((c) => {
          if (!c.createdAt) return false;
          const d = new Date(c.createdAt);
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        }).length;
        const companyCount = new Set(contacts.map((c) => (c.company || '').trim()).filter(Boolean)).size;
        const privateCount = contacts.filter((c) => c.isPrivate).length;

        const stats = [
          { label: '전체 명함', value: contacts.length, color: 'indigo' as const },
          { label: '이번달 신규', value: thisMonthCount, color: 'emerald' as const },
          { label: '소속 회사 수', value: companyCount, color: 'amber' as const },
          { label: '나만 보기', value: privateCount, color: 'rose' as const }
        ];
        const colorClasses: Record<string, string> = {
          indigo: 'bg-blue-600 text-white',
          emerald: 'bg-emerald-500 text-white',
          amber: 'bg-amber-500 text-white',
          rose: 'bg-purple-500 text-white'
        };

        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {stats.map((s) => (
              <div key={s.label} className={`rounded-2xl p-3.5 shadow-md ${colorClasses[s.color]}`}>
                <p className="text-2xl font-extrabold leading-none">{s.value.toLocaleString()}</p>
                <p className="text-[11px] font-semibold mt-1.5 opacity-90">{s.label}</p>
              </div>
            ))}
          </div>
        );
      })()}

      {/* 🧠 관계 인텔리전스: 명함 + 프로젝트 + 팔로우업 + 통화기록을 엮어서
          "지금 누구를 챙겨야 하는지, 왜"까지 알려주는 패널 */}
      {(() => {
        const now = Date.now();
        const DAY_MS = 24 * 60 * 60 * 1000;
        const PRIORITY_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 };

        interface Insight {
          contact: BusinessCard;
          reasonText: string;
          daysSince: number;
          urgencyLabel: '높음' | '보통';
          score: number;
          linkedProjectName?: string;
        }

        const insights: Insight[] = [];

        contacts.forEach((c) => {
          // 이 명함과 연결된 프로젝트 중, 아직 끝나지 않은(진행중/기회) 것만 대상으로 한다
          const linkedActiveProjects = projects.filter(
            (p) => (p.contactIds || []).includes(c.id) && (p.status === 'opportunity' || p.status === 'progress')
          );

          let best: Insight | null = null;

          for (const p of linkedActiveProjects) {
            // 이 프로젝트의 "마지막 활동일" = 가장 최근 팔로우업 날짜, 없으면 프로젝트 등록일
            const followUpDates = (p.followUps || []).map((f) => new Date(f.date || '').getTime()).filter((t) => !isNaN(t));
            const lastActivity = followUpDates.length > 0 ? Math.max(...followUpDates) : new Date(p.createdAt).getTime();
            if (isNaN(lastActivity)) continue;
            const daysSince = Math.floor((now - lastActivity) / DAY_MS);
            if (daysSince < 7) continue; // 일주일 안 됐으면 아직 급하지 않다고 판단

            const weight = PRIORITY_WEIGHT[p.priority] || 1;
            const score = daysSince * weight;

            if (!best || score > best.score) {
              best = {
                contact: c,
                reasonText: `"${p.name}" 프로젝트 연결 · ${p.priority === 'high' ? '우선순위 높음' : p.priority === 'medium' ? '우선순위 보통' : '우선순위 낮음'}`,
                daysSince,
                urgencyLabel: score >= 40 ? '높음' : '보통',
                score,
                linkedProjectName: p.name
              };
            }
          }

          // 연결된 활성 프로젝트가 없으면, 기존처럼 통화기록 기준으로 판단(최소한의 안전망)
          if (!best && c.callHistory && c.callHistory.length > 0) {
            const lastCall = c.callHistory.reduce((latest, cur) => {
              const t = new Date(cur.timestamp).getTime();
              return t > latest ? t : latest;
            }, 0);
            if (lastCall) {
              const daysSince = Math.floor((now - lastCall) / DAY_MS);
              if (daysSince >= 10) {
                best = {
                  contact: c,
                  reasonText: '연결된 진행중 프로젝트는 없지만, 통화 기록 기준 연락이 뜸함',
                  daysSince,
                  urgencyLabel: daysSince >= 20 ? '높음' : '보통',
                  score: daysSince
                };
              }
            }
          }

          if (best) insights.push(best);
        });

        insights.sort((a, b) => b.score - a.score);
        const topInsights = insights.slice(0, 5);

        if (topInsights.length === 0) return null;

        // 오늘 이미 닫은 상태면, 완전히 숨기지 않고 작은 뱃지로 흔적을 남긴다
        if (isIntelDismissed) {
          return (
            <div className="max-w-3xl mx-auto flex">
              <button
                onClick={reopenIntel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-semibold transition-all animate-fadeIn"
              >
                <Brain className="w-3.5 h-3.5" />
                <span>관계 인텔리전스 · 챙길 거래처 {topInsights.length}건</span>
              </button>
            </div>
          );
        }

        return (
          <div className="relative bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-3xl p-5 shadow-sm animate-fadeIn max-w-3xl mx-auto">
            <button
              onClick={dismissIntelForToday}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-indigo-400 hover:text-indigo-700 hover:bg-indigo-100 transition-colors"
              title="오늘 하루 닫기"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-start gap-3 mb-3">
              <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl border border-indigo-200 shrink-0">
                <Brain className="w-5 h-5" />
              </div>
              <div className="pr-6">
                <h4 className="text-sm font-bold text-indigo-700">🧠 관계 인텔리전스 · 지금 챙기면 좋은 거래처 {topInsights.length}곳</h4>
                <p className="text-xs text-slate-500 mt-0.5">진행중인 프로젝트와 마지막 연락 시점을 같이 분석했어요.</p>
              </div>
            </div>

            <div className="space-y-2">
              {topInsights.map((insight) => (
                <div
                  key={insight.contact.id}
                  className="flex items-center justify-between gap-3 bg-slate-100 border border-slate-200 rounded-2xl p-3 hover:border-indigo-300 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-slate-800">{insight.contact.name}</span>
                      <span className="text-xs text-slate-400">{insight.contact.company}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        insight.urgencyLabel === '높음'
                          ? 'bg-rose-50 text-rose-600 border-rose-200'
                          : 'bg-amber-50 text-amber-600 border-amber-200'
                      }`}>
                        긴급도 {insight.urgencyLabel}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 truncate">
                      {insight.reasonText} · <span className="font-mono">{insight.daysSince}일째 활동 없음</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {insight.contact.phoneMobile && (
                      <a
                        href={`tel:${insight.contact.phoneMobile}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddCallHistory?.(insight.contact.id, {
                            type: 'outgoing',
                            note: '(자동 기록) 전화 버튼을 눌러 발신을 시도했습니다.'
                          });
                        }}
                        className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-600 transition-colors"
                        title="전화 걸기"
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      onClick={() => onSelectContact(insight.contact)}
                      className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[11px] font-bold transition-colors"
                    >
                      <span>상세보기</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 명함 검색 영역 */}
      <div className="max-w-lg mx-auto flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-16 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 transition-all placeholder:text-slate-400 shadow-inner"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-blue-500 hover:text-blue-700 transition-colors bg-blue-50 px-2 py-1 rounded-lg cursor-pointer"
            >
              지우기
            </button>
          )}
        </div>
        {/* [추가] 정렬 방식 선택 - 최신순(기본)/이름순 */}
        {setSortOrder && (
          <div className="relative shrink-0">
            <ArrowDownUp className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'recent' | 'name')}
              className="pl-8 pr-3 py-2.5 rounded-2xl bg-white border border-slate-200 text-xs font-semibold text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer shadow-inner"
              title="명함 정렬 방식"
            >
              <option value="recent">최신 등록순</option>
              <option value="name">이름순</option>
            </select>
          </div>
        )}
      </div>

      {contacts.length === 0 ? (
        <div className="py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400 border border-slate-200">
            <Search className="w-6 h-6 text-slate-500" />
          </div>
          <h3 className="text-base font-bold text-slate-600 mb-1">검색 결과가 없습니다</h3>
          <p className="text-xs text-slate-400 mb-4">
            '{searchQuery}'에 일치하는 이름 또는 회사명의 명함이 없습니다.
          </p>
          <button
            onClick={() => setSearchQuery('')}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl border border-slate-200 transition-all cursor-pointer"
          >
            검색어 초기화
          </button>
        </div>
      ) : (
        <>
          <div className="relative group/slider w-full">
        {/* 왼쪽 화살표 */}
        {showLeftArrow && (
          <button
            onClick={() => scroll('left')}
            className="absolute -left-2 md:-left-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/95 border border-slate-200 hover:bg-indigo-600 hover:border-indigo-500 hover:scale-105 text-slate-600 hover:text-white flex items-center justify-center shadow-lg transition-all duration-200"
            aria-label="이전 명함"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* 오른쪽 화살표 */}
        {showRightArrow && (
          <button
            onClick={() => scroll('right')}
            className="absolute -right-2 md:-right-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/95 border border-slate-200 hover:bg-indigo-600 hover:border-indigo-500 hover:scale-105 text-slate-600 hover:text-white flex items-center justify-center shadow-lg transition-all duration-200"
            aria-label="다음 명함"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* 가로 스크롤 카드 컨테이너 */}
        <div
          ref={scrollRef}
          className="flex overflow-x-auto gap-6 pb-4 pt-1 scroll-smooth snap-x snap-mandatory scrollbar-none"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {visibleContacts.map((contact) => {
            const contactGroups = getContactGroupIds(contact).map((gid) => groups.find((g) => g.id === gid)).filter((g): g is ContactGroup => Boolean(g));
            return (
              <div
                key={contact.id}
                onClick={() => onSelectContact(contact)}
                className="group relative bg-white rounded-2xl border border-slate-200 hover:border-blue-400 shadow-md overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-500/10 flex flex-col justify-between w-[85vw] sm:w-[380px] shrink-0 snap-center md:snap-start"
              >
                {/* 카드 상단 배너 & 사진 프리뷰 배경 (명함 비율에 맞춰 전체가 보이도록, 뒷면 있으면 좌우로 밀어서 전환) */}
                <div
                  className="aspect-[1.586/1] relative overflow-hidden bg-slate-100 border-b border-slate-200 touch-pan-y"
                  onTouchStart={handleImageSwipeStart}
                  onTouchEnd={handleImageSwipeEnd(contact.id, !!contact.backImage)}
                >
                  {(() => {
                    const side = cardImageSide[contact.id] || 'front';
                    const shownImage = side === 'back' && contact.backImage ? contact.backImage : contact.frontImage;
                    return shownImage ? (
                      <img
                        src={shownImage}
                        alt={contact.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-contain group-hover:scale-105 transition-all duration-500 select-none"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center">
                        <span className="text-4xl font-extrabold text-white/10 tracking-widest">{contact.company || 'BIZCARD'}</span>
                      </div>
                    );
                  })()}

                  {/* 앞/뒤 전환 점 표시기 (뒷면 있을 때만) */}
                  {contact.backImage && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
                      <span className={`w-1.5 h-1.5 rounded-full transition-all ${(cardImageSide[contact.id] || 'front') === 'front' ? 'bg-white' : 'bg-white/40'}`} />
                      <span className={`w-1.5 h-1.5 rounded-full transition-all ${(cardImageSide[contact.id] || 'front') === 'back' ? 'bg-white' : 'bg-white/40'}`} />
                    </div>
                  )}
                  
                  {/* [수정] 예전엔 사진 위에 얹혀있던 뱃지/아이콘이 밝은 사진 위에서도 잘 보이라고
                  이 어두운 그라디언트를 항상 깔아뒀는데, 그 아이콘들을 본문 영역으로 옮기면서
                  더 이상 필요 없어졌다. 흰 배경으로 자동 생성된 명함 이미지가 이 오버레이 때문에
                  아래쪽이 탁하게 어두워 보이는 문제가 있어서, 뒷면 표시 점(dot)이 실제로 있을
                  때만 아주 옅게 깔아준다. */}
                  {contact.backImage && (
                    <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-slate-900/40 to-transparent pointer-events-none" />
                  )}

                  {/* [수정] 그룹 뱃지가 사진 위에 겹쳐있으면, 실제 명함 사진에 찍힌 회사명/로고와
                  겹쳐서 안 보이는 경우가 많았다(특히 회사명이 카드 왼쪽 위에 있는 경우). 사진
                  위에 얹는 대신, 아래 본문 텍스트 영역으로 옮겨서 항상 명확하게 보이게 한다. */}

                  {/* [수정] 삭제/수정 액션: 기존엔 PC 마우스 호버 시에만 나타났는데, 휴대폰은 "호버" 개념이
                      없어서 이 버튼 자체가 안 보이는 문제가 있었다. 그래서 작은 화면(터치 기기로 간주)에서는
                      항상 보이게 하고, 큰 화면(마우스 사용 PC)에서는 기존처럼 호버할 때만 나타나게 유지한다. */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all duration-200 z-10">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditContact(contact);
                      }}
                      title="명함 수정"
                      className="w-8 h-8 rounded-full bg-white/80 hover:bg-indigo-600 text-slate-600 hover:text-white flex items-center justify-center shadow transition-all duration-150 cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => onDeleteContact(contact.id, e)}
                      title="명함 삭제"
                      className="w-8 h-8 rounded-full bg-white/80 hover:bg-rose-600 text-slate-600 hover:text-white flex items-center justify-center shadow transition-all duration-150 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 카드 본문 내용 */}
                <div className="p-5 flex-1 flex flex-col justify-start space-y-4">
                  
                  {/* [수정] 명함 하나가 여러 그룹에 속할 수 있게 되면서, 뱃지도 여러 개
                  나란히 보여준다. */}
                  {contactGroups.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {contactGroups.map((g) => (
                        <span key={g.id} className={`self-start px-2.5 py-0.5 rounded-full text-xs font-semibold border shadow-sm ${g.color}`}>
                          {g.name}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 이름 & 소속 */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-baseline gap-2">
                        <h3 className="text-xl font-bold text-slate-900 tracking-tight group-hover:text-blue-600 transition-colors">
                          {contact.name}
                        </h3>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-100">
                          {contact.title || '직책 미입력'}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-600 mt-1 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">{contact.company || '회사 미입력'} {contact.department ? `(${contact.department})` : ''}</span>
                      </p>
                    </div>

                    {/* 명함 앞/뒤 이미지 표시 아이콘 */}
                    <div className="flex items-center gap-1 shrink-0 text-slate-500 bg-slate-100 px-2 py-1 rounded-lg text-xs font-mono">
                      <Eye className="w-3.5 h-3.5 text-blue-400" />
                      <span>{contact.backImage ? '앞·뒤' : '앞면'}</span>
                    </div>
                  </div>

                  {/* 연락처 분리 정보 (핸드폰 / 사무실 / 팩스) */}
                  <div className="space-y-2 pt-2 border-t border-slate-200 text-xs text-slate-600">
                    {contact.phoneMobile && (
                      <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-lg border border-slate-200">
                        <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-slate-500 w-12 font-medium">핸드폰:</span>
                        <span className="font-mono text-slate-800 font-semibold">{contact.phoneMobile}</span>
                      </div>
                    )}

                    {contact.phoneOffice && (
                      <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-lg border border-slate-200">
                        <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="text-slate-500 w-12 font-medium">사무실:</span>
                        <span className="font-mono text-slate-700">{contact.phoneOffice}</span>
                      </div>
                    )}

                    {contact.phoneFax && (
                      <div className="flex items-center gap-2 bg-slate-100 px-2 py-1.5 rounded border border-slate-200">
                        <Printer className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-slate-500 w-12 font-medium">팩스:</span>
                        <span className="font-mono text-slate-600">{contact.phoneFax}</span>
                      </div>
                    )}

                    {contact.email && (
                      <div className="flex items-center gap-2 truncate text-slate-500 pt-1">
                        <Mail className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span className="truncate">{contact.email}</span>
                      </div>
                    )}

                    <div className="pt-1 border-t border-slate-200 space-y-1.5">
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (contact.address && contact.address !== '주소 미등록') {
                            setExpandedNavId(expandedNavId === contact.id ? null : contact.id);
                          }
                        }}
                        className={`flex items-center justify-between gap-2 p-1 rounded-lg transition-all ${
                          contact.address && contact.address !== '주소 미등록' 
                            ? 'hover:bg-slate-100 cursor-pointer text-slate-600' 
                            : 'text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate min-w-0">
                          <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                          <span className="truncate text-xs font-medium" title={contact.address || '주소 미등록'}>
                            {contact.address || '주소 미등록'}
                          </span>
                        </div>
                        {contact.address && contact.address !== '주소 미등록' && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold font-mono shrink-0 transition-colors ${
                            expandedNavId === contact.id ? 'bg-blue-500/20 text-blue-600' : 'bg-slate-100 text-slate-500 hover:text-blue-600'
                          }`}>
                            길찾기
                          </span>
                        )}
                      </div>

                      {expandedNavId === contact.id && contact.address && (
                        <div 
                          onClick={(e) => e.stopPropagation()}
                          className="flex flex-wrap gap-1 bg-slate-100 p-2 rounded-lg border border-slate-200 items-center justify-center"
                        >
                          <button
                            onClick={() => {
                              const enc = encodeURIComponent(contact.address);
                              window.open(`tmap://search?name=${enc}`, '_blank');
                              setTimeout(() => {
                                window.open(`https://search.naver.com/search.naver?query=${enc}+길찾기`, '_blank');
                              }, 500);
                            }}
                            className="text-[10px] px-1.5 py-0.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded border border-amber-500/20 transition-all font-bold cursor-pointer"
                          >
                            티맵
                          </button>
                          <button
                            onClick={() => window.open(`https://map.kakao.com/link/search/${encodeURIComponent(contact.address)}`, '_blank')}
                            className="text-[10px] px-1.5 py-0.5 bg-yellow-400/10 hover:bg-yellow-400/20 text-yellow-500 rounded border border-yellow-400/20 transition-all font-bold cursor-pointer"
                          >
                            카카오
                          </button>
                          <button
                            onClick={() => window.open(`https://map.naver.com/v5/search/${encodeURIComponent(contact.address)}`, '_blank')}
                            className="text-[10px] px-1.5 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/20 transition-all font-bold cursor-pointer"
                          >
                            네이버
                          </button>
                          <button
                            onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`, '_blank')}
                            className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded border border-blue-500/20 transition-all font-bold cursor-pointer"
                          >
                            구글맵
                          </button>
                          <button
                            onClick={() => window.open(`https://maps.apple.com/?q=${encodeURIComponent(contact.address)}`, '_blank')}
                            className="text-[10px] px-1.5 py-0.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded border border-purple-500/20 transition-all font-bold cursor-pointer"
                          >
                            애플맵
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 회사 정보 간략 요약 */}
                  {contact.companyInfo && (
                    <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-800">
                      <span className="font-bold text-blue-600 block text-[10px] uppercase font-mono mb-0.5">🏢 회사 비즈니스 요약</span>
                      <p className="line-clamp-2 leading-relaxed">{contact.companyInfo}</p>
                    </div>
                  )}

                  {/* 메모 요약 */}
                  {contact.memo && (
                    <p className="text-xs text-slate-500 bg-slate-100 p-2.5 rounded-xl border border-slate-200 line-clamp-2 italic">
                      "{contact.memo}"
                    </p>
                  )}
                </div>

                {/* 하단 푸터 (등록일 & 통화 히스토리 카운트) */}
                <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                    <span>등록일: {new Date(contact.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedCallsId(expandedCallsId === contact.id ? null : contact.id);
                    }}
                    className="flex items-center gap-1.5 text-blue-600 font-bold font-mono shrink-0 hover:text-blue-700 hover:bg-blue-100 transition-colors select-none cursor-pointer border border-blue-200 rounded-lg px-2 py-1 bg-blue-50 active:scale-95 shadow-sm"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>통화기록 {contact.callHistory?.length || 0}건</span>
                  </button>
                </div>

                {/* 확장된 통화기록 목록 (시계열, 최근 통화가 위로) */}
                {expandedCallsId === contact.id && (
                  <div 
                    onClick={(e) => e.stopPropagation()} // 카드 클릭 모달 오픈 방지
                    className="bg-slate-50 border-t border-slate-200 p-4 space-y-3 max-h-60 overflow-y-auto"
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                      <span className="text-xs font-bold text-slate-600 flex items-center gap-1">
                        <History className="w-3.5 h-3.5 text-blue-400" />
                        최근 통화 기록 상세
                      </span>
                      <button 
                        type="button"
                        onClick={() => setExpandedCallsId(null)}
                        className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded transition-all select-none cursor-pointer"
                      >
                        닫기
                      </button>
                    </div>

                    {!contact.callHistory || contact.callHistory.length === 0 ? (
                      <p className="text-center text-slate-400 text-[11px] py-4">등록된 통화기록이 없습니다.</p>
                    ) : (
                      <div className="space-y-3 relative pl-4 border-l border-slate-200">
                        {[...contact.callHistory]
                          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                          .map((record, idx) => {
                            const isInc = record.type === 'incoming';
                            const isOut = record.type === 'outgoing';
                            const isMiss = record.type === 'missed';
                            
                            return (
                              <div key={record.id || idx} className="relative text-[11px] space-y-1">
                                {/* 타임라인 동그라미 */}
                                <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 border-slate-200 ${
                                  isInc ? 'bg-emerald-500' : isOut ? 'bg-blue-500' : 'bg-rose-500'
                                }`} />
                                
                                <div className="flex items-center justify-between text-slate-500">
                                  <span className="font-semibold text-slate-600 font-mono">
                                    {formatCallDate(record.timestamp)}
                                  </span>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    isInc ? 'bg-emerald-50 text-emerald-600' : isOut ? 'bg-blue-50 text-blue-600' : 'bg-rose-50 text-rose-600'
                                  }`}>
                                    {isInc ? '수신' : isOut ? '발신' : '부재중'}
                                  </span>
                                </div>
                                
                                {record.note && (
                                  <p className="text-slate-700 bg-slate-100 p-2 rounded border border-slate-200 leading-relaxed font-medium">
                                    {record.note}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                )}

              </div>
            );
          })}

          {/* [수정] 스크롤 감지가 안 먹히는 경우를 대비한 수동 "더 보기" 카드 */}
          {visibleCount < contacts.length && (
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => Math.min(prev + 50, contacts.length))}
              className="flex flex-col items-center justify-center gap-2 bg-slate-100 hover:bg-white border border-dashed border-slate-300 hover:border-indigo-400 rounded-2xl w-[85vw] sm:w-[220px] shrink-0 snap-center md:snap-start text-slate-500 hover:text-indigo-600 transition-all"
            >
              <span className="text-2xl">＋</span>
              <span className="text-xs font-bold">{contacts.length - visibleCount}명 더 보기</span>
            </button>
          )}
        </div>
      </div>

          {/* 페이지네이션 정보 */}
          <div className="flex flex-col items-center justify-center pt-2 space-y-2">
            <div className="flex items-center gap-1.5 bg-white/80 border border-slate-200 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-500 shadow-lg">
              <span className="text-indigo-600 font-bold">{Math.min(currentIndex + 1, contacts.length)}</span>
              <span className="opacity-50">/</span>
              <span>{contacts.length}</span>
            </div>
            
            <div className="w-32 h-1 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-indigo-500 transition-all duration-300 rounded-full"
                style={{ width: `${((currentIndex + 1) / contacts.length) * 100}%` }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
};
