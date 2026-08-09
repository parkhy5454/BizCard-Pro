import React, { useState, useEffect } from 'react';
import { X, Upload, ScanLine, CheckCircle2, Sparkles, Building2, Camera, AlertTriangle, Trash2, Layers, ArrowLeft } from 'lucide-react';
import { BusinessCard, ContactGroup } from '../types.js';
import { formatPhoneNumber } from '../phoneFormat.js';
import { CropAdjustModal, resizeDataUrl, warpDataUrlWithNormalizedCorners, isValidNormalizedCorners, NormalizedCorners } from './CropAdjustModal.js';
import { LiveCameraCapture } from './LiveCameraCapture.js';
import { loadOpenCv } from '../cardVision.js';
import { generateStandardCardImage } from '../cardImageGenerator.js';
import { GroupMultiSelect } from './GroupMultiSelect.js';

interface Props {
  groups: ContactGroup[];
  // [수정] 중복 명함 감지를 위해 기존 등록된 명함 목록을 받는다
  contacts: BusinessCard[];
  onClose: () => void;
  onSave: (newCard: BusinessCard) => void;
  // [수정] 중복 발견 시 "기존 정보 업데이트"를 선택하면 이 콜백으로 저장한다
  onUpdate?: (updated: BusinessCard) => void;
}

// [수정] 이름+회사가 같거나 핸드폰 번호가 같으면 "같은 사람"으로 간주해서 중복 후보로 판단한다.
export function findDuplicateContact(
  candidate: { name?: string; company?: string; phoneMobile?: string },
  existing: BusinessCard[]
): BusinessCard | null {
  const normalize = (s?: string) => (s || '').trim().toLowerCase().replace(/\s+/g, '');
  const candName = normalize(candidate.name);
  const candCompany = normalize(candidate.company);
  const candPhone = (candidate.phoneMobile || '').replace(/[^0-9]/g, '');

  if (!candName && !candPhone) return null;

  return existing.find((c) => {
    const cPhone = (c.phoneMobile || '').replace(/[^0-9]/g, '');
    if (candPhone && candPhone.length >= 9 && cPhone === candPhone) return true;
    const cName = normalize(c.name);
    const cCompany = normalize(c.company);
    if (candName && candCompany && cName === candName && cCompany === candCompany) return true;
    return false;
  }) || null;
}

// 연속 촬영(배치) 모드에서 한 장씩 쌓이는 항목
interface BatchItem {
  tempId: string;
  frontImage: string;
  status: 'pending' | 'scanning' | 'done' | 'error';
  parsed?: Partial<BusinessCard>;
  duplicateMatch?: BusinessCard | null;
  action: 'create' | 'update' | 'skip';
  errorMessage?: string;
}

const emptyForm = (defaultGroupId: string): Partial<BusinessCard> => ({
  name: '', company: '', department: '', title: '', phoneMobile: '', phoneOffice: '',
  phoneOffice2: '', phoneFax: '', email: '', address: '', address2: '', memo: '',
  groupId: defaultGroupId,
  // [추가] 이제 그룹을 여러 개 동시에 고를 수 있어서 배열로 관리한다. defaultGroupId가
  // 비어있으면(그룹 미지정 기본값) 빈 배열로 시작한다.
  groupIds: defaultGroupId ? [defaultGroupId] : []
});

