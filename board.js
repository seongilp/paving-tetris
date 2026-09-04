// 자랑하기 게시판 — /api/brag 목록을 받아 미니 보드와 함께 그린다
import { PALETTE, spriteFor, drawSprite, drawBackdrop } from './render.js';
import { COLS, ROWS, ACCENT_TONE, isValidPiece, gridToneAt } from './replay.js';
import { relativeTime, statBadges } from './brag-format.js';
import { readMyIds, getDeviceId, readCommentName, rememberCommentName } from './brag.js';
import { lightboxCell } from './lightbox-layout.js';
import { fetchEntryDetail, toggleLikeRequest, postComment } from './brag-social.js';

const MINI_CELL = 7;
const list = document.getElementById('list');
const msg = document.getElementById('board-msg');
const tabs = [...document.querySelectorAll('.tab')];
const myIds = new Set(readMyIds());
const dpr = Math.min(window.devicePixelRatio || 1, 2);
const deviceId = getDeviceId();

const lightbox = document.getElementById('lightbox');
const lightboxCanvas = document.getElementById('lightbox-canvas');
const lightboxName = document.getElementById('lightbox-name');
const lightboxScore = document.getElementById('lightbox-score');
const lightboxBadges = document.getElementById('lightbox-badges');
const lightboxMeta = document.getElementById('lightbox-meta');
const lightboxClose = document.getElementById('lightbox-close');
const lightboxLike = document.getElementById('lightbox-like');
const lightboxLikeCount = document.getElementById('lightbox-like-count');
const commentsMsg = document.getElementById('comments-msg');
const commentList = document.getElementById('comment-list');
const commentForm = document.getElementById('comment-form');
const commentNameInput = document.getElementById('comment-name');
const commentTextInput = document.getElementById('comment-text');
const commentSubmit = document.getElementById('comment-submit');

const toneColor = (t) => (t === ACCENT_TONE ? PALETTE.accent : PALETTE.tones[t] || PALETTE.tones[0]);

// 배치 기록이 있으면 실제 조각 실루엣으로, 없으면 격자 색만으로 그린다
// cell 크기만 바꿔서 미니 썸네일과 라이트박스 확대 뷰가 같은 그리기 로직을 공유한다
function renderBoard(canvas, entry, cell) {
  const w = COLS * cell;
  const h = ROWS * cell;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackdrop(ctx, COLS, ROWS, cell);
  const placed = Array.isArray(entry.placed) ? entry.placed.filter(isValidPiece) : [];
  if (placed.length) {
    for (const p of placed) {
      const sprite = spriteFor(p.s, p.r, (p.x + p.y) % 2, toneColor(p.t), cell, dpr);
      drawSprite(ctx, sprite, p.x * cell, p.y * cell);
    }
    return;
  }
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const t = gridToneAt(entry.board || [], x, y);
      if (t === null) continue;
      ctx.fillStyle = toneColor(t);
      ctx.fillRect(x * cell + 0.5, y * cell + 0.5, cell - 1, cell - 1);
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
  canvas.setAttribute('role', 'button');
  canvas.setAttribute('tabindex', '0');
  canvas.setAttribute('aria-label', `${entry.name}의 바닥 크게 보기`);
  renderBoard(canvas, entry, MINI_CELL);
  canvas.addEventListener('click', () => openLightbox(entry));
  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      openLightbox(entry);
    }
  });

  const body = el('div', 'entry-body');
  const top = el('div', 'entry-top');
  top.append(el('b', 'name', entry.name), el('span', 'score', `${entry.score}점`));
  const badges = el('div', 'badges');
  for (const text of statBadges(entry.stats)) badges.append(el('span', 'badge', text));
  const meta = el('div', 'meta', `블록 ${entry.landed ?? '?'}장 · ${relativeTime(entry.at)}`);
  if (myIds.has(entry.id)) meta.append(' · ', el('span', 'me', '내 기록'));
  const social = el('div', 'social', `♥ ${entry.likes ?? 0} · 💬 ${entry.comments ?? 0}`);
  body.append(top, badges, meta, social);
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

