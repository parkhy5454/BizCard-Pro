import React, { useEffect, useState } from 'react';
import { loadOpenCv } from '../cardVision';

interface ScanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan?: (imageData: string) => void;
}

const ScanModal: React.FC<ScanModalProps> = ({ isOpen, onClose, onScan }) => {
  const [cvReady, setCvReady] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;

    const initializeOpenCV = async () => {
      try {
        const cv = await loadOpenCv();
        if (mounted) {
          console.log('✅ ScanModal: OpenCV.js 로드 완료');
          setCvReady(true);
        }
      } catch (err) {
        if (mounted) {
          const errorMsg = err instanceof Error ? err.message : '알 수 없는 오류';
          console.error('❌ ScanModal: OpenCV.js 로드 실패:', errorMsg);
          setError(errorMsg);
        }
      }
    };

    initializeOpenCV();

    return () => {
      mounted = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="scan-modal-overlay" onClick={onClose}>
      <div className="scan-modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>명함 스캔</h2>
        {error && <div className="error-message">에러: {error}</div>}
        {!cvReady && <div className="loading">OpenCV.js 로드 중...</div>}
        <button onClick={onClose}>닫기</button>
      </div>
    </div>
  );
};

export default ScanModal;
