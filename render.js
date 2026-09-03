// 조각 실루엣 그리기 + 오프스크린 스프라이트 캐시
import { cellsOf, outlineEdges } from './shapes.js';

export const PALETTE = {
  bg: '#1c1f22',
  grid: '#22262a',
  joint: '#2b2318',
  ghost: 'rgba(210, 220, 208, 0.42)',
  tones: ['#8fa894', '#839b88', '#98b09b', '#93968f', '#878a84', '#9c9f98'],
  accent: '#c7ccc3',
};

const AMPLITUDE = 0.095; // 셀 단위 톱니 진폭
const STEPS = 14;
const SPRITE_PAD = 5;

const waveSign = (a, b, parity) => (((a + b + parity) % 2) === 0 ? 1 : -1);

// 단위 변 하나를 물결로 샘플링. 절대 좌표 기준이라 이웃 조각과 정확히 맞물린다.
function edgePoints(edge, parity) {
  const [ax, ay, bx, by] = edge;
  const horizontal = ay === by;
  const forward = horizontal ? bx > ax : by > ay;
  const x0 = Math.min(ax, bx);
  const y0 = Math.min(ay, by);
  const sign = waveSign(x0, y0, parity);
  const pts = [];
  for (let i = 0; i <= STEPS; i += 1) {
    const t = i / STEPS;
    // 한 변마다 사인 한 주기 — 실제 I형 보도블록의 잘록한 실루엣이 나온다
    const off = Math.sin(t * Math.PI * 2) * AMPLITUDE * sign;
    pts.push(horizontal ? [x0 + t, y0 + off] : [x0 + off, y0 + t]);
  }
  return forward ? pts : pts.reverse();
}

export function tracePath(ctx, cells, cell, parity, offX = 0, offY = 0) {
  const edges = outlineEdges(cells);
  ctx.beginPath();
  let started = false;
  for (const edge of edges) {
    const pts = edgePoints(edge, parity);
    for (const [px, py] of pts) {
      const x = offX + px * cell;
      const y = offY + py * cell;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return `rgb(${r}, ${g}, ${b})`;
}

const cache = new Map();

export function spriteFor(shapeId, rotation, parity, tone, cell, dpr) {
  const id = `${shapeId}|${rotation}|${parity}|${tone}|${cell}|${dpr}`;
  const hit = cache.get(id);
  if (hit) return hit;

  const cells = cellsOf(shapeId, rotation);
  const w = Math.max(...cells.map((c) => c.x)) + 1;
  const h = Math.max(...cells.map((c) => c.y)) + 1;
  const pxW = Math.ceil((w + AMPLITUDE * 2) * cell) + SPRITE_PAD * 2;
  const pxH = Math.ceil((h + AMPLITUDE * 2) * cell) + SPRITE_PAD * 2;

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(pxW * dpr);
  canvas.height = Math.ceil(pxH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const ox = SPRITE_PAD + AMPLITUDE * cell;
  const oy = SPRITE_PAD + AMPLITUDE * cell;

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = cell * 0.16;
  ctx.shadowOffsetY = cell * 0.09;
  tracePath(ctx, cells, cell, parity, ox, oy);
  const grad = ctx.createLinearGradient(ox, oy, ox, oy + h * cell);
  grad.addColorStop(0, shade(tone, 11));
  grad.addColorStop(0.55, tone);
  grad.addColorStop(1, shade(tone, -20));
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  // 줄눈
  ctx.lineWidth = 2;
  ctx.strokeStyle = PALETTE.joint;
  ctx.lineJoin = 'round';
  tracePath(ctx, cells, cell, parity, ox, oy);
  ctx.stroke();

  // 윗면 하이라이트
  ctx.save();
  tracePath(ctx, cells, cell, parity, ox, oy);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1.5;
  tracePath(ctx, cells, cell, parity, ox, oy - 1.5);
  ctx.stroke();
  ctx.restore();

  const sprite = { canvas, ox, oy, pxW, pxH };
  cache.set(id, sprite);
  return sprite;
}

export function drawSprite(ctx, sprite, x, y) {
  ctx.drawImage(sprite.canvas, x - sprite.ox, y - sprite.oy, sprite.pxW, sprite.pxH);
}

export function drawGhost(ctx, cells, cell, parity, x, y) {
  ctx.save();
  ctx.strokeStyle = PALETTE.ghost;
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  ctx.setLineDash([5, 4]);
  tracePath(ctx, cells, cell, parity, x, y);
  ctx.stroke();
  ctx.restore();
}

export function drawBackdrop(ctx, cols, rows, cell) {
  ctx.fillStyle = PALETTE.bg;
  ctx.fillRect(0, 0, cols * cell, rows * cell);
  ctx.strokeStyle = PALETTE.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < cols; x += 1) {
    ctx.moveTo(x * cell + 0.5, 0);
    ctx.lineTo(x * cell + 0.5, rows * cell);
  }
  for (let y = 1; y < rows; y += 1) {
    ctx.moveTo(0, y * cell + 0.5);
    ctx.lineTo(cols * cell, y * cell + 0.5);
  }
  ctx.stroke();
}
