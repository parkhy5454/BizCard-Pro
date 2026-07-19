import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';

interface Point {
  x: number;
  y: number;
}

interface Props {
  imageDataUrl: string;
  title?: string;
  onConfirm: (croppedDataUrl: string) => void;
  onCancel: () => void;
}

// 저장 용량을 줄이기 위해 이미지의 긴 변을 최대 크기로 축소 (DB 조회 속도에 큰 영향을 주므로 모든 최종 출력에 적용)
const resizeDataUrl = (dataUrl: string, maxDim = 1400, quality = 0.82): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const longSide = Math.max(img.naturalWidth, img.naturalHeight);
      if (longSide <= maxDim) {
        resolve(dataUrl);
        return;
      }
      const scale = maxDim / longSide;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
};

// OpenCV.js를 최초 1회만 지연 로딩 (여러 화면에서 공유)
let openCvLoadPromise: Promise<any> | null = null;
const loadOpenCv = (): Promise<any> => {
  const w = window as any;
  if (w.cv && w.cv.Mat) return Promise.resolve(w.cv);
  if (openCvLoadPromise) return openCvLoadPromise;

  const loadTask = (async () => {
    // @ts-ignore - CommonJS/UMD 패키지라 타입 선언이 완전히 맞지 않을 수 있음
    const mod: any = await import('@techstark/opencv-js');
    let cv = (mod && (mod.default ?? mod)) as any;
    if (cv && typeof cv.then === 'function') {
      cv = await cv;
    } else if (cv && !cv.Mat) {
      await new Promise<void>((resolve) => { cv.onRuntimeInitialized = () => resolve(); });
    }
    if (!cv || !cv.Mat) throw new Error('OpenCV 모듈 초기화에 실패했습니다.');
    w.cv = cv;
    return cv;
  })();

  const timeoutTask = new Promise<never>((_, reject) => {
    window.setTimeout(() => reject(new Error('OpenCV.js 초기화 시간 초과')), 15000);
  });

  openCvLoadPromise = Promise.race([loadTask, timeoutTask]).catch((err) => {
    openCvLoadPromise = null;
    throw err;
  });
  return openCvLoadPromise;
};

// 이미지에서 가장 그럴듯한 4각형(명함/영수증) 모서리를 자동으로 찾음 (실패 시 null)
const detectCorners = async (img: HTMLImageElement): Promise<Point[] | null> => {
  try {
    await loadOpenCv();
  } catch {
    return null;
  }
  const cv = (window as any).cv;
  let src, gray, blurred, edged, dilated, kernel, contours, hierarchy, bestApprox: any = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    src = cv.imread(canvas);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    edged = new cv.Mat();
    cv.Canny(blurred, edged, 50, 150);
    dilated = new cv.Mat();
    kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edged, dilated, kernel);

    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const imgArea = img.naturalWidth * img.naturalHeight;
    const centerX = img.naturalWidth / 2;
    const centerY = img.naturalHeight / 2;
    const frameDiag = Math.hypot(centerX, centerY);
    let bestScore = -1;

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
      const area = cv.contourArea(approx);
      const areaRatio = area / imgArea;

      // 명함/영수증다운 후보만: 화면의 15%~95% 사이 면적, 볼록(convex)한 4각형
      if (approx.rows === 4 && areaRatio > 0.15 && areaRatio < 0.95 && cv.isContourConvex(approx)) {
        // 사용자가 문서를 화면 중앙에 놓는다고 가정하고, 면적만이 아니라 중앙에 얼마나 가까운지도 반영한다.
        // (그렇지 않으면 책상 모서리·문틀처럼 크고 사각형에 가까운 배경 요소를 잘못 고르는 경우가 있다)
        let cx = 0, cy = 0;
        for (let j = 0; j < 4; j++) { cx += approx.data32S[j * 2]; cy += approx.data32S[j * 2 + 1]; }
        cx /= 4; cy /= 4;
        const centerDist = Math.min(Math.hypot(cx - centerX, cy - centerY) / frameDiag, 1);
        const score = areaRatio * (1 - centerDist * 0.8);

        if (score > bestScore) {
          bestScore = score;
          if (bestApprox) bestApprox.delete();
          bestApprox = approx;
        } else {
          approx.delete();
        }
      } else {
        approx.delete();
      }
      cnt.delete();
    }

    if (!bestApprox) return null;

    const pts: Point[] = [];
    for (let i = 0; i < 4; i++) {
      pts.push({ x: bestApprox.data32S[i * 2], y: bestApprox.data32S[i * 2 + 1] });
    }
    // 좌상 → 우상 → 우하 → 좌하 순서로 정렬
    const sums = pts.map((p) => p.x + p.y);
    const diffs = pts.map((p) => p.x - p.y);
    const tl = pts[sums.indexOf(Math.min(...sums))];
    const br = pts[sums.indexOf(Math.max(...sums))];
    const tr = pts[diffs.indexOf(Math.max(...diffs))];
    const bl = pts[diffs.indexOf(Math.min(...diffs))];
    return [tl, tr, br, bl];
  } catch (err) {
    console.error('모서리 자동 감지 실패:', err);
    return null;
  } finally {
    [src, gray, blurred, edged, dilated, kernel, contours, hierarchy].forEach((m) => {
      try { m && m.delete && m.delete(); } catch {}
    });
  }
};

