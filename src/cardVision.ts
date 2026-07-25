// 명함/영수증 등 문서 스캔을 위한 실시간 컴퓨터비전 유틸리티.
// OpenCV.js(WASM)를 @techstark/opencv-js 패키지로 지연 로딩해서 사용한다.
// (동적 import()를 쓰면 Vite가 자동으로 별도 청크로 분리해서, 스캔 화면을 열 때만 내려받는다.)
//
// 제공 기능:
//  - loadOpenCv(): OpenCV.js 지연 로딩
//  - detectQuad(): 카메라 프레임에서 문서로 보이는 사각형(네 모서리) 실시간 탐지
//  - warpToRect(): 탐지된 네 모서리를 기준으로 perspective transform 적용 (비스듬한 문서를 정면 직사각형으로 보정)
//  - computeBlurScore() / computeBrightness() / computeGlareRatio(): 초점/밝기/반사광 품질 체크
//  - enhanceMat(): 대비/선명도 보정 + 약한 노이즈 제거

export type Point = [number, number];
export type Quad = [Point, Point, Point, Point]; // [좌상, 우상, 우하, 좌하] 순서

export interface DetectedQuad {
  points: Quad;
  areaRatio: number; // 프레임 전체 넓이 대비 감지된 사각형 넓이 비율 (0~1)
}

let openCvPromise: Promise<any> | null = null;

// OpenCV.js를 지연 로딩. 여러 컴포넌트에서 동시에 호출해도 한 번만 로딩되도록 프로미스를 캐시한다.
// [수정] 네트워크 순간 오류로 로딩이 실패하는 경우를 대비해, 실패 시 한 번 더 자동으로 재시도한다.
export function loadOpenCv(): Promise<any> {
  const w = window as any;
  if (w.cv && w.cv.Mat) return Promise.resolve(w.cv);
  if (openCvPromise) return openCvPromise;

  const attemptLoad = async (): Promise<any> => {
    // @ts-ignore - CommonJS/UMD 패키지라 타입 선언이 완전히 맞지 않을 수 있음
    const mod: any = await import('@techstark/opencv-js');
    let cv = (mod && (mod.default ?? mod)) as any;

    // 이 패키지는 cv 자체가 Promise이거나(WASM 런타임 초기화까지 기다리는 형태),
    // 이미 준비된 객체이거나, onRuntimeInitialized 콜백을 기다려야 하는 경우가 있다.
    if (cv && typeof cv.then === 'function') {
      cv = await cv;
    } else if (cv && !cv.Mat) {
      await new Promise<void>((resolve) => {
        cv.onRuntimeInitialized = () => resolve();
      });
    }

    if (!cv || !cv.Mat) throw new Error('OpenCV 모듈 초기화에 실패했습니다.');
    w.cv = cv;
    return cv;
  };

  // [수정] npm 패키지 방식(ES 모듈 동적 import)이 특정 브라우저/네트워크 환경에서 반복적으로
  // 실패하는 경우를 대비해, 완전히 다른 방식(공식 OpenCV.js CDN을 <script> 태그로 직접 삽입)으로
  // 한 번 더 시도하는 최후의 수단을 추가한다. 두 경로 모두 실패해야만 진짜로 실패로 처리된다.
  const attemptLoadFromCdn = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      const w2 = window as any;
      if (w2.cv && w2.cv.Mat) { resolve(w2.cv); return; }

      const existing = document.getElementById('opencv-cdn-fallback-script') as HTMLScriptElement | null;
      if (existing) {
        // 이미 스크립트 태그가 붙어있다면(이전 시도 잔재) 초기화 완료를 폴링으로 기다린다
        const started = Date.now();
        const check = () => {
          if (w2.cv && w2.cv.Mat) { resolve(w2.cv); return; }
          if (Date.now() - started > 20000) { reject(new Error('CDN 폴백에서 OpenCV.js 초기화 시간 초과')); return; }
          window.setTimeout(check, 250);
        };
        check();
        return;
      }

      const script = document.createElement('script');
      script.id = 'opencv-cdn-fallback-script';
      script.src = 'https://docs.opencv.org/4.9.0/opencv.js';
      script.async = true;
      script.onload = () => {
        const w3 = window as any;
        if (w3.cv && w3.cv.Mat) { resolve(w3.cv); return; }
        if (w3.cv) {
          w3.cv.onRuntimeInitialized = () => resolve(w3.cv);
        } else {
          reject(new Error('CDN 스크립트는 로드됐지만 cv 객체를 찾지 못했습니다.'));
        }
      };
      script.onerror = () => reject(new Error('CDN에서 OpenCV.js 스크립트 로딩 자체에 실패했습니다.'));
      document.head.appendChild(script);
    });
  };

  const withTimeout = (task: Promise<any>, ms: number) => Promise.race([
    task,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error(`OpenCV.js 초기화가 시간 내에 끝나지 않았습니다 (${Math.round(ms / 1000)}초 초과).`)), ms);
    })
  ]);

  const loadWithRetry = async () => {
    try {
      return await withTimeout(attemptLoad(), 18000);
    } catch (firstErr) {
      console.warn('OpenCV.js 1차 로딩 실패, 한 번 더 시도합니다:', firstErr);
      try {
        return await withTimeout(attemptLoad(), 22000);
      } catch (secondErr) {
        console.warn('OpenCV.js 2차 로딩(같은 방식)도 실패, CDN 폴백으로 마지막 시도합니다:', secondErr);
        return await withTimeout(attemptLoadFromCdn(), 25000);
      }
    }
  };

  openCvPromise = loadWithRetry().catch((err) => {
    openCvPromise = null; // 재시도까지 모두 실패한 경우, 다음 진입 때 다시 로딩을 시도할 수 있도록 캐시를 비운다
    throw err;
  });

  return openCvPromise;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

