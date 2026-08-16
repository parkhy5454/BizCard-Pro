import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
// [추가] 색상/윤곽선 규칙을 사람이 손으로 정하는 OpenCV 방식은, 나무 무늬 배경처럼
// 밝기가 들쭉날쭉한 배경에서 실제 명함 테두리와 배경을 구분 못 하는 근본적인 한계가
// 반복적으로 확인됐다(마름모/엉뚱한 사각형으로 잡히는 문제). scanic은 다양한 실제 사진으로
// 미리 학습된 신경망(ONNX, 완전히 브라우저 로컬 실행 — 서버/API 호출도, 할당량 소모도 없음)
// 으로 문서 모서리를 찾아주는 오픈소스(MIT) 라이브러리다. 색상 규칙이 아니라 "이게 문서처럼
// 생겼다"는 걸 데이터로 학습했기 때문에, 배경 무늬에 훨씬 덜 흔들린다. 이걸 1순위로 쓰고,
// 실패하면(네트워크 문제로 모델을 못 받아온 경우 등) 기존 OpenCV 방식으로 자연스럽게 넘어간다.
import { scanDocument } from 'scanic';

interface Point {
  x: number;
  y: number;
}

// corners 배열 순서(좌상, 우상, 우하, 좌하)를 기준으로, 각 변을 이루는 두 점의 인덱스.
// [수정] 변 중간 손잡이를 드래그하면 이 두 점만 같이 움직여서 "위쪽만/오른쪽만/아래쪽만/왼쪽만" 조정이 가능해진다.
const EDGE_POINT_INDEXES: [number, number][] = [
  [0, 1], // 위쪽 변 (좌상-우상)
  [1, 2], // 오른쪽 변 (우상-우하)
  [2, 3], // 아래쪽 변 (우하-좌하)
  [3, 0]  // 왼쪽 변 (좌하-좌상)
];
const EDGE_CURSORS = ['ns-resize', 'ew-resize', 'ns-resize', 'ew-resize'];

// [추가] 이 화면(재촬영 후 테두리 확인)의 자동감지는 그동안 "밝고 채도 낮은 영역의 넓이 +
// 화면 중앙에 가까운 정도"로만 점수를 매기고, 실제 명함 비율(가로:세로 ≈ 1.586)과 맞는지는
// 전혀 확인하지 않았다. 그래서 나무 책상의 밝은 결/무늬가 카드의 흰 영역과 화면상 붙어있으면
// (white-mask + MORPH_CLOSE로 뭉쳐짐), 실제 카드보다 더 크고 삐뚤어진 사각형이 점수만 높게
// 나와 "자동감지: 성공"으로 잘못 뜨는 문제가 있었다. 실시간 촬영 화면(cardVision.ts의
// detectQuad)에는 이미 있는 비율 검증 로직을 여기에도 동일하게 적용해서, 넓기만 하고 명함
// 비율과 동떨어진 사각형은 감점시킨다.
const CARD_TARGET_ASPECT = 1.586;
// 정방향이든 90도 회전(세로로 찍힘)이든, 카드 비율과 이보다 더 벌어지면 "명함 모양이 아니다"로
// 보고 후보에서 아예 제외한다 (예: 카드+배경이 뭉쳐서 훨씬 넓적하거나 정사각형에 가까운 덩어리).
// [수정] 처음엔 0.4로 뒀는데, 정사각형(비율 1.0)의 diff가 약 0.37이라 이 문턱을 근소하게
// 통과해버렸다. 그러면 카드 전체 윤곽선을 못 찾았을 때 QR코드/로고 블록처럼 정사각형에 가까운
// 작은 영역이 대신 잡히고, 사진 속 카드 자체가 기울어져 찍혀 있으면 그 정사각형도 같이 기울어져
// 화면엔 마름모(다이아몬드)처럼 보이는 문제로 이어졌다. 0.3으로 낮춰서 정사각형에 가까운 후보는
// 확실히 걸러내면서도, 일반적인 촬영 각도의 원근 왜곡(가로세로 비율이 어느 정도 눌리는 것)은 계속 허용한다.
const MAX_ACCEPTABLE_ASPECT_DIFF = 0.3;

// 순서 없는 4개 점을 [좌상, 우상, 우하, 좌하] 순서로 정렬 (점수 계산 중간 단계와
// 최종 반환 시 양쪽에서 같은 규칙으로 재사용한다)
function orderQuadPoints(pts: Point[]): [Point, Point, Point, Point] {
  const sums = pts.map((p) => p.x + p.y);
  const diffs = pts.map((p) => p.x - p.y);
  const tl = pts[sums.indexOf(Math.min(...sums))];
  const br = pts[sums.indexOf(Math.max(...sums))];
  const tr = pts[diffs.indexOf(Math.max(...diffs))];
  const bl = pts[diffs.indexOf(Math.min(...diffs))];
  return [tl, tr, br, bl];
}

function quadAspectRatio(pts: Point[]): number {
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const [tl, tr, br, bl] = pts;
  const w = (dist(tl, tr) + dist(bl, br)) / 2;
  const h = (dist(tl, bl) + dist(tr, br)) / 2;
  return w / Math.max(h, 1);
}

// [추가] scanic ML 모델이 "확신 있다"고 보고해도(score>=0.5) 실사용 테스트에서, 명함이
// 기울어져 찍힌 사진에서 실제 모서리를 따라가지 못하고 수평/수직으로 딱 떨어지는(회전 없는)
// 엉뚱한 사각형을 내놓는 경우가 확인됐다 — 심지어 그 엉뚱한 사각형이 명함 비율(1.586)과
// 거의 정확히 맞아떨어져서, 비율 검증만으로는 걸러지지 않았다. 신경망 점수 하나만 믿고
// OpenCV/Gemini 재확인 단계를 전부 건너뛰면, 예전에 OpenCV 자체 confident 점수만 믿었다가
// "확신에 찬 오탐"을 못 걸렀던 것과 똑같은 함정에 빠진다. 그래서 서로 독립적인 두 방법(ML
// 신경망 vs OpenCV 윤곽선 감지)의 결과 위치가 실제로 비슷할 때만("교차 검증") ML 결과를
// 확정으로 취급한다 — 위치(중심점)와 크기(면적)가 둘 다 어느 정도 가까워야 "같은 카드를
// 가리키고 있다"고 본다.
function quadsRoughlyAgree(a: Point[], b: Point[]): boolean {
  const area = (pts: Point[]) => {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      s += p1.x * p2.y - p2.x * p1.y;
    }
    return Math.abs(s) / 2;
  };
  const centroid = (pts: Point[]) => ({
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length
  });
  const areaA = area(a);
  const areaB = area(b);
  if (areaA <= 0 || areaB <= 0) return false;
  const cA = centroid(a);
  const cB = centroid(b);
  // 두 사각형 크기 기준으로 정규화한 중심점 거리 (카드 크기와 무관하게 같은 기준으로 비교하기 위함)
  const scale = Math.sqrt((areaA + areaB) / 2);
  const centroidDist = Math.hypot(cA.x - cB.x, cA.y - cB.y) / Math.max(scale, 1);
  const areaRatio = Math.min(areaA, areaB) / Math.max(areaA, areaB);
  return centroidDist < 0.25 && areaRatio > 0.55;
}

