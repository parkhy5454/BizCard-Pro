// [신규] 에러 처리 타입 및 클래스 정의

export type ErrorCode = 'VALIDATION_ERROR' | 'AUTHENTICATION_ERROR' | 'AUTHORIZATION_ERROR' | 'NOT_FOUND_ERROR' | 'NETWORK_ERROR' | 'SERVER_ERROR' | 'APPROVAL_REQUIRED' | 'EMAIL_VERIFICATION_REQUIRED';

export interface ErrorResponse {
  error: string;
  code: ErrorCode;
  statusCode: number;
  timestamp: string;
  details?: Record<string, unknown>;
}

export class AppError extends Error {
  code: ErrorCode;
  statusCode: number;
  details?: Record<string, unknown>;

  constructor(message: string, code: ErrorCode = 'SERVER_ERROR', statusCode: number = 500, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON(): ErrorResponse {
    return { error: this.message, code: this.code, statusCode: this.statusCode, timestamp: new Date().toISOString(), details: this.details };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = '로그인이 필요합니다.') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = '접근 권한이 없습니다.') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

export class ApprovalRequiredError extends AppError {
  constructor(message: string = '회사 관리자 승인이 필요합니다.') {
    super(message, 'APPROVAL_REQUIRED', 403);
    Object.setPrototypeOf(this, ApprovalRequiredError.prototype);
  }
}

export class EmailVerificationRequiredError extends AppError {
  constructor(message: string = '이메일 인증이 필요합니다.') {
    super(message, 'EMAIL_VERIFICATION_REQUIRED', 403);
    Object.setPrototypeOf(this, EmailVerificationRequiredError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = '요청한 항목을 찾을 수 없습니다.') {
    super(message, 'NOT_FOUND_ERROR', 404);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class NetworkError extends AppError {
  constructor(message: string = '네트워크 연결 오류입니다.') {
    super(message, 'NETWORK_ERROR', 503);
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) {
    if (error.message.includes('network') || error.message.includes('fetch')) return new NetworkError(error.message);
    return new AppError(error.message, 'SERVER_ERROR', 500);
  }
  return new AppError(String(error) || '알 수 없는 오류가 발생했습니다.', 'SERVER_ERROR', 500);
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
  timestamp: string;
}

export interface ApiError {
  success: false;
  error: string;
  code: ErrorCode;
  timestamp: string;
  details?: Record<string, unknown>;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function createSuccessResponse<T>(data: T, message?: string): ApiSuccess<T> {
  return { success: true, data, message, timestamp: new Date().toISOString() };
}

export function createErrorResponse(error: AppError | Error | string): ApiError {
  if (typeof error === 'string') {
    const appError = new AppError(error);
    return { success: false, error: appError.message, code: appError.code, timestamp: new Date().toISOString() };
  }
  if (error instanceof AppError) {
    return { success: false, error: error.message, code: error.code, timestamp: new Date().toISOString(), details: error.details };
  }
  return { success: false, error: error.message || 'Unknown error', code: 'SERVER_ERROR', timestamp: new Date().toISOString() };
}
