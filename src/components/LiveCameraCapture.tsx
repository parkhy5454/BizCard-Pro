import React, { useRef, useEffect, useState } from 'react';
import { loadOpenCv, detectQuad } from '../cardVision';

interface LiveCameraCaptureProps {
  onCapture?: (imageData: string) => void;
  disabled?: boolean;
}

const LiveCameraCapture: React.FC<LiveCameraCaptureProps> = ({ onCapture, disabled = false }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cvReady, setCvReady] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let mounted = true;

    const initializeOpenCV = async () => {
      try {
        const cv = await loadOpenCv();
        if (mounted) {
          console.log('✅ OpenCV.js 로드 완료');
          setCvReady(true);
        }
      } catch (err) {
        if (mounted) {
          const errorMsg = err instanceof Error ? err.message : '알 수 없는 오류';
          console.error('❌ OpenCV.js 로드 실패:', errorMsg);
          setError(errorMsg);
        }
      }
    };

    initializeOpenCV();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="live-camera-capture">
      {error && <div className="error-message">OpenCV 초기화 실패: {error}</div>}
      {!cvReady && <div className="loading">OpenCV.js 로드 중...</div>}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        disabled={disabled || !cvReady}
      />
      <canvas ref={canvasRef} hidden />
    </div>
  );
};

export default LiveCameraCapture;