// 4개 점(원본 이미지 좌표)을 기준으로 원근 보정하여 반듯하게 자름
const warpToCorners = async (img: HTMLImageElement, corners: Point[]): Promise<string> => {
  await loadOpenCv();
  const cv = (window as any).cv;
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const src = cv.imread(canvas);

  const [tl, tr, br, bl] = corners;
  const maxWidth = Math.round(Math.max(Math.hypot(br.x - bl.x, br.y - bl.y), Math.hypot(tr.x - tl.x, tr.y - tl.y)));
  const maxHeight = Math.round(Math.max(Math.hypot(tr.x - br.x, tr.y - br.y), Math.hypot(tl.x - bl.x, tl.y - bl.y)));

  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, maxWidth, 0, maxWidth, maxHeight, 0, maxHeight]);
  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const dst = new cv.Mat();
  cv.warpPerspective(src, dst, M, new cv.Size(maxWidth, maxHeight));

  const outCanvas = document.createElement('canvas');
  outCanvas.width = maxWidth;
  outCanvas.height = maxHeight;
  cv.imshow(outCanvas, dst);

  // 저장 용량을 줄이기 위해 긴 변을 최대 1400px로 축소 (DB 저장/조회 속도에 큰 영향을 주므로 필수)
  const MAX_DIM = 1400;
  const longSide = Math.max(maxWidth, maxHeight);
  let finalCanvas = outCanvas;
  if (longSide > MAX_DIM) {
    const scale = MAX_DIM / longSide;
    const resized = document.createElement('canvas');
    resized.width = Math.round(maxWidth * scale);
    resized.height = Math.round(maxHeight * scale);
    const rctx = resized.getContext('2d')!;
    rctx.drawImage(outCanvas, 0, 0, resized.width, resized.height);
    finalCanvas = resized;
  }
  const result = finalCanvas.toDataURL('image/jpeg', 0.82);

  [src, srcTri, dstTri, M, dst].forEach((m) => { try { m.delete(); } catch {} });
  return result;
};

