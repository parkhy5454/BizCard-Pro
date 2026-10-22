// OpenCV.js(@techstark/opencv-js) 모듈의 타입. 사진 처리 코드에서 any 대신 쓴다.
import type * as CvNs from '@techstark/opencv-js';

export type CvModule = typeof CvNs;
export type CvMat = CvNs.Mat;
