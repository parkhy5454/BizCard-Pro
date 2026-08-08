import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Compass, Building2, Phone, X, Route, CheckSquare, Square, Trash2 } from 'lucide-react';
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

// [추가] 여러 방문지를 "가장 효율적인 순서"로 정렬한다. 진짜 최적해(외판원 문제)를 구하려면
// 계산량이 너무 크니까, 영업 방문처럼 지점 수가 적을 때(보통 10곳 이내) 실무적으로 충분히
// 좋은 결과를 주는 "최근접 이웃(nearest neighbor)" 방식을 쓴다: 지금 위치에서 가장 가까운
// 곳부터 하나씩 방문한다고 가정하고 순서를 정하는 방식.
function optimizeVisitOrder(startLat: number, startLng: number, stops: BusinessCard[]): BusinessCard[] {
  const remaining = [...stops];
  const ordered: BusinessCard[] = [];
  let curLat = startLat;
  let curLng = startLng;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    remaining.forEach((s, idx) => {
      if (!s.lat || !s.lng) return;
      const d = getDistanceKM(curLat, curLng, s.lat, s.lng);
      if (d < nearestDist) {
        nearestDist = d;
        nearestIdx = idx;
      }
    });
    const next = remaining.splice(nearestIdx, 1)[0];
    ordered.push(next);
    if (next.lat && next.lng) {
      curLat = next.lat;
      curLng = next.lng;
    }
  }
  return ordered;
}

const KAKAO_MAP_KEY = import.meta.env.VITE_KAKAO_MAP_KEY as string | undefined;

declare global {
  interface Window {
    kakao?: any;
  }
}

