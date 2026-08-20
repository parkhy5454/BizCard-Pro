import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Compass, Building2, Phone, X, Route, CheckSquare, Square, Trash2, RefreshCw, Search, LocateFixed } from 'lucide-react';
import { BusinessCard, ContactGroup } from '../types.js';
import { getContactGroupIds } from '../groupUtils.js';

interface Props {
  contacts: BusinessCard[];
  groups: ContactGroup[];
  onSelectContact: (contact: BusinessCard) => void;
  // [추가] 좌표 재계산 등으로 명함 데이터가 서버에서 바뀌었을 때, 페이지 전체를 새로고침
  // 하지 않고도 최신 데이터를 반영할 수 있도록 부모(App.tsx)의 contacts 상태를 갱신하는 콜백.
  onContactsRefresh?: (contacts: BusinessCard[]) => void;
  // [추가] 목록에서 바로 전화 버튼을 눌렀을 때 "발신 시도" 통화 기록을 자동으로 남기기
  // 위해 필요. 명함 상세보기(CardDetailModal)의 전화 버튼과 동일한 동작을 이 화면의
  // 목록에서도 한 번의 클릭으로 할 수 있게 한다. 안 넘겨주면 전화 버튼만 동작하고
  // 기록은 남지 않는다.
  onAddCallHistory?: (contactId: string, record: { type: 'incoming' | 'outgoing' | 'missed'; note?: string }) => void;
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

export const NearbyRadarMap: React.FC<Props> = ({ contacts, groups, onSelectContact, onContactsRefresh, onAddCallHistory }) => {
  const [myLat, setMyLat] = useState<number>(37.5665);
  const [myLng, setMyLng] = useState<number>(126.9780);
  const [gpsLoading, setGpsLoading] = useState<boolean>(false);
  // [추가] "지금 내 위치" 대신, 이동하기 전에 미리 지역/주소를 검색해서 그 지역 사람들을
  // 확인하고 미팅을 잡을 수 있게 하는 기능. locationMode가 'search'면 기준 좌표가 GPS가
  // 아니라 검색한 지역이라는 뜻이고, 화면에 그 사실과 검색어를 같이 보여준다.
  const [locationMode, setLocationMode] = useState<'gps' | 'search'>('gps');
  const [addressQuery, setAddressQuery] = useState<string>('');
  const [searchedLabel, setSearchedLabel] = useState<string>('');
  const [isSearchingAddress, setIsSearchingAddress] = useState<boolean>(false);
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

  // [추가] 이동하기 전에 미리 어느 지역에 사람이 있는지 확인하고 싶을 때 쓰는 지역/주소
  // 검색. 카카오맵 SDK의 주소 검색(Geocoder)으로 먼저 시도하고, "강남역"·"판교테크노밸리"
  // 처럼 정확한 지번/도로명 주소가 아닌 지역·건물명일 수도 있으니 실패하면 장소 키워드
  // 검색(Places)으로 한 번 더 시도한다. 검색이 성공하면 이 지점을 기준 좌표로 바꿔서,
  // GPS로 실제 이동했을 때와 완전히 동일한 화면(지도/가상 레이더/거리순 목록)을 보여준다.
  const handleSearchAddress = () => {
    const q = addressQuery.trim();
    if (!q) return;
    const kakao = window.kakao;
    if (kakaoLoadState !== 'ready' || !kakao?.maps?.services) {
      alert('지도가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.');
      return;
    }
    setIsSearchingAddress(true);
    const geocoder = new kakao.maps.services.Geocoder();
    geocoder.addressSearch(q, (result: any[], status: string) => {
      if (status === kakao.maps.services.Status.OK && result[0]) {
        setMyLat(parseFloat(result[0].y));
        setMyLng(parseFloat(result[0].x));
        setLocationMode('search');
        setSearchedLabel(q);
        setIsSearchingAddress(false);
        return;
      }
      const places = new kakao.maps.services.Places();
      places.keywordSearch(q, (data: any[], placesStatus: string) => {
        setIsSearchingAddress(false);
        if (placesStatus === kakao.maps.services.Status.OK && data[0]) {
          setMyLat(parseFloat(data[0].y));
          setMyLng(parseFloat(data[0].x));
          setLocationMode('search');
          setSearchedLabel(q);
        } else {
          alert('입력하신 지역/주소를 찾지 못했습니다. 더 정확한 주소나 건물/지역명으로 다시 시도해주세요.');
        }
      });
    });
  };

  // 검색했던 지역 기준에서 다시 "지금 내 위치" 기준으로 돌아간다.
  const handleUseMyGPS = () => {
    setLocationMode('gps');
    setSearchedLabel('');
    setAddressQuery('');
    handleGetMyGPS();
  };

  const filteredAndSortedContacts = contacts
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
  const [regeocodeProgress, setRegeocodeProgress] = useState<string>('');
  // [추가] "주소는 있는데 좌표를 못 구한" 명함 목록을 실제로 눈으로 확인할 수 있게 한다.
  interface GeocodeFailure { id: string; name: string; company: string; address: string; }
  const [failureList, setFailureList] = useState<GeocodeFailure[] | null>(null);
  const [isLoadingFailures, setIsLoadingFailures] = useState<boolean>(false);

  const handleShowFailures = async () => {
    if (failureList) {
      setFailureList(null); // 이미 열려있으면 다시 눌렀을 때 닫기
      return;
    }
    setIsLoadingFailures(true);
    try {
      const res = await fetch('/api/contacts/geocode-failures');
      if (!res.ok) throw new Error(`목록을 불러오지 못했습니다 (상태: ${res.status}).`);
      const data = await res.json();
      setFailureList(data.failures || []);
    } catch (err: any) {
      alert(`실패 목록을 불러오는 중 오류가 발생했습니다.\n${err.message || '다시 시도해주세요.'}`);
    } finally {
      setIsLoadingFailures(false);
    }
  };

  const handleRegeocode = async (retryFailed: boolean = false, silent: boolean = false) => {
    if (!silent) {
      const confirmMsg = retryFailed
        ? '이전에 실패로 처리됐던 명함들도 다시 시도합니다 (버그 수정 등으로 이번엔 성공할 수도 있는 것들).\n계속할까요?'
        : '주소가 등록된 모든 명함의 위치 좌표를 실제 주소 기준으로 다시 계산합니다.\n명함 수에 따라 시간이 걸릴 수 있습니다. 계속할까요?';
      if (!confirm(confirmMsg)) return;
    }
    setRegeocoding(true);
    let totalUpdated = 0;
    let totalFailed = 0;
    let lastError: string | undefined;
    try {
      // [수정] 예전엔 "남은 개수"로 반복 여부를 판단했는데, retryFailed 모드에서 이 값이
      // 실제 진행 상황과 안 맞아서 무한 반복되는 심각한 버그가 있었다. 이제는 서버가
      // 알려주는 offset(몇 번째까지 봤는지)을 그대로 다음 요청에 넘겨주고, 서버가 명시
      // 하는 done 신호로만 종료 여부를 판단한다. 혹시 모를 예외 상황을 대비해 최대
      // 반복 횟수도 안전장치로 걸어둔다(명함이 아무리 많아도 이 정도면 충분하다).
      let offset = 0;
      let done = false;
      let stoppedByAuthError = false;
      let safetyCounter = 0;
      const MAX_ITERATIONS = 500;
      while (!done && safetyCounter < MAX_ITERATIONS) {
        safetyCounter++;
        setRegeocodeProgress(`좌표 재계산 중... (지금까지 성공 ${totalUpdated}건 · 실패 ${totalFailed}건)`);
        const res = await fetch('/api/contacts/regeocode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ retryFailed, offset })
        });
        if (!res.ok) throw new Error(`재계산에 실패했습니다 (상태: ${res.status}).`);
        const data = await res.json();
        totalUpdated += data.updated;
        totalFailed += data.failed;
        if (data.firstError) lastError = data.firstError;
        if (data.authError) stoppedByAuthError = true;
        offset = data.nextOffset;
        done = Boolean(data.done);
      }
      if (safetyCounter >= MAX_ITERATIONS && !done) {
        console.error('좌표 재계산이 안전장치(최대 반복 횟수)에 걸려 중단되었습니다.');
      }

      // [수정] silent(자동 백그라운드 실행)일 땐 알림창을 띄우지 않는다 — 화면 들어올
      // 때마다 팝업이 뜨면 오히려 방해가 된다. 콘솔 로그로만 조용히 남긴다.
      if (silent) {
        console.log(`[주변 지도] 자동 좌표 정리: 성공 ${totalUpdated}건, 실패 ${totalFailed}건${lastError ? ` (사유: ${lastError})` : ''}`);
      } else {
        const reasonMsg = totalFailed > 0 && lastError ? `\n(실패 사유: ${lastError})` : '';
        const authNote = stoppedByAuthError ? '\n\n⚠️ 카카오 API 인증 문제로 중단됐습니다. 설정을 확인하신 뒤 다시 눌러주세요 (이 명함들은 재시도 대상으로 남아있습니다).' : '';
        alert(`좌표 재계산 완료: 성공 ${totalUpdated}건, 실패 ${totalFailed}건.${reasonMsg}${authNote}`);
      }

      // [수정] 예전엔 여기서 페이지 전체를 새로고침(window.location.reload())했는데, 그러면
      // 앱이 처음 화면(명함 메인)으로 리셋돼서 방금까지 보고 있던 레이더 지도 화면을 잃어
      // 버렸다. 이제는 페이지를 새로고침하지 않고, 명함 목록만 서버에서 다시 받아와 화면에
      // 반영한다 — 지금 이 화면에 계속 머무른 채로 갱신된 좌표가 바로 보인다.
      if (onContactsRefresh && totalUpdated > 0) {
        const refreshRes = await fetch('/api/contacts');
        if (refreshRes.ok) {
          const refreshedContacts = await refreshRes.json();
          onContactsRefresh(refreshedContacts);
        }
      }
    } catch (err: any) {
      if (!silent) {
        alert(`좌표 재계산 중 오류가 발생했습니다 (지금까지 성공 ${totalUpdated}건).\n${err.message || '다시 시도해주세요.'}\n\n버튼을 다시 누르면 실패한 것들부터 이어서 계속됩니다.`);
      } else {
        console.error('[주변 지도] 자동 좌표 정리 중 오류:', err);
      }
    } finally {
      setRegeocoding(false);
      setRegeocodeProgress('');
    }
  };

