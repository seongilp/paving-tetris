// 라이트박스 캔버스 크기 계산 — 순수 함수라 DOM 없이 유닛 테스트 가능
const MOBILE_MAX_RATIO = 0.9; // 화면 폭의 90%
const DESKTOP_MAX_WIDTH = 520; // 데스크톱에서 더 커지지 않도록 상한

// 뷰포트 폭 기준으로 라이트박스가 차지할 최대 폭(px)
export function lightboxMaxWidth(viewportWidth) {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return DESKTOP_MAX_WIDTH;
  return Math.min(viewportWidth * MOBILE_MAX_RATIO, DESKTOP_MAX_WIDTH);
}

// 격자 비율(cols x rows)을 유지하면서 폭에 맞는 셀 크기(px, 정수)를 구한다
export function lightboxCell(viewportWidth, cols) {
  const maxWidth = lightboxMaxWidth(viewportWidth);
  return Math.max(1, Math.floor(maxWidth / cols));
}