let lastFocused = null;
let currentEntry = null;

function renderLike(liked, count) {
  lightboxLike.setAttribute('aria-pressed', String(liked));
  lightboxLike.classList.toggle('liked', liked);
  lightboxLikeCount.textContent = String(Math.max(0, count));
}

function renderComment(c) {
  const li = el('li', 'comment');
  const top = el('div', 'comment-top');
  top.append(el('b', 'comment-name', c.name), el('span', 'comment-time', relativeTime(c.ts)));
  li.append(top, el('p', 'comment-text', c.text));
  return li;
}

async function openLightbox(entry) {
  lastFocused = document.activeElement;
  currentEntry = entry;
  const cell = lightboxCell(window.innerWidth, COLS);
  renderBoard(lightboxCanvas, entry, cell);
  lightboxCanvas.setAttribute('aria-label', `${entry.name}의 바닥`);
  lightboxName.textContent = entry.name;
  lightboxScore.textContent = `${entry.score}점`;
  lightboxBadges.replaceChildren(...statBadges(entry.stats).map((text) => el('span', 'badge', text)));
  lightboxMeta.textContent = `블록 ${entry.landed ?? '?'}장 · ${relativeTime(entry.at)}${myIds.has(entry.id) ? ' · 내 기록' : ''}`;
  renderLike(false, entry.likes ?? 0);
  commentList.replaceChildren();
  commentNameInput.value = readCommentName();
  commentTextInput.value = '';
  commentsMsg.textContent = '불러오는 중…';
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
  lightboxClose.focus();

  try {
    const data = await fetchEntryDetail(entry.id, deviceId);
    if (currentEntry !== entry) return; // 그 사이 다른 항목이 열렸으면 버린다
    renderLike(data.liked, data.likes);
    commentsMsg.textContent = data.comments.length ? '' : '아직 댓글이 없다. 첫 댓글을 남겨보자.';
    commentList.replaceChildren(...data.comments.map(renderComment));
  } catch (err) {
    if (currentEntry !== entry) return;
    commentsMsg.textContent = `댓글을 불러오지 못했다: ${err.message}`;
  }
}

function closeLightbox() {
  if (lightbox.hidden) return;
  lightbox.hidden = true;
  currentEntry = null;
  document.body.style.overflow = '';
  if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
}

lightboxClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox(); // 배경(카드 바깥) 클릭
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
});

lightboxLike.addEventListener('click', async () => {
  const entry = currentEntry;
  if (!entry || lightboxLike.disabled) return;
  const wasLiked = lightboxLike.getAttribute('aria-pressed') === 'true';
  const prevCount = Number(lightboxLikeCount.textContent) || 0;
  lightboxLike.disabled = true;
  renderLike(!wasLiked, prevCount + (wasLiked ? -1 : 1)); // 옵티미스틱 업데이트
  try {
    const data = await toggleLikeRequest(entry.id, deviceId);
    if (currentEntry === entry) renderLike(data.liked, data.count);
  } catch {
    if (currentEntry === entry) renderLike(wasLiked, prevCount); // 실패 시 롤백
  } finally {
    lightboxLike.disabled = false;
  }
});

commentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const entry = currentEntry;
  if (!entry) return;
  const name = commentNameInput.value;
  const text = commentTextInput.value;
  commentSubmit.disabled = true;
  commentsMsg.textContent = '올리는 중…';
  try {
    const data = await postComment(entry.id, deviceId, { name, text });
    rememberCommentName(data.comment.name);
    commentTextInput.value = '';
    commentsMsg.textContent = '';
    commentList.prepend(renderComment(data.comment));
  } catch (err) {
    commentsMsg.textContent = err.message || '댓글을 올리지 못했다';
  } finally {
    commentSubmit.disabled = false;
  }
});

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