// [추가] "핸드폰을 가로로 돌려서 찍으면 계속 실패한다"는 반복 재현 끝에, 처음엔 "90도 단위
// 회전"(폰을 눕혀서 찍는 경우)만 대응했었다. 그런데 실제로는 90도 딱 떨어지는 경우가 아니라
// 명함이 임의의 각도(예: 20~25도)로 삐딱하게 찍히는 경우가 훨씬 흔했고, 그 경우 scanic ML
// 모델이 실제 모서리를 못 따라가는 걸로 확인됐다 — 명함 촬영은 사용자가 어느 각도로 들고
// 찍을지 특정할 수 없으므로, 90도 단위가 아니라 촘촘한 각도 전체를 훑어야 한다. 사진 한 장을
// 15도 간격으로(총 24방향) 돌려가며 모델에 넣어보고, 그중 점수가 가장 높은(=모델이 가장
// "문서답다"고 판단한) 방향의 결과를 원본 좌표계로 되돌려 사용한다. 모델 자체는 브라우저에서
// 로컬로 도는 가벼운 연산이라 여러 번 돌려도 서버/할당량 비용은 없다 — 다만 매번 24번을 다
// 시도하면 느려지므로, 가장 흔한 방향(안 돌아감→90도 단위)부터 먼저 시도하고, 아주 높은
// 점수(0.85 이상 = 충분히 확신)가 나오면 그 시점에 바로 멈춘다.
const ROTATION_SWEEP_ANGLES = [
  0, 90, 180, 270,
  15, 345, 30, 330, 45, 315, 60, 300, 75, 285,
  105, 255, 120, 240, 135, 225, 150, 210, 165, 195
];
const ROTATION_EARLY_EXIT_SCORE = 0.85;

// 이미지를 angleDeg만큼 회전시킨 새 캔버스를 만든다. 90도 단위가 아닌 임의 각도도 다루므로,
// 회전 후 이미지 전체가 캔버스 밖으로 잘리지 않도록 캔버스 크기를 넉넉하게(회전된 바운딩
// 박스 크기로) 잡는다.
function rotateImageToCanvas(img: HTMLImageElement, angleDeg: number): HTMLCanvasElement {
  const rad = (angleDeg * Math.PI) / 180;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * cos + h * sin);
  canvas.height = Math.ceil(w * sin + h * cos);
  const ctx = canvas.getContext('2d')!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rad);
  ctx.drawImage(img, -w / 2, -h / 2);
  return canvas;
}

