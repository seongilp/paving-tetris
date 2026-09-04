// 게시판 표시용 순수 포맷 함수
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

export function relativeTime(at, now = Date.now()) {
  const diff = Math.max(0, now - at);
  if (diff < 10 * 1000) return '방금';
  if (diff < MINUTE) return `${Math.floor(diff / 1000)}초 전`;
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}분 전`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}시간 전`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)}일 전`;
  if (diff < 5 * WEEK) return `${Math.floor(diff / WEEK)}주 전`;
  return new Date(at).toLocaleDateString('ko-KR');
}

export const STAT_BADGES = Object.freeze([
  ['herringbone', '헤링본'],
  ['basket', '바구니'],
  ['rows', '완성줄'],
  ['accent', '악센트'],
]);

// 0인 통계는 숨기고, 전부 0이면 "무늬 없음"
export function statBadges(stats) {
  const badges = STAT_BADGES.filter(([k]) => stats?.[k] > 0).map(([k, label]) => `${label} ${stats[k]}`);
  return badges.length ? badges : ['무늬 없음'];
}
