import React, { useRef, useState, useEffect } from 'react';
import { Phone, Building2, Printer, Mail, MapPin, History, Eye, Trash2, Edit3, ChevronLeft, ChevronRight, Sparkles, Navigation, Search, AlertTriangle } from 'lucide-react';
import { BusinessCard, ContactGroup } from '../types.js';

interface Props {
  contacts: BusinessCard[];
  groups: ContactGroup[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onSelectContact: (contact: BusinessCard) => void;
  onEditContact: (contact: BusinessCard) => void;
  onDeleteContact: (id: string, e: React.MouseEvent) => void;
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

export const CardGrid: React.FC<Props> = ({ contacts, groups, searchQuery, setSearchQuery, onSelectContact, onEditContact, onDeleteContact }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [expandedCallsId, setExpandedCallsId] = useState<string | null>(null);
  const [expandedNavId, setExpandedNavId] = useState<string | null>(null);

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
        <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4 text-slate-500">
          <Building2 className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-bold text-slate-200 mb-1">등록된 명함이 없습니다</h3>
        <p className="text-sm text-slate-400 max-w-sm mx-auto mb-6">
          상단의 '명함 스캔/등록' 버튼을 눌러 카메라 사진이나 이미지를 업로드하고 AI OCR 자동 파싱을 체험해보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ⚠️ 5일 이상 연락 없는 거래처 알림 배너 */}
      {(() => {
        const now = Date.now();
        const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;
        const staleContacts = contacts.filter((c) => {
          if (!c.callHistory || c.callHistory.length === 0) return false;
          const lastCall = c.callHistory.reduce((latest, cur) => {
            const t = new Date(cur.timestamp).getTime();
            return t > latest ? t : latest;
          }, 0);
          if (!lastCall) return false;
          return now - lastCall >= FIVE_DAYS_MS;
        });

        if (staleContacts.length === 0) return null;

        return (
          <div className="bg-gradient-to-r from-rose-950/40 to-amber-950/30 border border-rose-500/30 rounded-3xl p-5 shadow-xl flex items-start gap-4 animate-fadeIn max-w-3xl mx-auto">
            <div className="p-2.5 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30 shrink-0">
              <AlertTriangle className="w-5 h-5 animate-bounce" />
            </div>
            <div className="space-y-1.5 flex-1">
              <h4 className="text-sm font-bold text-rose-300">
                5일 이상 연락이 뜸한 거래처가 {staleContacts.length}개 있습니다!
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                안부 전화나 후속 연락을 진행해 보세요.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {staleContacts.map((c) => {
                  const lastCall = (c.callHistory || []).reduce((latest, cur) => {
                    const t = new Date(cur.timestamp).getTime();
                    return t > latest ? t : latest;
                  }, 0);
                  const daysSince = Math.floor((now - lastCall) / (24 * 60 * 60 * 1000));
                  return (
                    <button
                      key={c.id}
                      onClick={() => onSelectContact(c)}
                      className="px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all flex items-center gap-1.5 bg-slate-950 hover:bg-slate-900 border-rose-500/20 hover:border-rose-500/40 text-rose-300"
                    >
                      <span className="font-bold">{c.name}</span>
                      <span className="text-[10px] opacity-80 font-mono">({daysSince}일 경과)</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 명함 검색 영역 */}
      <div className="max-w-md mx-auto relative">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="이름 또는 회사명으로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-16 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200 transition-all placeholder:text-slate-500 shadow-inner"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 px-2 py-1 rounded-lg cursor-pointer"
            >
              지우기
            </button>
          )}
        </div>
      </div>

      {contacts.length === 0 ? (
        <div className="py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-900/50 flex items-center justify-center mx-auto mb-3 text-slate-500 border border-slate-800">
            <Search className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-base font-bold text-slate-300 mb-1">검색 결과가 없습니다</h3>
          <p className="text-xs text-slate-500 mb-4">
            '{searchQuery}'에 일치하는 이름 또는 회사명의 명함이 없습니다.
          </p>
          <button
            onClick={() => setSearchQuery('')}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 transition-all cursor-pointer"
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
            className="absolute -left-2 md:-left-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-slate-900/95 border border-slate-700 hover:bg-indigo-600 hover:border-indigo-500 hover:scale-105 text-white flex items-center justify-center shadow-2xl transition-all duration-200"
            aria-label="이전 명함"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* 오른쪽 화살표 */}
        {showRightArrow && (
          <button
            onClick={() => scroll('right')}
            className="absolute -right-2 md:-right-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-slate-900/95 border border-slate-700 hover:bg-indigo-600 hover:border-indigo-500 hover:scale-105 text-white flex items-center justify-center shadow-2xl transition-all duration-200"
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
          {contacts.map((contact) => {
            const group = groups.find((g) => g.id === contact.groupId);
            return (
              <div
                key={contact.id}
                onClick={() => onSelectContact(contact)}
                className="group relative bg-gradient-to-b from-slate-800/90 to-slate-900/90 rounded-2xl border border-slate-700/80 hover:border-blue-500/50 shadow-xl overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-blue-500/10 flex flex-col justify-between w-[85vw] sm:w-[380px] shrink-0 snap-center md:snap-start"
              >
                {/* 카드 상단 배너 & 사진 프리뷰 배경 */}
                <div className="h-28 relative overflow-hidden bg-slate-950 border-b border-slate-800">
                  {contact.frontImage ? (
                    <img
                      src={contact.frontImage}
                      alt={contact.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover opacity-60 group-hover:scale-105 group-hover:opacity-80 transition-all duration-500"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-tr from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center">
                      <span className="text-4xl font-extrabold text-white/10 tracking-widest">{contact.company || 'BIZCARD'}</span>
                    </div>
                  )}
                  
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />

                  {/* 그룹 뱃지 */}
                  {group && (
                    <span className={`absolute top-3 left-3 px-2.5 py-0.5 rounded-full text-xs font-semibold border shadow-sm ${group.color}`}>
                      {group.name}
                    </span>
                  )}

                  {/* 삭제/수정 액션 (호버 시 표시) */}
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditContact(contact);
                      }}
                      title="명함 수정"
                      className="w-8 h-8 rounded-full bg-slate-900/80 hover:bg-indigo-600 text-slate-300 hover:text-white flex items-center justify-center shadow transition-all duration-150 cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => onDeleteContact(contact.id, e)}
                      title="명함 삭제"
                      className="w-8 h-8 rounded-full bg-slate-900/80 hover:bg-rose-600 text-slate-300 hover:text-white flex items-center justify-center shadow transition-all duration-150 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 카드 본문 내용 */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  
                  {/* 이름 & 소속 */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-baseline gap-2">
                        <h3 className="text-xl font-bold text-white tracking-tight group-hover:text-blue-400 transition-colors">
                          {contact.name}
                        </h3>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-blue-300 border border-slate-700">
                          {contact.title || '직책 미입력'}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-300 mt-1 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{contact.company || '회사 미입력'} {contact.department ? `(${contact.department})` : ''}</span>
                      </p>
                    </div>

                    {/* 명함 앞/뒤 이미지 표시 아이콘 */}
                    <div className="flex items-center gap-1 shrink-0 text-slate-400 bg-slate-800/80 px-2 py-1 rounded-lg text-xs font-mono">
                      <Eye className="w-3.5 h-3.5 text-blue-400" />
                      <span>{contact.backImage ? '앞·뒤' : '앞면'}</span>
                    </div>
                  </div>

                  {/* 연락처 분리 정보 (핸드폰 / 사무실 / 팩스) */}
                  <div className="space-y-2 pt-2 border-t border-slate-800 text-xs text-slate-300">
                    {contact.phoneMobile && (
                      <div className="flex items-center gap-2 bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                        <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="text-slate-400 w-12 font-medium">핸드폰:</span>
                        <span className="font-mono text-slate-100 font-semibold">{contact.phoneMobile}</span>
                      </div>
                    )}

                    {contact.phoneOffice && (
                      <div className="flex items-center gap-2 bg-slate-800/50 p-2 rounded-lg border border-slate-700/50">
                        <Building2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span className="text-slate-400 w-12 font-medium">사무실:</span>
                        <span className="font-mono text-slate-200">{contact.phoneOffice}</span>
                      </div>
                    )}

                    {contact.phoneFax && (
                      <div className="flex items-center gap-2 bg-slate-800/30 px-2 py-1.5 rounded border border-slate-800">
                        <Printer className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-slate-400 w-12 font-medium">팩스:</span>
                        <span className="font-mono text-slate-300">{contact.phoneFax}</span>
                      </div>
                    )}

                    {contact.email && (
                      <div className="flex items-center gap-2 truncate text-slate-400 pt-1">
                        <Mail className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span className="truncate">{contact.email}</span>
                      </div>
                    )}

                    <div className="pt-1 border-t border-slate-800/30 space-y-1.5">
                      <div 
                        onClick={(e) => {
                          e.stopPropagation();
                          if (contact.address && contact.address !== '주소 미등록') {
                            setExpandedNavId(expandedNavId === contact.id ? null : contact.id);
                          }
                        }}
                        className={`flex items-center justify-between gap-2 p-1 rounded-lg transition-all ${
                          contact.address && contact.address !== '주소 미등록' 
                            ? 'hover:bg-slate-800/50 cursor-pointer text-slate-300' 
                            : 'text-slate-500'
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
                            expandedNavId === contact.id ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400 hover:text-white'
                          }`}>
                            길찾기
                          </span>
                        )}
                      </div>

                      {expandedNavId === contact.id && contact.address && (
                        <div 
                          onClick={(e) => e.stopPropagation()}
                          className="flex flex-wrap gap-1 bg-slate-950/80 p-2 rounded-lg border border-slate-800/60 items-center justify-center"
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
                    <div className="p-2.5 rounded-xl bg-blue-950/40 border border-blue-500/20 text-xs text-blue-200">
                      <span className="font-bold text-blue-400 block text-[10px] uppercase font-mono mb-0.5">🏢 회사 비즈니스 요약</span>
                      <p className="line-clamp-2 leading-relaxed">{contact.companyInfo}</p>
                    </div>
                  )}

                  {/* 메모 요약 */}
                  {contact.memo && (
                    <p className="text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 line-clamp-2 italic">
                      "{contact.memo}"
                    </p>
                  )}
                </div>

                {/* 하단 푸터 (등록일 & 통화 히스토리 카운트) */}
                <div className="px-5 py-3 bg-slate-950/80 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                    <span>등록일: {new Date(contact.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}</span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedCallsId(expandedCallsId === contact.id ? null : contact.id);
                    }}
                    className="flex items-center gap-1.5 text-blue-400 font-bold font-mono shrink-0 hover:text-blue-300 hover:bg-blue-500/10 transition-colors select-none cursor-pointer border border-blue-500/20 rounded-lg px-2 py-1 bg-blue-950/20 active:scale-95 shadow-sm"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>통화기록 {contact.callHistory?.length || 0}건</span>
                  </button>
                </div>

                {/* 확장된 통화기록 목록 (시계열, 최근 통화가 위로) */}
                {expandedCallsId === contact.id && (
                  <div 
                    onClick={(e) => e.stopPropagation()} // 카드 클릭 모달 오픈 방지
                    className="bg-slate-950/90 border-t border-slate-800 p-4 space-y-3 max-h-60 overflow-y-auto"
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-800/60">
                      <span className="text-xs font-bold text-slate-300 flex items-center gap-1">
                        <History className="w-3.5 h-3.5 text-blue-400" />
                        최근 통화 기록 상세
                      </span>
                      <button 
                        type="button"
                        onClick={() => setExpandedCallsId(null)}
                        className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded transition-all select-none cursor-pointer"
                      >
                        닫기
                      </button>
                    </div>

                    {!contact.callHistory || contact.callHistory.length === 0 ? (
                      <p className="text-center text-slate-500 text-[11px] py-4">등록된 통화기록이 없습니다.</p>
                    ) : (
                      <div className="space-y-3 relative pl-4 border-l border-slate-800">
                        {[...contact.callHistory]
                          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                          .map((record, idx) => {
                            const isInc = record.type === 'incoming';
                            const isOut = record.type === 'outgoing';
                            const isMiss = record.type === 'missed';
                            
                            return (
                              <div key={record.id || idx} className="relative text-[11px] space-y-1">
                                {/* 타임라인 동그라미 */}
                                <div className={`absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full border-2 border-slate-950 ${
                                  isInc ? 'bg-emerald-500' : isOut ? 'bg-blue-500' : 'bg-rose-500'
                                }`} />
                                
                                <div className="flex items-center justify-between text-slate-400">
                                  <span className="font-semibold text-slate-300 font-mono">
                                    {formatCallDate(record.timestamp)}
                                  </span>
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    isInc ? 'bg-emerald-500/10 text-emerald-400' : isOut ? 'bg-blue-500/10 text-blue-400' : 'bg-rose-500/10 text-rose-400'
                                  }`}>
                                    {isInc ? '수신' : isOut ? '발신' : '부재중'}
                                  </span>
                                </div>
                                
                                {record.note && (
                                  <p className="text-slate-200 bg-slate-900/40 p-2 rounded border border-slate-800/40 leading-relaxed font-medium">
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
        </div>
      </div>

          {/* 페이지네이션 정보 */}
          <div className="flex flex-col items-center justify-center pt-2 space-y-2">
            <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-full text-xs font-semibold text-slate-400 shadow-lg">
              <span className="text-white font-bold">{Math.min(currentIndex + 1, contacts.length)}</span>
              <span className="opacity-50">/</span>
              <span>{contacts.length}</span>
            </div>
            
            <div className="w-32 h-1 bg-slate-800 rounded-full overflow-hidden">
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