// rotateImageToCanvas로 angleDeg만큼 돌린 캔버스 위의 좌표(p)를, 원본 이미지 좌표계로 되돌린다.
function rotatedPointToOriginal(canvas: HTMLCanvasElement, img: HTMLImageElement, angleDeg: number, p: Point): Point {
  const rad = (-angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - canvas.width / 2;
  const dy = p.y - canvas.height / 2;
  return {
    x: dx * cos - dy * sin + img.naturalWidth / 2,
    y: dx * sin + dy * cos + img.naturalHeight / 2
  };
}

interface MlOrientationResult {
  canvas: HTMLCanvasElement;
  angle: number;
  canvasPts: Point[]; // 회전된 캔버스 좌표계 기준 (그 캔버스 위에서 OpenCV 교차검증할 때 사용)
  originalPts: Point[]; // 원본 이미지 좌표계로 되돌린 좌표 (화면 표시/최종 사용)
  score: number;
}

async function detectMlBestOrientation(img: HTMLImageElement): Promise<MlOrientationResult | null> {
  let best: MlOrientationResult | null = null;

  for (const angle of ROTATION_SWEEP_ANGLES) {
    try {
      const canvas = rotateImageToCanvas(img, angle);
      const result = await scanDocument(canvas, { detector: 'ml', mode: 'detect' });
      const score = result.score ?? 0;
      if (result.success && result.corners && score >= 0.5 && score > (best?.score ?? 0)) {
        const canvasPts = orderQuadPoints([
          { x: result.corners.topLeft.x, y: result.corners.topLeft.y },
          { x: result.corners.topRight.x, y: result.corners.topRight.y },
          { x: result.corners.bottomRight.x, y: result.corners.bottomRight.y },
          { x: result.corners.bottomLeft.x, y: result.corners.bottomLeft.y }
        ]);
        const originalPts = orderQuadPoints(canvasPts.map((p) => rotatedPointToOriginal(canvas, img, angle, p)));
        best = { canvas, angle, canvasPts, originalPts, score };
        if (score >= ROTATION_EARLY_EXIT_SCORE) break;
      }
    } catch {
      // 이 각도에서 실패해도 나머지 각도는 계속 시도한다.
    }
  }

  return best;
}

interface Props {
  imageDataUrl: string;
  title?: string;
  onConfirm: (croppedDataUrl: string) => void;
  onCancel: () => void;
  // [추가] 명함처럼 "이 방향(가로/세로)이 맞다"가 정해진 문서일 때만 넘긴다. 넘기면 최종
  // 결과물이 항상 이 방향으로 나오도록 보정하고(orientQuadForExpectedAspect 정의부 주석
  // 참고), 영수증처럼 방향이 정해지지 않은 문서는 안 넘겨서 예전처럼 감지된 그대로 쓴다.
  expectedAspectRatio?: number;
}

// 저장 용량을 줄이기 위해 이미지의 긴 변을 최대 크기로 축소 (DB 조회 속도에 큰 영향을 주므로 모든 최종 출력에 적용)
// [수정] 카메라 촬영 결과(LiveCameraCapture)도 재사용할 수 있도록 export 처리
export const resizeDataUrl = (dataUrl: string, maxDim = 1400, quality = 0.82): Promise<string> => {
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

// [추가] 스마트폰 사진은 실제 픽셀과 별도로 "이 사진을 몇 도 돌려서 보여줘라"는 회전
// 정보(EXIF orientation)가 따로 저장된 경우가 많다. 화면에 보여줄 때(<img> 태그)는
// 브라우저가 이 회전 정보를 자동으로 반영해서 똑바로 보여주지만, 캔버스에 그려서 자르는
// 작업(OpenCV 테두리 감지, 실제 크롭)은 회전 정보를 무시하고 원본 픽셀 그대로 처리했다.
// 그 결과 "화면에 보이는 것 기준으로 맞춘 테두리 좌표"가 "실제로 잘라내는 원본 픽셀"에서는
// 완전히 다른 위치를 가리키게 되어, 테두리 밖 엉뚱한 부분까지 잘려 나오는 문제가 있었다.
// 이 함수를 맨 처음(화면 표시/테두리 감지/자르기 전부보다 먼저) 한 번 거쳐서, 회전 정보를
// 실제 픽셀에 "구워 넣은" 새 이미지로 바꿔둔다 — 이후 모든 단계가 동일하게 "보이는 그대로"의
// 이미지를 기준으로 처리되므로 더 이상 이 불일치가 생기지 않는다.
export const normalizeImageOrientation = async (dataUrl: string): Promise<string> => {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    // imageOrientation: 'from-image' 옵션이 EXIF 회전 정보를 읽어서 자동으로 바로잡아 디코딩한다.
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' } as any);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch (err) {
    // 이 브라우저가 지원을 안 하거나 실패하면, 회전 보정 없이 원본을 그대로 쓴다
    // (예전과 같은 동작으로 돌아갈 뿐, 이 함수를 호출하기 전보다 더 나빠지지는 않는다).
    console.error('이미지 회전 정보 정규화 실패, 원본 사용:', err);
    return dataUrl;
  }
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

// [수정] 명함이 배경과 색·명암 대비가 약할 때(예: 크림색 명함 + 회색 벽), Canny(경계선 명암차
// 기반) 방식 하나로는 아무리 민감도를 조절해도 실패하는 경우가 있었다. Canny 민감도를 단계적으로
// 낮춰가며 재시도하는 것에 더해, 완전히 다른 방식인 적응형 이진화(주변 지역과 비교해 밝은지
// 어두운지를 보는 방식)도 마지막 안전장치로 추가했다.
// [추가] 나무 책상 무늬, 옷감 짜임 같은 "무늬가 많은 배경"에서는 Canny/적응형 이진화 둘 다
// 배경의 무늬 자체를 엣지로 잘못 잡아서 명함 테두리를 놓치는 경우가 많았다. 명함은 거의
// 항상 흰색/밝은 무채색이라는 특징을 이용해서, "밝고 채도가 낮은 영역"을 색상 기준으로
// 직접 찾는 방식(white-mask)을 가장 먼저 시도하도록 추가했다 — 배경 무늬에 흔들리지 않고
// 훨씬 안정적으로 명함 영역만 골라낸다.
type DetectionStrategyCrop =
  | { mode: 'white-mask'; satMax: number; valMin: number }
  | { mode: 'canny'; low: number; high: number }
  | { mode: 'adaptive'; blockSize: number; C: number };

const DETECTION_STRATEGY_LADDER_CROP: DetectionStrategyCrop[] = [
  { mode: 'white-mask', satMax: 60, valMin: 140 },
  { mode: 'white-mask', satMax: 90, valMin: 110 },
  { mode: 'canny', low: 45, high: 140 },
  { mode: 'canny', low: 25, high: 90 },
  { mode: 'canny', low: 15, high: 60 },
  { mode: 'adaptive', blockSize: 35, C: 5 }
];

// [추가] OpenCV 감지 결과와 함께 "이 결과를 얼마나 믿을 수 있는지"도 반환한다.
interface DetectionResult {
  points: Point[];
  confident: boolean;
}

// [추가] 회전 탐색(detectMlBestOrientation)이 찾은 "가장 문서다운 방향"의 캔버스를 그대로
// OpenCV 교차검증에도 재사용할 수 있도록, 원본 <img> 대신 이미 그려진 <canvas>도 받을 수 있게
// 한다 (둘 다 naturalWidth/naturalHeight 대신 공통으로 쓸 수 있는 크기 계산이 필요).
function getSourceDims(src: HTMLImageElement | HTMLCanvasElement): { width: number; height: number } {
  return src instanceof HTMLCanvasElement
    ? { width: src.width, height: src.height }
    : { width: src.naturalWidth, height: src.naturalHeight };
}

const detectCornersOnce = (imgSrc: HTMLImageElement | HTMLCanvasElement, cv: any, strategy: DetectionStrategyCrop): DetectionResult | null => {
  let src, gray, blurred, edged, dilated, kernel, closeKernel, contours, hierarchy, hsv, whiteMask: any = null;
  let bestApprox: any = null;
  let bestApproxScore = -1;
  let fallbackQuad: Point[] | null = null;
  let fallbackAreaRatio = -1;

  try {
    const { width: srcWidth, height: srcHeight } = getSourceDims(imgSrc);
    const canvas = document.createElement('canvas');
    canvas.width = srcWidth;
    canvas.height = srcHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(imgSrc, 0, 0);

    src = cv.imread(canvas);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    edged = new cv.Mat();
    dilated = new cv.Mat();
    kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    closeKernel = cv.Mat.ones(9, 9, cv.CV_8U);

    if (strategy.mode === 'white-mask') {
      // [추가] 색상(HSV) 기준으로 "밝고 채도 낮은(=흰색/무채색에 가까운)" 픽셀만 골라내서
      // 그 영역의 윤곽선을 찾는다. 나무 무늬/옷감 짜임처럼 밝기 변화가 많은 배경이어도,
      // 명함처럼 실제로 하얗고 채도가 낮은 영역만 정확히 잡아낼 수 있다.
      hsv = new cv.Mat();
      cv.cvtColor(src, hsv, cv.COLOR_RGBA2RGB);
      cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);
      whiteMask = new cv.Mat();
      const low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [0, 0, strategy.valMin, 0]);
      const high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [180, strategy.satMax, 255, 255]);
      cv.inRange(hsv, low, high, whiteMask);
      low.delete();
      high.delete();
      cv.morphologyEx(whiteMask, dilated, cv.MORPH_CLOSE, closeKernel);
    } else if (strategy.mode === 'canny') {
      cv.Canny(blurred, edged, strategy.low, strategy.high);
      cv.dilate(edged, dilated, kernel);
    } else {
      cv.adaptiveThreshold(blurred, edged, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY, strategy.blockSize, strategy.C);
      cv.morphologyEx(edged, dilated, cv.MORPH_CLOSE, closeKernel);
    }

    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const imgArea = srcWidth * srcHeight;
    const centerX = srcWidth / 2;
    const centerY = srcHeight / 2;
    const frameDiag = Math.hypot(centerX, centerY);
    const epsilonFactors = [0.02, 0.01, 0.03, 0.05];

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const peri = cv.arcLength(cnt, true);
      if (peri <= 0) { cnt.delete(); continue; }

      // 4점으로 안 떨어질 경우를 대비해, 이 윤곽선의 실제 면적 기준으로 최소 회전 사각형 폴백도 준비
      try {
        const rawArea = Math.abs(cv.contourArea(cnt));
        const rawAreaRatio = rawArea / imgArea;
        if (rawAreaRatio > 0.05 && rawAreaRatio < 0.99 && rawAreaRatio > fallbackAreaRatio) {
          const rotRect = cv.minAreaRect(cnt);
          // [추가] 이 폴백 경로도 넓이만 보고 골랐었다 — 배경 무늬가 카드와 뭉쳐서 카드보다
          // 훨씬 크고 명함 비율과 동떨어진 덩어리가 되면, 그게 그대로 "가장 큰 덩어리"로 뽑혀
          // 폴백으로 쓰였다. 명함 비율과 너무 동떨어진 덩어리는 폴백 후보에서도 제외한다.
          const rectAspect = rotRect.size.width / Math.max(rotRect.size.height, 1);
          const rectAspectDiffNormal = Math.abs(rectAspect - CARD_TARGET_ASPECT) / CARD_TARGET_ASPECT;
          const rectAspectDiffRotated = Math.abs(rectAspect - 1 / CARD_TARGET_ASPECT) / (1 / CARD_TARGET_ASPECT);
          const rectAspectDiff = Math.min(rectAspectDiffNormal, rectAspectDiffRotated);
          if (rectAspectDiff <= MAX_ACCEPTABLE_ASPECT_DIFF) {
            const angleRad = (rotRect.angle * Math.PI) / 180;
            const cos = Math.cos(angleRad);
            const sin = Math.sin(angleRad);
            const hw = rotRect.size.width / 2;
            const hh = rotRect.size.height / 2;
            const corners: Point[] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([dx, dy]) => ({
              x: rotRect.center.x + dx * cos - dy * sin,
              y: rotRect.center.y + dx * sin + dy * cos
            }));
            fallbackQuad = corners;
            fallbackAreaRatio = rawAreaRatio;
          }
        }
      } catch {
        // minAreaRect 계산 실패해도 전체 흐름은 계속 진행
      }

      let matchedThisContour = false;
      for (const factor of epsilonFactors) {
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, factor * peri, true);
        const area = cv.contourArea(approx);
        const areaRatio = area / imgArea;

        // 명함/영수증다운 후보만: 화면의 5%~97% 사이 면적, 볼록(convex)한 4각형
        if (!matchedThisContour && approx.rows === 4 && areaRatio > 0.05 && areaRatio < 0.99 && cv.isContourConvex(approx)) {
          let cx = 0, cy = 0;
          for (let j = 0; j < 4; j++) { cx += approx.data32S[j * 2]; cy += approx.data32S[j * 2 + 1]; }
          cx /= 4; cy /= 4;
          const centerDist = Math.min(Math.hypot(cx - centerX, cy - centerY) / frameDiag, 1);

          // [추가] 넓이/중앙근접도만으로는, 배경 무늬가 카드 흰 영역과 뭉쳐서 생긴 "카드보다
          // 크고 삐뚤어진 사각형"도 점수가 높게 나올 수 있다. 실제 명함 비율(가로:세로 ≈
          // 1.586, 세로로 찍힌 경우 그 역수)과 얼마나 가까운지도 같이 반영해서, 비율이 크게
          // 어긋난 후보는 감점한다.
          const rawPts: Point[] = [];
          for (let j = 0; j < 4; j++) rawPts.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] });
          const orderedForScore = orderQuadPoints(rawPts);
          const aspect = quadAspectRatio(orderedForScore);
          const aspectDiffNormal = Math.abs(aspect - CARD_TARGET_ASPECT) / CARD_TARGET_ASPECT;
          const aspectDiffRotated = Math.abs(aspect - 1 / CARD_TARGET_ASPECT) / (1 / CARD_TARGET_ASPECT);
          const aspectDiff = Math.min(aspectDiffNormal, aspectDiffRotated, 1);

          if (aspectDiff > MAX_ACCEPTABLE_ASPECT_DIFF) {
            // 명함 비율과 너무 동떨어진 사각형(배경과 뭉친 덩어리 등)은 아예 후보에서 제외.
            // 이 전략(strategy)에서 더 나은 후보를 못 찾으면 detectCorners()가 다음 전략으로 넘어간다.
            approx.delete();
          } else {
            const score = areaRatio * (1 - aspectDiff * 0.5) * (1 - centerDist * 0.6);

            if (score > bestApproxScore) {
              bestApproxScore = score;
              if (bestApprox) bestApprox.delete();
              bestApprox = approx;
              matchedThisContour = true;
            } else {
              approx.delete();
            }
          }
        } else {
          approx.delete();
        }
      }
      cnt.delete();
    }

    let pts: Point[] | null = null;
    // [추가] OpenCV 결과를 어느 정도로 믿을 수 있는지("확신") 같이 반환한다. 뒤에서 이 값이
    // false일 때만 Gemini AI 모서리 감지를 추가로 호출하기 위함이다 — AI 호출은 하루 20회짜리
    // 무료 할당량을 같이 쓰기 때문에, OpenCV가 이미 잘 맞춘 케이스까지 매번 호출하면 정작
    // 필요한 명함 OCR(스캔 자체)에 쓸 할당량이 낭비된다.
    let confident = false;
    if (bestApprox) {
      pts = [];
      for (let i = 0; i < 4; i++) {
        pts.push({ x: bestApprox.data32S[i * 2], y: bestApprox.data32S[i * 2 + 1] });
      }
      // 실제 4점 다각형이 넓이/중심/비율 종합 점수로도 괜찮게 나왔을 때만 확신으로 본다.
      confident = bestApproxScore >= 0.12;
    } else if (fallbackQuad) {
      // 정확히 4점으로 떨어지는 윤곽선을 못 찾은 경우(휘거나 구겨진 영수증 등),
      // 가장 큰 덩어리를 감싸는 최소 사각형을 대신 사용한다. 이 경로는 근사치라 항상 "확신 없음".
      pts = fallbackQuad;
      confident = false;
    }

    if (!pts) return null;

    // 좌상 → 우상 → 우하 → 좌하 순서로 정렬
    const ordered = orderQuadPoints(pts);

    // [추가] AI 확인 없이 순수 OpenCV 결과를 그대로 쓰는 경우(=confident일 때는 AI를 아예
    // 안 부름), 실제 카드보다 살짝 타이트하게 잡혀서 인쇄된 글자 가장자리가 잘리는 실패가
    // 반복 보고됐다. 이건 배경(나무 무늬 등)이 조금 더 넓게 잡히는 실패보다 훨씬 치명적이다
    // — 글자가 잘리면 그 정보는 되살릴 수 없지만, 배경이 살짝 더 들어간 정도는 명함 OCR
    // 응답에 같이 딸려오는 frontCorners/backCorners로 별도 AI 호출/할당량 소모 없이 자동으로
    // 다시 타이트하게 다듬어진다(ScanModal의 recognizeAndDiffRescan/handleScan 참고). 그래서
    // 최종 사각형을 중심 기준 자기 크기의 4%만큼 바깥쪽으로 살짝 여유를 둬서, "카드 전체를
    // 포함하되 살짝 넉넉하게"를 "정확히 딱 맞게(그래서 가끔 모자라게)"보다 우선한다.
    const PAD_RATIO = 0.04;
    const cx = (ordered[0].x + ordered[1].x + ordered[2].x + ordered[3].x) / 4;
    const cy = (ordered[0].y + ordered[1].y + ordered[2].y + ordered[3].y) / 4;
    const padded = ordered.map((p) => ({
      x: Math.min(Math.max(p.x + (p.x - cx) * PAD_RATIO, 0), srcWidth),
      y: Math.min(Math.max(p.y + (p.y - cy) * PAD_RATIO, 0), srcHeight)
    })) as [Point, Point, Point, Point];

    return { points: padded, confident };
  } catch (err) {
    console.error('모서리 자동 감지 실패:', err);
    return null;
  } finally {
    if (bestApprox) { try { bestApprox.delete(); } catch {} }
    [src, gray, blurred, edged, dilated, kernel, closeKernel, contours, hierarchy, hsv, whiteMask].forEach((m) => {
      try { m && m.delete && m.delete(); } catch {}
    });
  }
};

