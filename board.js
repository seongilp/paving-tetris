// 자랑하기 게시판 — /api/brag 목록을 받아 미니 보드와 함께 그린다
import { PALETTE, spriteFor, drawSprite, drawBackdrop } from './render.js';
import { COLS, ROWS, ACCENT_TONE, isValidPiece, gridToneAt } from './replay.js';
import { relativeTime, statBadges } from './brag-format.js';
import { readMyIds } from './brag.js';

const MINI_CELL = 7;
const list = document.getElementById('list');
const msg = document.getElementById('board-msg');
const tabs = [...document.querySelectorAll('.tab')];
const myIds = new Set(readMyIds());
const dpr = Math.min(window.devicePixelRatio || 1, 2);

const toneColor = (t) => (t === ACCENT_TONE ? PALETTE.accent : PALETTE.tones[t] || PALETTE.tones[0]);

// 배치 기록이 있으면 실제 조각 실루엣으로, 없으면 격자 색만으로 그린다
function drawMini(canvas, entry) {
  const w = COLS * MINI_CELL;
  const h = ROWS * MINI_CELL;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackdrop(ctx, COLS, ROWS, MINI_CELL);
  const placed = Array.isArray(entry.placed) ? entry.placed.filter(isValidPiece) : [];
  if (placed.length) {
    for (const p of placed) {
      const sprite = spriteFor(p.s, p.r, (p.x + p.y) % 2, toneColor(p.t), MINI_CELL, dpr);
      drawSprite(ctx, sprite, p.x * MINI_CELL, p.y * MINI_CELL);
    }
    return;
  }
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const t = gridToneAt(entry.board || [], x, y);
      if (t === null) continue;
      ctx.fillStyle = toneColor(t);
      ctx.fillRect(x * MINI_CELL + 0.5, y * MINI_CELL + 0.5, MINI_CELL - 1, MINI_CELL - 1);
    }
  }
}

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text; // textContent 로만 넣어 XSS 를 막는다
  return node;
};

function renderEntry(entry, index, tab) {
  const li = el('li', `entry${myIds.has(entry.id) ? ' mine' : ''}`);
  const rank = el('div', 'rank', tab === 'top' ? String(entry.rank ?? index + 1) : '·');
  const canvas = el('canvas', 'mini');
  canvas.setAttribute('aria-label', `${entry.name}의 바닥`);
  drawMini(canvas, entry);

  const body = el('div', 'entry-body');
  const top = el('div', 'entry-top');
  top.append(el('b', 'name', entry.name), el('span', 'score', `${entry.score}점`));
  const badges = el('div', 'badges');
  for (const text of statBadges(entry.stats)) badges.append(el('span', 'badge', text));
  const meta = el('div', 'meta', `블록 ${entry.landed ?? '?'}장 · ${relativeTime(entry.at)}`);
  if (myIds.has(entry.id)) meta.append(' · ', el('span', 'me', '내 기록'));
  body.append(top, badges, meta);
  li.append(rank, canvas, body);
  return li;
}

async function load(tab) {
  msg.textContent = '불러오는 중…';
  list.replaceChildren();
  try {
    const res = await fetch(`/api/brag?tab=${tab}`);
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (data.items.length === 0) {
      msg.textContent = '아직 자랑한 사람이 없다. 첫 번째가 되어 보자.';
      return;
    }
    msg.textContent = '';
    list.replaceChildren(...data.items.map((entry, i) => renderEntry(entry, i, tab)));
  } catch (err) {
    msg.textContent = `불러오지 못했다: ${err.message}`;
  }
}

function selectTab(tab) {
  for (const button of tabs) {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  }
  history.replaceState(null, '', `#${tab}`);
  load(tab);
}

for (const button of tabs) button.addEventListener('click', () => selectTab(button.dataset.tab));
selectTab(location.hash === '#recent' ? 'recent' : 'top');
