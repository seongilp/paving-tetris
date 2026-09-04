// 배치 기록(placed)으로 게임을 처음부터 다시 돌려 점수·통계·격자를 재계산한다.
// 순수 함수만 — 브라우저(game.js)와 서버(api/brag.js)가 같은 규칙을 공유한다.
import { createBoard, scorePlacement, countHoles } from './pattern.js';
import { cellsOf, rotationCount, SHAPES } from './shapes.js';

export const COLS = 10;
export const ROWS = 14;
export const TONE_COUNT = 6; // PALETTE.tones 길이
export const ACCENT_TONE = 6; // 악센트 블록의 톤 인덱스
export const MAX_PIECES = Math.floor((COLS * ROWS) / 2); // 최소 2셀짜리 조각만 있으므로 상한
export const LEVEL_STEP = 12;

const SHAPE_IDS = new Set(SHAPES.map((s) => s.id));

export const emptyStats = () =>
  Object.freeze({ herringbone: 0, basket: 0, monotony: 0, accent: 0, rows: 0, holes: 0 });

// 착지 결과를 누적한 새 stats 객체
export function addResult(stats, result) {
  return Object.freeze({
    herringbone: stats.herringbone + result.herringbone,
    basket: stats.basket + result.basket,
    monotony: stats.monotony + result.monotony,
    accent: stats.accent + result.accent,
    rows: stats.rows + result.newRows.length,
    holes: result.holes,
  });
}

// 전송용 조각: { s: shapeId, r: rotation, x, y, t: toneIndex(0..5, 악센트 6) }
export function isValidPiece(piece) {
  if (!piece || typeof piece !== 'object') return false;
  const { s, r, x, y, t } = piece;
  if (!SHAPE_IDS.has(s)) return false;
  if (!Number.isInteger(r) || r < 0 || r >= rotationCount(s)) return false;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (!Number.isInteger(t) || t < 0 || t > ACCENT_TONE) return false;
  return true;
}

export const isAccentTone = (t) => t === ACCENT_TONE;

export function pieceCells(piece) {
  return cellsOf(piece.s, piece.r).map((c) => ({
    x: piece.x + c.x,
    y: piece.y + c.y,
    orient: c.orient,
  }));
}

export function pieceFits(board, piece) {
  const rows = board.length;
  const cols = board[0].length;
  return pieceCells(piece).every(
    (c) => c.x >= 0 && c.x < cols && c.y >= 0 && c.y < rows && !board[c.y][c.x],
  );
}

// 조각 하나를 착지시킨 새 보드와 채점 결과. 원본 보드는 바꾸지 않는다.
export function applyPlacement(board, piece, prev) {
  const cells = pieceCells(piece);
  const accent = isAccentTone(piece.t);
  const next = board.map((row) => row.slice());
  for (const c of cells) next[c.y][c.x] = { orient: c.orient, accent, tone: piece.t };
  const result = scorePlacement(next, cells, prev);
  return { board: next, cells, result };
}

// 톤 인덱스 격자: 0 = 빈 칸, 1..7 = 톤 인덱스 + 1. 행마다 문자열 하나.
export function boardToGrid(board) {
  return board.map((row) => row.map((c) => (c ? String(c.tone + 1) : '0')).join(''));
}

export function gridToneAt(grid, x, y) {
  const ch = grid[y]?.[x];
  if (ch === undefined || ch === '0') return null;
  return Number(ch) - 1;
}

// 처음부터 끝까지 다시 깐다. 조각이 안 맞으면 실패.
export function replayGame(placed, { cols = COLS, rows = ROWS } = {}) {
  if (!Array.isArray(placed) || placed.length === 0 || placed.length > MAX_PIECES) {
    return { ok: false, error: 'placed 개수가 범위를 벗어났다' };
  }
  let board = createBoard(cols, rows);
  let stats = emptyStats();
  let scoredRows = [];
  let score = 0;
  for (let i = 0; i < placed.length; i += 1) {
    const piece = placed[i];
    if (!isValidPiece(piece)) return { ok: false, error: `조각 #${i} 형식이 잘못됐다` };
    if (!pieceFits(board, piece)) return { ok: false, error: `조각 #${i} 이(가) 판에 맞지 않는다` };
    const step = applyPlacement(board, piece, { holes: stats.holes, scoredRows });
    board = step.board;
    score = Math.max(0, score + step.result.points);
    stats = addResult(stats, step.result);
    scoredRows = [...scoredRows, ...step.result.newRows];
  }
  return {
    ok: true,
    board,
    grid: boardToGrid(board),
    score,
    stats: { ...stats, holes: countHoles(board) },
    landed: placed.length,
    level: 1 + Math.floor(placed.length / LEVEL_STEP),
  };
}
