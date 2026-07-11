import React, { useState } from 'react';
import { X, Phone, Building2, Printer, Mail, MapPin, History, Edit3, Plus, ArrowDownLeft, ArrowUpRight, PhoneMissed, Calendar, Clock, MessageSquare, Sparkles, Navigation } from 'lucide-react';
import { BusinessCard, ContactGroup, CallRecord } from '../types.js';

interface Props {
  contact: BusinessCard | null;
  groups: ContactGroup[];
  onClose: () => void;
  onUpdateContact: (updated: BusinessCard) => void;
  onAddCallHistory: (contactId: string, record: { type: 'incoming'|'outgoing'|'missed'; duration?: string; note?: string }) => void;
  initialTab?: 'info' | 'history' | 'edit';
}

export const CardDetailModal: React.FC<Props> = ({ contact, groups, onClose, onUpdateContact, onAddCallHistory, initialTab = 'info' }) => {
  if (!contact) return null;

  const [activeTab, setActiveTab] = useState<'info' | 'history' | 'edit'>(initialTab);
  const [cardSide, setCardSide] = useState<'front' | 'back'>('front');

  // 통화기록 추가 폼 상태
  const [callType, setCallType] = useState<'incoming' | 'outgoing' | 'missed'>('incoming');
  const [callDuration, setCallDuration] = useState('');
  const [callNote, setCallNote] = useState('');
  const [isAddingCall, setIsAddingCall] = useState(false);

  // AI 회사 요약 검색 상태
  const [isSearchingCompany, setIsSearchingCompany] = useState(false);

  // 수정 폼 상태
  const [editForm, setEditForm] = useState<BusinessCard>({ ...contact });

  // 연락처 변경 시 상태 동기화
  React.useEffect(() => {
    if (contact) {
      setActiveTab(initialTab);
      setEditForm({ ...contact });
    }
  }, [contact?.id, initialTab]);

  const group = groups.find((g) => g.id === contact.groupId);

  const handleSearchCompanySummary = async () => {
    if (!contact.company) return;
    setIsSearchingCompany(true);
    try {
      const response = await fetch('/api/company/search-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: contact.company })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.companyInfo) {
          const updated = { ...contact, companyInfo: data.companyInfo };
          onUpdateContact(updated);
          setEditForm(prev => ({ ...prev, companyInfo: data.companyInfo }));
        }
      }
    } catch (error) {
      console.error('Error searching company summary:', error);
    } finally {
      setIsSearchingCompany(false);
    }
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateContact(editForm);
    setActiveTab('info');
  };

  const handleSaveCallRecord = (e: React.FormEvent) => {
    e.preventDefault();
    onAddCallHistory(contact.id, {
      type: callType,
      duration: callDuration || undefined,
      note: callNote || undefined
    });
    setCallDuration('');
    setCallNote('');
    setIsAddingCall(false);
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const date = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${year}년 ${month}월 ${date}일 ${hours}시 ${minutes}분`;
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl flex flex-col md:flex-row overflow-y-auto md:overflow-hidden max-h-[95vh] md:max-h-[90vh]">
        
        {/* 좌측: 명함 앞/뒤 이미지 프리뷰 영역 */}
        <div className="w-full md:w-1/2 bg-slate-950 p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-wider text-slate-400 uppercase font-mono">
                명함 원본 스캔 프리뷰
              </span>
              
              {/* 앞면/뒷면 전환 버튼 */}
              {contact.backImage && (
                <div className="flex bg-slate-900 rounded-lg p-1 border border-slate-800 text-xs">
                  <button
                    onClick={() => setCardSide('front')}
                    className={`px-3 py-1 rounded-md font-medium transition-all ${cardSide === 'front' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    앞면
                  </button>
                  <button
                    onClick={() => setCardSide('back')}
                    className={`px-3 py-1 rounded-md font-medium transition-all ${cardSide === 'back' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    뒷면
                  </button>
                </div>
              )}
            </div>

            {/* 카드 액자 */}
            <div className="aspect-video w-full rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl relative group/img flex items-center justify-center">
              {cardSide === 'front' ? (
                contact.frontImage ? (
                  <img src={contact.frontImage} alt="명함 앞면" className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-105" />
                ) : (
                  <div className="text-center p-6 text-slate-600">
                    <Building2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">앞면 스캔 이미지가 없습니다</p>
                  </div>
                )
              ) : (
                contact.backImage ? (
                  <img src={contact.backImage} alt="명함 뒷면" className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-105" />
                ) : (
                  <div className="text-center p-6 text-slate-600">
                    <Building2 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">뒷면 스캔 이미지가 없습니다</p>
                  </div>
                )
              )}
            </div>
          </div>

          {/* 빠른 전화/문자 발신 바 */}
          <div className="pt-6 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">다이렉트 액션</p>
            <div className="grid grid-cols-2 gap-3">
              <a
                href={contact.phoneMobile ? `tel:${contact.phoneMobile}` : '#'}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm shadow-lg transition-all ${contact.phoneMobile ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 active:scale-95' : 'bg-slate-800 text-slate-600 pointer-events-none'}`}
              >
                <Phone className="w-4 h-4" />
                <span>핸드폰 통화</span>
              </a>

              <a
                href={contact.phoneMobile ? `sms:${contact.phoneMobile}` : '#'}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm shadow-lg transition-all ${contact.phoneMobile ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 active:scale-95' : 'bg-slate-800 text-slate-600 pointer-events-none'}`}
              >
                <MessageSquare className="w-4 h-4" />
                <span>문자 보내기</span>
              </a>
            </div>
            
            {contact.phoneOffice && (
              <a
                href={`tel:${contact.phoneOffice}`}
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 font-medium text-xs transition-colors"
              >
                <Building2 className="w-3.5 h-3.5 text-blue-400" />
                <span>사무실 유선전화 연결 ({contact.phoneOffice})</span>
              </a>
            )}
          </div>
        </div>

        {/* 우측: 상세 인포메이션 & 히스토리 타임라인 탭 */}
        <div className="w-full md:w-1/2 p-6 flex flex-col md:overflow-hidden">
          
          {/* 상단 헤더 & 닫기 */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('info')}
                className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'info' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40' : 'text-slate-400 hover:text-white'}`}
              >
                명함 상세정보
              </button>
              
              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${activeTab === 'history' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40' : 'text-slate-400 hover:text-white'}`}
              >
                <History className="w-4 h-4" />
                <span>통화 히스토리</span>
                <span className="px-1.5 py-0.2 rounded-full text-xs bg-slate-800 text-blue-300 font-mono">{contact.callHistory?.length || 0}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {activeTab === 'info' && (
                <button
                  onClick={() => setActiveTab('edit')}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs flex items-center gap-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>수정</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 탭 1: 상세정보 뷰 */}
          {activeTab === 'info' && (
            <div className="flex-1 overflow-y-auto py-5 space-y-6 pr-2">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-3xl font-extrabold text-white tracking-tight">{contact.name}</h2>
                  {group && <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${group.color}`}>{group.name}</span>}
                </div>
                <p className="text-base font-semibold text-blue-400 mt-1">{contact.title || '직책 미등록'}</p>
                <p className="text-sm font-medium text-slate-300 flex items-center gap-1.5 mt-1">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <span>{contact.company} {contact.department ? `| ${contact.department}` : ''}</span>
                </p>
                <div className="mt-3">
                  <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 text-xs text-slate-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <span className="font-bold text-blue-400 text-[10px] uppercase tracking-wider font-mono flex items-center gap-1.5">
                        🏢 회사 비즈니스 요약 & 전년도 매출
                      </span>
                      {contact.company && (
                        <button
                          type="button"
                          disabled={isSearchingCompany}
                          onClick={handleSearchCompanySummary}
                          className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] flex items-center gap-1 transition-all shadow-md active:scale-95 disabled:opacity-50 select-none cursor-pointer self-start sm:self-auto shrink-0"
                        >
                          {isSearchingCompany ? (
                            <>
                              <div className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              <span>검색 중...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-2.5 h-2.5 text-blue-200 animate-pulse" />
                              <span>AI 매출액/비즈니스 실시간 검색</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    {contact.companyInfo ? (
                      <p className="leading-relaxed text-slate-200 text-xs font-medium bg-blue-950/30 p-2.5 rounded-xl border border-blue-900/40">
                        {contact.companyInfo}
                      </p>
                    ) : (
                      <div className="text-center py-3 text-slate-500 text-[11px] bg-slate-900/50 rounded-xl border border-dashed border-slate-800">
                        회사 정보가 아직 요약되지 않았습니다. 실시간 검색 버튼을 눌러 매출액과 주요 사업을 검색해 보세요.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 핸드폰/사무실/팩스 분리 박스 */}
              <div className="space-y-3 bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">연락처 상세 분리 입력</h4>
                
                <div className="grid grid-cols-1 gap-2.5 text-sm">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="flex items-center gap-2 text-slate-400 text-xs font-medium"><Phone className="w-4 h-4 text-emerald-400" /> 핸드폰 (Mobile)</span>
                    <span className="font-mono font-bold text-emerald-300">{contact.phoneMobile || '-'}</span>
                  </div>

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="flex items-center gap-2 text-slate-400 text-xs font-medium"><Building2 className="w-4 h-4 text-blue-400" /> 사무실 1 (Office 1)</span>
                    <span className="font-mono font-semibold text-slate-200">{contact.phoneOffice || '-'}</span>
                  </div>

                  {contact.phoneOffice2 && (
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                      <span className="flex items-center gap-2 text-slate-400 text-xs font-medium"><Building2 className="w-4 h-4 text-cyan-400" /> 사무실 2 (Office 2)</span>
                      <span className="font-mono font-semibold text-slate-200">{contact.phoneOffice2}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                    <span className="flex items-center gap-2 text-slate-400 text-xs font-medium"><Printer className="w-4 h-4 text-amber-400" /> 팩스 번호 (Fax)</span>
                    <span className="font-mono text-slate-300">{contact.phoneFax || '-'}</span>
                  </div>
                </div>
              </div>

              {/* 주소 & 이메일 */}
              <div className="space-y-3 text-sm text-slate-300">
                <div className="flex items-start gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                  <Mail className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-400 font-medium">이메일</p>
                    <p className="font-mono font-medium text-slate-100">{contact.email || '미등록'}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                  <MapPin className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400 font-medium">회사 주소 1 (본사 - 지도 연동)</p>
                    <p className="text-slate-200 mt-0.5 break-words">{contact.address || '미등록'}</p>
                    {contact.lat && <p className="text-[10px] text-slate-500 font-mono mt-1">좌표: {contact.lat.toFixed(4)}, {contact.lng?.toFixed(4)}</p>}
                    
                    {contact.address && contact.address !== '미등록' && (
                      <div className="mt-2 pt-2 border-t border-slate-800/60 flex flex-wrap gap-1.5 items-center">
                        <span className="text-[10px] text-slate-400 mr-1 font-medium flex items-center gap-1">
                          <Navigation className="w-3 h-3 text-blue-400 animate-pulse" />
                          길찾기:
                        </span>
                        <button
                          onClick={() => {
                            const enc = encodeURIComponent(contact.address);
                            window.open(`tmap://search?name=${enc}`, '_blank');
                            setTimeout(() => {
                              window.open(`https://search.naver.com/search.naver?query=${enc}+길찾기`, '_blank');
                            }, 500);
                          }}
                          className="text-[10px] px-2 py-0.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-md border border-amber-500/20 transition-all font-bold cursor-pointer"
                          title="티맵 앱 실행 (모바일) 또는 웹 검색"
                        >
                          티맵
                        </button>
                        <button
                          onClick={() => window.open(`https://map.kakao.com/link/search/${encodeURIComponent(contact.address)}`, '_blank')}
                          className="text-[10px] px-2 py-0.5 bg-yellow-400/10 hover:bg-yellow-400/20 text-yellow-500 rounded-md border border-yellow-400/20 transition-all font-bold cursor-pointer"
                          title="카카오맵/카카오내비 연결"
                        >
                          카카오
                        </button>
                        <button
                          onClick={() => window.open(`https://map.naver.com/v5/search/${encodeURIComponent(contact.address)}`, '_blank')}
                          className="text-[10px] px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-md border border-emerald-500/20 transition-all font-bold cursor-pointer"
                          title="네이버 지도 연결"
                        >
                          네이버
                        </button>
                        <button
                          onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`, '_blank')}
                          className="text-[10px] px-2 py-0.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-md border border-blue-500/20 transition-all font-bold cursor-pointer"
                          title="구글 지도 연결"
                        >
                          구글맵
                        </button>
                        <button
                          onClick={() => window.open(`https://maps.apple.com/?q=${encodeURIComponent(contact.address)}`, '_blank')}
                          className="text-[10px] px-2 py-0.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-md border border-purple-500/20 transition-all font-bold cursor-pointer"
                          title="애플 지도 연결"
                        >
                          애플맵
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {contact.address2 && (
                  <div className="flex items-start gap-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                    <MapPin className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-indigo-400 font-medium flex items-center gap-1.5">
                        <span>회사 주소 2 (지사/공장 등)</span>
                        <span className="text-[9px] bg-indigo-500/10 text-indigo-400 px-1.5 py-0.2 rounded font-bold font-mono">스캔 분리</span>
                      </p>
                      <p className="text-slate-200 mt-0.5 break-words">{contact.address2}</p>
                      
                      <div className="mt-2 pt-2 border-t border-slate-800/60 flex flex-wrap gap-1.5 items-center">
                        <span className="text-[10px] text-indigo-400 mr-1 font-medium flex items-center gap-1">
                          <Navigation className="w-3 h-3 text-indigo-400 animate-pulse" />
                          길찾기:
                        </span>
                        <button
                          onClick={() => {
                            const enc = encodeURIComponent(contact.address2!);
                            window.open(`tmap://search?name=${enc}`, '_blank');
                            setTimeout(() => {
                              window.open(`https://search.naver.com/search.naver?query=${enc}+길찾기`, '_blank');
                            }, 500);
                          }}
                          className="text-[10px] px-2 py-0.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-md border border-amber-500/20 transition-all font-bold cursor-pointer"
                          title="티맵 앱 실행 (모바일) 또는 웹 검색"
                        >
                          티맵
                        </button>
                        <button
                          onClick={() => window.open(`https://map.kakao.com/link/search/${encodeURIComponent(contact.address2!)}`, '_blank')}
                          className="text-[10px] px-2 py-0.5 bg-yellow-400/10 hover:bg-yellow-400/20 text-yellow-500 rounded-md border border-yellow-400/20 transition-all font-bold cursor-pointer"
                          title="카카오맵/카카오내비 연결"
                        >
                          카카오
                        </button>
                        <button
                          onClick={() => window.open(`https://map.naver.com/v5/search/${encodeURIComponent(contact.address2!)}`, '_blank')}
                          className="text-[10px] px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-md border border-emerald-500/20 transition-all font-bold cursor-pointer"
                          title="네이버 지도 연결"
                        >
                          네이버
                        </button>
                        <button
                          onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address2!)}`, '_blank')}
                          className="text-[10px] px-2 py-0.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-md border border-blue-500/20 transition-all font-bold cursor-pointer"
                          title="구글 지도 연결"
                        >
                          구글맵
                        </button>
                        <button
                          onClick={() => window.open(`https://maps.apple.com/?q=${encodeURIComponent(contact.address2!)}`, '_blank')}
                          className="text-[10px] px-2 py-0.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-md border border-purple-500/20 transition-all font-bold cursor-pointer"
                          title="애플 지도 연결"
                        >
                          애플맵
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 명함 메모 */}
              <div className="bg-gradient-to-br from-blue-950/30 to-indigo-950/30 p-4 rounded-2xl border border-blue-900/40">
                <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">비즈니스 메모 / 요약</h4>
                <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{contact.memo || '작성된 비즈니스 메모가 없습니다.'}</p>
              </div>
            </div>
          )}

          {/* 탭 2: 통화 히스토리 타임라인 */}
          {activeTab === 'history' && (
            <div className="flex-1 flex flex-col overflow-hidden pt-4">
              <div className="flex items-center justify-between pb-3">
                <span className="text-xs text-slate-400 font-medium">과거~현재 통화 & 미팅 히스토리 타임라인</span>
                <button
                  onClick={() => setIsAddingCall(!isAddingCall)}
                  className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>통화기록 추가</span>
                </button>
              </div>

              {/* 통화기록 추가 모달/서브폼 */}
              {isAddingCall && (
                <form onSubmit={handleSaveCallRecord} className="mb-4 bg-slate-950 p-4 rounded-2xl border border-blue-500/40 space-y-3 animate-fadeIn text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-blue-400 uppercase">새 통화 히스토리 기록</span>
                    <button type="button" onClick={() => setIsAddingCall(false)} className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setCallType('incoming')}
                      className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border font-medium transition-all ${callType === 'incoming' ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 font-bold' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
                    >
                      <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" /> 수신통화
                    </button>
                    <button
                      type="button"
                      onClick={() => setCallType('outgoing')}
                      className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border font-medium transition-all ${callType === 'outgoing' ? 'bg-blue-600/20 border-blue-500 text-blue-300 font-bold' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
                    >
                      <ArrowUpRight className="w-3.5 h-3.5 text-blue-400" /> 발신통화
                    </button>
                    <button
                      type="button"
                      onClick={() => setCallType('missed')}
                      className={`flex items-center justify-center gap-1.5 p-2 rounded-lg border font-medium transition-all ${callType === 'missed' ? 'bg-rose-600/20 border-rose-500 text-rose-300 font-bold' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
                    >
                      <PhoneMissed className="w-3.5 h-3.5 text-rose-400" /> 부재중
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="통화 소요시간 (예: 5분 30초)"
                      value={callDuration}
                      onChange={(e) => setCallDuration(e.target.value)}
                      className="w-1/3 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                    <input
                      type="text"
                      placeholder="통화 내용 메모 요약 (예: 제안서 피드백 논의 건)"
                      value={callNote}
                      onChange={(e) => setCallNote(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <button type="submit" className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs shadow transition-all">
                    히스토리 타임라인에 저장
                  </button>
                </form>
              )}

              {/* 타임라인 리스트 */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {(!contact.callHistory || contact.callHistory.length === 0) ? (
                  <div className="py-12 text-center text-slate-500">
                    <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">기록된 통화 히스토리가 없습니다</p>
                    <p className="text-xs text-slate-600 mt-1">상단의 '통화기록 추가' 버튼으로 과거 약속이나 통화 내용을 남겨보세요.</p>
                  </div>
                ) : (
                  <div className="relative pl-6 border-l-2 border-slate-800 space-y-6 my-2">
                    {[...(contact.callHistory || [])]
                      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                      .map((record) => {
                      const isInc = record.type === 'incoming';
                      const isOut = record.type === 'outgoing';
                      const isMiss = record.type === 'missed';

                      return (
                        <div key={record.id} className="relative group/rec">
                          {/* 타임라인 핀 마커 */}
                          <div className={`absolute -left-[31px] top-1 w-6 h-6 rounded-full flex items-center justify-center border-2 border-slate-900 shadow-md ${isInc ? 'bg-emerald-500 text-slate-950' : isOut ? 'bg-blue-500 text-white' : 'bg-rose-500 text-white'}`}>
                            {isInc && <ArrowDownLeft className="w-3.5 h-3.5 font-bold" />}
                            {isOut && <ArrowUpRight className="w-3.5 h-3.5 font-bold" />}
                            {isMiss && <PhoneMissed className="w-3.5 h-3.5 font-bold" />}
                          </div>

                          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 hover:border-slate-700 transition-all">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className={`text-xs font-bold font-mono ${isInc ? 'text-emerald-400' : isOut ? 'text-blue-400' : 'text-rose-400'}`}>
                                {isInc ? '전화 걸려옴 (수신)' : isOut ? '전화 걸음 (발신)' : '부재중 전화'}
                              </span>
                              <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {formatDate(record.timestamp)}
                              </span>
                            </div>

                            {record.duration && (
                              <p className="text-xs text-slate-400 font-mono mb-2 bg-slate-900/80 px-2 py-0.5 rounded inline-block">
                                통화 시간: {record.duration}
                              </p>
                            )}

                            {record.note ? (
                              <p className="text-sm text-slate-200 font-medium bg-slate-900/50 p-2.5 rounded-xl border border-slate-800/50">
                                {record.note}
                              </p>
                            ) : (
                              <p className="text-xs text-slate-600 italic">남겨진 메모가 없습니다.</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 탭 3: 명함 수정 폼 */}
          {activeTab === 'edit' && (
            <form onSubmit={handleSaveEdit} className="flex-1 overflow-y-auto py-3 space-y-4 pr-2 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1 font-medium">성명 *</label>
                  <input type="text" required value={editForm.name} onChange={e=>setEditForm({...editForm, name:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1 font-medium">그룹 선택</label>
                  <select value={editForm.groupId} onChange={e=>setEditForm({...editForm, groupId:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500">
                    {groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-slate-400 block mb-1 font-medium">회사명</label>
                  <input type="text" value={editForm.company} onChange={e=>setEditForm({...editForm, company:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1 font-medium">부서명</label>
                  <input type="text" value={editForm.department} onChange={e=>setEditForm({...editForm, department:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1 font-medium">직책</label>
                  <input type="text" value={editForm.title} onChange={e=>setEditForm({...editForm, title:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                </div>
              </div>

              {/* 분리된 연락처 */}
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 space-y-3">
                <span className="text-xs font-bold text-slate-400 uppercase font-mono">연락처 분리 입력</span>
                <div className="grid grid-cols-1 gap-2.5">
                  <div>
                    <label className="text-xs text-emerald-400 block mb-1">핸드폰 번호 (Mobile)</label>
                    <input type="text" value={editForm.phoneMobile} onChange={e=>setEditForm({...editForm, phoneMobile:e.target.value})} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="text-xs text-blue-400 block mb-1">사무실 유선전화 1 (Office 1)</label>
                    <input type="text" value={editForm.phoneOffice} onChange={e=>setEditForm({...editForm, phoneOffice:e.target.value})} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-cyan-400 block mb-1 flex items-center gap-1.5">
                      <span>사무실 유선전화 2 / 직통번호 (Office 2)</span>
                      <span className="text-[9px] bg-cyan-500/10 text-cyan-400 px-1 py-0.2 rounded font-mono font-bold">스캔 분리</span>
                    </label>
                    <input type="text" value={editForm.phoneOffice2 || ''} onChange={e=>setEditForm({...editForm, phoneOffice2:e.target.value})} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-cyan-500" />
                  </div>
                  <div>
                    <label className="text-xs text-amber-400 block mb-1">팩스 번호 (Fax)</label>
                    <input type="text" value={editForm.phoneFax} onChange={e=>setEditForm({...editForm, phoneFax:e.target.value})} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-amber-500" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1 font-medium">이메일</label>
                  <input type="email" value={editForm.email} onChange={e=>setEditForm({...editForm, email:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1 font-medium">회사 주소 1 (본사)</label>
                  <input type="text" value={editForm.address} onChange={e=>setEditForm({...editForm, address:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium text-slate-300 flex items-center gap-1">
                  <span>회사 주소 2 (지사/공장 등 2번째 주소)</span>
                  <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.2 rounded font-mono">분리 인식</span>
                </label>
                <input type="text" value={editForm.address2 || ''} onChange={e=>setEditForm({...editForm, address2:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium">회사 비즈니스 요약 정보</label>
                <input type="text" value={editForm.companyInfo || ''} onChange={e=>setEditForm({...editForm, companyInfo:e.target.value})} placeholder="예: 인공지능 기반 B2B DX 및 스마트 비즈니스 솔루션 기업" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500" />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1 font-medium">메모 / 요약</label>
                <textarea rows={3} value={editForm.memo} onChange={e=>setEditForm({...editForm, memo:e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={()=>setActiveTab('info')} className="w-1/3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold">취소</button>
                <button type="submit" className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-600/30">수정 완료 저장</button>
              </div>
            </form>
          )}

        </div>

      </div>
    </div>
  );
};