// 순서 없는 4개 점을 [좌상, 우상, 우하, 좌하] 순서로 정렬
function orderQuadPoints(pts: Point[]): Quad {
  const sums = pts.map((p) => p[0] + p[1]);
  const diffs = pts.map((p) => p[0] - p[1]);
  const tl = pts[sums.indexOf(Math.min(...sums))];
  const br = pts[sums.indexOf(Math.max(...sums))];
  const tr = pts[diffs.indexOf(Math.max(...diffs))];
  const bl = pts[diffs.indexOf(Math.min(...diffs))];
  return [tl, tr, br, bl];
}

function quadAspectRatio(q: Quad): number {
  const [tl, tr, br, bl] = q;
  const w = (dist(tl, tr) + dist(bl, br)) / 2;
  const h = (dist(tl, bl) + dist(tr, br)) / 2;
  return w / Math.max(h, 1);
}

// 카메라 프레임(cv.Mat)에서 문서로 보이는 사각형을 찾는다.
// targetAspect: 찾고자 하는 문서의 가로:세로 비율(예: 명함 ≈ 1.586). 비율이 가까울수록, 넓이가 클수록 높은 점수.
// [수정] 명함/영수증이 가까이서 배경과 색·명암 대비가 약할 때, Canny(경계선 명암차 기반) 방식
// 하나로는 아무리 민감도를 조절해도 실패하는 경우가 있었다(예: 크림색 명함 + 회색 벽처럼
// 전체적인 명암 차이가 약한 조합). 그래서 Canny 민감도를 단계적으로 낮춰가며 재시도하는 것에
// 더해, 완전히 다른 방식인 "적응형 이진화(adaptive threshold)"도 마지막 안전장치로 추가했다.
// 적응형 이진화는 화면 전체의 밝기 차이가 아니라 "주변 지역과 비교해 밝은지 어두운지"를 보기
// 때문에, 전체 대비가 약해도 그 지역 안에서의 미세한 밝기 차이만으로 경계를 찾아낼 수 있다.
type DetectionStrategy =
  | { mode: 'canny'; low: number; high: number }
  | { mode: 'adaptive'; blockSize: number; C: number };

const DETECTION_STRATEGY_LADDER: DetectionStrategy[] = [
  { mode: 'canny', low: 45, high: 140 }, // 기본: 또렷한 대비에 적합
  { mode: 'canny', low: 25, high: 90 },  // 완화: 대비가 약한 상황에서 흐릿한 경계선도 더 쉽게 잡음
  { mode: 'canny', low: 15, high: 60 },  // 더 완화
  { mode: 'adaptive', blockSize: 35, C: 5 } // 최후 수단: 전체 대비가 아닌 지역별 밝기 차이로 재시도
];

