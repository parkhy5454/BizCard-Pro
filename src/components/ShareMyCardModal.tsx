import React, { useEffect, useState } from 'react';
import { loadOpenCv } from '../cardVision';

interface ShareMyCardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ShareMyCardModal: React.FC<ShareMyCardModalProps> = ({ isOpen, onClose }) => {
  const [cvReady, setCvReady] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;

    const initializeOpenCV = async () => {
      try {
        const cv = await loadOpenCv();
        if (mounted) {
          console.log('✅ ShareMyCardModal: OpenCV.js 로드 완료');
          setCvReady(true);
        }
      } catch (err) {
        if (mounted) {
          const errorMsg = err instanceof Error ? err.message : '알 수 없는 오류';
          console.error('❌ ShareMyCardModal: OpenCV.js 로드 실패:', errorMsg);
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
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>명함 공유</h2>
        {error && <div className="error-message">에러: {error}</div>}
        {!cvReady && <div className="loading">OpenCV.js 로드 중...</div>}
        <button onClick={onClose}>닫기</button>
      </div>
    </div>
  );
};

export default ShareMyCardModal;