export const CropAdjustModal: React.FC<Props> = ({ imageDataUrl, title, onConfirm, onCancel }) => {
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [corners, setCorners] = useState<Point[] | null>(null); // 표시 좌표계 기준
  const [isDetecting, setIsDetecting] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [warpError, setWarpError] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgNaturalRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  // 이미지 로드 + 자동 모서리 감지
  useEffect(() => {
    const img = new Image();
    img.onload = async () => {
      setImgEl(img);
      imgNaturalRef.current = { width: img.naturalWidth, height: img.naturalHeight };
      const detected = await detectCorners(img);
      // 표시 크기 계산은 아래 별도 effect(리사이즈 감지)에서 처리되므로,
      // 여기서는 우선 감지 결과를 "자연 좌표계" 기준으로 저장해두고 표시 시점에 스케일 변환
      setIsDetecting(false);
      if (detected) {
        (img as any).__detectedCorners = detected;
      }
    };
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  // 컨테이너 크기에 맞춰 이미지 표시 크기 계산 및 모서리 좌표를 표시 좌표계로 변환
  useEffect(() => {
    if (!imgEl || !containerRef.current) return;
    const updateSize = () => {
      const containerWidth = containerRef.current!.clientWidth;
      const maxHeight = window.innerHeight * 0.55;
      const ratio = imgEl.naturalWidth / imgEl.naturalHeight;
      let w = containerWidth;
      let h = w / ratio;
      if (h > maxHeight) {
        h = maxHeight;
        w = h * ratio;
      }
      setDisplaySize({ width: w, height: h });

      const scaleX = w / imgEl.naturalWidth;
      const scaleY = h / imgEl.naturalHeight;
      const detected = (imgEl as any).__detectedCorners as Point[] | undefined;
      if (detected) {
        setCorners(detected.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY })));
      } else {
        // 감지 실패 시 이미지 안쪽 8% 여백을 둔 기본 사각형 제시 (사용자가 직접 맞추도록)
        const margin = 0.08;
        setCorners([
          { x: w * margin, y: h * margin },
          { x: w * (1 - margin), y: h * margin },
          { x: w * (1 - margin), y: h * (1 - margin) },
          { x: w * margin, y: h * (1 - margin) }
        ]);
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [imgEl]);

  const handlePointerDown = (idx: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragIndex(idx);
  };

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragIndex === null || !containerRef.current || !corners) return;
    const rect = containerRef.current.getBoundingClientRect();
    const offsetX = (rect.width - displaySize.width) / 2;
    const offsetY = (rect.height - displaySize.height) / 2;
    let x = e.clientX - rect.left - offsetX;
    let y = e.clientY - rect.top - offsetY;
    x = Math.max(0, Math.min(displaySize.width, x));
    y = Math.max(0, Math.min(displaySize.height, y));
    setCorners((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[dragIndex] = { x, y };
      return next;
    });
  }, [dragIndex, corners, displaySize]);

  const handlePointerUp = () => setDragIndex(null);

  const handleConfirm = async () => {
    if (!imgEl || !corners) {
      onConfirm(await resizeDataUrl(imageDataUrl));
      return;
    }
    setIsProcessing(true);
    setWarpError(null);
    try {
      const scaleX = imgNaturalRef.current.width / displaySize.width;
      const scaleY = imgNaturalRef.current.height / displaySize.height;
      const naturalCorners = corners.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY }));
      const cropped = await warpToCorners(imgEl, naturalCorners);
      onConfirm(cropped);
    } catch (err: any) {
      // 이전에는 실패를 콘솔에만 남기고 조용히 원본으로 넘어갔는데, 그러면 왜 보정이 안 됐는지 알 수가 없다.
      // 화면에 실제 에러 메시지를 보여줘서 다음에 실패하면 정확한 원인을 바로 알 수 있게 한다.
      const message = err?.message || String(err);
      console.error('크롭(테두리 보정) 처리 실패:', err);
      setWarpError(message);
      setIsProcessing(false);
      return; // 원본으로 자동 진행하지 않고, 사용자가 에러를 보고 재시도하거나 "원본 그대로 사용"을 직접 선택하게 한다
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmAnyway = async () => {
    setWarpError(null);
    onConfirm(await resizeDataUrl(imageDataUrl));
  };

  const handleReset = () => {
    if (!imgEl) return;
    const detected = (imgEl as any).__detectedCorners as Point[] | undefined;
    const scaleX = displaySize.width / imgEl.naturalWidth;
    const scaleY = displaySize.height / imgEl.naturalHeight;
    if (detected) {
      setCorners(detected.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY })));
    } else {
      const margin = 0.08;
      setCorners([
        { x: displaySize.width * margin, y: displaySize.height * margin },
        { x: displaySize.width * (1 - margin), y: displaySize.height * margin },
        { x: displaySize.width * (1 - margin), y: displaySize.height * (1 - margin) },
        { x: displaySize.width * margin, y: displaySize.height * (1 - margin) }
      ]);
    }
  };

  const polygonPoints = corners ? corners.map((p) => `${p.x},${p.y}`).join(' ') : '';

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-100">{title || '테두리 확인 및 조정'}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">모서리 점을 드래그해서 실제 가장자리에 맞춰주세요</p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          ref={containerRef}
          className="relative bg-slate-950 flex items-center justify-center select-none touch-none"
          style={{ minHeight: 240 }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {isDetecting ? (
            <div className="py-16 flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-2 border-slate-700 border-t-blue-400 rounded-full animate-spin" />
              <span className="text-xs text-slate-400">가장자리 인식 중...</span>
            </div>
          ) : (
            <div className="relative" style={{ width: displaySize.width, height: displaySize.height }}>
              <img src={imageDataUrl} alt="크롭 대상" className="w-full h-full object-contain select-none pointer-events-none" draggable={false} />
              {corners && (
                <svg
                  className="absolute inset-0 w-full h-full"
                  viewBox={`0 0 ${displaySize.width} ${displaySize.height}`}
                >
                  <polygon
                    points={polygonPoints}
                    fill="rgba(99,102,241,0.18)"
                    stroke="#818cf8"
                    strokeWidth={2}
                  />
                  {corners.map((p, idx) => (
                    <circle
                      key={idx}
                      cx={p.x}
                      cy={p.y}
                      r={12}
                      fill="#4f46e5"
                      stroke="white"
                      strokeWidth={2}
                      style={{ cursor: 'grab', touchAction: 'none', pointerEvents: 'all' }}
                      onPointerDown={handlePointerDown(idx)}
                    />
                  ))}
                </svg>
              )}
            </div>
          )}
        </div>

        {warpError && (
          <div className="px-4 pt-3 flex flex-col gap-2">
            <div className="px-3 py-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-[11px] leading-relaxed">
              <p className="font-bold mb-0.5">테두리 보정에 실패했어요</p>
              <p className="text-rose-300/90 break-all">{warpError}</p>
            </div>
            <button
              onClick={handleConfirmAnyway}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
            >
              보정 없이 원본으로 계속 진행
            </button>
          </div>
        )}

        <div className="p-4 flex items-center gap-2 border-t border-slate-800">
          <button
            onClick={handleReset}
            disabled={isDetecting}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            다시 맞추기
          </button>
          <button
            onClick={async () => onConfirm(await resizeDataUrl(imageDataUrl))}
            disabled={isDetecting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors disabled:opacity-40"
          >
            원본 그대로 사용
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDetecting || isProcessing}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-600/25 transition-all disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                자르는 중...
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                이대로 자르기
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