function detectQuadOnce(
  cv: any,
  srcMat: any,
  targetAspect: number,
  strategy: DetectionStrategy
): { quad: Quad; score: number; areaRatio: number } | null {
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const dilated = new cv.Mat();
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
  const closeKernel = cv.Mat.ones(9, 9, cv.CV_8U);
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  let best: { quad: Quad; score: number; areaRatio: number } | null = null;
  // [수정] 영수증처럼 얇은 종이는 살짝 휘거나 구겨져 있어서 윤곽선이 "정확히 꼭짓점 4개"로
  // 딱 떨어지지 않는 경우가 많다. 그런 경우를 위해, 화면에서 가장 큰 덩어리를 감싸는
  // 최소 회전 사각형(minAreaRect)을 마지막 안전장치로 준비해둔다.
  let fallback: { quad: Quad; areaRatio: number } | null = null;

  try {
    cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    if (strategy.mode === 'canny') {
      cv.Canny(blurred, edges, strategy.low, strategy.high);
      cv.dilate(edges, dilated, kernel);
    } else {
      // 적응형 이진화: 화면 전체가 아니라 각 지점 주변(blockSize)의 평균 밝기와 비교해서
      // 그 지점이 상대적으로 밝은지/어두운지를 판단한다. 그 후 작은 잡음(글씨, 로고 디테일)은
      // 형태학적 닫힘(close) 연산으로 뭉개서, 카드 전체가 하나의 매끈한 덩어리로 보이게 한다.
      cv.adaptiveThreshold(blurred, edges, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY, strategy.blockSize, strategy.C);
      cv.morphologyEx(edges, dilated, cv.MORPH_CLOSE, closeKernel);
    }

    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const frameArea = srcMat.cols * srcMat.rows;
    const epsilonFactors = [0.02, 0.01, 0.03, 0.05]; // 윤곽선마다 여러 근사값을 시도해 4점으로 떨어질 확률을 높인다

    const frameCenterX = srcMat.cols / 2;
    const frameCenterY = srcMat.rows / 2;
    const frameDiag = Math.hypot(frameCenterX, frameCenterY);

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const peri = cv.arcLength(cnt, true);
      if (peri <= 0) { cnt.delete(); continue; }

      // 정확히 4점으로 떨어지는 윤곽선을 찾는 기존 로직과는 별개로, 이 윤곽선의 실제 면적이
      // 지금까지의 폴백 후보보다 크면 minAreaRect(회전된 최소 사각형)를 미리 계산해 저장해둔다.
      // (아래에서 4점 근사가 하나도 안 나올 경우에만 이 폴백을 최종적으로 사용한다)
      try {
        const rawArea = Math.abs(cv.contourArea(cnt));
        const rawAreaRatio = rawArea / frameArea;
        if (rawAreaRatio > 0.05 && rawAreaRatio < 0.99 && (!fallback || rawAreaRatio > fallback.areaRatio)) {
          const rotRect = cv.minAreaRect(cnt);
          const angleRad = (rotRect.angle * Math.PI) / 180;
          const cos = Math.cos(angleRad);
          const sin = Math.sin(angleRad);
          const hw = rotRect.size.width / 2;
          const hh = rotRect.size.height / 2;
          const corners: Point[] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([dx, dy]) => [
            rotRect.center.x + dx * cos - dy * sin,
            rotRect.center.y + dx * sin + dy * cos
          ] as Point);
          fallback = { quad: orderQuadPoints(corners), areaRatio: rawAreaRatio };
        }
      } catch {
        // minAreaRect 계산이 실패해도(드물게 점 개수가 너무 적은 경우 등) 전체 인식은 계속 진행
      }

      for (const factor of epsilonFactors) {
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, factor * peri, true);

        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          const area = Math.abs(cv.contourArea(approx));
          const areaRatio = area / frameArea;
          // [수정] 화면의 5%~99% 사이 크기로 허용 범위 확대 (명함이 화면에 작게 잡히거나,
          // 반대로 화면에 꽉 차게 가까이 잡혀도 후보로 인정되도록)
          if (areaRatio > 0.05 && areaRatio < 0.99) {
            const pts: Point[] = [];
            for (let j = 0; j < 4; j++) {
              pts.push([approx.data32S[j * 2], approx.data32S[j * 2 + 1]]);
            }
            const ordered = orderQuadPoints(pts);
            const aspect = quadAspectRatio(ordered);
            const aspectDiff = Math.min(Math.abs(aspect - targetAspect) / targetAspect, 1);

            // 사용자가 화면 중앙에 문서를 놓는다고 가정하고, 중앙에서 먼 후보(책상 모서리, 문틀 등 배경
            // 요소가 크기/비율만으로 우연히 점수가 높게 나오는 경우)는 불리하게 만든다.
            // [수정] 감점 폭을 완화해서(0.65->0.5, 0.8->0.6), 화면 중앙이 아니거나 비율이 살짝
            // 다른 경우에도 후보에서 탈락하지 않고 인식되도록 함
            const cx = (ordered[0][0] + ordered[1][0] + ordered[2][0] + ordered[3][0]) / 4;
            const cy = (ordered[0][1] + ordered[1][1] + ordered[2][1] + ordered[3][1]) / 4;
            const centerDist = Math.min(Math.hypot(cx - frameCenterX, cy - frameCenterY) / frameDiag, 1);

            const score = areaRatio * (1 - aspectDiff * 0.5) * (1 - centerDist * 0.6);
            if (!best || score > best.score) {
              best = { quad: ordered, score, areaRatio };
            }
          }
          approx.delete();
          break; // 이 윤곽선에서 4점 근사를 찾았으니 다음 epsilon은 시도할 필요 없음
        }
        approx.delete();
      }
      cnt.delete();
    }

    // 정확히 4점으로 떨어지는 윤곽선을 하나도 못 찾았다면(휘거나 구겨진 영수증 등),
    // 가장 큰 덩어리를 감싸는 최소 사각형을 대신 사용한다.
    if (!best && fallback) {
      best = { quad: fallback.quad, score: fallback.areaRatio, areaRatio: fallback.areaRatio };
    }
  } finally {
    gray.delete();
    blurred.delete();
    edges.delete();
    dilated.delete();
    kernel.delete();
    closeKernel.delete();
    contours.delete();
    hierarchy.delete();
  }

  return best;
}