// 이미지에서 가장 그럴듯한 4각형(명함/영수증) 모서리를 자동으로 찾음 (실패 시 null)
// 기본 민감도로 먼저 시도하고, 실패하면 더 민감한 설정 → 적응형 이진화 순으로 자동 재시도한다.
// [수정] 회전 탐색이 찾은 "가장 문서다운 방향"의 캔버스도 그대로 받아 교차검증할 수 있도록,
// 원본 <img> 대신 <canvas>도 받을 수 있게 확장했다.
const detectCorners = async (imgSrc: HTMLImageElement | HTMLCanvasElement): Promise<DetectionResult | null> => {
  try {
    await loadOpenCv();
  } catch {
    return null;
  }
  const cv = (window as any).cv;
  for (const strategy of DETECTION_STRATEGY_LADDER_CROP) {
    const result = detectCornersOnce(imgSrc, cv, strategy);
    if (result) return result;
  }
  return null;
};

// [추가] 폰을 가로로 눕혀서 찍은 사진은, 카드 자체는 정상(가로로 긴) 규격인데 원본 이미지
// 좌표 기준으로만 좌상/우상/우하/좌하를 정하다 보니(orderQuadPoints는 순수 좌표값으로만
// 판단, 실제 글자가 어느 방향으로 읽히는지는 모른다) 사각형 자체는 카드 테두리에 잘 맞아도
// 최종 결과물이 세로로(글자가 옆으로 누운 채로) 저장되는 문제가 실사용 테스트에서 확인됐다.
// 명함은 항상 가로가 더 긴 규격(90x50mm, 비율 ≈1.586)이므로, 예상 비율(expectedAspectRatio)이
// 주어지면 그 방향(가로 긴 모양인지 세로 긴 모양인지)과 실제 감지된 사각형의 방향이 다를 때
// 시계 방향으로 90도 돌려서 항상 올바른(가로/세로) 방향으로 결과물이 나오게 한다. 영수증처럼
// 원래 세로가 긴 문서도 있으므로(ReceiptScanModal은 이 값을 안 넘김), 호출한 쪽이 명시적으로
// "이 방향이 맞다"고 알려줄 때만 보정하고, 안 넘기면 예전처럼 감지된 그대로 사용한다.
function orientQuadForExpectedAspect(corners: Point[], expectedAspectRatio?: number): [Point, Point, Point, Point] {
  let [tl, tr, br, bl] = corners as [Point, Point, Point, Point];
  if (!expectedAspectRatio) return [tl, tr, br, bl];

  const widthEstimate = (Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(br.x - bl.x, br.y - bl.y)) / 2;
  const heightEstimate = (Math.hypot(bl.x - tl.x, bl.y - tl.y) + Math.hypot(br.x - tr.x, br.y - tr.y)) / 2;
  const detectedIsLandscape = widthEstimate >= heightEstimate;
  const expectedIsLandscape = expectedAspectRatio >= 1;

  if (detectedIsLandscape !== expectedIsLandscape) {
    // 시계 방향으로 한 칸 회전 (좌상←좌하, 우상←좌상, 우하←우상, 좌하←우하) — 뒤집힘(미러링) 없이
    // 순수 회전만 적용해서 원근 왜곡/글자 좌우반전이 생기지 않는다.
    [tl, tr, br, bl] = [bl, tl, tr, br];
  }
  return [tl, tr, br, bl];
}

