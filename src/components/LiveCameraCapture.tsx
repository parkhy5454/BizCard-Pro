import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, RefreshCw, Image as ImageIcon, Camera, Loader2 } from 'lucide-react';
import {
  loadOpenCv, detectQuad, warpToRect, enhanceMat, matToDataUrl,
  computeBlurScore, computeBrightness, computeGlareRatio, Quad
} from '../cardVision.js';

interface Props {
  title?: string;
  guideAspectRatio?: number; // 문서 가로:세로 비율 (명함 ≈ 1.586, 영수증은 세로로 길게 등)
  // [수정] 화면 안내 문구에 쓰이는 문서 종류 이름. 이 컴포넌트가 명함 외에 영수증 스캔에도
  // 재사용되기 때문에, "명함을 화면 안에 맞춰주세요" 같은 문구가 항상 명함으로 고정되지 않도록 분리했다.
  docLabel?: string; // 기본값 '명함' (영수증 스캔 시 '영수증'을 넘겨서 사용)
  // [수정] autoDetected: OpenCV가 실시간으로 문서 사각형을 인식해서 정확히 잘라낸 경우 true.
  // false면 자동 인식 없이 화면 중앙 고정 박스로 대충 잘린 것이므로, 호출 측에서
  // 수동 테두리 조정 화면(CropAdjustModal)으로 보내는 것을 권장한다.
  onCapture: (croppedDataUrl: string, autoDetected: boolean) => void;
  onCancel: () => void;
  onFallbackToFile: () => void; // 카메라 권한이 없거나 사용자가 "갤러리에서 선택"을 누르면
}

interface Quality {
  sizeOk: boolean;
  focusOk: boolean;
  brightOk: boolean;
  glareOk: boolean;
}

const DETECT_W = 480; // 실시간 감지용 축소 해상도 (성능을 위해 원본보다 작게 처리)
const DETECT_INTERVAL_MS = 180;
// [수정] 20px는 명함(딱딱한 재질)엔 맞지만, 영수증(얇은 종이)은 미세하게 흔들리거나
// 프레임마다 테두리가 살짝씩 달라 보여서 이 기준을 잘 못 채우고 "고정됨" 판정이 잘 안 나던 문제가 있었다.
// 기준을 완화하고 고정 유지 시간도 살짝 줄여서, 종이류도 안정적으로 자동 촬영되도록 한다.
const STABLE_MOVE_THRESHOLD = 32; // px (감지 캔버스 기준) - 이보다 적게 움직이면 "안정"으로 판단
const STABLE_DURATION_MS = 500; // 이 시간 이상 안정 + 품질 통과 시 자동 촬영
// [수정] 1400 -> 1600: 카메라 해상도를 올린 만큼, 출력 크기도 살짝 상향해 원본 디테일을 더 살림
const OUTPUT_LONG_SIDE = 1600;