export const NearbyRadarMap: React.FC<Props> = ({ contacts, groups, onSelectContact }) => {
  const [myLat, setMyLat] = useState<number>(37.5665);
  const [myLng, setMyLng] = useState<number>(126.9780);
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  // [추가] 주소 지오코딩이 안 된 명함이나 너무 먼 명함까지 다 나열되면 실제로 쓸모 있는
  // "지금 갈 수 있는 근처 사람"을 찾기 어려웠다. 반경 필터를 추가해서, 기본값을 5km로
  // 두고 필요하면 더 좁히거나 넓힐 수 있게 한다.
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [activeContactId, setActiveContactId] = useState<string | null>(null);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const kakaoMapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [kakaoLoadState, setKakaoLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const [visitListIds, setVisitListIds] = useState<string[]>([]);
  const [optimizedOrder, setOptimizedOrder] = useState<BusinessCard[] | null>(null);

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

  const filteredAndSortedContacts = contacts
    .filter((c) => selectedGroupFilter === 'all' || c.groupId === selectedGroupFilter)
    .map((c) => {
      const dist = (c.lat && c.lng) ? getDistanceKM(myLat, myLng, c.lat, c.lng) : 9999;
      return { ...c, distanceKm: dist };
    })
    // radiusKm이 0이면 "전체보기"로 취급해서 거리 제한 없이 다 보여준다.
    // 좌표가 없는 명함(distanceKm 9999)은 반경 필터를 걸어두면 자동으로 걸러진다.
    .filter((c) => radiusKm === 0 || c.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  useEffect(() => {
    if (!KAKAO_MAP_KEY) return;

    if (window.kakao?.maps) {
      setKakaoLoadState('ready');
      return;
    }

    setKakaoLoadState('loading');
    const existingScript = document.getElementById('kakao-map-sdk') as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        window.kakao.maps.load(() => setKakaoLoadState('ready'));
      });
      return;
    }

    const script = document.createElement('script');
    script.id = 'kakao-map-sdk';
    script.async = true;
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_MAP_KEY}&autoload=false&libraries=services`;
    script.onload = () => {
      window.kakao.maps.load(() => setKakaoLoadState('ready'));
    };
    script.onerror = () => setKakaoLoadState('error');
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (kakaoLoadState !== 'ready' || !mapContainerRef.current || kakaoMapRef.current) return;
    const map = new window.kakao.maps.Map(mapContainerRef.current, {
      center: new window.kakao.maps.LatLng(myLat, myLng),
      level: 6
    });
    kakaoMapRef.current = map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kakaoLoadState]);

  useEffect(() => {
    if (kakaoMapRef.current) {
      kakaoMapRef.current.setCenter(new window.kakao.maps.LatLng(myLat, myLng));
    }
  }, [myLat, myLng]);

  useEffect(() => {
    if (kakaoLoadState !== 'ready' || !kakaoMapRef.current) return;
    const kakao = window.kakao;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const myMarker = new kakao.maps.Marker({
      position: new kakao.maps.LatLng(myLat, myLng),
      map: kakaoMapRef.current,
      image: new kakao.maps.MarkerImage(
        'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="10" fill="#2563eb" stroke="white" stroke-width="3"/></svg>`),
        new kakao.maps.Size(28, 28)
      )
    });
    markersRef.current.push(myMarker);

    filteredAndSortedContacts.forEach((c) => {
      if (!c.lat || !c.lng) return;
      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(c.lat, c.lng),
        map: kakaoMapRef.current
      });
      kakao.maps.event.addListener(marker, 'click', () => {
        setActiveContactId(c.id);
        kakaoMapRef.current.panTo(new kakao.maps.LatLng(c.lat, c.lng));
      });
      markersRef.current.push(marker);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kakaoLoadState, filteredAndSortedContacts.map((c) => c.id).join(','), myLat, myLng]);

  const toggleVisitList = (id: string) => {
    setOptimizedOrder(null);
    setVisitListIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleOptimizeRoute = () => {
    const stops = contacts.filter((c) => visitListIds.includes(c.id) && c.lat && c.lng);
    if (stops.length === 0) {
      alert('방문 목록에 위치 정보가 있는 명함이 없습니다. 먼저 방문할 곳을 담아주세요.');
      return;
    }
    setOptimizedOrder(optimizeVisitOrder(myLat, myLng, stops));
  };

  const [regeocoding, setRegeocoding] = useState<boolean>(false);

  const handleRegeocode = async () => {
    if (!confirm('주소가 등록된 모든 명함의 위치 좌표를 실제 주소 기준으로 다시 계산합니다.\n명함 수에 따라 시간이 걸릴 수 있습니다. 계속할까요?')) return;
    setRegeocoding(true);
    try {
      const res = await fetch('/api/contacts/regeocode', { method: 'POST' });
      if (!res.ok) throw new Error(`재계산에 실패했습니다 (상태: ${res.status}).`);
      const data = await res.json();
      const reasonMsg = data.failed > 0 && data.firstError ? `\n(실패 사유: ${data.firstError})` : '';
      alert(`좌표 재계산 완료: 총 ${data.totalWithAddress}건 중 ${data.updated}건 성공, ${data.failed}건 실패.${reasonMsg}\n화면을 새로고침해서 결과를 반영합니다.`);
      window.location.reload();
    } catch (err: any) {
      alert(`좌표 재계산에 실패했습니다.\n${err.message || '다시 시도해주세요.'}`);
    } finally {
      setRegeocoding(false);
    }
  };

  const activeContact = activeContactId ? contacts.find((c) => c.id === activeContactId) : null;

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl border border-rose-200 animate-pulse">
            <Compass className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">주변 사람 지도 (가까운 거리순 정렬 · 방문 동선)</h2>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          <button
            onClick={handleRegeocode}
            disabled={regeocoding}
            title="기존 명함들이 예전 방식(부정확)으로 좌표가 찍혀있다면, 실제 주소 기준으로 다시 계산합니다"
            className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shrink-0 disabled:opacity-50"
          >
            <MapPin className={`w-3.5 h-3.5 ${regeocoding ? 'animate-pulse' : ''}`} />
            <span>{regeocoding ? '좌표 재계산 중...' : '기존 명함 좌표 다시 계산'}</span>
          </button>

          <button
            onClick={handleGetMyGPS}
            disabled={gpsLoading}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-blue-600 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 shrink-0"
          >
            <Navigation className={`w-3.5 h-3.5 ${gpsLoading ? 'animate-spin' : ''}`} />
            <span>{gpsLoading ? '위치 측정 중...' : '내 GPS 위치 갱신'}</span>
          </button>

          <select
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500 font-bold"
          >
            <option value={1}>1km 이내</option>
            <option value={2}>2km 이내</option>
            <option value={5}>5km 이내</option>
            <option value={10}>10km 이내</option>
            <option value={0}>거리 제한 없음(전체)</option>
          </select>

          <select
            value={selectedGroupFilter}
            onChange={(e) => setSelectedGroupFilter(e.target.value)}
            className="bg-slate-100 border border-slate-200 text-slate-700 text-xs rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 font-medium"
          >
            <option value="all">전체 그룹 보기</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden relative aspect-square md:aspect-video">
          {KAKAO_MAP_KEY ? (
            <>
              <div ref={mapContainerRef} className="w-full h-full" />
              {kakaoLoadState !== 'ready' && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-xs text-slate-400">
                  {kakaoLoadState === 'error' ? '지도를 불러오지 못했습니다.' : '지도를 불러오는 중...'}
                </div>
              )}
              {activeContact && (
                <div className="absolute bottom-3 left-3 right-3 md:left-3 md:right-auto md:w-72 bg-white/95 backdrop-blur border border-slate-200 shadow-2xl rounded-2xl p-3.5 z-20">
                  <ContactInfoCard
                    contact={activeContact}
                    onClose={() => setActiveContactId(null)}
                    onSelectContact={onSelectContact}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="p-6 h-full flex flex-col">
              <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
                ⚠️ 실제 지도를 보려면 카카오맵 API 키(VITE_KAKAO_MAP_KEY) 설정이 필요합니다. 지금은 대략적인 방향/거리만 보여주는 가상 레이더로 표시됩니다.
              </p>
              <VirtualRadar
                myLat={myLat}
                myLng={myLng}
                contacts={filteredAndSortedContacts}
                groups={groups}
                activeContactId={activeContactId}
                setActiveContactId={setActiveContactId}
                onSelectContact={onSelectContact}
              />
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xl flex flex-col max-h-[600px]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
            <span className="text-xs font-bold text-slate-600 uppercase font-mono">가까운 거리순 정렬 명함</span>
            <span className="text-xs font-mono text-emerald-600 font-bold">{filteredAndSortedContacts.length}명</span>
          </div>

          {visitListIds.length > 0 && (
            <div className="mb-3 p-3 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-indigo-700 flex items-center gap-1">
                  <Route className="w-3.5 h-3.5" /> 방문 목록 ({visitListIds.length}곳)
                </span>
                <button
                  onClick={() => { setVisitListIds([]); setOptimizedOrder(null); }}
                  className="text-[10px] text-slate-400 hover:text-rose-500 flex items-center gap-0.5"
                >
                  <Trash2 className="w-3 h-3" /> 비우기
                </button>
              </div>
              <button
                onClick={handleOptimizeRoute}
                className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors"
              >
                이 순서대로 방문하면 효율적이에요 (동선 최적화)
              </button>

              {optimizedOrder && (
                <div className="space-y-1.5 pt-1">
                  {optimizedOrder.map((c, idx) => (
                    <div key={c.id} className="flex items-center gap-2 bg-white border border-indigo-100 rounded-xl px-2.5 py-2">
                      <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 truncate">{c.name} <span className="text-slate-400 font-normal">· {c.company}</span></p>
                      </div>
                      {c.address && (
                        <a
                          href={`https://map.kakao.com/link/search/${encodeURIComponent(c.address)}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] px-2 py-1 rounded-lg bg-yellow-50 text-yellow-700 border border-yellow-200 font-bold shrink-0"
                        >
                          길찾기
                        </a>
                      )}
                    </div>
                  ))}
                  <p className="text-[10px] text-slate-400 pt-1">
                    각 목적지 "길찾기"는 그 순간의 현재 위치를 출발점으로 잡아줍니다 — 실제로 그 순서대로 이동하시면서 눌러주세요.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {filteredAndSortedContacts.length === 0 ? (
              <p className="text-xs text-slate-400 py-10 text-center px-4">
                {radiusKm > 0 ? `${radiusKm}km 이내에 해당하는 명함이 없습니다. 반경을 넓혀보세요.` : '조건에 맞는 명함이 없습니다.'}
              </p>
            ) : (
              filteredAndSortedContacts.map((c) => {
                const distStr = c.distanceKm >= 9999 ? '좌표 미측정' : c.distanceKm < 1 ? `${Math.round(c.distanceKm * 1000)}m` : `${c.distanceKm.toFixed(1)}km`;
                const inVisitList = visitListIds.includes(c.id);

                return (
                  <div
                    key={c.id}
                    className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 hover:border-blue-300 transition-all flex items-center gap-2.5 group"
                  >
                    <button
                      onClick={() => toggleVisitList(c.id)}
                      title="방문 목록에 담기"
                      className={`shrink-0 ${inVisitList ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-400'}`}
                    >
                      {inVisitList ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                    </button>

                    <div onClick={() => onSelectContact(c)} className="min-w-0 flex-1 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors truncate">{c.name}</span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium">{c.title || '직책없음'}</span>
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5 flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{c.company}</span>
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                        <MapPin className="w-3 h-3" />
                        {distStr}
                      </span>
                      {c.phoneMobile && (
                        <div className="text-[10px] font-mono text-slate-400 mt-1 flex items-center justify-end gap-1">
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

const ContactInfoCard: React.FC<{
  contact: BusinessCard;
  onClose: () => void;
  onSelectContact: (c: BusinessCard) => void;
}> = ({ contact: c, onClose, onSelectContact }) => (
  <div>
    <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2 mb-2">
      <div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold text-slate-900 text-xs">{c.name}</span>
          {c.title && <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium">{c.title}</span>}
        </div>
        <p className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[170px]">{c.company}</p>
      </div>
      <button onClick={onClose} className="text-slate-400 hover:text-slate-800 p-0.5 rounded-lg hover:bg-slate-100 cursor-pointer">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>

    <div className="space-y-2.5">
      <p className="text-[10px] text-slate-600 bg-white p-2 rounded-xl border border-slate-200 break-all leading-normal flex items-start gap-1.5">
        <MapPin className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
        <span>{c.address || '주소 미등록'}</span>
      </p>

      {c.address && c.address !== '주소 미등록' && (
        <div className="grid grid-cols-3 gap-1">
          <button
            onClick={() => {
              const enc = encodeURIComponent(c.address);
              window.open(`tmap://search?name=${enc}`, '_blank');
              setTimeout(() => window.open(`https://search.naver.com/search.naver?query=${enc}+길찾기`, '_blank'), 500);
            }}
            className="text-[10px] py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-md border border-amber-200 font-bold transition-all"
          >
            티맵
          </button>
          <button
            onClick={() => window.open(`https://map.kakao.com/link/search/${encodeURIComponent(c.address)}`, '_blank')}
            className="text-[10px] py-1 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 rounded-md border border-yellow-200 font-bold transition-all"
          >
            카카오
          </button>
          <button
            onClick={() => window.open(`https://map.naver.com/v5/search/${encodeURIComponent(c.address)}`, '_blank')}
            className="text-[10px] py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md border border-emerald-200 font-bold transition-all"
          >
            네이버
          </button>
          <button
            onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`, '_blank')}
            className="text-[10px] py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md border border-blue-200 font-bold transition-all"
          >
            구글맵
          </button>
          <button
            onClick={() => window.open(`https://maps.apple.com/?q=${encodeURIComponent(c.address)}`, '_blank')}
            className="text-[10px] py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-md border border-purple-200 font-bold transition-all"
          >
            애플맵
          </button>
          <button
            onClick={() => onSelectContact(c)}
            className="text-[10px] py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-md border border-slate-800 font-bold transition-all"
          >
            상세보기
          </button>
        </div>
      )}
    </div>
  </div>
);

const VirtualRadar: React.FC<{
  myLat: number;
  myLng: number;
  contacts: (BusinessCard & { distanceKm: number })[];
  groups: ContactGroup[];
  activeContactId: string | null;
  setActiveContactId: (id: string | null) => void;
  onSelectContact: (c: BusinessCard) => void;
}> = ({ myLat, myLng, contacts, groups, activeContactId, setActiveContactId, onSelectContact }) => (
  <div
    onClick={() => setActiveContactId(null)}
    className="flex-1 relative overflow-visible cursor-default"
  >
    <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px] opacity-20" />
    </div>

    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center">
      <div className="w-5 h-5 rounded-full bg-blue-500 ring-4 ring-blue-500/30 shadow-lg flex items-center justify-center animate-pulse">
        <div className="w-2 h-2 bg-white rounded-full" />
      </div>
      <span className="text-[10px] font-bold bg-blue-600 text-white px-2 py-0.5 rounded-full shadow mt-1 whitespace-nowrap font-mono">
        내 위치 ({myLat.toFixed(2)}, {myLng.toFixed(2)})
      </span>
    </div>

    <div className="absolute inset-0 z-10 pointer-events-none">
      {contacts.slice(0, 10).map((c, idx) => {
        if (c.distanceKm >= 9999) return null;

        const angle = (idx * 36) * (Math.PI / 180);
        const maxRadiusPercent = 38;
        const normalizedDist = Math.min(c.distanceKm / 20, 1);
        const radius = 10 + normalizedDist * maxRadiusPercent;

        const top = 50 - Math.sin(angle) * radius;
        const left = 50 + Math.cos(angle) * radius;

        const g = groups.find((grp) => grp.id === c.groupId);
        const isSelected = activeContactId === c.id;
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
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer"
          >
            <div
              className="w-3 h-3 rounded-full shadow ring-2 ring-white"
              style={{ backgroundColor: g?.color?.includes('amber') ? '#f59e0b' : g?.color?.includes('blue') ? '#3b82f6' : g?.color?.includes('emerald') ? '#10b981' : g?.color?.includes('purple') ? '#a855f7' : '#64748b' }}
            />
            {isSelected && (
              <div
                onClick={(e) => e.stopPropagation()}
                className={`absolute z-30 w-64 text-left pointer-events-auto transition-all p-3.5 rounded-2xl bg-white/95 border border-slate-200 shadow-2xl ${
                  isPinNearTop ? 'top-full mt-3' : 'bottom-full mb-3'
                } ${
                  isPinNearLeft ? 'left-0 translate-x-0' : isPinNearRight ? 'right-0 translate-x-0' : 'left-1/2 -translate-x-1/2'
                }`}
              >
                <ContactInfoCard contact={c} onClose={() => setActiveContactId(null)} onSelectContact={onSelectContact} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  </div>
);
