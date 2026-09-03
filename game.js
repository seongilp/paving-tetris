import { createBoard, scorePlacement, countHoles } from './pattern.js';
import { cellsOf, boundsOf, randomShapeId, rotationCount } from './shapes.js';
import { PALETTE, spriteFor, drawSprite, drawGhost, drawBackdrop } from './render.js';
import { attachKeyboard, attachTouch } from './input.js';

const COLS = 10;
const ROWS = 14;
const ACCENT_RATE = 0.1;
const BEST_KEY = 'paving-tetris.best';

const el = (id) => document.getElementById(id);
const dom = {
  canvas: el('board'),
  next: el('next'),
  score: el('score'),
  level: el('level'),
  best: el('best'),
  toast: el('toast'),
  overlay: el('overlay'),
  finalScore: el('final-score'),
  finalStats: el('final-stats'),
  restart: el('restart'),
  save: el('save'),
  pause: el('pause'),
};

const ctx = dom.canvas.getContext('2d');
const layer = document.createElement('canvas');
const layerCtx = layer.getContext('2d');
const nextCtx = dom.next.getContext('2d');

let cell = 32;
let dpr = 1;
let state = null;
let shake = 0;
let flash = null;
let lastFrame = 0;
let dropTimer = 0;

const readBest = () => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
};

const writeBest = (value) => {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    /* 저장 불가 환경은 조용히 넘어간다 */
  }
};

function makePiece() {
  const shapeId = randomShapeId();
  const accent = Math.random() < ACCENT_RATE;
  const tone = accent
    ? PALETTE.accent
    : PALETTE.tones[Math.floor(Math.random() * PALETTE.tones.length)];
  return { shapeId, rotation: 0, x: 0, y: 0, tone, accent };
}

function newGame() {
  state = {
    board: createBoard(COLS, ROWS),
    placed: [],
    current: null,
    next: makePiece(),
    score: 0,
    best: readBest(),
    stats: { herringbone: 0, basket: 0, monotony: 0, accent: 0, rows: 0, holes: 0 },
    scoredRows: [],
    landed: 0,
    level: 1,
    paused: false,
    over: false,
  };
  rebuildLayer();
  dom.overlay.hidden = true;
  spawn();
  syncHud();
}

function occupiedCells(piece) {
  return cellsOf(piece.shapeId, piece.rotation).map((c) => ({
    x: piece.x + c.x,
    y: piece.y + c.y,
    orient: c.orient,
  }));
}

function fits(piece, x = piece.x, y = piece.y, rotation = piece.rotation) {
  return cellsOf(piece.shapeId, rotation).every((c) => {
    const cx = x + c.x;
    const cy = y + c.y;
    if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) return false;
    return !state.board[cy][cx];
  });
}

function spawn() {
  const piece = state.next;
  const { w } = boundsOf(cellsOf(piece.shapeId, 0));
  piece.x = Math.floor((COLS - w) / 2);
  piece.y = 0;
  state.next = makePiece();
  if (!fits(piece)) {
    state.current = null;
    gameOver();
    return;
  }
  state.current = piece;
  dropTimer = 0;
  drawNextPreview();
}

const move = (dx) => {
  const p = state.current;
  if (!p || state.paused || state.over) return;
  if (fits(p, p.x + dx, p.y)) p.x += dx;
};

function rotate() {
  const p = state.current;
  if (!p || state.paused || state.over) return;
  const next = (p.rotation + 1) % rotationCount(p.shapeId);
  for (const kick of [0, -1, 1, -2, 2]) {
    if (fits(p, p.x + kick, p.y, next)) {
      p.x += kick;
      p.rotation = next;
      return;
    }
  }
}

function stepDown() {
  const p = state.current;
  if (!p || state.paused || state.over) return false;
  if (fits(p, p.x, p.y + 1)) {
    p.y += 1;
    return true;
  }
  lock();
  return false;
}

function hardDrop() {
  const p = state.current;
  if (!p || state.paused || state.over) return;
  while (fits(p, p.x, p.y + 1)) p.y += 1;
  lock();
}

function ghostY(piece) {
  let y = piece.y;
  while (fits(piece, piece.x, y + 1)) y += 1;
  return y;
}

