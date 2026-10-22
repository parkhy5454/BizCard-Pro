// 브라우저 음성 인식(Web Speech API) 타입 정의.
// 표준 TypeScript 타입이 브라우저마다 달라서, 우리가 쓰는 부분만 직접 정의한다.

export interface SpeechAlternativeLike {
  transcript: string;
}

export interface SpeechResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechAlternativeLike;
}

export interface SpeechResultEventLike {
  resultIndex: number;
  results: { readonly length: number; [index: number]: SpeechResultLike };
}

export interface SpeechErrorEventLike {
  error?: string;
  message?: string;
}

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: SpeechErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

// 지원하는 생성자를 찾는다 (일부 브라우저는 webkit 접두사가 붙는다). 없으면 undefined.
export const getSpeechRecognitionCtor = (): SpeechRecognitionCtor | undefined => {
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition;
};