export const ScanModal: React.FC<Props> = ({ groups, contacts, onClose, onSave, onUpdate }) => {
  const [frontImg, setFrontImg] = useState<string>('');
  const [backImg, setBackImg] = useState<string>('');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const scanGenerationRef = React.useRef<number>(0);
  const [scanDone, setScanDone] = useState<boolean>(false);

  // [수정] 사용자가 "카메라로 촬영" 버튼을 누르는 그 순간이 아니라, 이 스캔 화면이 열리자마자
  // 미리 백그라운드로 OpenCV 엔진 로딩을 시작해둔다.
  useEffect(() => {
    loadOpenCv().catch(() => {});
  }, []);

  // [수정] 예전엔 그룹을 안 고르면 목록의 첫 번째 그룹(대체로 VIP 거래처)으로 자동
  // 배정됐는데, 그러면 사용자가 의도치 않게 엉뚱한 그룹에 명함이 들어가는 문제가 있었다.
  // 이제는 기본값을 "미지정"으로 둬서 "전체보기"에서만 보이게 하고, 나중에 사용자가
  // 직접 그룹을 지정해야만 그 그룹에 들어가게 한다.
  const defaultGroupId = '';

  // 입력 폼 (단일 스캔 모드)
  const [form, setForm] = useState<Partial<BusinessCard>>(emptyForm(defaultGroupId));

  // 크롭 조정 모달 상태: 어느 면(front/back)의 사진을 조정 중인지 + 원본 데이터
  const [cropTarget, setCropTarget] = useState<{ side: 'front' | 'back'; rawImage: string } | null>(null);
  const [cameraTarget, setCameraTarget] = useState<'front' | 'back' | null>(null);
  const fallbackFileInputRef = React.useRef<HTMLInputElement>(null);

  // [수정] 중복 명함 감지: 저장 직전에 확인하는 팝업 상태 (단일 스캔 모드)
  const [duplicateCheck, setDuplicateCheck] = useState<{ match: BusinessCard; pending: BusinessCard } | null>(null);

  // ===== [수정] 연속 촬영(배치) 모드 상태 =====
  const [batchMode, setBatchMode] = useState<boolean>(false);
  // [수정] 연속 촬영을 시작하기 전에 미리 지정해두는 그룹. 이 배치로 찍는 명함은 전부 이 그룹으로 저장된다.
  const [batchGroupIds, setBatchGroupIds] = useState<string[]>(defaultGroupId ? [defaultGroupId] : []);
  const [batchStage, setBatchStage] = useState<'capturing' | 'review'>('capturing');
  const [batchQueue, setBatchQueue] = useState<BatchItem[]>([]);
  const [batchCameraOpen, setBatchCameraOpen] = useState<boolean>(false);
  const [batchCropTarget, setBatchCropTarget] = useState<string | null>(null);
  const [isBatchScanning, setIsBatchScanning] = useState<boolean>(false);
  const [batchScanProgress, setBatchScanProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>, side: 'front' | 'back') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result as string;
      setCropTarget({ side, rawImage: raw });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleStartOCR = async () => {
    if (!frontImg && !backImg) {
      alert('스캔할 명함 앞면 또는 뒷면 이미지를 업로드해주세요.');
      return;
    }
    // [수정] 스캔 도중 재촬영 등으로 handleStartOCR가 또 호출되면, 먼저 보낸 요청과
    // 나중에 보낸 요청 중 어느 게 먼저 끝나느냐에 따라 화면에 엉뚱한(오래된) 결과가
    // 나중에 덮어써질 수 있었다. "이번이 몇 번째 요청인지"를 세대 번호로 남겨서,
    // 지금 가장 최근에 보낸 요청의 결과만 화면에 반영되게 한다(오래된 요청이 늦게
    // 응답해도 무시됨).
    const myGeneration = ++scanGenerationRef.current;

    setIsScanning(true);
    setScanDone(false);

    try {
      const res = await fetch('/api/scan-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frontImage: frontImg, backImage: backImg })
      });
      const data = await res.json();

      // 이 응답을 받는 사이에 더 최신 스캔이 시작됐다면, 이 결과는 이미 낡은 것이니 버린다.
      if (myGeneration !== scanGenerationRef.current) return;

      if (data.error) {
        throw new Error(data.error);
      }

      setForm((prev) => ({
        ...prev,
        name: data.name || prev.name || '',
        company: data.company || prev.company || '',
        department: data.department || prev.department || '',
        title: data.title || prev.title || '',
        phoneMobile: data.phoneMobile || prev.phoneMobile || '',
        phoneOffice: data.phoneOffice || prev.phoneOffice || '',
        phoneOffice2: data.phoneOffice2 || prev.phoneOffice2 || '',
        phoneFax: data.phoneFax || prev.phoneFax || '',
        email: data.email || prev.email || '',
        address: data.address || prev.address || '',
        address2: data.address2 || prev.address2 || '',
        website: data.website || prev.website || '',
        memo: data.memo || prev.memo || ''
      }));

      // [수정] AI가 함께 알려준 "명함 실물의 네 꼭짓점 좌표"로 사진을 다시 한번 정밀하게 잘라낸다.
      // 화면의 명암 차이로 테두리를 찾는 기존 방식보다 훨씬 안정적이라(배경과 색이 비슷해도 잘 됨),
      // 이 결과가 있으면 지금까지의 대충 잘린/원본 사진을 이걸로 교체한다.
      if (frontImg && isValidNormalizedCorners(data.frontCorners)) {
        try {
          const recropped = await warpDataUrlWithNormalizedCorners(frontImg, data.frontCorners);
          setFrontImg(recropped);
        } catch (err) {
          console.error('AI 좌표 기반 앞면 재크롭 실패, 기존 사진 유지:', err);
        }
      }
      if (backImg && isValidNormalizedCorners(data.backCorners)) {
        try {
          const recropped = await warpDataUrlWithNormalizedCorners(backImg, data.backCorners);
          setBackImg(recropped);
        } catch (err) {
          console.error('AI 좌표 기반 뒷면 재크롭 실패, 기존 사진 유지:', err);
        }
      }

      setScanDone(true);
    } catch (err: any) {
      if (myGeneration === scanGenerationRef.current) {
        alert(err.message || '스캔 중 오류 발생');
      }
    } finally {
      // 이 요청이 이미 낡은(더 최신 요청이 진행 중인) 상태라면, 로딩 상태를 건드리지 않는다
      // — 안 그러면 최신 스캔이 한창 진행 중인데 갑자기 "스캔 중" 표시가 사라져버린다.
      if (myGeneration === scanGenerationRef.current) {
        setIsScanning(false);
      }
    }
  };

  // [수정] 영수증 스캔은 촬영하자마자 자동으로 AI 인식이 실행되는데, 명함은 촬영 후 "AI 자동 스캔 실행"
  // 버튼을 따로 눌러야 해서 불일치가 있었다. 앞면(또는 뒷면) 사진이 채워지는 순간 자동으로 스캔이
  // 시작되도록 통일한다. (연속 촬영 모드는 별도의 "일괄 인식" 단계를 따로 쓰므로 여기서는 제외)
  useEffect(() => {
    if (!batchMode && (frontImg || backImg)) {
      handleStartOCR();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frontImg, backImg]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) {
      alert('성명을 입력해주세요.');
      return;
    }

    const candidate: BusinessCard = {
      id: `c-${Date.now()}`,
      name: form.name || '',
      company: form.company || '',
      department: form.department || '',
      title: form.title || '',
      phoneMobile: form.phoneMobile || '',
      phoneOffice: form.phoneOffice || '',
      phoneOffice2: form.phoneOffice2 || '',
      phoneFax: form.phoneFax || '',
      email: form.email || '',
      address: form.address || '',
      address2: form.address2 || '',
      website: form.website || '',
      groupId: form.groupId || defaultGroupId,
      groupIds: form.groupIds && form.groupIds.length > 0 ? form.groupIds : (form.groupId ? [form.groupId] : []),
      // [수정] 실제 촬영한 명함 사진이 없으면(이름/연락처만 직접 입력한 경우), "가져오기"
      // 할 때와 똑같이 이름·회사 정보로 정형화된 명함 이미지를 자동으로 만들어준다.
      // isAutoGeneratedImage 표시를 남겨서, 나중에 이름 등을 수정하면 이미지도 같이
      // 자동으로 다시 그려지게 한다(CardDetailModal의 저장 로직과 연결됨).
      frontImage: frontImg || generateStandardCardImage({ name: form.name, company: form.company, title: form.title, department: form.department, phoneMobile: form.phoneMobile, phoneOffice: form.phoneOffice, email: form.email, address: form.address } as BusinessCard) || undefined,
      isAutoGeneratedImage: !frontImg,
      backImage: backImg || undefined,
      memo: form.memo || '',
      createdAt: new Date().toISOString(),
      callHistory: []
    };

    // [수정] 저장 전에 비슷한 명함이 이미 있는지 확인
    const match = findDuplicateContact(candidate, contacts);
    if (match) {
      setDuplicateCheck({ match, pending: candidate });
      return;
    }

    onSave(candidate);
    onClose();
  };

  const resolveDuplicate = (choice: 'create' | 'update' | 'cancel') => {
    if (!duplicateCheck) return;
    if (choice === 'cancel') {
      setDuplicateCheck(null);
      return;
    }
    if (choice === 'update' && onUpdate) {
      const merged: BusinessCard = {
        ...duplicateCheck.match,
        ...duplicateCheck.pending,
        id: duplicateCheck.match.id,
        createdAt: duplicateCheck.match.createdAt,
        callHistory: duplicateCheck.match.callHistory
      };
      onUpdate(merged);
    } else {
      onSave(duplicateCheck.pending);
    }
    setDuplicateCheck(null);
    onClose();
  };

  // ===== [수정] 연속 촬영(배치) 모드 로직 =====
  const startBatchMode = () => {
    setBatchMode(true);
    setBatchStage('capturing');
    setBatchQueue([]);
    setBatchGroupIds(defaultGroupId ? [defaultGroupId] : []);
    setBatchCameraOpen(false);
  };

  const exitBatchMode = () => {
    setBatchMode(false);
    setBatchStage('capturing');
    setBatchQueue([]);
    setBatchGroupIds(defaultGroupId ? [defaultGroupId] : []);
    setBatchCameraOpen(false);
    setBatchCropTarget(null);
  };

  // 한 장 촬영 완료 시: 큐에 담고, 자동 인식 성공/실패와 무관하게 곧바로 다음 촬영을 위해 카메라를 다시 연다
  const handleBatchCapture = async (dataUrl: string, autoDetected: boolean) => {
    setBatchCameraOpen(false);
    if (autoDetected) {
      const resized = await resizeDataUrl(dataUrl);
      setBatchQueue((prev) => [...prev, { tempId: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, frontImage: resized, status: 'pending', action: 'create' }]);
      // 계속 촬영: 짧은 지연 후 카메라를 다시 연다 (같은 컴포넌트를 재마운트해서 스트림을 새로 연결)
      window.setTimeout(() => setBatchCameraOpen(true), 60);
    } else {
      // 자동 인식 실패한 한 장은 수동으로 테두리를 맞추도록 안내
      setBatchCropTarget(dataUrl);
    }
  };

  const handleBatchCropConfirm = (cropped: string) => {
    setBatchQueue((prev) => [...prev, { tempId: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, frontImage: cropped, status: 'pending', action: 'create' }]);
    setBatchCropTarget(null);
    setBatchCameraOpen(true);
  };

  const handleBatchCropCancel = () => {
    // 이 한 장은 건너뛰고 계속 촬영
    setBatchCropTarget(null);
    setBatchCameraOpen(true);
  };

  const endBatchCapturing = () => {
    setBatchCameraOpen(false);
    if (batchQueue.length === 0) {
      exitBatchMode();
    } else {
      setBatchStage('review');
    }
  };

  const removeBatchItem = (tempId: string) => {
    setBatchQueue((prev) => prev.filter((it) => it.tempId !== tempId));
  };

  const resumeBatchCapturing = () => {
    setBatchStage('capturing');
    setBatchCameraOpen(true);
  };

  // [수정] 큐에 쌓인 사진들을 순서대로 하나씩 AI 인식 + 중복 검사
  const runBatchRecognition = async () => {
    setIsBatchScanning(true);
    const targets = batchQueue.filter((it) => it.status === 'pending');
    setBatchScanProgress({ done: 0, total: targets.length });

    // 이번 배치 안에서 이미 인식된 항목들과도 서로 중복인지 확인하기 위한 임시 목록
    const recognizedInThisBatch: BusinessCard[] = [];

    for (const item of targets) {
      setBatchQueue((prev) => prev.map((it) => (it.tempId === item.tempId ? { ...it, status: 'scanning' } : it)));
      try {
        const res = await fetch('/api/scan-card', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ frontImage: item.frontImage })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        const parsed: Partial<BusinessCard> = {
          name: data.name || '', company: data.company || '', department: data.department || '', title: data.title || '',
          phoneMobile: data.phoneMobile || '', phoneOffice: data.phoneOffice || '', phoneOffice2: data.phoneOffice2 || '',
          phoneFax: data.phoneFax || '', email: data.email || '', address: data.address || '', address2: data.address2 || '',
          memo: data.memo || '', groupId: batchGroupIds[0] || '', groupIds: batchGroupIds
        };

        // [수정] AI가 알려준 꼭짓점 좌표로 이 항목의 사진도 정밀하게 재크롭한다.
        let finalFrontImage = item.frontImage;
        if (isValidNormalizedCorners(data.frontCorners)) {
          try {
            finalFrontImage = await warpDataUrlWithNormalizedCorners(item.frontImage, data.frontCorners);
          } catch (err) {
            console.error('AI 좌표 기반 재크롭 실패, 기존 사진 유지:', err);
          }
        }

        const dup =
          findDuplicateContact(parsed, contacts) ||
          findDuplicateContact(parsed, recognizedInThisBatch);

        setBatchQueue((prev) => prev.map((it) => (it.tempId === item.tempId ? {
          ...it, status: 'done', parsed, duplicateMatch: dup, action: dup ? 'skip' : 'create', frontImage: finalFrontImage
        } : it)));

        recognizedInThisBatch.push({
          id: item.tempId, name: parsed.name || '', company: parsed.company || '', department: parsed.department || '',
          title: parsed.title || '', phoneMobile: parsed.phoneMobile || '', phoneOffice: parsed.phoneOffice || '',
          phoneFax: parsed.phoneFax || '', email: parsed.email || '', address: parsed.address || '',
          groupId: batchGroupIds[0] || '', groupIds: batchGroupIds, memo: '', createdAt: new Date().toISOString(), callHistory: []
        });
      } catch (err: any) {
        setBatchQueue((prev) => prev.map((it) => (it.tempId === item.tempId ? { ...it, status: 'error', errorMessage: err?.message || '인식 실패' } : it)));
      } finally {
        setBatchScanProgress((prev) => ({ ...prev, done: prev.done + 1 }));
      }
    }

    setIsBatchScanning(false);
  };

  const updateBatchItemField = (tempId: string, field: keyof BusinessCard, value: string) => {
    setBatchQueue((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, parsed: { ...it.parsed, [field]: value } } : it)));
  };

  const setBatchItemAction = (tempId: string, action: 'create' | 'update' | 'skip') => {
    setBatchQueue((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, action } : it)));
  };

  const retryBatchItem = async (tempId: string) => {
    const item = batchQueue.find((it) => it.tempId === tempId);
    if (!item) return;
    setBatchQueue((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, status: 'scanning' } : it)));
    try {
      const res = await fetch('/api/scan-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frontImage: item.frontImage })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const parsed: Partial<BusinessCard> = {
        name: data.name || '', company: data.company || '', department: data.department || '', title: data.title || '',
        phoneMobile: data.phoneMobile || '', phoneOffice: data.phoneOffice || '', phoneOffice2: data.phoneOffice2 || '',
        phoneFax: data.phoneFax || '', email: data.email || '', address: data.address || '', address2: data.address2 || '',
        memo: data.memo || '', groupId: batchGroupIds[0] || '', groupIds: batchGroupIds
      };
      let finalFrontImage = item.frontImage;
      if (isValidNormalizedCorners(data.frontCorners)) {
        try {
          finalFrontImage = await warpDataUrlWithNormalizedCorners(item.frontImage, data.frontCorners);
        } catch (err) {
          console.error('AI 좌표 기반 재크롭 실패, 기존 사진 유지:', err);
        }
      }
      const dup = findDuplicateContact(parsed, contacts);
      setBatchQueue((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, status: 'done', parsed, duplicateMatch: dup, action: dup ? 'skip' : 'create', frontImage: finalFrontImage } : it)));
    } catch (err: any) {
      setBatchQueue((prev) => prev.map((it) => (it.tempId === tempId ? { ...it, status: 'error', errorMessage: err?.message || '인식 실패' } : it)));
    }
  };

  const saveBatchAll = () => {
    const toSave = batchQueue.filter((it) => it.status === 'done' && it.action !== 'skip');
    if (toSave.length === 0) {
      alert('저장할 명함이 없습니다. (모두 건너뛰기로 설정되어 있어요)');
      return;
    }

    toSave.forEach((item) => {
      const isUpdate = item.action === 'update' && item.duplicateMatch;
      const card: BusinessCard = {
        id: isUpdate ? item.duplicateMatch!.id : `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: item.parsed?.name || '',
        company: item.parsed?.company || '',
        department: item.parsed?.department || '',
        title: item.parsed?.title || '',
        phoneMobile: item.parsed?.phoneMobile || '',
        phoneOffice: item.parsed?.phoneOffice || '',
        phoneOffice2: item.parsed?.phoneOffice2 || '',
        phoneFax: item.parsed?.phoneFax || '',
        email: item.parsed?.email || '',
        address: item.parsed?.address || '',
        address2: item.parsed?.address2 || '',
        groupId: item.parsed?.groupId || batchGroupIds[0] || '',
        groupIds: item.parsed?.groupIds || batchGroupIds,
        frontImage: item.frontImage,
        memo: item.parsed?.memo || '',
        createdAt: isUpdate ? item.duplicateMatch!.createdAt : new Date().toISOString(),
        callHistory: isUpdate ? item.duplicateMatch!.callHistory : []
      };
      if (isUpdate && onUpdate) {
        onUpdate(card);
      } else {
        onSave(card);
      }
    });

    onClose();
  };

  const batchPendingCount = batchQueue.filter((it) => it.status === 'pending').length;
  const batchAllRecognized = batchQueue.length > 0 && batchQueue.every((it) => it.status === 'done' || it.status === 'error');

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-4xl bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col overflow-y-auto max-h-[95vh] md:max-h-[92vh]">

        {batchMode ? (
          /* ========================================== */
          /* [수정] 연속 촬영(배치) 모드 화면              */
          /* ========================================== */
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <button type="button" onClick={exitBatchMode} className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <Layers className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-lg text-slate-900">연속 촬영 모드</h3>
                {batchQueue.length > 0 && (
                  <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-500/30 px-2 py-0.5 rounded-full font-mono">
                    {batchQueue.length}장
                  </span>
                )}
                {batchQueue.length > 0 && (
                  <span className="text-xs bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">
                    → {batchGroupIds.length > 0 ? batchGroupIds.map((id) => groups.find((g) => g.id === id)?.name).filter(Boolean).join(', ') : '그룹 미지정'}
                  </span>
                )}
              </div>
              <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-700 p-1 bg-slate-100 rounded-full"><X className="w-4 h-4" /></button>
            </div>

            {batchStage === 'capturing' && !batchCameraOpen && batchQueue.length === 0 && (
              <div className="text-center py-8 space-y-4">
                <p className="text-sm text-slate-600">명함을 여러 장 연달아 찍을 수 있어요. 한 장 찍으면 자동으로 다음 촬영을 위해 카메라가 다시 열려요.</p>

                {/* [수정] 촬영 시작 전에 그룹을 미리 지정해두면, 이번에 찍는 명함들이 전부 이 그룹들로 저장된다 */}
                <div className="max-w-xs mx-auto text-left space-y-1.5">
                  <label className="text-xs text-slate-500 font-medium">저장할 그룹 (여러 개 선택 가능)</label>
                  <GroupMultiSelect groups={groups} value={batchGroupIds} onChange={setBatchGroupIds} />
                </div>

                <button
                  type="button"
                  onClick={() => setBatchCameraOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-indigo-600/25"
                >
                  <Camera className="w-4 h-4" />
                  촬영 시작
                </button>
              </div>
            )}

            {batchStage === 'capturing' && (
              <div className="flex flex-wrap gap-2">
                {batchQueue.map((it) => (
                  <div key={it.tempId} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200">
                    <img src={it.frontImage} alt="촬영된 명함" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}

            {batchStage === 'capturing' && batchQueue.length > 0 && (
              <button
                type="button"
                onClick={endBatchCapturing}
                className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/25"
              >
                촬영 종료 → {batchQueue.length}장 검토하기
              </button>
            )}

            {batchStage === 'review' && (
              <div className="space-y-4">
                {!batchAllRecognized && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">촬영된 명함 {batchQueue.length}장</span>
                      <button type="button" onClick={resumeBatchCapturing} className="text-xs text-indigo-400 hover:text-indigo-600 flex items-center gap-1 font-semibold">
                        <Camera className="w-3.5 h-3.5" />
                        촬영 더 하기
                      </button>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {batchQueue.map((it) => (
                        <div key={it.tempId} className="relative aspect-[1.586/1] rounded-lg overflow-hidden border border-slate-200 group">
                          <img src={it.frontImage} alt="촬영된 명함" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removeBatchItem(it.tempId)}
                            className="absolute top-1 right-1 p-1 rounded-full bg-slate-900/60 text-rose-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      disabled={isBatchScanning || batchPendingCount === 0}
                      onClick={runBatchRecognition}
                      className="w-full py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isBatchScanning ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          <span>AI 인식 중... ({batchScanProgress.done}/{batchScanProgress.total})</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-amber-600" />
                          <span>AI 일괄 인식 시작 ({batchPendingCount}장)</span>
                        </>
                      )}
                    </button>
                  </>
                )}

                {batchQueue.some((it) => it.status === 'done' || it.status === 'error') && (
                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">인식 결과 확인 및 수정</span>
                    {batchQueue.map((it) => (
                      <div key={it.tempId} className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex gap-3">
                        <img src={it.frontImage} alt="명함" className="w-16 h-16 rounded-lg object-cover border border-slate-200 shrink-0" />

                        {it.status === 'scanning' && (
                          <div className="flex-1 flex items-center gap-2 text-xs text-slate-500">
                            <div className="w-3.5 h-3.5 border-2 border-slate-600 border-t-blue-400 rounded-full animate-spin" />
                            인식 중...
                          </div>
                        )}

                        {it.status === 'error' && (
                          <div className="flex-1 space-y-2">
                            <p className="text-xs text-rose-400">인식 실패: {it.errorMessage}</p>
                            <div className="flex gap-2">
                              <button type="button" onClick={() => retryBatchItem(it.tempId)} className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold">다시 시도</button>
                              <button type="button" onClick={() => removeBatchItem(it.tempId)} className="text-[11px] px-2.5 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-950/60 text-rose-400 font-semibold">이 항목 제외</button>
                            </div>
                          </div>
                        )}

                        {it.status === 'done' && (
                          <div className="flex-1 space-y-2 min-w-0">
                            {it.duplicateMatch && (
                              <div className="flex items-center gap-1.5 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>이미 등록된 "{it.duplicateMatch.name}"({it.duplicateMatch.company})와 비슷해요</span>
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-1.5">
                              <input
                                type="text"
                                placeholder="성명"
                                value={it.parsed?.name || ''}
                                onChange={(e) => updateBatchItemField(it.tempId, 'name', e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 font-bold focus:outline-none focus:border-blue-500"
                              />
                              <input
                                type="text"
                                placeholder="회사명"
                                value={it.parsed?.company || ''}
                                onChange={(e) => updateBatchItemField(it.tempId, 'company', e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-blue-500"
                              />
                              <input
                                type="text"
                                inputMode="numeric"
                                placeholder="핸드폰"
                                value={it.parsed?.phoneMobile || ''}
                                onChange={(e) => updateBatchItemField(it.tempId, 'phoneMobile', formatPhoneNumber(e.target.value))}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 font-mono focus:outline-none focus:border-blue-500"
                              />
                              <input
                                type="text"
                                placeholder="직책"
                                value={it.parsed?.title || ''}
                                onChange={(e) => updateBatchItemField(it.tempId, 'title', e.target.value)}
                                className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-blue-500"
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setBatchItemAction(it.tempId, 'create')}
                                className={`text-[10px] px-2 py-1 rounded-lg font-semibold border transition-colors ${it.action === 'create' ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-600' : 'bg-white border-slate-200 text-slate-400'}`}
                              >
                                새로 등록
                              </button>
                              {it.duplicateMatch && (
                                <button
                                  type="button"
                                  onClick={() => setBatchItemAction(it.tempId, 'update')}
                                  className={`text-[10px] px-2 py-1 rounded-lg font-semibold border transition-colors ${it.action === 'update' ? 'bg-blue-600/20 border-blue-500/40 text-blue-600' : 'bg-white border-slate-200 text-slate-400'}`}
                                >
                                  기존 정보 업데이트
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setBatchItemAction(it.tempId, 'skip')}
                                className={`text-[10px] px-2 py-1 rounded-lg font-semibold border transition-colors ${it.action === 'skip' ? 'bg-rose-600/20 border-rose-500/40 text-rose-600' : 'bg-white border-slate-200 text-slate-400'}`}
                              >
                                건너뛰기
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={saveBatchAll}
                      className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30"
                    >
                      전체 저장하기 ({batchQueue.filter((it) => it.status === 'done' && it.action !== 'skip').length}건)
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* ========================================== */
          /* 기본(단일) 스캔 모드 화면                     */
          /* ========================================== */
          <div className="flex flex-col md:flex-row md:overflow-hidden">
            {/* 좌측: 앞면/뒷면 명함 스캔 업로딩 존 */}
            <div className="w-full md:w-1/2 bg-slate-50 p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-200 md:overflow-y-auto">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <ScanLine className="w-5 h-5 text-blue-400 animate-pulse" />
                    <h3 className="font-bold text-base text-slate-900">명함 스캔 & 이미지 저장</h3>
                  </div>
                  <span className="text-xs bg-blue-50 text-blue-700 border border-blue-500/30 px-2 py-0.5 rounded font-mono">앞·뒤 동시지원</span>
                </div>

                {/* [수정] 명함이 여러 장일 때는 이 버튼으로 연속 촬영 모드로 전환 */}
                <button
                  type="button"
                  onClick={startBatchMode}
                  className="w-full mb-4 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 hover:text-indigo-800 text-xs font-bold transition-colors"
                >
                  <Layers className="w-3.5 h-3.5" />
                  명함이 여러 장이면 연속 촬영 모드
                </button>

                <div className="space-y-4">
                  {/* 앞면 스캔 업로드 */}
                  <div>
                    <span className="text-xs font-bold text-slate-500 block mb-1.5 font-mono">① 명함 앞면 (Front Side)</span>
                    <div className="aspect-video w-full rounded-2xl border-2 border-dashed border-slate-200 hover:border-blue-500/60 bg-slate-100 flex flex-col items-center justify-center relative overflow-hidden transition-all group">
                      {frontImg ? (
                        <>
                          <img src={frontImg} alt="앞면 미리보기" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setFrontImg('')}
                            className="absolute top-2 right-2 p-1 rounded-full bg-slate-900/60 text-rose-400 hover:text-white"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center w-full h-full p-4 gap-2.5">
                          <Upload className="w-7 h-7 text-slate-400" />
                          <button
                            type="button"
                            onClick={() => setCameraTarget('front')}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            카메라로 촬영 (가이드 자동맞춤)
                          </button>
                          <label className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer underline underline-offset-2">
                            갤러리에서 사진 선택
                            <input type="file" accept="image/*" onChange={(e) => handleImageFile(e, 'front')} className="hidden" />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 뒷면 스캔 업로드 */}
                  <div>
                    <span className="text-xs font-bold text-slate-500 block mb-1.5 font-mono">② 명함 뒷면 (Back Side - 선택사항)</span>
                    <div className="aspect-[2.5/1] w-full rounded-2xl border-2 border-dashed border-slate-200 hover:border-slate-600 bg-white/30 flex flex-col items-center justify-center relative overflow-hidden transition-all group">
                      {backImg ? (
                        <>
                          <img src={backImg} alt="뒷면 미리보기" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setBackImg('')}
                            className="absolute top-2 right-2 p-1 rounded-full bg-slate-900/60 text-rose-400 hover:text-white"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center justify-center w-full h-full p-3 gap-3">
                          <button
                            type="button"
                            onClick={() => setCameraTarget('back')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-colors"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            카메라로 촬영
                          </button>
                          <label className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer underline underline-offset-2">
                            갤러리에서 선택
                            <input type="file" accept="image/*" onChange={(e) => handleImageFile(e, 'back')} className="hidden" />
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* [수정] 영수증 화면과 통일: 별도의 큰 "AI 자동 스캔 실행" 버튼 없이, 사진이 찍히면
                  바로 자동으로 인식되고 여기엔 진행 상태만 작게 표시한다. */}
              {(isScanning || scanDone) && (
                <div className="pt-6">
                  {isScanning ? (
                    <div className="flex items-center justify-center gap-2 py-2 text-xs text-slate-500">
                      <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      <span>Gemini Vision이 명함을 분석하고 있어요...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2 py-2 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-medium">AI 인식 완료</span>
                      <button
                        type="button"
                        onClick={() => handleStartOCR()}
                        className="text-slate-400 hover:text-slate-600 underline underline-offset-2"
                      >
                        다시 스캔
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 우측: OCR 추출 결과 및 정보 확인 폼 */}
            <form onSubmit={handleSubmit} className="w-full md:w-1/2 p-6 flex flex-col justify-between md:overflow-y-auto">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-4">
                  <h3 className="font-bold text-lg text-slate-900">스캔 정보 확인 및 입력</h3>
                  <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-700 p-1 bg-slate-100 rounded-full"><X className="w-4 h-4" /></button>
                </div>

                <div className="space-y-4 text-sm pr-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1 font-medium">성명 *</label>
                      <input type="text" required placeholder="예: 김도현" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-bold focus:outline-none focus:border-blue-500" />
                    </div>

                    <div>
                      <label className="text-xs text-slate-500 block mb-1 font-medium">그룹 지정 <span className="text-[10px] text-slate-400 font-normal">(여러 개 선택 가능, 아무것도 안 고르면 전체보기에서만 표시)</span></label>
                      <GroupMultiSelect
                        groups={groups}
                        value={form.groupIds || []}
                        onChange={(ids) => setForm({ ...form, groupIds: ids, groupId: ids[0] || '' })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">회사명</label>
                      <input type="text" placeholder="예: 네이버" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">부서명</label>
                      <input type="text" placeholder="예: 개발팀" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">직책/직급</label>
                      <input type="text" placeholder="예: 팀장" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-blue-500" />
                    </div>
                  </div>

                  {/* 요구사항: 연락처 핸드폰/사무실/팩스 나누어 입력 */}
                  <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2.5">
                    <span className="text-xs font-bold text-slate-500 uppercase font-mono tracking-wider">연락처 세부 분리</span>

                    <div className="grid grid-cols-1 gap-2">
                      <div>
                        <label className="text-[11px] text-emerald-400 block mb-0.5 font-medium">핸드폰 번호 (Mobile)</label>
                        <input type="text" inputMode="numeric" placeholder="010-0000-0000" value={form.phoneMobile} onChange={(e) => setForm({ ...form, phoneMobile: formatPhoneNumber(e.target.value) })} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 font-mono focus:outline-none focus:border-emerald-500" />
                      </div>

                      <div>
                        <label className="text-[11px] text-blue-400 block mb-0.5 font-medium flex items-center justify-between">
                          <span>사무실 유선전화 1 (Office 1)</span>
                        </label>
                        <input type="text" inputMode="numeric" placeholder="02-000-0000" value={form.phoneOffice} onChange={(e) => setForm({ ...form, phoneOffice: formatPhoneNumber(e.target.value) })} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 font-mono focus:outline-none focus:border-blue-500" />
                      </div>

                      <div>
                        <label className="text-[11px] text-cyan-400 block mb-0.5 font-medium flex items-center justify-between">
                          <span>사무실 유선전화 2 / 직통번호 (Office 2)</span>
                          <span className="text-[9px] bg-cyan-500/10 text-cyan-400 px-1 py-0.2 rounded font-mono font-bold">스캔 분리</span>
                        </label>
                        <input type="text" inputMode="numeric" placeholder="지사번호, 직통번호 등이 표기된 경우 분리 인식됩니다." value={form.phoneOffice2 || ''} onChange={(e) => setForm({ ...form, phoneOffice2: formatPhoneNumber(e.target.value) })} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 font-mono focus:outline-none focus:border-cyan-500" />
                      </div>

                      <div>
                        <label className="text-[11px] text-amber-400 block mb-0.5 font-medium">팩스 번호 (Fax)</label>
                        <input type="text" inputMode="numeric" placeholder="02-000-0001" value={form.phoneFax} onChange={(e) => setForm({ ...form, phoneFax: formatPhoneNumber(e.target.value) })} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 font-mono focus:outline-none focus:border-amber-500" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">이메일 주소</label>
                      <input type="email" placeholder="email@domain.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">회사 주소 1 (본사)</label>
                      <input type="text" placeholder="서울시 강남구..." value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-blue-500" />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-500 block mb-1 font-medium text-slate-600 flex items-center gap-1">
                      <span>회사 주소 2 (지사/공장 등 2번째 주소)</span>
                      <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded">분리 인식</span>
                    </label>
                    <input type="text" placeholder="지사, 공장, 연구소 주소가 있는 경우 여기에 자동 또는 수동 입력됩니다." value={form.address2} onChange={(e) => setForm({ ...form, address2: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-blue-500" />
                  </div>

                  <div>
                    <label className="text-xs text-slate-500 block mb-1">홈페이지</label>
                    <input type="text" placeholder="예: www.company.com" value={form.website || ''} onChange={(e) => setForm({ ...form, website: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 focus:outline-none focus:border-blue-500" />
                  </div>

                  <div>
                    <label className="text-xs text-slate-500 block mb-1">메모 / 슬로건 요약</label>
                    <textarea rows={2} placeholder="주요 협의 사항이나 메모 작성" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-200 flex gap-3">
                <button type="button" onClick={onClose} className="w-1/3 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm">
                  취소
                </button>
                <button type="submit" className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30">
                  명함 최종 등록
                </button>
              </div>
            </form>
          </div>
        )}

      </div>

      {/* [수정] 단일 스캔 모드: 저장 직전 중복 명함 확인 팝업 */}
      {duplicateCheck && (
        <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white border border-amber-500/30 rounded-3xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-sm font-bold">비슷한 명함이 이미 있어요</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              <span className="font-bold text-slate-900">{duplicateCheck.match.name}</span> ({duplicateCheck.match.company || '회사 미등록'}) 님이 이미 등록되어 있어요. 어떻게 할까요?
            </p>
            <div className="space-y-2">
              {onUpdate && (
                <button
                  type="button"
                  onClick={() => resolveDuplicate('update')}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors"
                >
                  기존 정보 업데이트
                </button>
              )}
              <button
                type="button"
                onClick={() => resolveDuplicate('create')}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
              >
                그래도 새로 등록
              </button>
              <button
                type="button"
                onClick={() => resolveDuplicate('cancel')}
                className="w-full py-2 text-slate-400 hover:text-slate-600 text-xs transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 단일 스캔 모드: 갤러리 업로드 원본 크롭 조정 */}
      {cropTarget && (
        <CropAdjustModal
          imageDataUrl={cropTarget.rawImage}
          title={cropTarget.side === 'front' ? '명함 앞면 테두리 확인' : '명함 뒷면 테두리 확인'}
          onConfirm={(cropped) => {
            if (cropTarget.side === 'front') setFrontImg(cropped);
            else setBackImg(cropped);
            setCropTarget(null);
          }}
          onCancel={() => setCropTarget(null)}
        />
      )}

      {/* 단일 스캔 모드: 카메라 촬영 */}
      {cameraTarget && (
        <LiveCameraCapture
          title={cameraTarget === 'front' ? '명함 앞면 촬영' : '명함 뒷면 촬영'}
          guideAspectRatio={1.586}
          onCapture={async (dataUrl, autoDetected) => {
            const side = cameraTarget;
            setCameraTarget(null);
            if (!side) return;
            if (autoDetected) {
              const resized = await resizeDataUrl(dataUrl);
              if (side === 'front') setFrontImg(resized);
              else setBackImg(resized);
            } else {
              setCropTarget({ side, rawImage: dataUrl });
            }
          }}
          onCancel={() => setCameraTarget(null)}
          onFallbackToFile={() => {
            fallbackFileInputRef.current?.click();
          }}
        />
      )}
      <input
        ref={fallbackFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (cameraTarget) {
            handleImageFile(e, cameraTarget);
            setCameraTarget(null);
          }
        }}
      />

      {/* [수정] 배치 모드: 연속 촬영용 카메라 (한 장 찍으면 큐에 담고 자동으로 다시 열림) */}
      {batchCameraOpen && (
        <LiveCameraCapture
          title={`명함 연속 촬영${batchQueue.length > 0 ? ` (${batchQueue.length}장 완료)` : ''}`}
          docLabel="명함"
          guideAspectRatio={1.586}
          onCapture={handleBatchCapture}
          onCancel={endBatchCapturing}
          onFallbackToFile={() => {
            setBatchCameraOpen(false);
          }}
        />
      )}

      {/* [수정] 배치 모드: 자동 인식 실패한 한 장을 수동으로 테두리 맞추는 화면 */}
      {batchCropTarget && (
        <CropAdjustModal
          imageDataUrl={batchCropTarget}
          title="명함 테두리 확인"
          onConfirm={handleBatchCropConfirm}
          onCancel={handleBatchCropCancel}
        />
      )}
    </div>
  );
};