export function detectQuad(cv: any, srcMat: any, targetAspect: number): DetectedQuad | null {
  // 기본 민감도부터 순서대로 시도하고, 뭔가 찾아지는 순간 바로 반환한다.
  // (대부분의 경우 첫 번째 시도에서 바로 찾아지므로, 실시간 감지 성능에 거의 영향이 없다)
  for (const strategy of DETECTION_STRATEGY_LADDER) {
    const best = detectQuadOnce(cv, srcMat, targetAspect, strategy);
    if (best) {
      return { points: best.quad, areaRatio: best.areaRatio };
    }
  }
  return null;
}

// 탐지된 네 모서리를 기준으로 perspective transform을 적용해 정면 직사각형 이미지로 보정
export function warpToRect(cv: any, srcMat: any, quad: Quad, outW: number, outH: number): any {
  const [tl, tr, br, bl] = quad;
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl[0], tl[1], tr[0], tr[1], br[0], br[1], bl[0], bl[1]
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outW, 0, outW, outH, 0, outH]);
  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const dst = new cv.Mat();
  try {
    cv.warpPerspective(srcMat, dst, M, new cv.Size(outW, outH), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
  } finally {
    srcTri.delete();
    dstTri.delete();
    M.delete();
  }
  return dst;
}

// 초점(선명도) 점수: 라플라시안 분산. 값이 작을수록 흐릿함.
export function computeBlurScore(cv: any, mat: any): number {
  const gray = new cv.Mat();
  const lap = new cv.Mat();
  const mean = new cv.Mat();
  const stddev = new cv.Mat();
  try {
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
    cv.Laplacian(gray, lap, cv.CV_64F);
    cv.meanStdDev(lap, mean, stddev);
    return Math.pow(stddev.data64F[0], 2);
  } finally {
    gray.delete();
    lap.delete();
    mean.delete();
    stddev.delete();
  }
}

// 밝기 점수(0~255)
export function computeBrightness(cv: any, mat: any): number {
  const gray = new cv.Mat();
  try {
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
    const m = cv.mean(gray);
    return m[0];
  } finally {
    gray.delete();
  }
}

// 반사광(글레어) 비율: 거의 흰색으로 포화된 픽셀의 비율(0~1). 높을수록 반사광이 심함.
export function computeGlareRatio(cv: any, mat: any): number {
  const gray = new cv.Mat();
  const thresh = new cv.Mat();
  try {
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
    cv.threshold(gray, thresh, 248, 255, cv.THRESH_BINARY);
    const white = cv.countNonZero(thresh);
    return white / (thresh.rows * thresh.cols);
  } finally {
    gray.delete();
    thresh.delete();
  }
}

// 대비/선명도 보정 + 약한 노이즈(그림자 얼룩 등) 완화
export function enhanceMat(cv: any, mat: any): any {
  const adjusted = new cv.Mat();
  const sharpened = new cv.Mat();
  const denoised = new cv.Mat();
  try {
    // 대비(alpha)와 밝기(beta)를 살짝 보정
    mat.convertTo(adjusted, -1, 1.12, 6);

    // 언샤프 마스크 커널로 문자 경계를 또렷하게
    const kernel = cv.matFromArray(3, 3, cv.CV_32FC1, [0, -1, 0, -1, 5, -1, 0, -1, 0]);
    cv.filter2D(adjusted, sharpened, -1, kernel);
    kernel.delete();

    // 경계는 보존하면서 잡음/그림자 얼룩만 완화
    cv.bilateralFilter(sharpened, denoised, 5, 35, 35);

    const result = new cv.Mat();
    denoised.copyTo(result);
    return result;
  } finally {
    adjusted.delete();
    sharpened.delete();
    denoised.delete();
  }
}

export function matToDataUrl(cv: any, mat: any, quality = 0.88): string {
  const canvas = document.createElement('canvas');
  canvas.width = mat.cols;
  canvas.height = mat.rows;
  cv.imshow(canvas, mat);
  return canvas.toDataURL('image/jpeg', quality);
}