// 4개 점(원본 이미지 좌표)을 기준으로 원근 보정하여 반듯하게 자름
export const warpToCorners = async (img: HTMLImageElement, corners: Point[], expectedAspectRatio?: number): Promise<string> => {
  await loadOpenCv();
  const cv = (window as any).cv;
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  const src = cv.imread(canvas);

  const [tl, tr, br, bl] = orientQuadForExpectedAspect(corners, expectedAspectRatio);
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

// [수정] Gemini Vision이 명함 인식과 함께 알려주는 "네 꼭짓점 좌표"(이미지 가로/세로에 대한 0~1 비율)를
// 받아서, 그 좌표대로 정밀하게 반듯이 잘라주는 편의 함수. OpenCV로 화면에서 직접 테두리를 찾는 방식보다
// AI가 "이게 명함처럼 생겼다"는 패턴 자체로 판단하는 것이라, 배경과 색이 비슷해도 훨씬 안정적이다.
export interface NormalizedCorners {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
}

// [수정] AI가 응답에 꼭짓점 좌표를 아예 안 주거나(파싱 실패 등), 좌표가 말이 안 되는 값(예: 네 점이
// 거의 겹쳐서 면적이 0에 가까움)일 때는 재크롭을 시도하지 않고 기존 사진을 그대로 쓰기 위한 안전장치.
// 명함 등록(ScanModal), 내 명함 공유(ShareMyCardModal) 등 여러 화면에서 공통으로 재사용한다.
export function isValidNormalizedCorners(c: any): c is NormalizedCorners {
  if (!c || typeof c !== 'object') return false;
  const keys = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;
  for (const k of keys) {
    const p = c[k];
    if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return false;
    if (p.x < -0.05 || p.x > 1.05 || p.y < -0.05 || p.y > 1.05) return false;
  }
  // 신발끈 공식으로 대략적인 면적을 구해, 네 점이 거의 한 점에 겹쳐있는 경우(찌그러진 응답)를 걸러낸다.
  const pts = [c.topLeft, c.topRight, c.bottomRight, c.bottomLeft];
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % 4];
    area += p1.x * p2.y - p2.x * p1.y;
  }
  area = Math.abs(area) / 2;
  return area > 0.03; // 이미지 전체 면적의 3% 미만이면 신뢰하지 않음
}

export const warpDataUrlWithNormalizedCorners = (dataUrl: string, corners: NormalizedCorners, expectedAspectRatio?: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      try {
        const pts: Point[] = [
          { x: corners.topLeft.x * img.naturalWidth, y: corners.topLeft.y * img.naturalHeight },
          { x: corners.topRight.x * img.naturalWidth, y: corners.topRight.y * img.naturalHeight },
          { x: corners.bottomRight.x * img.naturalWidth, y: corners.bottomRight.y * img.naturalHeight },
          { x: corners.bottomLeft.x * img.naturalWidth, y: corners.bottomLeft.y * img.naturalHeight }
        ];
        const result = await warpToCorners(img, pts, expectedAspectRatio);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('이미지 로딩 실패'));
    img.src = dataUrl;
  });
};

// [추가] 이 화면의 자동감지는 그동안 OpenCV(색상/밝기/윤곽선 기반 기하 추정)만 썼다. 서버에는
// 이미 Gemini Vision으로 "이게 명함처럼 생겼다"는 패턴 자체로 모서리를 찾아주는
// /api/detect-card-corners가 있었는데, 정작 화면 어디에서도 호출하지 않고 있었다(연결이 안 된
// 죽은 코드였음). OpenCV는 배경이 카드와 색/밝기가 비슷하거나, 카드가 세로로 찍히거나, 표면이
// 반짝여서 하이라이트가 지면 실제 카드 테두리보다 안쪽의 엉뚱한 사각형(마름모 등)을 잡는 경우가
// 반복적으로 보고됐다. OpenCV 결과를 먼저 즉시 보여주고, 그 뒤로 이 함수가 AI 감지를 백그라운드로
// 한 번 더 요청해서 유효한 결과가 오면 화면을 그걸로 갱신한다(사용자가 이미 직접 손으로 만졌으면
// 덮어쓰지 않는다). AI 호출이 실패/무응답이어도(할당량 소진 등) 조용히 무시하고 OpenCV 결과를 유지한다.
async function fetchAiCornersNormalized(dataUrl: string): Promise<NormalizedCorners | null> {
  try {
    const res = await fetch('/api/detect-card-corners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl })
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!isValidNormalizedCorners(data?.corners)) return null;
    return data.corners as NormalizedCorners;
  } catch {
    return null;
  }
}

