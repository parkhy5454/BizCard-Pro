import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Camera, RefreshCw, Image as ImageIcon } from 'lucide-react';

interface Props {
  title?: string;
  guideAspectRatio?: number; // 가이드 사각형의 가로:세로 비율 (명함 ≈ 1.586, 영수증은 세로로 길게 등)
  onCapture: (croppedDataUrl: string) => void;
  onCancel: () => void;
  onFallbackToFile: () => void; // 카메라 권한이 없거나 사용자가 "갤러리에서 선택"을 누르면
}

export const LiveCameraCapture: React.FC<Props> = ({
  title,
  guideAspectRatio = 1.586,
  onCapture,
  onCancel,
  onFallbackToFile
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startStream = useCallback(async (mode: 'environment' | 'user') => {
    setError(null);
    setIsReady(false);
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsReady(true);
      }
    } catch (err) {
      console.error('카메라 접근 실패:', err);
      setError('카메라를 사용할 수 없습니다. 갤러리에서 사진을 선택해주세요.');
    }
  }, [stopStream]);

  useEffect(() => {
    startStream(facingMode);
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  // 가이드 사각형의 화면상 위치/크기 계산 (컨테이너에 꽉 채우되 여백 10%)
  const getGuideRect = () => {
    const container = containerRef.current;
    if (!container) return null;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const marginRatio = 0.08;
    let w = cw * (1 - marginRatio * 2);
    let h = w / guideAspectRatio;
    if (h > ch * (1 - marginRatio * 2)) {
      h = ch * (1 - marginRatio * 2);
      w = h * guideAspectRatio;
    }
    const x = (cw - w) / 2;
    const y = (ch - h) / 2;
    return { x, y, w, h, cw, ch };
  };

  const handleCapture = () => {
    const video = videoRef.current;
    const guide = getGuideRect();
    if (!video || !guide || !isReady) return;

    // 비디오의 실제 해상도와 화면에 표시된(object-cover) 크기 사이의 배율 계산
    const videoW = video.videoWidth;
    const videoH = video.videoHeight;
    const displayRatio = guide.cw / guide.ch;
    const videoRatio = videoW / videoH;

    // object-cover 기준으로 비디오가 컨테이너를 채울 때의 스케일/오프셋 계산
    let scale: number;
    let offsetX = 0;
    let offsetY = 0;
    if (videoRatio > displayRatio) {
      // 비디오가 더 넓음 → 높이 기준으로 채우고 좌우가 잘림
      scale = videoH / guide.ch;
      offsetX = (videoW - guide.cw * scale) / 2;
    } else {
      // 비디오가 더 좁음(또는 세로) → 너비 기준으로 채우고 위아래가 잘림
      scale = videoW / guide.cw;
      offsetY = (videoH - guide.ch * scale) / 2;
    }

    const sx = offsetX + guide.x * scale;
    const sy = offsetY + guide.y * scale;
    const sw = guide.w * scale;
    const sh = guide.h * scale;

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    stopStream();
    onCapture(dataUrl);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col">
      <div className="flex items-center justify-between p-4 bg-slate-950/80 backdrop-blur-sm">
        <div>
          <h3 className="text-sm font-bold text-white">{title || '가이드에 맞춰 촬영하세요'}</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">사각형 안에 맞춰서 찍으면 그 부분만 자동으로 업로드돼요</p>
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
            {/* 어두운 마스크 + 가이드 사각형 (CSS box-shadow로 바깥을 어둡게 처리) */}
            {isReady && (
              <GuideOverlay containerRef={containerRef} aspectRatio={guideAspectRatio} />
            )}
            {!isReady && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
          onClick={handleCapture}
          disabled={!isReady || !!error}
          className="w-16 h-16 rounded-full bg-white border-4 border-slate-300 shadow-xl active:scale-95 transition-transform disabled:opacity-40"
        />

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

// 어두운 마스크 위에 밝은 사각형 구멍을 뚫어 가이드 영역을 표시
const GuideOverlay: React.FC<{ containerRef: React.RefObject<HTMLDivElement>; aspectRatio: number }> = ({ containerRef, aspectRatio }) => {
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    const update = () => {
      const el = containerRef.current;
      if (!el) return;
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      const marginRatio = 0.08;
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
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ width: '100%', height: '100%' }}>
      <defs>
        <mask id="guide-mask">
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={12} fill="black" />
        </mask>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#guide-mask)" />
      <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx={12} fill="none" stroke="#818cf8" strokeWidth={3} />
      {/* 모서리 강조 마커 */}
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