function lock() {
  const piece = state.current;
  const cells = occupiedCells(piece);
  for (const c of cells) state.board[c.y][c.x] = { orient: c.orient, accent: piece.accent };
  state.placed.push({ ...piece });
  blitPiece(layerCtx, piece);

  const result = scorePlacement(state.board, cells, {
    holes: state.stats.holes,
    scoredRows: state.scoredRows,
  });
  state.score = Math.max(0, state.score + result.points);
  state.stats.herringbone += result.herringbone;
  state.stats.basket += result.basket;
  state.stats.monotony += result.monotony;
  state.stats.accent += result.accent;
  state.stats.rows += result.newRows.length;
  state.stats.holes = result.holes;
  state.scoredRows.push(...result.newRows);
  state.landed += 1;
  state.level = 1 + Math.floor(state.landed / 12);
  if (state.score > state.best) {
    state.best = state.score;
    writeBest(state.best);
  }

  shake = 1;
  showToast(result);
  syncHud();
  state.current = null;
  spawn();
}

function showToast(result) {
  const parts = [];
  if (result.herringbone) parts.push(`헤링본 +${result.herringbone * 3}`);
  if (result.basket) parts.push(`바구니짜기 +${result.basket * 5}`);
  if (result.newRows.length) parts.push(`완성 줄 +${result.newRows.length * 10}`);
  if (result.accent) parts.push(`악센트 +${result.accent * 4}`);
  if (result.newHoles) parts.push(`구멍 −${result.newHoles * 2}`);
  if (result.monotony && parts.length === 0) parts.push(`단조로움 -${result.monotony}`);
  const text = parts.join('  ');
  dom.toast.textContent = text;
  flash = text ? { life: 1 } : null;
}

const dropInterval = () => Math.max(160, 950 - (state.level - 1) * 70);

function syncHud() {
  dom.score.textContent = String(state.score);
  dom.level.textContent = String(state.level);
  dom.best.textContent = String(state.best);
}

