import test from 'node:test';
import assert from 'node:assert/strict';
import {
  H, V, S, POINTS,
  createBoard, countHerringbone, countBasketWeave, countMonotony,
  countHoles, completedRows, countAccentPairs, scorePlacement,
} from './pattern.js';

const put = (board, x, y, orient, accent = false) => {
  board[y][x] = { orient, accent };
  return { x, y };
};

test('헤링본: 기존 셀과 수직으로 맞물린 쌍만 센다', () => {
  const board = createBoard(4, 4);
  put(board, 0, 0, H);
  put(board, 1, 0, H);
  const fresh = [put(board, 0, 1, V), put(board, 1, 1, V)];
  assert.equal(countHerringbone(board, fresh), 2);

  const flat = createBoard(4, 4);
  put(flat, 0, 0, H);
  put(flat, 1, 0, H);
  const same = [put(flat, 0, 1, H), put(flat, 1, 1, H)];
  assert.equal(countHerringbone(flat, same), 0, '같은 방향은 헤링본이 아니다');
});

test('바구니짜기: 2×2가 가로2 + 세로2로 꽉 찬 창만 센다', () => {
  const board = createBoard(3, 3);
  put(board, 0, 0, H);
  put(board, 1, 0, H);
  put(board, 0, 1, V);
  const fresh = [put(board, 1, 1, V)];
  assert.equal(countBasketWeave(board, fresh), 1);

  const partial = createBoard(3, 3);
  put(partial, 0, 0, H);
  put(partial, 1, 0, H);
  const three = [put(partial, 0, 1, V)];
  assert.equal(countBasketWeave(partial, three), 0, '빈 칸이 있으면 0');
});

test('구멍: 위가 막힌 빈 셀만 센다', () => {
  const board = createBoard(3, 4);
  put(board, 0, 0, H);
  // (0,1) (0,2) (0,3) 은 위가 막혀 구멍 3개
  assert.equal(countHoles(board), 3);

  const clean = createBoard(3, 4);
  put(clean, 1, 3, H);
  assert.equal(countHoles(clean), 0, '바닥에 붙은 블록은 구멍을 만들지 않는다');
});

test('완성 줄: 빈틈없이 채워진 행을 찾되 사라지지 않는다', () => {
  const board = createBoard(3, 2);
  put(board, 0, 1, H);
  put(board, 1, 1, H);
  put(board, 2, 1, V);
  assert.deepEqual(completedRows(board), [1]);
  assert.ok(board[1][0], '완성 줄도 보드에 그대로 남는다');
});

test('단조로움: 같은 방향 3개 이상 연속 구간을 센다', () => {
  const board = createBoard(5, 2);
  put(board, 0, 0, H);
  put(board, 1, 0, H);
  const fresh = [put(board, 2, 0, H)];
  assert.equal(countMonotony(board, fresh), 1);

  const short = createBoard(5, 2);
  put(short, 0, 0, H);
  const two = [put(short, 1, 0, H)];
  assert.equal(countMonotony(short, two), 0, '2개는 단조롭지 않다');
});

test('악센트: 대각선으로 이어진 체스판 쌍을 센다', () => {
  const board = createBoard(3, 3);
  put(board, 0, 0, S, true);
  const fresh = [put(board, 1, 1, S, true)];
  assert.equal(countAccentPairs(board, fresh), 1);
  assert.equal(countAccentPairs(createBoard(3, 3), []), 0);
});

test('scorePlacement: 규칙별 배점을 합산하고 구멍은 증가분만 깎는다', () => {
  const board = createBoard(2, 2);
  put(board, 0, 0, H);
  put(board, 1, 0, H);
  put(board, 0, 1, V);
  const fresh = [put(board, 1, 1, V)];
  const result = scorePlacement(board, fresh, { holes: 0, scoredRows: [0] });

  assert.equal(result.basket, 1);
  assert.equal(result.herringbone, 1, '새 셀 하나가 위쪽 가로 블록과만 맞물린다');
  assert.deepEqual(result.newRows, [1], '이미 채점한 0행은 다시 세지 않는다');
  assert.equal(result.newHoles, 0);
  const expected =
    result.herringbone * POINTS.herringbone +
    result.basket * POINTS.basket +
    result.monotony * POINTS.monotony +
    POINTS.fullRow;
  assert.equal(result.points, expected);
});

test('scorePlacement: 새로 생긴 구멍마다 −2', () => {
  const board = createBoard(3, 3);
  const fresh = [put(board, 0, 0, S, false)];
  const result = scorePlacement(board, fresh, { holes: 0, scoredRows: [] });
  assert.equal(result.newHoles, 2);
  assert.equal(result.points, 2 * POINTS.hole);
});
