import { defineConfig } from 'vitest/config';

// [수정] 테스트 자동화 시작점. 지금은 DOM/서버 없이도 돌아가는 "순수 로직" 함수들만
// 우선 테스트한다(중복 명함 감지, 스캔 좌표 유효성 검사 등). 이런 함수들은 오늘 겪었던
// "고쳤는데 다른 게 깨졌다" 같은 사고가 나기 쉬운 대표적인 지점이라, 여기부터 시작하는 게
// 투자 대비 효과가 가장 크다. 컴포넌트 렌더링 테스트나 서버 API 테스트는 필요성이 커지면
// (사용자/기능이 늘어나면) 이 설정을 기반으로 확장하면 된다.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: true
  }
});