function gameOver() {
  state.over = true;
  dom.finalScore.textContent = String(state.score);
  const s = state.stats;
  dom.finalStats.innerHTML = [
    ['헤링본', `${s.herringbone}회`],
    ['바구니짜기', `${s.basket}회`],
    ['완성 줄', `${s.rows}줄`],
    ['악센트 배치', `${s.accent}회`],
    ['단조로운 구간', `${s.monotony}곳`],
    ['구멍', `${countHoles(state.board)}개`],
    ['깔린 블록', `${state.placed.length}장`],
  ]
    .map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`)
    .join('');
  dom.overlay.hidden = false;
}

/* ---------- 렌더 ---------- */

function blitPiece(target, piece) {
  const parity = (piece.x + piece.y) % 2;
  const sprite = spriteFor(piece.shapeId, piece.rotation, parity, piece.tone, cell, dpr);
  drawSprite(target, sprite, piece.x * cell, piece.y * cell);
}

function rebuildLayer() {
  layer.width = Math.floor(COLS * cell * dpr);
  layer.height = Math.floor(ROWS * cell * dpr);
  layerCtx.setTransform(1, 0, 0, 1, 0, 0);
  layerCtx.clearRect(0, 0, layer.width, layer.height);
  layerCtx.scale(dpr, dpr);
  for (const piece of state.placed) blitPiece(layerCtx, piece);
}

function resize() {
  const rect = dom.canvas.parentElement.getBoundingClientRect();
  const width = Math.max(220, Math.min(rect.width, 420));
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cell = Math.floor(width / COLS);
  const w = cell * COLS;
  const h = cell * ROWS;
  dom.canvas.style.width = `${w}px`;
  dom.canvas.style.height = `${h}px`;
  dom.canvas.width = Math.floor(w * dpr);
  dom.canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (state) {
    rebuildLayer();
    drawNextPreview();
  }
}

function drawNextPreview() {
  const piece = state.next;
  const cells = cellsOf(piece.shapeId, 0);
  const { w, h } = boundsOf(cells);
  const size = 74;
  dom.next.style.width = `${size}px`;
  dom.next.style.height = `${size}px`;
  dom.next.width = Math.floor(size * dpr);
  dom.next.height = Math.floor(size * dpr);
  nextCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  nextCtx.clearRect(0, 0, size, size);
  const mini = Math.floor(Math.min(size / (w + 0.8), size / (h + 0.8)));
  const sprite = spriteFor(piece.shapeId, 0, 0, piece.tone, mini, dpr);
  drawSprite(nextCtx, sprite, (size - w * mini) / 2, (size - h * mini) / 2);
}

function render() {
  const offset = shake > 0 ? Math.sin(shake * Math.PI * 3) * shake * 3 : 0;
  ctx.save();
  drawBackdrop(ctx, COLS, ROWS, cell);
  ctx.translate(0, offset);
  ctx.drawImage(layer, 0, 0, COLS * cell, ROWS * cell);
  ctx.restore();

  const piece = state.current;
  if (piece && !state.over) {
    const cells = cellsOf(piece.shapeId, piece.rotation);
    const gy = ghostY(piece);
    if (gy !== piece.y) {
      drawGhost(ctx, cells, cell, (piece.x + gy) % 2, piece.x * cell, gy * cell);
    }
    blitPiece(ctx, piece);
  }

  if (state.paused) {
    ctx.fillStyle = 'rgba(28, 31, 34, 0.78)';
    ctx.fillRect(0, 0, COLS * cell, ROWS * cell);
    ctx.fillStyle = '#d7dbd4';
    ctx.font = '600 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('일시정지', (COLS * cell) / 2, (ROWS * cell) / 2);
  }
}

function loop(now) {
  const dt = lastFrame ? now - lastFrame : 16;
  lastFrame = now;
  if (state && !state.paused && !state.over) {
    dropTimer += dt;
    if (dropTimer >= dropInterval()) {
      dropTimer = 0;
      stepDown();
    }
  }
  if (shake > 0) shake = Math.max(0, shake - dt / 260);
  if (flash) {
    flash.life -= dt / 1600;
    dom.toast.style.opacity = String(Math.max(0, flash.life));
    if (flash.life <= 0) flash = null;
  }
  if (state) render();
  requestAnimationFrame(loop);
}

/* ---------- 이미지 저장 ---------- */

function exportImage() {
  const pad = 24;
  const out = document.createElement('canvas');
  const w = COLS * cell;
  const h = ROWS * cell;
  out.width = w + pad * 2;
  out.height = h + pad * 2 + 56;
  const octx = out.getContext('2d');
  octx.fillStyle = PALETTE.bg;
  octx.fillRect(0, 0, out.width, out.height);
  octx.save();
  octx.translate(pad, pad);
  drawBackdrop(octx, COLS, ROWS, cell);
  octx.drawImage(layer, 0, 0, w, h);
  octx.restore();
  octx.fillStyle = '#d7dbd4';
  octx.font = '600 18px system-ui, sans-serif';
  octx.fillText('보도블록', pad, h + pad + 30);
  octx.fillStyle = '#9fb6a3';
  octx.textAlign = 'right';
  octx.fillText(`${state.score}점 · 블록 ${state.placed.length}장`, w + pad, h + pad + 30);

  const link = document.createElement('a');
  link.download = `보도블록-${state.score}점.png`;
  link.href = out.toDataURL('image/png');
  link.click();
}

/* ---------- 부트 ---------- */

const actions = {
  left: () => move(-1),
  right: () => move(1),
  rotate,
  softDrop: () => {
    if (stepDown()) dropTimer = 0;
  },
  hardDrop,
  togglePause: () => {
    if (state.over) return;
    state.paused = !state.paused;
    dom.pause.textContent = state.paused ? '계속' : '일시정지';
  },
};

resize();
newGame();
window.addEventListener('resize', resize);
attachKeyboard(window, actions);
attachTouch(dom.canvas, actions, () => cell);
// 버튼에 포커스가 남으면 Space 하드드롭이 버튼 클릭으로 새는 것을 막는다
const bind = (button, handler) =>
  button.addEventListener('click', () => {
    button.blur();
    handler();
  });

bind(dom.pause, actions.togglePause);
bind(dom.restart, newGame);
bind(dom.save, exportImage);
requestAnimationFrame(loop);