  // [추가] 화면에 들어올 때마다 매번 좌표 재계산을 돌리면, 명함이 많을 때 시간이 오래
  // 걸리고 카카오 API 호출도 낭비된다. 대신 "오늘 이미 한 번 돌았는지"를 브라우저에 기억해
  // 뒀다가, 하루에 한 번만 조용히 백그라운드로 실행한다(기본 재계산 → 실패했던 것 재시도
  // 순서로 이어서).
  const [isAutoRegeocoding, setIsAutoRegeocoding] = useState<boolean>(false);
  useEffect(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const lastRunKey = 'bizcard_radar_last_autoregeocode';
    if (localStorage.getItem(lastRunKey) === todayKey) return; // 오늘 이미 돌았으면 건너뜀

    (async () => {
      setIsAutoRegeocoding(true);
      try {
        await handleRegeocode(false, true);
        await handleRegeocode(true, true);
        localStorage.setItem(lastRunKey, todayKey);
      } finally {
        setIsAutoRegeocoding(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeContact = activeContactId ? contacts.find((c) => c.id === activeContactId) : null;

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* [수정] 모바일에서 제목/버튼/드롭다운이 두 줄로 나뉘어 있었다(제목 줄, 그 아래
      버튼+드롭다운 줄). 폰 화면 폭에 맞춰 글자·아이콘·여백을 더 줄이고 항상 가로 한 줄로
      배치해서, "주변 사람 지도" 제목 + "좌표 없는 명함" 버튼 + 거리 선택이 한 줄에 다 들어오게
      했다. 제목은 min-w-0 + truncate로 넘치면 줄임표 처리되고, 버튼/드롭다운은 shrink-0으로
      찌그러지지 않게 고정했다. */}
      <div className="bg-white border border-slate-200 rounded-2xl md:rounded-3xl p-2.5 md:p-6 shadow-xl flex flex-row items-center justify-between gap-2 md:gap-4">
        <div className="flex items-center gap-1.5 md:gap-3 min-w-0">
          <div className="p-1.5 md:p-3 bg-rose-50 text-rose-600 rounded-lg md:rounded-2xl border border-rose-200 animate-pulse shrink-0">
            <Compass className="w-3.5 h-3.5 md:w-6 md:h-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-[13px] md:text-xl font-bold text-slate-900 tracking-tight truncate">주변 사람 지도</h2>
          </div>
          {isAutoRegeocoding && (
            <span className="text-[9px] text-slate-400 flex items-center gap-1 md:hidden shrink-0">
              <RefreshCw className="w-2.5 h-2.5 animate-spin" />
              정리 중
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          {isAutoRegeocoding && (
            <span className="hidden md:flex text-[11px] text-slate-400 items-center gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin" />
              좌표 정리 중...
            </span>
          )}

          <button
            onClick={handleShowFailures}
            disabled={isLoadingFailures}
            className="shrink-0 px-2 md:px-4 py-1.5 md:py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg md:rounded-xl text-[10px] md:text-xs font-semibold flex items-center justify-center gap-1 md:gap-1.5 whitespace-nowrap transition-all active:scale-95 disabled:opacity-50"
          >
            <MapPin className="w-3 h-3 md:w-3.5 md:h-3.5 shrink-0" />
            <span>{isLoadingFailures ? '불러오는 중...' : failureList ? '목록 닫기' : '좌표 없는 명함'}</span>
          </button>

          <select
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="shrink-0 bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] md:text-xs rounded-lg md:rounded-xl px-1.5 md:px-3 py-1.5 md:py-2 focus:outline-none focus:border-indigo-500 font-bold"
          >
            <option value={1}>1km 이내</option>
            <option value={2}>2km 이내</option>
            <option value={5}>5km 이내</option>
            <option value={10}>10km 이내</option>
            <option value={0}>전체</option>
          </select>
        </div>
      </div>

      {/* [추가] 이동하기 전에 미리 지역/주소를 검색해서 그 지역 사람들을 확인하고 미팅을
      잡을 수 있게 하는 검색 바. 검색하면 아래 지도/목록의 기준 좌표가 "지금 내 위치"에서
      검색한 지역으로 바뀌고, 실제로 그 지역에 도착해서 GPS로 볼 때와 동일한 화면을
      미리 볼 수 있다. */}
      <div className="bg-white border border-slate-200 rounded-2xl md:rounded-3xl p-2.5 md:p-4 shadow-xl space-y-2">
        <div className="flex items-center gap-1.5 md:gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 md:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 md:w-4 md:h-4 text-slate-400" />
            <input
              type="text"
              value={addressQuery}
              onChange={(e) => setAddressQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearchAddress(); } }}
              placeholder="이동 전 미리 확인할 지역/주소 입력 (예: 강남역, 판교테크노밸리, 서울 강남구 테헤란로)"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg md:rounded-xl pl-8 md:pl-9 pr-3 py-2 md:py-2.5 text-xs md:text-sm text-slate-700 outline-none focus:border-indigo-500"
            />
          </div>
          <button
            onClick={handleSearchAddress}
            disabled={isSearchingAddress || !addressQuery.trim()}
            className="shrink-0 px-3 md:px-4 py-2 md:py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg md:rounded-xl text-[11px] md:text-xs font-bold transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap"
          >
            {isSearchingAddress ? '검색 중...' : '검색'}
          </button>
        </div>

        {locationMode === 'search' && (
          <div className="flex items-center justify-between gap-2 bg-indigo-50 border border-indigo-100 rounded-lg md:rounded-xl px-2.5 md:px-3 py-1.5 md:py-2">
            <span className="text-[10px] md:text-xs text-indigo-700 font-semibold flex items-center gap-1 min-w-0 truncate">
              <MapPin className="w-3 h-3 md:w-3.5 md:h-3.5 shrink-0" />
              <span className="truncate">"{searchedLabel}" 기준으로 보는 중 (내 실제 위치 아님)</span>
            </span>
            <button
              onClick={handleUseMyGPS}
              className="shrink-0 text-[10px] md:text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
            >
              <LocateFixed className="w-3 h-3 md:w-3.5 md:h-3.5" />
              내 위치로
            </button>
          </div>
        )}
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

                    {/* [추가] 상세보기까지 들어가지 않아도, 목록에서 바로 전화를 걸 수 있게
                    한다. 명함 상세보기(CardDetailModal)의 전화 버튼과 동일하게, 누르는
                    순간 "발신 시도" 통화 기록을 자동으로 남긴다. */}
                    {c.phoneMobile && (
                      <a
                        href={`tel:${c.phoneMobile}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddCallHistory?.(c.id, {
                            type: 'outgoing',
                            note: '(자동 기록) 주변 레이더 목록에서 전화 버튼을 눌러 발신을 시도했습니다.'
                          });
                        }}
                        title={`${c.name}에게 바로 전화하기`}
                        className="shrink-0 w-8 h-8 rounded-full bg-emerald-50 hover:bg-emerald-600 text-emerald-600 hover:text-white flex items-center justify-center transition-all"
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </a>
                    )}

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

      {/* [수정] "좌표 없는 명함 목록"을 예전엔 지도 위쪽에 뒀는데, 지도를 먼저 보고 나서
      필요할 때만 아래로 펼쳐보는 흐름이 더 자연스러워서 지도+목록 아래로 옮겼다. */}
      {failureList && (
        <div className="bg-white border border-rose-200 rounded-3xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-rose-600">📍 좌표 없는 명함 ({failureList.length}건)</span>
          </div>
          {failureList.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">좌표 없는 명함이 없습니다. 전부 정상 계산됐어요.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {failureList.map((f) => {
                const fullContact = contacts.find((c) => c.id === f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => fullContact && onSelectContact(fullContact)}
                    className="w-full text-left flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 transition-colors"
                  >
                    <div className="min-w-0 shrink-0 w-32">
                      <p className="text-xs font-bold text-slate-800 truncate">{f.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">{f.company || '회사 미등록'}</p>
                    </div>
                    <p className="text-xs text-slate-500 truncate flex-1">{f.address}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
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

        const g = groups.find((grp) => getContactGroupIds(c).includes(grp.id));
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
