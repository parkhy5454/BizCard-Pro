// 명함/영수증 등 문서 스캔을 위한 실시간 컴퓨터비전 유틸리티.
// OpenCV.js(WASM)를 브라우저에서 지연 로딩해서 사용한다 (번들 크기 때문에 스캔 화면을 열 때만 불러옴).
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

// OpenCV.js를 CDN에서 지연 로딩. 여러 컴포넌트에서 동시에 호출해도 한 번만 로딩되도록 프로미스를 캐시한다.
export function loadOpenCv(): Promise<any> {
  const w = window as any;
  if (w.cv && w.cv.Mat) return Promise.resolve(w.cv);
  if (openCvPromise) return openCvPromise;

  openCvPromise = new Promise((resolve, reject) => {
    const resolveWhenReady = () => {
      const cv = w.cv;
      if (!cv) { reject(new Error('OpenCV 전역 객체를 찾을 수 없습니다.')); return; }
      // opencv.js 빌드에 따라 cv 자체가 Promise이거나(then 지원), onRuntimeInitialized 콜백 방식이거나, 이미 준비된 경우가 있다.
      if (typeof cv.then === 'function') {
        cv.then((resolvedCv: any) => resolve(resolvedCv));
      } else if (cv.Mat) {
        resolve(cv);
      } else {
        cv['onRuntimeInitialized'] = () => resolve(cv);
      }
    };

    const existing = document.getElementById('opencv-js-lib') as HTMLScriptElement | null;
    if (existing) {
      if (w.cv?.Mat) { resolve(w.cv); return; }
      existing.addEventListener('load', resolveWhenReady);
      existing.addEventListener('error', () => reject(new Error('OpenCV.js 로드에 실패했습니다.')));
      return;
    }

    const script = document.createElement('script');
    script.id = 'opencv-js-lib';
    script.src = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js';
    script.async = true;
    script.onload = resolveWhenReady;
    script.onerror = () => reject(new Error('OpenCV.js 로드에 실패했습니다.'));
    document.body.appendChild(script);
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
export function detectQuad(cv: any, srcMat: any, targetAspect: number): DetectedQuad | null {
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const dilated = new cv.Mat();
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  let best: { quad: Quad; score: number; areaRatio: number } | null = null;

  try {
    cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 45, 140);
    cv.dilate(edges, dilated, kernel);
    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const frameArea = srcMat.cols * srcMat.rows;
    const epsilonFactors = [0.02, 0.01, 0.03, 0.05]; // 윤곽선마다 여러 근사값을 시도해 4점으로 떨어질 확률을 높인다

    for (let i = 0; i < contours.size(); i++) {
      const cnt = contours.get(i);
      const peri = cv.arcLength(cnt, true);
      if (peri <= 0) { cnt.delete(); continue; }

      for (const factor of epsilonFactors) {
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, factor * peri, true);

        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          const area = Math.abs(cv.contourArea(approx));
          const areaRatio = area / frameArea;
          // 화면의 8%~95% 사이 크기만 후보로 (너무 작으면 노이즈, 너무 크면 화면 테두리 자체를 잡은 것)
          if (areaRatio > 0.08 && areaRatio < 0.95) {
            const pts: Point[] = [];
            for (let j = 0; j < 4; j++) {
              pts.push([approx.data32S[j * 2], approx.data32S[j * 2 + 1]]);
            }
            const ordered = orderQuadPoints(pts);
            const aspect = quadAspectRatio(ordered);
            const aspectDiff = Math.min(Math.abs(aspect - targetAspect) / targetAspect, 1);
            const score = areaRatio * (1 - aspectDiff * 0.65);
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
  } finally {
    gray.delete();
    blurred.delete();
    edges.delete();
    dilated.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();
  }

  return best ? { points: best.quad, areaRatio: best.areaRatio } : null;
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