function dist(a: [number, number], b: [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function scaleQuad(quad: Quad, sx: number, sy: number): Quad {
  return quad.map(([x, y]) => [x * sx, y * sy]) as Quad;
}

// [수정] Canny 엣지 감지가 카드 그림자/테두리까지 살짝 포함해서 실제보다 약간 크게 잡히는 경향이 있어,
// 감지된 사각형을 중심점 방향으로 살짝(기본 1.6%) 안쪽으로 줄여서 여백이 같이 잘리는 문제를 줄인다.
function shrinkQuadInward(quad: Quad, ratio = 0.016): Quad {
  const cx = (quad[0][0] + quad[1][0] + quad[2][0] + quad[3][0]) / 4;
  const cy = (quad[0][1] + quad[1][1] + quad[2][1] + quad[3][1]) / 4;
  return quad.map(([x, y]) => [x + (cx - x) * ratio, y + (cy - y) * ratio]) as Quad;
}

// 감지 캔버스 좌표(비디오 원본과 같은 비율로 축소된 좌표) → 화면에 실제 렌더링된(object-cover) 좌표로 변환
function mapToDisplay(quad: Quad, srcW: number, srcH: number, dispW: number, dispH: number): Quad {
  const srcRatio = srcW / srcH;
  const dispRatio = dispW / dispH;
  let scale: number, offsetX = 0, offsetY = 0;
  if (srcRatio > dispRatio) {
    scale = dispH / srcH;
    offsetX = (dispW - srcW * scale) / 2;
  } else {
    scale = dispW / srcW;
    offsetY = (dispH - srcH * scale) / 2;
  }
  return quad.map(([x, y]) => [x * scale + offsetX, y * scale + offsetY]) as Quad;
}

// (구) 고정 가이드 사각형 기준 크롭 — OpenCV 미지원/미감지 시 안전한 대체 동작
function fallbackCenterCrop(video: HTMLVideoElement, container: HTMLDivElement | null, aspect: number): string {
  const cw = container?.clientWidth || video.clientWidth || video.videoWidth;
  const ch = container?.clientHeight || video.clientHeight || video.videoHeight;
  // [수정] 8% -> 4%: StaticGuideOverlay와 동일하게 맞춰, 화면에 보이는 가이드 박스와 실제 잘리는 영역이 일치하도록 함
  const marginRatio = 0.04;
  let w = cw * (1 - marginRatio * 2);
  let h = w / aspect;
  if (h > ch * (1 - marginRatio * 2)) {
    h = ch * (1 - marginRatio * 2);
    w = h * aspect;
  }
  const x = (cw - w) / 2;
  const y = (ch - h) / 2;

  const videoW = video.videoWidth;
  const videoH = video.videoHeight;
  const displayRatio = cw / ch;
  const videoRatio = videoW / videoH;
  let scale: number, offsetX = 0, offsetY = 0;
  if (videoRatio > displayRatio) {
    scale = videoH / ch;
    offsetX = (videoW - cw * scale) / 2;
  } else {
    scale = videoW / cw;
    offsetY = (videoH - ch * scale) / 2;
  }
  const sx = offsetX + x * scale;
  const sy = offsetY + y * scale;
  const sw = w * scale;
  const sh = h * scale;

  const outScale = Math.max(sw, sh) > OUTPUT_LONG_SIDE ? OUTPUT_LONG_SIDE / Math.max(sw, sh) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * outScale);
  canvas.height = Math.round(sh * outScale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

export const LiveCameraCapture: React.FC<Props> = ({
  title,
  guideAspectRatio = 1.586,
  docLabel = '명함',
  onCapture,
  onCancel,
  onFallbackToFile
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const detectCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cvStatus, setCvStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  // [수정] 실패했을 때만 화면에 짧게 보여줄 원인 문구 (평소엔 안 보이고, 문제 진단용으로만 노출)
  const [cvErrorMessage, setCvErrorMessage] = useState<string>('');
  const [quadDisplay, setQuadDisplay] = useState<Quad | null>(null);
  const [quality, setQuality] = useState<Quality | null>(null);
  const [isStable, setIsStable] = useState(false);
  const [statusMessage, setStatusMessage] = useState(`${docLabel}을(를) 화면 안에 맞춰주세요`);
  const [isProcessing, setIsProcessing] = useState(false);
  const [captureFlash, setCaptureFlash] = useState(false);
  const cvRef = useRef<any>(null);
  const quadHistoryRef = useRef<{ quad: Quad; t: number }[]>([]);
  const stableSinceRef = useRef<number | null>(null);
  const lastRawQuadRef = useRef<{ quad: Quad; detectW: number; detectH: number } | null>(null);
  const autoCapturedRef = useRef(false);
  const isProcessingRef = useRef(false);
  const detectIntervalRef = useRef<number | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startStream = useCallback(async (mode: 'environment' | 'user') => {
    setError(null);
    setIsReady(false);
    stopStream();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('이 브라우저에서는 카메라를 직접 지원하지 않아요. 아래 "갤러리"를 눌러 사진을 선택해주세요.');
      return;
    }

    const tryGetStream = async (constraints: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(constraints);

    try {
      let stream: MediaStream;
      try {
        // [수정] width/height를 명시적으로 요청 (안 하면 브라우저가 임의로 저해상도를 줄 수 있음 — 흐림의 주된 원인)
        stream = await tryGetStream({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });
      } catch (firstErr) {
        console.warn('1차 카메라 요청 실패, 해상도 조건을 낮춰 재시도:', firstErr);
        try {
          // [수정] 완전히 해상도 조건 없이 바로 가지 않고, 한 단계 낮춰서 한 번 더 시도
          stream = await tryGetStream({
            video: {
              facingMode: { ideal: mode },
              width: { ideal: 1280 },
              height: { ideal: 720 }
            },
            audio: false
          });
        } catch (secondErr) {
          console.warn('2차 카메라 요청도 실패, 기본 카메라로 재시도:', secondErr);
          stream = await tryGetStream({ video: true, audio: false });
        }
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (playErr) {
          console.warn('비디오 재생 대기 중:', playErr);
        }
        setIsReady(true);
      }
    } catch (err: any) {
      console.error('카메라 접근 실패:', err);
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setError('카메라 권한이 거부되어 있어요. 아이폰의 "설정 → Safari → 카메라"에서 허용으로 바꾼 뒤 다시 시도하시거나, 아래 "갤러리"로 사진을 선택해주세요.');
      } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setError('사용 가능한 카메라를 찾지 못했어요. 아래 "갤러리"에서 사진을 선택해주세요.');
      } else if (name === 'NotReadableError') {
        setError('다른 앱이 카메라를 사용 중이라 열 수 없어요. 다른 카메라 앱을 종료한 뒤 다시 시도하시거나 "갤러리"를 이용해주세요.');
      } else {
        setError(`카메라를 열 수 없어요 (${name || '알 수 없는 오류'}). 아래 "갤러리"에서 사진을 선택해주세요.`);
      }
    }
  }, [stopStream]);

  useEffect(() => {
    startStream(facingMode);
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  // OpenCV.js 지연 로딩 (스캔 화면이 열릴 때 + "다시 시도" 버튼을 눌렀을 때 재사용)
  const attemptLoadCv = useCallback(() => {
    let cancelled = false;
    setCvStatus('loading');
    setCvErrorMessage('');
    loadOpenCv()
      .then((cv) => {
        if (cancelled) return;
        cvRef.current = cv;
        setCvStatus('ready');
      })
      .catch((err) => {
        console.warn('OpenCV.js 로드 실패 - 수동 촬영 모드로 전환합니다:', err);
        if (!cancelled) {
          setCvStatus('failed');
          setCvErrorMessage(err?.message || String(err));
        }
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    return attemptLoadCv();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 실제 촬영 + 보정 처리 (자동/수동 공통)
  const handleCapture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !isReady || isProcessingRef.current) return;
    isProcessingRef.current = true;
    setIsProcessing(true);

    try {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = vw;
      fullCanvas.height = vh;
      const fctx = fullCanvas.getContext('2d')!;
      fctx.drawImage(video, 0, 0, vw, vh);

      const cv = cvRef.current;
      let outDataUrl: string;
      let autoDetected = false;

      if (cv) {
        const srcMat = cv.imread(fullCanvas);
        try {
          // [수정] 실시간 감지 때 썼던 저해상도(480px) 좌표를 그대로 확대해서 쓰면
          // 확대 배율만큼 오차가 커져 화면에 보였던 테두리와 실제 크롭 결과가 어긋나는 문제가 있었다.
          // 그래서 촬영 버튼이 눌린 바로 그 순간, 실제로 찍힌 고화질 원본 위에서
          // 사각형을 한 번 더 정밀하게 재감지해서 훨씬 정확한 경계로 잘라낸다.
          const preciseQuad = detectQuad(cv, srcMat, guideAspectRatio);
          let quadToUse: Quad | null = null;

          if (preciseQuad) {
            quadToUse = preciseQuad.points;
          } else if (lastRawQuadRef.current) {
            // 정밀 재감지가 실패한 경우에만, 실시간 감지 때 찾았던 좌표를 확대해서 대체 사용
            const { quad, detectW, detectH } = lastRawQuadRef.current;
            quadToUse = scaleQuad(quad, vw / detectW, vh / detectH);
          }

          if (quadToUse) {
            autoDetected = true;
            quadToUse = shrinkQuadInward(quadToUse);
            let outW: number, outH: number;
            if (guideAspectRatio >= 1) { outW = OUTPUT_LONG_SIDE; outH = Math.round(OUTPUT_LONG_SIDE / guideAspectRatio); }
            else { outH = OUTPUT_LONG_SIDE; outW = Math.round(OUTPUT_LONG_SIDE * guideAspectRatio); }

            const warped = warpToRect(cv, srcMat, quadToUse, outW, outH);
            const enhanced = enhanceMat(cv, warped);
            outDataUrl = matToDataUrl(cv, enhanced, 0.9);
            warped.delete();
            enhanced.delete();
          } else {
            // 사각형이 감지되지 않은 경우: 화면 중앙 가이드 영역으로 대체
            outDataUrl = fallbackCenterCrop(video, containerRef.current, guideAspectRatio);
          }
        } finally {
          srcMat.delete();
        }
      } else {
        // OpenCV를 못 쓰는 경우: 화면 중앙 가이드 영역으로 대체
        outDataUrl = fallbackCenterCrop(video, containerRef.current, guideAspectRatio);
      }

      stopStream();
      setCaptureFlash(true);
      window.setTimeout(() => onCapture(outDataUrl, autoDetected), 120);
    } catch (err) {
      console.error('촬영/보정 처리 실패:', err);
      try {
        const fallback = fallbackCenterCrop(video, containerRef.current, guideAspectRatio);
        stopStream();
        onCapture(fallback, false);
      } catch {
        alert('사진 처리에 실패했습니다. 다시 시도해주세요.');
        isProcessingRef.current = false;
        setIsProcessing(false);
      }
    }
  }, [isReady, guideAspectRatio, stopStream, onCapture]);

  // 실시간 감지 루프: 카메라 프레임에서 문서 사각형을 찾아 위치/기울기에 맞는 테두리를 표시하고,
  // 크기·초점·밝기·반사광 품질과 안정성(흔들림 없음)을 체크해 자동 촬영을 트리거한다.
  const runDetection = useCallback(() => {
    const video = videoRef.current;
    const cv = cvRef.current;
    const container = containerRef.current;
    if (!video || !cv || !container || video.readyState < 2 || isProcessingRef.current) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    const detectW = DETECT_W;
    const detectH = Math.round(detectW * (vh / vw));

    if (!detectCanvasRef.current) detectCanvasRef.current = document.createElement('canvas');
    const canvas = detectCanvasRef.current;
    canvas.width = detectW;
    canvas.height = detectH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, detectW, detectH);

    let srcMat: any;
    try {
      srcMat = cv.imread(canvas);
    } catch {
      return;
    }

    try {
      const found = detectQuad(cv, srcMat, guideAspectRatio);
      if (!found) {
        setQuadDisplay(null);
        setQuality(null);
        setIsStable(false);
        quadHistoryRef.current = [];
        stableSinceRef.current = null;
        lastRawQuadRef.current = null;
        setStatusMessage(`${docLabel}을(를) 화면 안에 맞춰주세요`);
        return;
      }

      const xs = found.points.map((p) => p[0]);
      const ys = found.points.map((p) => p[1]);
      const minX = Math.max(0, Math.min(...xs));
      const minY = Math.max(0, Math.min(...ys));
      const maxX = Math.min(detectW, Math.max(...xs));
      const maxY = Math.min(detectH, Math.max(...ys));
      const roiW = Math.max(1, Math.round(maxX - minX));
      const roiH = Math.max(1, Math.round(maxY - minY));
      const roi = srcMat.roi(new cv.Rect(Math.round(minX), Math.round(minY), roiW, roiH));

      const blur = computeBlurScore(cv, roi);
      const brightness = computeBrightness(cv, roi);
      const glare = computeGlareRatio(cv, roi);
      roi.delete();

      // [수정] 크기 기준을 0.14 -> 0.10으로 완화: 명함이 화면에 조금 작게 잡혀도(멀리서 찍어도) 인식되도록.
      // 초점 기준은 흐림 방지를 위해 유지하되, 밝기/반사광 허용 범위는 살짝 넓혀서
      // 실제 촬영 환경(약한 조명, 약한 반사)에서 "실패"로 튕기는 경우를 줄인다.
      const sizeOk = found.areaRatio >= 0.10;
      const focusOk = blur >= 18;
      const brightOk = brightness >= 35 && brightness <= 250;
      const glareOk = glare <= 0.13;

      lastRawQuadRef.current = { quad: found.points, detectW, detectH };

      const now = performance.now();
      quadHistoryRef.current.push({ quad: found.points, t: now });
      quadHistoryRef.current = quadHistoryRef.current.filter((h) => now - h.t < 1200);

      let stable = false;
      if (quadHistoryRef.current.length >= 3) {
        const recent = quadHistoryRef.current.slice(-4);
        let maxMove = 0;
        for (let i = 1; i < recent.length; i++) {
          for (let k = 0; k < 4; k++) {
            maxMove = Math.max(maxMove, dist(recent[i].quad[k], recent[i - 1].quad[k]));
          }
        }
        stable = maxMove < STABLE_MOVE_THRESHOLD;
      }

      if (stable) {
        if (stableSinceRef.current === null) stableSinceRef.current = now;
      } else {
        stableSinceRef.current = null;
      }

      const stableDuration = stableSinceRef.current ? now - stableSinceRef.current : 0;
      const allQualityOk = sizeOk && focusOk && brightOk && glareOk;

      const dispW = container.clientWidth;
      const dispH = container.clientHeight;
      setQuadDisplay(mapToDisplay(found.points, detectW, detectH, dispW, dispH));
      setQuality({ sizeOk, focusOk, brightOk, glareOk });
      setIsStable(stable && allQualityOk);

      if (!sizeOk) setStatusMessage(`${docLabel}을(를) 조금 더 가까이 가져와 주세요`);
      else if (!brightOk) setStatusMessage(brightness < 60 ? '조명이 어두워요' : '빛이 너무 강해요');
      else if (!glareOk) setStatusMessage('반사광이 있어요, 각도를 살짝 바꿔주세요');
      else if (!focusOk) setStatusMessage('흔들리지 않게 잠시 고정해주세요');
      else if (!stable) setStatusMessage('위치를 고정해주세요...');
      else setStatusMessage('고정됨! 자동 촬영합니다');

      if (allQualityOk && stable && stableDuration >= STABLE_DURATION_MS && !autoCapturedRef.current) {
        autoCapturedRef.current = true;
        handleCapture();
      }
    } finally {
      srcMat.delete();
    }
  }, [guideAspectRatio, handleCapture]);

  useEffect(() => {
    if (cvStatus !== 'ready' || !isReady || error) return;
    const id = window.setInterval(runDetection, DETECT_INTERVAL_MS);
    detectIntervalRef.current = id;
    return () => window.clearInterval(id);
  }, [cvStatus, isReady, error, runDetection]);

  const allQualityOk = quality ? Object.values(quality).every(Boolean) : false;
  const outlineColor = quadDisplay ? (isStable && allQualityOk ? '#22c55e' : allQualityOk ? '#facc15' : '#f87171') : '#f87171';

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col">
      <div className="flex items-center justify-between p-4 bg-slate-950/80 backdrop-blur-sm">
        <div>
          <h3 className="text-sm font-bold text-white">{title || `${docLabel}을(를) 화면 안에 비춰주세요`}</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {cvStatus === 'ready' ? '초록 테두리가 뜨고 고정되면 자동으로 촬영돼요' : '가이드에 맞춰 촬영 버튼을 눌러주세요'}
          </p>
        </div>
        <button onClick={() => { stopStream(); onCancel(); }} className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div ref={containerRef} className="relative flex-1 overflow-hidden bg-black">
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="text-sm text-slate-300">{error}</p>
            <button
              onClick={() => { stopStream(); onFallbackToFile(); }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold"
            >
              <ImageIcon className="w-4 h-4" />
              갤러리에서 선택
            </button>
          </div>
        ) : (
          <>
            <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />

            {isReady && cvStatus === 'ready' && (
              <DetectionOverlay quad={quadDisplay} color={outlineColor} />
            )}
            {isReady && cvStatus === 'failed' && (
              <>
                <StaticGuideOverlay containerRef={containerRef} aspectRatio={guideAspectRatio} />
                <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
                  <div className="px-3 py-1.5 rounded-full bg-rose-950/80 border border-rose-500/40 text-rose-200 text-[11px] font-semibold whitespace-nowrap">
                    자동 인식 엔진을 불러오지 못했어요 · 가이드에 맞춰 수동으로 촬영해주세요
                  </div>
                  <button
                    type="button"
                    onClick={attemptLoadCv}
                    className="flex items-center gap-1 px-3 py-1 rounded-full bg-slate-900/90 hover:bg-slate-800 text-slate-200 text-[11px] font-semibold transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    자동 인식 다시 시도
                  </button>
                  {cvErrorMessage && (
                    <div className="max-w-[260px] px-2.5 py-1 rounded-lg bg-black/70 text-amber-300 text-[9px] font-mono text-center leading-tight">
                      원인: {cvErrorMessage.slice(0, 120)}
                    </div>
                  )}
                </div>
              </>
            )}
            {isReady && cvStatus === 'loading' && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 text-white text-[11px]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                스캔 엔진 준비 중...
              </div>
            )}
            {!isReady && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}

            {isReady && cvStatus === 'ready' && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/65 text-white text-xs font-semibold whitespace-nowrap">
                {statusMessage}
              </div>
            )}

            {captureFlash && <div className="absolute inset-0 bg-white animate-pulse" />}

            {isProcessing && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 text-white animate-spin" />
                <p className="text-xs text-slate-200">각도 보정 및 화질 개선 중...</p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="p-5 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center gap-6">
        <button
          onClick={() => { stopStream(); onFallbackToFile(); }}
          className="flex flex-col items-center gap-1 text-slate-300 hover:text-white transition-colors"
        >
          <div className="p-3 rounded-full bg-slate-800">
            <ImageIcon className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-semibold">갤러리</span>
        </button>

        <button
          onClick={() => { autoCapturedRef.current = true; handleCapture(); }}
          disabled={!isReady || !!error || isProcessing}
          className="w-16 h-16 rounded-full bg-white border-4 border-slate-300 shadow-xl active:scale-95 transition-transform disabled:opacity-40 flex items-center justify-center"
        >
          {isProcessing && <Camera className="w-5 h-5 text-slate-500" />}
        </button>

        <button
          onClick={() => setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))}
          className="flex flex-col items-center gap-1 text-slate-300 hover:text-white transition-colors"
        >
          <div className="p-3 rounded-full bg-slate-800">
            <RefreshCw className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-semibold">전환</span>
        </button>
      </div>
    </div>
  );
};

// 실시간으로 감지된 사각형(기울어진 네 모서리)을 그대로 따라가는 테두리 오버레이
const DetectionOverlay: React.FC<{ quad: Quad | null; color: string }> = ({ quad, color }) => {
  if (!quad) {
    return (
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.35)" />
      </svg>
    );
  }
  const pointsAttr = quad.map((p) => p.join(',')).join(' ');
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none">
      <defs>
        <mask id="quad-mask">
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          <polygon points={pointsAttr} fill="black" />
        </mask>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.45)" mask="url(#quad-mask)" />
      <polygon points={pointsAttr} fill="none" stroke={color} strokeWidth={3.5} strokeLinejoin="round" />
      {quad.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={6} fill={color} />
      ))}
    </svg>
  );
};

