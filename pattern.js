// 패턴 판정 — 순수 함수만. 보드는 board[y][x] = null | { orient, accent }
export const H = 'h'; // 가로로 누운 블록 셀
export const V = 'v'; // 세로로 선 블록 셀
export const S = 's'; // 정사각 판석 셀

export const POINTS = Object.freeze({
  herringbone: 3,
  basket: 5,
  monotony: -1,
  hole: -2,
  fullRow: 10,
  accent: 4,
});

const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAGONALS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

export function createBoard(cols, rows) {
  return Array.from({ length: rows }, () => Array(cols).fill(null));
}

export function cellAt(board, x, y) {
  if (y < 0 || y >= board.length) return null;
  const row = board[y];
  if (x < 0 || x >= row.length) return null;
  return row[x];
}

const key = (x, y) => `${x},${y}`;
const pairKey = (ax, ay, bx, by) =>
  ax < bx || (ax === bx && ay < by) ? `${ax},${ay}|${bx},${by}` : `${bx},${by}|${ax},${ay}`;

const toKeySet = (cells) => new Set(cells.map((c) => key(c.x, c.y)));

// 헤링본: 새로 놓인 셀과 "기존" 셀이 서로 수직으로 맞물린 쌍의 수
export function countHerringbone(board, cells) {
  const fresh = toKeySet(cells);
  const seen = new Set();
  let count = 0;
  for (const { x, y } of cells) {
    const a = cellAt(board, x, y);
    if (!a || a.orient === S) continue;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (fresh.has(key(nx, ny))) continue; // 같은 조각 내부는 제외
      const b = cellAt(board, nx, ny);
      if (!b || b.orient === S || b.orient === a.orient) continue;
      const pk = pairKey(x, y, nx, ny);
      if (seen.has(pk)) continue;
      seen.add(pk);
      count += 1;
    }
  }
  return count;
}

// 바구니짜기: 2×2 창이 꽉 찼고 가로 2 + 세로 2 조합인 경우
export function countBasketWeave(board, cells) {
  const windows = new Set();
  for (const { x, y } of cells) {
    for (const dx of [-1, 0]) for (const dy of [-1, 0]) windows.add(key(x + dx, y + dy));
  }
  let count = 0;
  for (const w of windows) {
    const [wx, wy] = w.split(',').map(Number);
    const quad = [
      cellAt(board, wx, wy), cellAt(board, wx + 1, wy),
      cellAt(board, wx, wy + 1), cellAt(board, wx + 1, wy + 1),
    ];
    if (quad.some((c) => !c)) continue;
    const h = quad.filter((c) => c.orient === H).length;
    const v = quad.filter((c) => c.orient === V).length;
    if (h === 2 && v === 2) count += 1;
  }
  return count;
}

function scanLine(board, length, at, orient, fresh) {
  let runs = 0;
  let run = 0;
  let touched = false;
  const flush = () => {
    if (run >= 3 && touched) runs += 1;
    run = 0;
    touched = false;
  };
  for (let i = 0; i < length; i += 1) {
    const [x, y] = at(i);
    const cell = cellAt(board, x, y);
    if (cell && cell.orient === orient) {
      run += 1;
      if (fresh.has(key(x, y))) touched = true;
    } else flush();
  }
  flush();
  return runs;
}

// 단조로움: 같은 방향 셀이 그 방향으로 3개 이상 나란히 이어진 구간 수
export function countMonotony(board, cells) {
  const fresh = toKeySet(cells);
  const rows = board.length;
  const cols = board[0].length;
  let count = 0;
  for (let y = 0; y < rows; y += 1) count += scanLine(board, cols, (i) => [i, y], H, fresh);
  for (let x = 0; x < cols; x += 1) count += scanLine(board, rows, (i) => [x, i], V, fresh);
  return count;
}

// 구멍: 위가 막힌 빈 셀
export function countHoles(board) {
  const rows = board.length;
  const cols = board[0].length;
  let holes = 0;
  for (let x = 0; x < cols; x += 1) {
    let covered = false;
    for (let y = 0; y < rows; y += 1) {
      if (board[y][x]) covered = true;
      else if (covered) holes += 1;
    }
  }
  return holes;
}

// 완성 줄: 빈틈없이 채워진 행의 인덱스 (사라지지는 않는다)
export function completedRows(board) {
  const out = [];
  for (let y = 0; y < board.length; y += 1) {
    if (board[y].every((c) => c)) out.push(y);
  }
  return out;
}

// 악센트 보너스: 새 악센트 셀이 대각선으로 다른 악센트와 맞물린 체스판 쌍
export function countAccentPairs(board, cells) {
  const seen = new Set();
  let count = 0;
  for (const { x, y } of cells) {
    const a = cellAt(board, x, y);
    if (!a || !a.accent) continue;
    for (const [dx, dy] of DIAGONALS) {
      const b = cellAt(board, x + dx, y + dy);
      if (!b || !b.accent) continue;
      const pk = pairKey(x, y, x + dx, y + dy);
      if (seen.has(pk)) continue;
      seen.add(pk);
      count += 1;
    }
  }
  return count;
}

// 착지 1회분 채점. prev = { holes, scoredRows: number[] }
export function scorePlacement(board, cells, prev = { holes: 0, scoredRows: [] }) {
  const scored = new Set(prev.scoredRows);
  const herringbone = countHerringbone(board, cells);
  const basket = countBasketWeave(board, cells);
  const monotony = countMonotony(board, cells);
  const accent = countAccentPairs(board, cells);
  const holes = countHoles(board);
  const newHoles = Math.max(0, holes - (prev.holes || 0));
  const newRows = completedRows(board).filter((r) => !scored.has(r));
  const points =
    herringbone * POINTS.herringbone +
    basket * POINTS.basket +
    monotony * POINTS.monotony +
    accent * POINTS.accent +
    newRows.length * POINTS.fullRow +
    newHoles * POINTS.hole;
  return { points, herringbone, basket, monotony, accent, newHoles, holes, newRows };
}
