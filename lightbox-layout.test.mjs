import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lightboxMaxWidth, lightboxCell } from './lightbox-layout.js';

test('lightboxMaxWidth caps at 90% of a narrow (mobile) viewport', () => {
  assert.equal(lightboxMaxWidth(360), 324); // 360 * 0.9
});

test('lightboxMaxWidth caps at 520px on wide (desktop) viewports', () => {
  assert.equal(lightboxMaxWidth(1440), 520);
  assert.equal(lightboxMaxWidth(600), 520); // 600 * 0.9 = 540 > 520
});

test('lightboxMaxWidth falls back to the desktop cap for invalid input', () => {
  assert.equal(lightboxMaxWidth(0), 520);
  assert.equal(lightboxMaxWidth(NaN), 520);
  assert.equal(lightboxMaxWidth(undefined), 520);
});

test('lightboxCell keeps the board aspect ratio by dividing width by column count', () => {
  const cols = 10;
  assert.equal(lightboxCell(360, cols), 32); // floor(324 / 10)
  assert.equal(lightboxCell(1440, cols), 52); // floor(520 / 10)
});

test('lightboxCell never returns less than 1px', () => {
  assert.equal(lightboxCell(1, 100), 1);
});