export const CropAdjustModal: React.FC<Props> = ({ imageDataUrl, title, onConfirm, onCancel, expectedAspectRatio }) => {
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [corners, setCorners] = useState<Point[] | null>(null); // 표시 좌표계 기준
  const [isDetecting, setIsDetecting] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [warpError, setWarpError] = useState<string | null>(null);
  const [autoDetected, setAutoDetected] = useState<boolean | null>(null);
  // [추가] AI(Gemini) 기반 모서리 감지가 아직 진행 중인지 / 이미 그 결과로 화면을 갱신했는지.
  // 라벨 문구에 반영해서, 사용자가 지금 보고 있는 사각형이 빠른 추정인지 AI로 재확인된 것인지
  // 알 수 있게 한다.
  const [aiRefining, setAiRefining] = useState(false);
  const [aiConfirmed, setAiConfirmed] = useState(false);
  // [추가] OpenCV 자체 결과가 이미 충분히 믿을만해서(confident) AI 추가 호출을 아예 안 한
  // 경우를 구분한다 — 이때는 "빠른 추정이라 불확실함"이 아니라 실제로 꽤 신뢰할 수 있는
  // 결과이므로 라벨 문구를 다르게 보여준다.
  const [cvConfident, setCvConfident] = useState(false);
  // [추가] scanic의 로컬 ML(신경망) 감지기로 찾은 결과인지. 이 경로는 완전히 브라우저에서
  // 끝나서 서버/API 호출도, Gemini 할당량 소모도 없다 — OpenCV보다 신뢰도가 높으므로
  // 성공하면 OpenCV/AI 재확인 단계 자체를 건너뛴다.
  const [mlConfirmed, setMlConfirmed] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // [수정] 모서리 점을 하나씩 맞추는 게 번거롭다는 피드백에 따라, 사각형 안쪽을 드래그하면
  // 네 점이 동시에 같은 방향으로 움직이는 "전체 이동" 모드를 추가한다.
  const [isDraggingAll, setIsDraggingAll] = useState<boolean>(false);
  // [수정] 위/아래/왼쪽/오른쪽 변만 따로 옮길 수 있는 드래그 모드 (0=위, 1=오른쪽, 2=아래, 3=왼쪽)
  const [dragEdge, setDragEdge] = useState<number | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgNaturalRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  // [추가] 사용자가 이미 직접 테두리를 드래그해서 조정했으면, 나중에 AI 감지 결과가 도착해도
  // 그 조정을 덮어쓰지 않는다.
  const userAdjustedRef = useRef(false);
  const displaySizeRef = useRef(displaySize);
  useEffect(() => { displaySizeRef.current = displaySize; }, [displaySize]);

  // [추가] 회전 정보(EXIF)를 실제 픽셀에 반영한 정규화된 이미지. 이후 화면 표시/테두리 감지/
  // 실제 자르기까지 전부 이 값을 기준으로 통일해서 써야, "화면에 보이는 것"과 "실제로 잘리는
  // 것"이 어긋나지 않는다. null이면 아직 정규화 중.
  const [normalizedUrl, setNormalizedUrl] = useState<string | null>(null);

  // 이미지 로드 + 자동 모서리 감지
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // [추가] 맨 처음에 회전 정보부터 실제 픽셀에 반영해둔다 (이 함수의 자세한 이유는
      // normalizeImageOrientation 정의 위 주석 참고).
      const fixedUrl = await normalizeImageOrientation(imageDataUrl);
      if (cancelled) return;
      setNormalizedUrl(fixedUrl);

      const img = new Image();
      img.onload = async () => {
        if (cancelled) return;
        setImgEl(img);
        imgNaturalRef.current = { width: img.naturalWidth, height: img.naturalHeight };

        // [추가] scanic의 로컬 ML 감지기(scanic import부 주석 참고)와 기존 OpenCV 윤곽선 감지를
        // 동시에 돌린다. ML은 색상 규칙이 아니라 학습된 신경망으로 판단해서 나무 무늬 배경 등에
        // 훨씬 안정적이지만, 명함이 임의의 각도로 삐딱하게 찍히면 인식률이 떨어진다는 게
        // 확인됐다(detectMlBestOrientation 정의부 주석 참고) — 그래서 사진을 15도 간격 24방향으로
        // 미리 돌려보며 가장 "문서답다"고 판단한 방향의 결과를 쓴다. 그렇게 얻은 결과도 실사용
        // 테스트에서 명함 비율과 맞아떨어지는 채로 위치는 틀린 경우가 확인됐으므로
        // (quadsRoughlyAgree 정의부 주석 참고), 독립적인 두 번째 방법(OpenCV)과 위치가 실제로
        // 비슷할 때만("교차 검증") 확정으로 취급한다. 이때 OpenCV도 원본(기울어진) 사진이 아니라
        // ML이 찾은 "가장 문서다운 방향"으로 이미 돌려둔 같은 캔버스에서 돌려야, OpenCV 쪽도
        // 기울기 때문에 실패하는 걸 막을 수 있다.
        let mlOrientation: MlOrientationResult | null = null;
        const [mlSettled, cvOriginalSettled] = await Promise.allSettled([
          detectMlBestOrientation(img),
          detectCorners(img)
        ]);
        if (cancelled) return;

        if (mlSettled.status === 'fulfilled') {
          mlOrientation = mlSettled.value;
        } else {
          // 모델을 못 받아왔거나(네트워크 문제) 초기화에 실패해도, 아래 OpenCV 결과로
          // 자연스럽게 넘어가면 되므로 여기서는 콘솔 경고만 남기고 계속 진행한다.
          console.warn('scanic ML 감지 실패, OpenCV 방식으로 대체합니다:', mlSettled.reason);
        }

        const cvOnOriginal = cvOriginalSettled.status === 'fulfilled' ? cvOriginalSettled.value : null;
        if (cvOriginalSettled.status === 'rejected') {
          console.error('OpenCV 모서리 감지 실패:', cvOriginalSettled.reason);
        }

        const mlOk = !!mlOrientation;
        const mlPts = mlOrientation?.originalPts ?? null;

        if (mlOrientation) {
          // ML이 "가장 문서다운 방향"으로 이미 돌려둔 캔버스 위에서 OpenCV도 한 번 더 돌려,
          // 같은(기울기 보정된) 프레임 안에서 두 방법이 같은 자리를 가리키는지 확인한다 —
          // 원본(기울어진) 사진에서 OpenCV를 돌리는 것보다 훨씬 공정한 비교다.
          let cvOnRotated: DetectionResult | null = null;
          try {
            await loadOpenCv();
            const cv = (window as any).cv;
            for (const strategy of DETECTION_STRATEGY_LADDER_CROP) {
              const result = detectCornersOnce(mlOrientation.canvas, cv, strategy);
              if (result) { cvOnRotated = result; break; }
            }
          } catch (err) {
            console.warn('회전 보정된 프레임에서 OpenCV 교차검증 실패:', err);
          }

          if (cvOnRotated && quadsRoughlyAgree(mlOrientation.canvasPts, cvOnRotated.points)) {
            // 서로 다른 두 방법이 (기울기 보정 후) 같은 위치를 가리켰으니 안심하고 확정,
            // 뒤 단계(Gemini AI)는 건너뛴다.
            (img as any).__detectedCorners = mlOrientation.originalPts;
            setIsDetecting(false);
            setAutoDetected(true);
            setMlConfirmed(true);
            return;
          }

          // 회전 보정된 프레임에서도 교차검증이 안 됐다면, 마지막으로 원본(기울어진) 프레임의
          // OpenCV 결과와도 비교해본다 (기존 로직과 동일한 안전망).
          if (cvOnOriginal && quadsRoughlyAgree(mlPts!, cvOnOriginal.points)) {
            (img as any).__detectedCorners = mlPts;
            setIsDetecting(false);
            setAutoDetected(true);
            setMlConfirmed(true);
            return;
          }
        }

        // 교차 검증에 실패했거나(ML/OpenCV 결과가 서로 다름, 또는 둘 중 하나가 실패) 아직 확신할
        // 수 없는 상태 — 일단 더 정교한 쪽(ML 결과가 있으면 ML, 없으면 OpenCV)을 화면에 먼저
        // 보여주고, 표시 크기 계산은 아래 별도 effect(리사이즈 감지)에서 처리된다.
        const initialPts = mlPts || cvOnOriginal?.points || null;
        setIsDetecting(false);
        setAutoDetected(!!initialPts);
        if (initialPts) {
          (img as any).__detectedCorners = initialPts;
        }

        // [추가] OpenCV 결과를 먼저 화면에 보여준 뒤(속도), OpenCV 스스로 확신이 높고(confident)
        // ML이 애초에 경쟁 후보를 내놓지 못했을 때만(=mlOk가 false) Gemini AI 확인을 건너뛴다.
        // ML이 뭔가를 내놨는데 OpenCV와 위치가 다르다면(교차 검증 실패), 서로 다른 두 "확신"이
        // 충돌하는 상황이므로 OpenCV 자체 확신만으로는 안심할 수 없다 — 이 AI 호출도 하루 20회짜리
        // 무료 할당량을 명함 OCR과 같이 나눠 쓰기 때문에, 확실한 케이스까지 매번 부르면 정작
        // 필요한 스캔(OCR) 자체가 할당량 부족으로 실패할 수 있어 애매하거나 충돌하는 케이스에만
        // 아껴서 쓴다.
        if (!mlOk && cvOnOriginal?.confident) {
          setCvConfident(true);
          return;
        }
        setAiRefining(true);
        const aiCorners = await fetchAiCornersNormalized(fixedUrl);
        if (!cancelled) setAiRefining(false);
        if (cancelled || !aiCorners || userAdjustedRef.current) return;

        const aiNaturalPts: Point[] = [
          { x: aiCorners.topLeft.x * img.naturalWidth, y: aiCorners.topLeft.y * img.naturalHeight },
          { x: aiCorners.topRight.x * img.naturalWidth, y: aiCorners.topRight.y * img.naturalHeight },
          { x: aiCorners.bottomRight.x * img.naturalWidth, y: aiCorners.bottomRight.y * img.naturalHeight },
          { x: aiCorners.bottomLeft.x * img.naturalWidth, y: aiCorners.bottomLeft.y * img.naturalHeight }
        ];
        (img as any).__detectedCorners = aiNaturalPts;
        setAutoDetected(true);
        setAiConfirmed(true);
        const { width: dw, height: dh } = displaySizeRef.current;
        if (dw > 0 && dh > 0) {
          const scaleX = dw / img.naturalWidth;
          const scaleY = dh / img.naturalHeight;
          setCorners(aiNaturalPts.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY })));
        }
      };
      img.onerror = () => { if (!cancelled) setIsDetecting(false); };
      img.src = fixedUrl;
    })();
    return () => { cancelled = true; };
  }, [imageDataUrl]);

  // 컨테이너 크기에 맞춰 이미지 표시 크기 계산 및 모서리 좌표를 표시 좌표계로 변환
  // [수정] 예전엔 window의 resize 이벤트가 뜰 때마다 사용자가 손으로 맞춰둔 테두리를 무시하고
  // 자동 감지(또는 기본 여백) 위치로 되돌려버렸다. 문제는 모바일 사파리에서 화면을 터치/스크롤하면
  // 주소창이 나타났다 사라지면서 "가짜 resize 이벤트"가 자주 발생한다는 점이다 — 그때마다 사용자가
  // 방금 조정한 내용이 사라지고 다시 넓은 기본 박스로 돌아가버렸다(=조정 중 갑자기 커지는 현상).
  // 이제는 최초 1회만 자동 감지/기본 위치로 초기화하고, 그 이후 크기가 실제로 바뀌면 사용자가
  // 조정해둔 테두리를 "비율에 맞게 그대로 유지"한 채 옮긴다.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!imgEl || !containerRef.current) return;
    initializedRef.current = false;

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

      setDisplaySize((prevSize) => {
        // 이미 초기화된 뒤, 크기가 실질적으로 안 바뀌었다면(모바일 주소창 표시/숨김 등 가짜 resize)
        // 아무것도 하지 않고 사용자가 조정 중이던 테두리를 그대로 둔다.
        if (initializedRef.current && Math.abs(prevSize.width - w) < 2 && Math.abs(prevSize.height - h) < 2) {
          return prevSize;
        }

        if (initializedRef.current && prevSize.width > 0 && prevSize.height > 0) {
          // 실제로 크기가 바뀐 경우: 기존에 사용자가 맞춰둔 테두리를 새 크기 비율에 맞게 그대로 옮긴다
          const scaleX = w / prevSize.width;
          const scaleY = h / prevSize.height;
          setCorners((prevCorners) => (prevCorners ? prevCorners.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY })) : prevCorners));
        } else {
          // 최초 1회만: 자동 감지 결과 또는 기본 여백 박스로 초기화
          const scaleX = w / imgEl.naturalWidth;
          const scaleY = h / imgEl.naturalHeight;
          const detected = (imgEl as any).__detectedCorners as Point[] | undefined;
          if (detected) {
            setCorners(detected.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY })));
          } else {
            const margin = 0.08;
            setCorners([
              { x: w * margin, y: h * margin },
              { x: w * (1 - margin), y: h * margin },
              { x: w * (1 - margin), y: h * (1 - margin) },
              { x: w * margin, y: h * (1 - margin) }
            ]);
          }
        }

        initializedRef.current = true;
        return { width: w, height: h };
      });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [imgEl]);

  const handlePointerDown = (idx: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    userAdjustedRef.current = true;
    setDragIndex(idx);
  };

  // [수정] 사각형 안쪽(테두리 선/채워진 영역)을 누르면 네 점을 통째로 같은 방향으로 이동시킨다.
  // 모서리 점을 하나씩 맞출 필요 없이, 대략적인 위치는 이 방법으로 한 번에 맞출 수 있다.
  const handlePolygonPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    userAdjustedRef.current = true;
    setIsDraggingAll(true);
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
  };

  // [수정] 변 중간 손잡이를 누르면 그 변을 이루는 두 점만 같이 이동시킨다 (위/아래/왼쪽/오른쪽만 조정)
  const handleEdgePointerDown = (edgeIdx: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    userAdjustedRef.current = true;
    setDragEdge(edgeIdx);
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!containerRef.current || !corners) return;

    if (isDraggingAll && lastPointerRef.current) {
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      setCorners((prev) => {
        if (!prev) return prev;
        // 사각형 전체의 경계 상자를 구해서, 이동해도 화면(이미지) 밖으로 나가지 않도록 이동량을 제한한다.
        // (점마다 다르게 자르면 사각형 모양이 일그러지므로, dx/dy를 전체에 동일하게 적용해야 모양이 유지된다)
        const xs = prev.map((p) => p.x);
        const ys = prev.map((p) => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        let clampedDx = dx;
        let clampedDy = dy;
        if (minX + clampedDx < 0) clampedDx = -minX;
        if (maxX + clampedDx > displaySize.width) clampedDx = displaySize.width - maxX;
        if (minY + clampedDy < 0) clampedDy = -minY;
        if (maxY + clampedDy > displaySize.height) clampedDy = displaySize.height - maxY;
        return prev.map((p) => ({ x: p.x + clampedDx, y: p.y + clampedDy }));
      });
      return;
    }

    if (dragEdge !== null && lastPointerRef.current) {
      const rawDx = e.clientX - lastPointerRef.current.x;
      const rawDy = e.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      // [수정] 예전엔 손가락/마우스가 움직인 방향(dx, dy) 그대로를 두 꼭짓점 모두에 적용해서,
      // 위/아래 변을 잡고 옆으로 살짝만 삐뚤게 움직여도 그 변의 양쪽 꼭짓점이 옆으로도 같이
      // 밀려버렸다(그러면 사각형이 아니라 마름모/사다리꼴처럼 일그러진다). 이제는 변의
      // 방향에 맞는 축으로만 이동을 제한한다: 위/아래 변(edgeIdx 0,2)은 위아래로만,
      // 좌/우 변(edgeIdx 1,3)은 좌우로만 움직이게 해서, 반대쪽 두 꼭짓점은 그 축 방향으로는
      // 절대 안 움직이고 정확히 그 변만 늘었다 줄었다 한다.
      const isHorizontalEdge = dragEdge === 0 || dragEdge === 2; // 위/아래 변 -> 세로로만 이동
      const dx = isHorizontalEdge ? 0 : rawDx;
      const dy = isHorizontalEdge ? rawDy : 0;
      setCorners((prev) => {
        if (!prev) return prev;
        const idxs = EDGE_POINT_INDEXES[dragEdge];
        const pts = idxs.map((i) => prev[i]);
        const minX = Math.min(...pts.map((p) => p.x));
        const maxX = Math.max(...pts.map((p) => p.x));
        const minY = Math.min(...pts.map((p) => p.y));
        const maxY = Math.max(...pts.map((p) => p.y));
        let clampedDx = dx;
        let clampedDy = dy;
        if (minX + clampedDx < 0) clampedDx = -minX;
        if (maxX + clampedDx > displaySize.width) clampedDx = displaySize.width - maxX;
        if (minY + clampedDy < 0) clampedDy = -minY;
        if (maxY + clampedDy > displaySize.height) clampedDy = displaySize.height - maxY;
        const next = [...prev];
        idxs.forEach((i) => {
          next[i] = { x: prev[i].x + clampedDx, y: prev[i].y + clampedDy };
        });
        return next;
      });
      return;
    }

    if (dragIndex === null) return;
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
  }, [dragIndex, isDraggingAll, dragEdge, corners, displaySize]);

  const handlePointerUp = () => {
    setDragIndex(null);
    setIsDraggingAll(false);
    setDragEdge(null);
    lastPointerRef.current = null;
  };

  const handleConfirm = async () => {
    if (!imgEl || !corners) {
      onConfirm(await resizeDataUrl(normalizedUrl || imageDataUrl));
      return;
    }
    setIsProcessing(true);
    setWarpError(null);
    try {
      const scaleX = imgNaturalRef.current.width / displaySize.width;
      const scaleY = imgNaturalRef.current.height / displaySize.height;
      const naturalCorners = corners.map((p) => ({ x: p.x * scaleX, y: p.y * scaleY }));
      const cropped = await warpToCorners(imgEl, naturalCorners, expectedAspectRatio);
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
    onConfirm(await resizeDataUrl(normalizedUrl || imageDataUrl));
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
    <div className="fixed inset-0 z-[200] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-bold text-slate-100">{title || '테두리 확인 및 조정'}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">안쪽을 밀어 전체 위치를, 네모 손잡이로 위/아래/좌우 한 변씩, 동그란 점으로 모서리를 조정하세요</p>
            {autoDetected !== null && (
              <p className="text-[10px] font-mono mt-0.5 text-lime-500">
                자동감지: {(() => {
                  // [추가] 지금 보이는 사각형이 빠른 OpenCV 추정인지, Gemini AI로 한 번 더
                  // 확인된 결과인지를 그대로 알려준다 — "성공"이라고 무조건 확신하는 문구 대신,
                  // 실제 신뢰도를 사용자가 판단할 수 있게 한다.
                  if (!autoDetected) return '실패 (기본 위치 - 직접 맞춰주세요)';
                  if (mlConfirmed) return 'AI 모델로 확인됨 (그래도 다르면 직접 드래그로 수정)';
                  if (aiConfirmed) return 'AI로 재확인됨 (그래도 다르면 직접 드래그로 수정)';
                  if (cvConfident) return '성공 (파란 사각형이 명함이 아니면 직접 드래그로 수정)';
                  if (aiRefining) return '성공 (빠른 추정 - AI로 정밀 확인 중...)';
                  return '성공 (빠른 추정 - 파란 사각형이 명함이 아니면 직접 드래그로 수정)';
                })()}
              </p>
            )}
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
              <img src={normalizedUrl || imageDataUrl} alt="크롭 대상" className="w-full h-full object-contain select-none pointer-events-none" draggable={false} />
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
                    style={{ cursor: 'move', touchAction: 'none', pointerEvents: 'all' }}
                    onPointerDown={handlePolygonPointerDown}
                  />
                  {EDGE_POINT_INDEXES.map(([i1, i2], edgeIdx) => {
                    const p1 = corners[i1];
                    const p2 = corners[i2];
                    const mx = (p1.x + p2.x) / 2;
                    const my = (p1.y + p2.y) / 2;
                    return (
                      <rect
                        key={edgeIdx}
                        x={mx - 9}
                        y={my - 9}
                        width={18}
                        height={18}
                        rx={5}
                        fill="#a5b4fc"
                        stroke="white"
                        strokeWidth={1.5}
                        style={{ cursor: EDGE_CURSORS[edgeIdx], touchAction: 'none', pointerEvents: 'all' }}
                        onPointerDown={handleEdgePointerDown(edgeIdx)}
                      />
                    );
                  })}
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
            onClick={async () => onConfirm(await resizeDataUrl(normalizedUrl || imageDataUrl))}
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
