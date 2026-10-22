// 에러 객체(catch의 err)에서 사람이 읽을 메시지를 안전하게 꺼낸다.
// catch 변수는 타입을 알 수 없으므로(unknown) 이 함수로 확인 후 사용한다.
export const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  // 메시지를 찾지 못한 객체는 빈 문자열로 둬서 호출하는 쪽의 기본 문구가 쓰이게 한다
  if (err && typeof err === 'object') return '';
  return err == null ? '' : String(err);
};

// 에러 객체에서 특정 속성(status, code, name 등)을 타입 안전하게 꺼낸다. 없으면 undefined.
export const getErrorField = (err: unknown, key: string): unknown => {
  if (err && typeof err === 'object' && key in err) {
    return (err as Record<string, unknown>)[key];
  }
  return undefined;
};
