import { useEffect } from 'react';

// 창(모달)이 열려 있는 동안 페이지 전체 스크롤을 잠근다.
// 아이폰은 입력칸을 누르면 페이지를 스크롤해서 고정 요소(상단·하단 탭)의 위치가 어긋나므로,
// body를 고정시켜 페이지가 움직이지 않게 하고, 닫힐 때 원래 스크롤 위치로 되돌린다.
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const body = document.body;
    const y = window.scrollY;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = 'fixed';
    body.style.top = `-${y}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, y);
    };
  }, [active]);
}