// OpenCV.js를 못 쓰는 환경을 위한 대체(고정 위치) 가이드 — 기존 동작 유지
const StaticGuideOverlay: React.FC<{ containerRef: React.RefObject<HTMLDivElement>; aspectRatio: number }> = ({ containerRef, aspectRatio }) => {
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      // [수정] 8% -> 4%: 고정 가이드 박스를 더 크게 표시해서, 명함이 박스보다 커서 안 들어가는 경우를 줄임
      const marginRatio = 0.04;
      let w = cw * (1 - marginRatio * 2);
      let h = w / aspectRatio;
      if (h > ch * (1 - marginRatio * 2)) {
        h = ch * (1 - marginRatio * 2);
        w = h * aspectRatio;
      }
      setRect({ x: (cw - w) / 2, y: (ch - h) / 2, w, h });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [containerRef, aspectRatio]);

  if (!rect) return null;

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none">
      <defs>
        <mask id="guide-mask">
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={12} fill="black" />
        </mask>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#guide-mask)" />
      <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={12} fill="none" stroke="#818cf8" strokeWidth={3} />
      {[
        [rect.x, rect.y],
        [rect.x + rect.w, rect.y],
        [rect.x + rect.w, rect.y + rect.h],
        [rect.x, rect.y + rect.h]
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={5} fill="#818cf8" />
      ))}
    </svg>
  );
};
