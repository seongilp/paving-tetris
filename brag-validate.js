// 자랑하기 제출 검증 — 순수 함수만, Node 전용 모듈 의존 없음(브라우저의 brag.js 도 이 파일을 쓴다).
import { replayGame, COLS, ROWS, MAX_PIECES } from './replay.js';

export const NAME_MIN = 2;
export const NAME_MAX = 12;
export const MAX_BODY_BYTES = 32 * 1024;
export const STAT_KEYS = Object.freeze(['herringbone', 'basket', 'rows', 'accent', 'monotony', 'holes']);

export const DEVICE_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const COMMENT_NAME_MIN = 1;
export const COMMENT_NAME_MAX = 12;
export const COMMENT_TEXT_MAX = 200;

// 한글·영문·숫자·공백·_ . - 만. <>&"' 같은 마크업 문자는 애초에 거른다.
const NAME_RE = /^[\p{L}\p{N} _.\-]+$/u;

const fail = (error) => ({ ok: false, error });

export function validateName(raw) {
  if (typeof raw !== 'string') return fail('닉네임은 문자열이어야 한다');
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  const length = [...name].length;
  if (length < NAME_MIN || length > NAME_MAX) {
    return fail(`닉네임은 ${NAME_MIN}~${NAME_MAX}자`);
  }
  if (!NAME_RE.test(name)) return fail('닉네임에 쓸 수 없는 문자가 있다');
  return { ok: true, value: name };
}

const isGrid = (grid) =>
  Array.isArray(grid) &&
  grid.length === ROWS &&
  grid.every((row) => typeof row === 'string' && /^[0-7]+$/.test(row) && row.length === COLS);

const isStats = (stats) =>
  stats &&
  typeof stats === 'object' &&
  STAT_KEYS.every((k) => Number.isInteger(stats[k]) && stats[k] >= 0);

// 바디 형식 검사. 값의 진위(점수 일치)는 verifySubmission 에서.
export function validatePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('JSON 객체가 필요하다');
  const name = validateName(body.name);
  if (!name.ok) return name;
  if (!Number.isInteger(body.score) || body.score < 0) return fail('score 가 잘못됐다');
  if (!isStats(body.stats)) return fail('stats 가 잘못됐다');
  if (!isGrid(body.board)) return fail('board 격자가 잘못됐다');
  if (!Array.isArray(body.placed) || body.placed.length === 0 || body.placed.length > MAX_PIECES) {
    return fail('placed 가 잘못됐다');
  }
  if (!Number.isInteger(body.landed) || body.landed !== body.placed.length) {
    return fail('landed 가 placed 개수와 다르다');
  }
  return {
    ok: true,
    value: {
      name: name.value,
      score: body.score,
      stats: Object.fromEntries(STAT_KEYS.map((k) => [k, body.stats[k]])),
      board: body.board,
      placed: body.placed.map(({ s, r, x, y, t }) => ({ s, r, x, y, t })),
      landed: body.landed,
    },
  };
}

// 배치 기록으로 재계산해 클라이언트 주장과 대조한다. 하나라도 다르면 거부.
export function verifySubmission(body) {
  const parsed = validatePayload(body);
  if (!parsed.ok) return parsed;
  const claim = parsed.value;
  const replay = replayGame(claim.placed);
  if (!replay.ok) return fail(`재계산 실패: ${replay.error}`);
  if (replay.score !== claim.score) return fail('점수가 재계산 결과와 다르다');
  const mismatch = STAT_KEYS.find((k) => replay.stats[k] !== claim.stats[k]);
  if (mismatch) return fail(`통계(${mismatch})가 재계산 결과와 다르다`);
  if (replay.grid.some((row, i) => row !== claim.board[i])) return fail('격자가 재계산 결과와 다르다');
  return {
    ok: true,
    value: {
      name: claim.name,
      score: replay.score,
      stats: replay.stats,
      board: replay.grid,
      placed: claim.placed,
      landed: replay.landed,
    },
  };
}

// 저장 형태. ip 는 목록 응답에서 뺀다.
export function makeEntry(verified, { id, at, ip }) {
  return Object.freeze({ id, at, ip, ...verified });
}

export function publicEntry(entry) {
  if (!entry) return null;
  const { ip, ...rest } = entry;
  return rest;
}

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

// 짧은 id: 시각(36진수) + 난수. 정렬에 쓰지 않으므로 충돌만 피하면 된다.
export function makeId(now = Date.now(), random = Math.random) {
  return `${now.toString(36)}${Math.floor(random() * 36 ** 6).toString(36).padStart(6, '0')}`;
}

// 브라우저별 deviceId(UUID v4 형식). 서버는 형식만 검증하고 신원 증명으로는 쓰지 않는다.
export function validateDeviceId(raw) {
  if (typeof raw !== 'string') return fail('device id 가 없다');
  const id = raw.trim();
  if (id.length !== 36 || !DEVICE_ID_RE.test(id)) return fail('device id 형식이 잘못됐다');
  return { ok: true, value: id };
}

const stripControlChars = (text) => text.replace(/[\x00-\x1f\x7f]/g, '');

export function validateCommentName(raw) {
  if (typeof raw !== 'string') return fail('이름은 문자열이어야 한다');
  const name = stripControlChars(raw).normalize('NFC').replace(/\s+/g, ' ').trim();
  const length = [...name].length;
  if (length < COMMENT_NAME_MIN || length > COMMENT_NAME_MAX) {
    return fail(`이름은 ${COMMENT_NAME_MIN}~${COMMENT_NAME_MAX}자`);
  }
  return { ok: true, value: name };
}

export function validateCommentText(raw) {
  if (typeof raw !== 'string') return fail('내용은 문자열이어야 한다');
  const text = stripControlChars(raw).normalize('NFC').trim();
  const length = [...text].length;
  if (length < 1 || length > COMMENT_TEXT_MAX) return fail(`댓글은 1~${COMMENT_TEXT_MAX}자`);
  return { ok: true, value: text };
}

// 댓글 제출 검증. name/text 둘 다 통과해야 한다.
export function validateComment(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('JSON 객체가 필요하다');
  const name = validateCommentName(body.name);
  if (!name.ok) return name;
  const text = validateCommentText(body.text);
  if (!text.ok) return text;
  return { ok: true, value: { name: name.value, text: text.value } };
}

