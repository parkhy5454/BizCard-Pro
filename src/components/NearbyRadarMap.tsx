import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, Compass, Building2, Phone, ExternalLink, X } from 'lucide-react';
import { BusinessCard, ContactGroup } from '../types.js';

interface Props {
  contacts: BusinessCard[];
  groups: ContactGroup[];
  onSelectContact: (contact: BusinessCard) => void;
}

// 하버사인 공식(Haversine formula)으로 두 좌표 간 거리(km) 계산
function getDistanceKM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371; // 지구 반지름 (km)
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const NearbyRadarMap: React.FC<Props> = ({ contacts, groups, onSelectContact }) => {
  // 내 기본 위치 (서울 시청 기준, GPS 활성화 시 실제 위치 갱신)
  const [myLat, setMyLat] = useState<number>(37.5665);
  const [myLng, setMyLng] = useState<number>(126.9780);
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [activeContactId, setActiveContactId] = useState<string | null>(null);

  useEffect(() => {
    handleGetMyGPS();
  }, []);

  const handleGetMyGPS = () => {
    if (!navigator.geolocation) {
      alert('이 브라우저는 위치 정보를 지원하지 않습니다. 기본 서울 좌표로 계산합니다.');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyLat(pos.coords.latitude);
        setMyLng(pos.coords.longitude);
        setGpsLoading(false);
      },
      (err) => {
        console.warn('GPS 획득 실패, 기본 좌표 사용:', err);
        setGpsLoading(false);
      },
      { timeout: 5000 }
    );
  };

  // 그룹 필터링 + 거리 계산 + 가까운 순 정렬
  const filteredAndSortedContacts = contacts
    .filter((c) => selectedGroupFilter === 'all' || c.groupId === selectedGroupFilter)
    .map((c) => {
      const dist = (c.lat && c.lng) ? getDistanceKM(myLat, myLng, c.lat, c.lng) : 9999;
      return { ...c, distanceKm: dist };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      
      {/* 상단 컨트롤 배너 */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-rose-500/10 text-rose-400 rounded-2xl border border-rose-500/20 animate-pulse">
            <Compass className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">주변 사람 레이더 (가까운 거리순 지도 정렬)</h2>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={handleGetMyGPS}
            disabled={gpsLoading}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-blue-400 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shrink-0"
          >
            <Navigation className={`w-3.5 h-3.5 ${gpsLoading ? 'animate-spin' : ''}`} />
            <span>{gpsLoading ? '위치 측정 중...' : '내 GPS 위치 갱신'}</span>
          </button>

          <select
            value={selectedGroupFilter}
            onChange={(e) => setSelectedGroupFilter(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 font-medium"
          >
            <option value="all">전체 그룹 보기</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 메인 콘텐츠 바디 (가상 레이더 지도 + 리스트) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* 좌측 2개 컬럼: 가상 레이더 캔버스 & 구글 맵 외부 링크 지원 뷰 */}
        <div 
          onClick={() => setActiveContactId(null)}
          className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between aspect-square md:aspect-video relative overflow-visible cursor-default"
        >
          
          {/* 배경 그리드 패턴 - 라운드 코너 클리핑 보존을 위한 별도 래퍼 */}
          <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
            <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px] opacity-20" />
          </div>
          


          {/* 중앙 내 위치 핀 */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center">
            <div className="w-5 h-5 rounded-full bg-blue-500 ring-4 ring-blue-500/30 shadow-lg flex items-center justify-center animate-pulse">
              <div className="w-2 h-2 bg-white rounded-full" />
            </div>
            <span className="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full shadow mt-1 whitespace-nowrap font-mono">
              내 위치 ({myLat.toFixed(2)}, {myLng.toFixed(2)})
            </span>
          </div>

          {/* 주변 연락처 마커들 산포 배치 */}
          <div className="absolute inset-0 z-10 pointer-events-none">
            {filteredAndSortedContacts.slice(0, 10).map((c, idx) => {
              if (c.distanceKm >= 9999) return null;
              
              // 거리 기반 가상 각도/반경 계산 (비즈니스 시각화용)
              const angle = (idx * 36) * (Math.PI / 180);
              const maxRadiusPercent = 38;
              const normalizedDist = Math.min(c.distanceKm / 20, 1); // 20km 이내 산포
              const radius = 10 + normalizedDist * maxRadiusPercent;
              
              const top = 50 - Math.sin(angle) * radius;
              const left = 50 + Math.cos(angle) * radius;

              const g = groups.find((grp) => grp.id === c.groupId);
              const isSelected = activeContactId === c.id;

              // 클리핑 방지를 위한 스마트 배치 클래스 결정
              const isPinNearTop = top < 40;
              const isPinNearLeft = left < 30;
              const isPinNearRight = left > 70;

              return (
                <div
                  key={c.id}
                  style={{ top: `${top}%`, left: `${left}%` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveContactId(isSelected ? null : c.id);
                  }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer group/pin transition-all duration-300 ${
                    isSelected ? 'scale-110 z-50' : 'hover:scale-115 z-20'
                  }`}
                >
                  <div className="relative flex flex-col items-center">
                    <MapPin className={`w-6 h-6 drop-shadow-md transition-all ${
                      isSelected ? 'text-blue-400 scale-125' : 'text-rose-500 animate-bounce'
                    }`} />
                    
                    <div className={`bg-slate-900/95 border px-2 py-1 rounded-lg shadow-xl text-[10px] text-white whitespace-nowrap transition-colors duration-200 font-medium ${
                      isSelected ? 'border-blue-400 bg-slate-900' : 'border-slate-700 opacity-90 group-hover/pin:opacity-100 group-hover/pin:border-blue-400'
                    }`}>
                      <span className="font-bold text-blue-300">{c.name}</span> <span className="text-slate-400">({c.distanceKm < 1 ? `${Math.round(c.distanceKm * 1000)}m` : `${c.distanceKm.toFixed(1)}km`})</span>
                      {g && <div className="text-[9px] text-amber-400 font-mono">{g.name}</div>}
                    </div>

                    {/* 지도 클릭 핀 별 길찾기 네비게이션 팝오버 */}
                    {isSelected && (
                      <div 
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute z-30 w-64 text-left pointer-events-auto transition-all p-3.5 rounded-2xl bg-slate-950/95 border border-slate-700/80 shadow-2xl animate-in fade-in zoom-in-95 duration-150 ${
                          isPinNearTop ? 'top-full mt-3' : 'bottom-full mb-3'
                        } ${
                          isPinNearLeft ? 'left-0 translate-x-0' : isPinNearRight ? 'right-0 translate-x-0' : 'left-1/2 -translate-x-1/2'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2 mb-2">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-white text-xs">{c.name}</span>
                              {c.title && <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded font-medium">{c.title}</span>}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[170px]">{c.company}</p>
                          </div>
                          <button 
                            onClick={() => setActiveContactId(null)} 
                            className="text-slate-400 hover:text-white p-0.5 rounded-lg hover:bg-slate-800 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="space-y-2.5">
                          <p className="text-[10px] text-slate-300 bg-slate-900 p-2 rounded-xl border border-slate-800 break-all leading-normal flex items-start gap-1.5">
                            <MapPin className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
                            <span>{c.address || '주소 미등록'}</span>
                          </p>

                          {c.address && c.address !== '주소 미등록' && (
                            <div className="space-y-1.5">
                              <div className="text-[9px] text-blue-400 font-bold flex items-center gap-1">
                                <Navigation className="w-3 h-3 animate-pulse" />
                                <span>길찾기 내비게이션 연결</span>
                              </div>
                              <div className="grid grid-cols-3 gap-1">
                                <button
                                  onClick={() => {
                                    const enc = encodeURIComponent(c.address);
                                    window.open(`tmap://search?name=${enc}`, '_blank');
                                    setTimeout(() => {
                                      window.open(`https://search.naver.com/search.naver?query=${enc}+길찾기`, '_blank');
                                    }, 500);
                                  }}
                                  className="text-[10px] py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-md border border-amber-500/20 font-bold transition-all text-center cursor-pointer"
                                  title="티맵 실행"
                                >
                                  티맵
                                </button>
                                <button
                                  onClick={() => window.open(`https://map.kakao.com/link/search/${encodeURIComponent(c.address)}`, '_blank')}
                                  className="text-[10px] py-1 bg-yellow-400/10 hover:bg-yellow-400/20 text-yellow-500 rounded-md border border-yellow-400/20 font-bold transition-all text-center cursor-pointer"
                                  title="카카오내비/맵 실행"
                                >
                                  카카오
                                </button>
                                <button
                                  onClick={() => window.open(`https://map.naver.com/v5/search/${encodeURIComponent(c.address)}`, '_blank')}
                                  className="text-[10px] py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-md border border-emerald-500/20 font-bold transition-all text-center cursor-pointer"
                                  title="네이버 지도 실행"
                                >
                                  네이버
                                </button>
                                <button
                                  onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`, '_blank')}
                                  className="text-[10px] py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-md border border-blue-500/20 font-bold transition-all text-center cursor-pointer"
                                  title="구글 지도 실행"
                                >
                                  구글맵
                                </button>
                                <button
                                  onClick={() => window.open(`https://maps.apple.com/?q=${encodeURIComponent(c.address)}`, '_blank')}
                                  className="text-[10px] py-1 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-md border border-purple-500/20 font-bold transition-all text-center cursor-pointer"
                                  title="애플 지도 실행"
                                >
                                  애플맵
                                </button>
                                <button
                                  onClick={() => onSelectContact(c)}
                                  className="text-[10px] py-1 bg-slate-800 hover:bg-slate-750 text-white rounded-md border border-slate-700 font-bold transition-all text-center cursor-pointer"
                                  title="명함 상세 보기"
                                >
                                  상세보기
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer removed per user request */}
        </div>

        {/* 우측 1개 컬럼: 거리순 정렬 리스트 뷰 */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col max-h-[600px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <span className="text-xs font-bold text-slate-300 uppercase font-mono">가까운 거리순 정렬 명함</span>
            <span className="text-xs font-mono text-emerald-400 font-bold">{filteredAndSortedContacts.length}명</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {filteredAndSortedContacts.length === 0 ? (
              <p className="text-xs text-slate-500 py-10 text-center">조건에 맞는 명함이 없습니다.</p>
            ) : (
              filteredAndSortedContacts.map((c) => {
                const grp = groups.find((g) => g.id === c.groupId);
                const distStr = c.distanceKm >= 9999 ? '좌표 미측정' : c.distanceKm < 1 ? `${Math.round(c.distanceKm * 1000)}m` : `${c.distanceKm.toFixed(1)}km`;

                return (
                  <div
                    key={c.id}
                    onClick={() => onSelectContact(c)}
                    className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 hover:border-blue-500/50 cursor-pointer transition-all flex items-center justify-between gap-3 group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white group-hover:text-blue-400 transition-colors truncate">{c.name}</span>
                        <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded font-medium">{c.title || '직책없음'}</span>
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-0.5 flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">{c.company}</span>
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                        <MapPin className="w-3 h-3" />
                        {distStr}
                      </span>
                      {c.phoneMobile && (
                        <div className="text-[10px] font-mono text-slate-500 mt-1 flex items-center justify-end gap-1">
                          <Phone className="w-2.5 h-2.5" /> {c.phoneMobile}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
