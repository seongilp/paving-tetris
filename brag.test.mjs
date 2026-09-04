import test from 'node:test';
import assert from 'node:assert/strict';
import { replayGame, applyPlacement, pieceFits, boardToGrid, emptyStats, addResult, COLS, ROWS, ACCENT_TONE } from './replay.js';
import { createBoard, countHoles } from './pattern.js';
import {
  validateName,
  validatePayload,
  verifySubmission,
  publicEntry,
  makeEntry,
  escapeHtml,
  makeId,
  validateDeviceId,
  validateComment,
  validateCommentName,
  validateCommentText,
} from './brag-validate.js';
import {
  saveEntry,
  listTop,
  listRecent,
  allowRequest,
  KEYS,
  entryExists,
  toggleLike,
  isLiked,
  likeCount,
  allowComment,
  addComment,
  makeComment,
  hashDeviceId,
  listComments,
  commentCount,
  attachCounts,
} from './brag-store.js';
import { createHandler, readJsonBody, deviceIdOf } from './brag-handler.js';
import { relativeTime, statBadges } from './brag-format.js';

/* ---------- 도우미: 무작위 게임을 게임 로직과 같은 방식으로 굴려 정직한 제출을 만든다 ---------- */

const rng = (seed) => () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

function simulate(seed, maxPieces = 40) {
  const rand = rng(seed);
  const shapes = ['I', 'I', 'L', 'Q'];
  const rotations = { I: 2, L: 4, Q: 1 };
  let board = createBoard(COLS, ROWS);
  let stats = emptyStats();
  let scoredRows = [];
  let score = 0;
  const placed = [];
  for (let i = 0; i < maxPieces; i += 1) {
    const s = shapes[Math.floor(rand() * shapes.length)];
    const r = Math.floor(rand() * rotations[s]);
    const t = rand() < 0.1 ? ACCENT_TONE : Math.floor(rand() * 6);
    const x = Math.floor(rand() * COLS);
    const probe = { s, r, x, y: 0, t };
    if (!pieceFits(board, probe)) continue;
    let y = 0;
    while (pieceFits(board, { ...probe, y: y + 1 })) y += 1;
    const piece = { ...probe, y };
    const step = applyPlacement(board, piece, { holes: stats.holes, scoredRows });
    board = step.board;
    score = Math.max(0, score + step.result.points);
    stats = addResult(stats, step.result);
    scoredRows = [...scoredRows, ...step.result.newRows];
    placed.push(piece);
  }
  return {
    name: '테스트유저',
    score,
    stats: { ...stats, holes: countHoles(board) },
    board: boardToGrid(board),
    placed,
    landed: placed.length,
  };
}

/* ---------- replay ---------- */

test('replayGame: 정직한 배치 기록은 점수·통계·격자가 그대로 재현된다', () => {
  for (const seed of [1, 7, 42]) {
    const game = simulate(seed);
    const replay = replayGame(game.placed);
    assert.ok(replay.ok, replay.error);
    assert.equal(replay.score, game.score);
    assert.deepEqual(replay.stats, game.stats);
    assert.deepEqual(replay.grid, game.board);
    assert.equal(replay.landed, game.placed.length);
  }
});

test('replayGame: 겹치거나 판 밖으로 나가는 조각은 거부', () => {
  assert.equal(replayGame([{ s: 'I', r: 0, x: 9, y: 13, t: 0 }]).ok, false, '판 밖');
  const overlap = [
    { s: 'I', r: 0, x: 0, y: 13, t: 0 },
    { s: 'I', r: 0, x: 1, y: 13, t: 1 },
  ];
  assert.equal(replayGame(overlap).ok, false, '겹침');
  assert.equal(replayGame([{ s: 'Z', r: 0, x: 0, y: 0, t: 0 }]).ok, false, '없는 모양');
  assert.equal(replayGame([{ s: 'I', r: 5, x: 0, y: 0, t: 0 }]).ok, false, '회전 범위');
  assert.equal(replayGame([]).ok, false, '빈 기록');
});

test('applyPlacement: 원본 보드를 바꾸지 않는다', () => {
  const board = createBoard(COLS, ROWS);
  const { board: next } = applyPlacement(board, { s: 'I', r: 0, x: 0, y: 13, t: 2 }, { holes: 0, scoredRows: [] });
  assert.equal(board[13][0], null);
  assert.deepEqual(next[13][0], { orient: 'h', accent: false, tone: 2 });
  assert.equal(boardToGrid(next)[13], '3300000000');
});

/* ---------- 닉네임 ---------- */

test('validateName: 2~12자, 허용 문자만, 공백 정리', () => {
  assert.equal(validateName('보도왕').value, '보도왕');
  assert.equal(validateName('  paver  01 ').value, 'paver 01');
  assert.equal(validateName('a').ok, false, '1자');
  assert.equal(validateName('가나다라마바사아자차카타파').ok, false, '13자');
  assert.equal(validateName('<script>').ok, false, '마크업 문자');
  assert.equal(validateName('a"b').ok, false, '따옴표');
  assert.equal(validateName(123).ok, false, '문자열 아님');
  assert.equal(validateName('한글 nick_1.-').ok, true);
});

/* ---------- 제출 검증 ---------- */

test('verifySubmission: 정직한 제출은 통과하고 재계산 값이 저장된다', () => {
  const game = simulate(3);
  const result = verifySubmission(game);
  assert.ok(result.ok, result.error);
  assert.equal(result.value.score, game.score);
  assert.equal(result.value.name, '테스트유저');
  assert.deepEqual(Object.keys(result.value.placed[0]).sort(), ['r', 's', 't', 'x', 'y']);
});

test('verifySubmission: 점수·통계·격자 조작은 400 감이다', () => {
  const game = simulate(5);
  assert.match(verifySubmission({ ...game, score: game.score + 1 }).error, /점수/);
  assert.match(
    verifySubmission({ ...game, stats: { ...game.stats, herringbone: game.stats.herringbone + 1 } }).error,
    /herringbone/,
  );
  const board = game.board.slice();
  board[0] = board[0][0] === '0' ? `1${board[0].slice(1)}` : `0${board[0].slice(1)}`;
  assert.match(verifySubmission({ ...game, board }).error, /격자/);
  assert.match(verifySubmission({ ...game, landed: game.landed + 1 }).error, /landed/);
});

test('validatePayload: 형식 오류를 잡는다', () => {
  const game = simulate(9);
  assert.equal(validatePayload(null).ok, false);
  assert.equal(validatePayload({ ...game, name: 'x' }).ok, false);
  assert.equal(validatePayload({ ...game, score: -1 }).ok, false);
  assert.equal(validatePayload({ ...game, score: '10' }).ok, false);
  assert.equal(validatePayload({ ...game, board: ['0'] }).ok, false);
  assert.equal(validatePayload({ ...game, board: game.board.map(() => '9999999999') }).ok, false);
  assert.equal(validatePayload({ ...game, stats: {} }).ok, false);
  assert.equal(validatePayload({ ...game, placed: [] }).ok, false);
  assert.equal(validatePayload({ ...game, placed: Array(71).fill(game.placed[0]), landed: 71 }).ok, false);
  const extra = { ...game, placed: [{ ...game.placed[0], __proto__: null, junk: 1 }, ...game.placed.slice(1)] };
  const ok = validatePayload(extra);
  assert.ok(ok.ok);
  assert.equal('junk' in ok.value.placed[0], false, '모르는 필드는 버린다');
});

/* ---------- 직렬화 ---------- */

test('makeEntry/publicEntry: ip 는 밖으로 나가지 않는다', () => {
  const entry = makeEntry({ name: 'a b', score: 1, stats: {}, board: [], placed: [], landed: 1 }, { id: 'x1', at: 5, ip: '1.2.3.4' });
  assert.equal(entry.ip, '1.2.3.4');
  const pub = publicEntry(entry);
  assert.equal('ip' in pub, false);
  assert.equal(pub.id, 'x1');
  assert.equal(publicEntry(null), null);
});

test('escapeHtml / makeId', () => {
  assert.equal(escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  const id = makeId(1000, () => 0.5);
  assert.match(id, /^[0-9a-z]+$/);
  assert.notEqual(makeId(), makeId());
});

/* ---------- 좋아요·댓글 검증 ---------- */

test('validateDeviceId: UUID 형식만 통과', () => {
  assert.equal(validateDeviceId('550e8400-e29b-41d4-a716-446655440000').ok, true);
  assert.equal(validateDeviceId('550E8400-E29B-41D4-A716-446655440000').ok, true, '대문자도 허용');
  assert.equal(validateDeviceId('not-a-uuid').ok, false);
  assert.equal(validateDeviceId('550e8400e29b41d4a716446655440000').ok, false, '하이픈 없음');
  assert.equal(validateDeviceId(123).ok, false);
  assert.equal(validateDeviceId(undefined).ok, false);
});

test('validateCommentName / validateCommentText: 길이·트림·제어문자 제거', () => {
  assert.equal(validateCommentName('a').ok, true, '1자도 허용');
  assert.equal(validateCommentName('').ok, false);
  assert.equal(validateCommentName('가나다라마바사아자차카타파').ok, false, '13자');
  assert.equal(validateCommentName('  이름  ').value, '이름');
  assert.equal(validateCommentName('na\x00me').value, 'name', '제어문자 제거');
  assert.equal(validateCommentText('a'.repeat(200)).ok, true);
  assert.equal(validateCommentText('a'.repeat(201)).ok, false);
  assert.equal(validateCommentText('   ').ok, false, '공백만은 거부');
  assert.equal(validateCommentText('hi\x07there').value, 'hithere');
});

test('validateComment: name/text 형식 오류를 함께 잡는다', () => {
  assert.equal(validateComment(null).ok, false);
  assert.equal(validateComment({ name: '', text: 'hi' }).ok, false);
  assert.equal(validateComment({ name: 'ok', text: '' }).ok, false);
  const good = validateComment({ name: ' ok ', text: ' hi ' });
  assert.deepEqual(good, { ok: true, value: { name: 'ok', text: 'hi' } });
});

test('hashDeviceId / makeComment: deviceId 원문은 저장되지 않는다', () => {
  const h1 = hashDeviceId('550e8400-e29b-41d4-a716-446655440000');
  assert.equal(h1.length, 8);
  assert.equal(hashDeviceId('550e8400-e29b-41d4-a716-446655440000'), h1, '결정적');
  assert.notEqual(hashDeviceId('other-device'), h1);
  const comment = makeComment({ name: 'ok', text: 'hi' }, { at: 5, deviceId: '550e8400-e29b-41d4-a716-446655440000' });
  assert.deepEqual(comment, { name: 'ok', text: 'hi', ts: 5, d: h1 });
  assert.equal('deviceId' in comment, false);
});

/* ---------- 가짜 Redis ---------- */

// redis LRANGE/LTRIM 식 음수 인덱스를 배열 slice 인자로 바꾼다
function normalizeRange(len, start, stop) {
  const from = start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
  const to = stop < 0 ? len + stop + 1 : Math.min(stop + 1, len);
  return [from, Math.max(to, from)];
}

function fakeRedis() {
  const kv = new Map();
  const zset = new Map();
  const lists = new Map();
  const sets = new Map();
  const expires = new Map();
  const CHAINABLE = ['set', 'zadd', 'lpush', 'rpush', 'ltrim', 'sadd', 'srem', 'scard', 'sismember', 'llen'];
  const api = {
    kv, zset, lists, sets, expires,
    async set(k, v, opts = {}) {
      if (opts.nx && kv.has(k)) return null;
      kv.set(k, JSON.stringify(v));
      if (opts.ex) expires.set(k, opts.ex);
      return 'OK';
    },
    async incr(k) { const n = (Number(kv.get(k)) || 0) + 1; kv.set(k, String(n)); return n; },
    async expire(k, s) { expires.set(k, s); return 1; },
    async exists(k) { return kv.has(k) ? 1 : 0; },
    async zadd(k, { score, member }) { if (!zset.has(k)) zset.set(k, new Map()); zset.get(k).set(member, score); return 1; },
    sorted(k) {
      return [...(zset.get(k) || new Map()).entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1));
    },
    async zrevrank(k, m) { const i = api.sorted(k).findIndex(([id]) => id === m); return i < 0 ? null : i; },
    async zrange(k, start, stop, { rev } = {}) {
      assert.ok(rev, 'top 은 역순으로 읽어야 한다');
      return api.sorted(k).slice(start, stop + 1).map(([id]) => id);
    },
    async lpush(k, v) { lists.set(k, [v, ...(lists.get(k) || [])]); return lists.get(k).length; },
    async rpush(k, v) { lists.set(k, [...(lists.get(k) || []), v]); return lists.get(k).length; },
    async ltrim(k, start, stop) {
      const arr = lists.get(k) || [];
      const [from, to] = normalizeRange(arr.length, start, stop);
      lists.set(k, arr.slice(from, to));
      return 'OK';
    },
    async lrange(k, start, stop) {
      const arr = lists.get(k) || [];
      const [from, to] = normalizeRange(arr.length, start, stop);
      return arr.slice(from, to);
    },
    async llen(k) { return (lists.get(k) || []).length; },
    async sadd(k, ...members) {
      if (!sets.has(k)) sets.set(k, new Set());
      const s = sets.get(k);
      let added = 0;
      for (const m of members) if (!s.has(m)) { s.add(m); added += 1; }
      return added;
    },
    async srem(k, ...members) {
      const s = sets.get(k);
      if (!s) return 0;
      let removed = 0;
      for (const m of members) if (s.delete(m)) removed += 1;
      return removed;
    },
    async sismember(k, m) { return sets.has(k) && sets.get(k).has(m) ? 1 : 0; },
    async scard(k) { return sets.has(k) ? sets.get(k).size : 0; },
    async mget(...keys) { return keys.map((k) => (kv.has(k) ? JSON.parse(kv.get(k)) : null)); },
    multi() {
      const queue = [];
      const tx = {
        exec: async () => { const out = []; for (const f of queue) out.push(await f()); return out; },
      };
      for (const name of CHAINABLE) {
        tx[name] = (...args) => { queue.push(() => api[name](...args)); return tx; };
      }
      return tx;
    },
    pipeline() {
      return api.multi();
    },
  };
  return api;
}

const entryOf = (id, score, extra = {}) =>
  makeEntry({ name: `u${id}`, score, stats: {}, board: [], placed: [], landed: 1 }, { id, at: score, ip: '9.9.9.9', ...extra });

test('store: 저장 → 순위, top 은 점수순, recent 는 최신순, ip 제거', async () => {
  const redis = fakeRedis();
  assert.equal(await saveEntry(redis, entryOf('a', 10)), 1);
  assert.equal(await saveEntry(redis, entryOf('b', 30)), 1);
  assert.equal(await saveEntry(redis, entryOf('c', 20)), 2);
  const top = await listTop(redis);
  assert.deepEqual(top.map((e) => [e.id, e.rank]), [['b', 1], ['c', 2], ['a', 3]]);
  assert.ok(top.every((e) => !('ip' in e)));
  const recent = await listRecent(redis);
  assert.deepEqual(recent.map((e) => e.id), ['c', 'b', 'a']);
});

test('store: recent 는 200개로 잘리고 rate limit 은 분당 5회', async () => {
  const redis = fakeRedis();
  for (let i = 0; i < 205; i += 1) await saveEntry(redis, entryOf(`e${i}`, i));
  assert.equal(redis.lists.get(KEYS.recent).length, 200);
  assert.equal((await listRecent(redis)).length, 20);
  assert.equal((await listTop(redis)).length, 50);

  for (let i = 0; i < 5; i += 1) assert.equal(await allowRequest(redis, '1.1.1.1'), true);
  assert.equal(await allowRequest(redis, '1.1.1.1'), false);
  assert.equal(await allowRequest(redis, '2.2.2.2'), true, '다른 IP 는 별개');
  assert.equal(redis.expires.get(KEYS.rate('1.1.1.1')), 60);
});

/* ---------- 좋아요·댓글 스토어 ---------- */

const DEVICE_A = '550e8400-e29b-41d4-a716-446655440000';
const DEVICE_B = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

test('entryExists: 저장된 id 만 존재로 판정', async () => {
  const redis = fakeRedis();
  await saveEntry(redis, entryOf('a', 10));
  assert.equal(await entryExists(redis, 'a'), true);
  assert.equal(await entryExists(redis, 'nope'), false);
});

test('toggleLike/isLiked/likeCount: SADD/SREM + SCARD 로 토글', async () => {
  const redis = fakeRedis();
  const first = await toggleLike(redis, 'a', DEVICE_A);
  assert.deepEqual(first, { liked: true, count: 1 });
  assert.equal(await isLiked(redis, 'a', DEVICE_A), true);

  const second = await toggleLike(redis, 'a', DEVICE_B);
  assert.deepEqual(second, { liked: true, count: 2 });

  const toggledOff = await toggleLike(redis, 'a', DEVICE_A);
  assert.deepEqual(toggledOff, { liked: false, count: 1 });
  assert.equal(await isLiked(redis, 'a', DEVICE_A), false);
  assert.equal(await likeCount(redis, 'a'), 1);
  assert.equal(await isLiked(redis, 'a', DEVICE_B), true);
});

test('allowComment: 같은 (id, deviceId) 는 10초에 한 번', async () => {
  const redis = fakeRedis();
  assert.equal(await allowComment(redis, 'a', DEVICE_A), true);
  assert.equal(await allowComment(redis, 'a', DEVICE_A), false, '10초 내 재요청');
  assert.equal(await allowComment(redis, 'a', DEVICE_B), true, '다른 deviceId 는 별개');
  assert.equal(await allowComment(redis, 'b', DEVICE_A), true, '다른 id 는 별개');
});

test('addComment/listComments/commentCount: 최신순, 최대 200개로 LTRIM(삭제 없음)', async () => {
  const redis = fakeRedis();
  for (let i = 0; i < 205; i += 1) {
    await addComment(redis, 'a', makeComment({ name: 'u', text: `c${i}` }, { at: i, deviceId: DEVICE_A }));
  }
  assert.equal(await commentCount(redis, 'a'), 200);
  const list = await listComments(redis, 'a');
  assert.equal(list.length, 50, '조회는 최대 50개');
  assert.equal(list[0].text, 'c204', '최신이 먼저');
  assert.equal(list[49].text, 'c155');
  const first = redis.lists.get(KEYS.comments('a'))[0];
  assert.equal(first.text, 'c5', '오래된 것부터 200개 넘어가면 밀려난다(삭제 아님, LTRIM)');
});

test('attachCounts: 파이프라인 한 번으로 여러 항목의 likes/comments 를 채운다', async () => {
  const redis = fakeRedis();
  await saveEntry(redis, entryOf('a', 10));
  await saveEntry(redis, entryOf('b', 20));
  await toggleLike(redis, 'a', DEVICE_A);
  await toggleLike(redis, 'a', DEVICE_B);
  await addComment(redis, 'b', makeComment({ name: 'u', text: 'hi' }, { at: 1, deviceId: DEVICE_A }));

  let pipelineCalls = 0;
  const countingRedis = new Proxy(redis, {
    get(target, prop) {
      if (prop === 'pipeline') return (...args) => { pipelineCalls += 1; return target.pipeline(...args); };
      return target[prop];
    },
  });

  const items = await listTop(redis);
  const withCounts = await attachCounts(countingRedis, items);
  assert.equal(pipelineCalls, 1, '항목 수와 무관하게 파이프라인 호출은 한 번');
  const byId = Object.fromEntries(withCounts.map((e) => [e.id, e]));
  assert.deepEqual([byId.a.likes, byId.a.comments], [2, 0]);
  assert.deepEqual([byId.b.likes, byId.b.comments], [0, 1]);
});

test('attachCounts: 빈 목록은 파이프라인을 만들지 않는다', async () => {
  const redis = fakeRedis();
  assert.deepEqual(await attachCounts(redis, []), []);
});

/* ---------- 핸들러 직접 호출 ---------- */

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) { res.headers[k.toLowerCase()] = v; },
    end(chunk) { res.body = chunk || ''; res.json = JSON.parse(res.body); },
  };
  return res;
}

const req = (method, url, { body, ip = '5.5.5.5', headers = {} } = {}) => ({
  method,
  url,
  headers: { 'x-forwarded-for': ip, ...headers },
  body,
  socket: { remoteAddress: '127.0.0.1' },
});

test('handler: POST 정직한 제출 → 201 + 순위, GET 목록 + 캐시 헤더', async () => {
  const redis = fakeRedis();
  let tick = 0;
  const handler = createHandler({ redis, now: () => 1_000 + tick++, newId: () => `id${tick}` });
  const game = simulate(11);

  const res = mockRes();
  await handler(req('POST', '/api/brag', { body: game }), res);
  assert.equal(res.statusCode, 201, res.body);
  assert.deepEqual(res.json, { ok: true, id: 'id0', rank: 1, score: game.score });

  const list = mockRes();
  await handler(req('GET', '/api/brag?tab=top'), list);
  assert.equal(list.statusCode, 200);
  assert.equal(list.headers['cache-control'], 'public, s-maxage=10, stale-while-revalidate=60');
  assert.equal(list.json.items.length, 1);
  assert.equal(list.json.items[0].name, '테스트유저');
  assert.equal(list.json.items[0].rank, 1);
  assert.equal('ip' in list.json.items[0], false);

  const recent = mockRes();
  await handler(req('GET', '/api/brag?tab=recent'), recent);
  assert.equal(recent.json.tab, 'recent');

  const bad = mockRes();
  await handler(req('GET', '/api/brag?tab=zzz'), bad);
  assert.equal(bad.statusCode, 400);
});

test('handler: 조작 400, 큰 바디 413, 과호출 429, 잘못된 메서드 405, JSON 에러 형식', async () => {
  const redis = fakeRedis();
  const handler = createHandler({ redis, log: () => {} });
  const game = simulate(13);

  const cheat = mockRes();
  await handler(req('POST', '/api/brag', { body: { ...game, score: 9999 } }), cheat);
  assert.equal(cheat.statusCode, 400);
  assert.equal(cheat.json.ok, false);
  assert.match(cheat.json.error, /점수/);

  const big = mockRes();
  await handler(req('POST', '/api/brag', { body: game, headers: { 'content-length': String(40 * 1024) } }), big);
  assert.equal(big.statusCode, 413);

  const junk = mockRes();
  await handler(req('POST', '/api/brag', { body: '{not json' }), junk);
  assert.equal(junk.statusCode, 413);

  for (let i = 0; i < 2; i += 1) await handler(req('POST', '/api/brag', { body: game }), mockRes());
  const limited = mockRes();
  await handler(req('POST', '/api/brag', { body: game }), limited);
  assert.equal(limited.statusCode, 429, '5회를 넘기면 429');

  const del = mockRes();
  await handler(req('DELETE', '/api/brag'), del);
  assert.equal(del.statusCode, 405);
  assert.deepEqual(Object.keys(del.json), ['ok', 'error']);

  const broken = createHandler({ redis: { incr: async () => { throw new Error('boom'); } }, log: () => {} });
  const err = mockRes();
  await broken(req('POST', '/api/brag', { body: game }), err);
  assert.equal(err.statusCode, 500);
  assert.equal(err.json.ok, false);
});

test('readJsonBody: 스트림에서 읽되 32KB 를 넘으면 거부', async () => {
  const stream = (chunks, headers = {}) => ({ headers, [Symbol.asyncIterator]: async function* () { yield* chunks; } });
  const ok = await readJsonBody(stream([Buffer.from('{"a":'), Buffer.from('1}')]));
  assert.deepEqual(ok, { ok: true, value: { a: 1 } });
  const huge = await readJsonBody(stream([Buffer.alloc(33 * 1024, 32)]));
  assert.equal(huge.ok, false);
});

test('deviceIdOf: X-Device-Id 헤더 형식 검증', () => {
  assert.equal(deviceIdOf(req('GET', '/', { headers: { 'x-device-id': DEVICE_A } })).ok, true);
  assert.equal(deviceIdOf(req('GET', '/', {})).ok, false);
  assert.equal(deviceIdOf(req('GET', '/', { headers: { 'x-device-id': 'bad' } })).ok, false);
});

/* ---------- 핸들러: 좋아요·댓글 ---------- */

async function seedGame(handler, seed = 21) {
  const game = simulate(seed);
  const res = mockRes();
  await handler(req('POST', '/api/brag', { body: game }), res);
  assert.equal(res.statusCode, 201, res.body);
  return res.json.id;
}

test('handler: 좋아요 토글은 200 + {liked, count}, 없는 id 는 404, device id 없으면 400', async () => {
  const redis = fakeRedis();
  const handler = createHandler({ redis, log: () => {} });
  const id = await seedGame(handler);

  const noDevice = mockRes();
  await handler(req('POST', `/api/brag?action=like&id=${id}`, {}), noDevice);
  assert.equal(noDevice.statusCode, 400);
  assert.equal(noDevice.json.ok, false);

  const on = mockRes();
  await handler(req('POST', `/api/brag?action=like&id=${id}`, { headers: { 'x-device-id': DEVICE_A } }), on);
  assert.equal(on.statusCode, 200);
  assert.deepEqual(on.json, { ok: true, liked: true, count: 1 });

  const off = mockRes();
  await handler(req('POST', `/api/brag?action=like&id=${id}`, { headers: { 'x-device-id': DEVICE_A } }), off);
  assert.deepEqual(off.json, { ok: true, liked: false, count: 0 });

  const missing = mockRes();
  await handler(req('POST', '/api/brag?action=like&id=nope', { headers: { 'x-device-id': DEVICE_A } }), missing);
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(Object.keys(missing.json), ['ok', 'error']);
});

test('handler: 댓글 작성 → 201, 검증 실패 400, 같은 device 10초 이내 429, 없는 id 404', async () => {
  const redis = fakeRedis();
  const handler = createHandler({ redis, now: () => 5000, log: () => {} });
  const id = await seedGame(handler, 23);
  const DEVICE_C = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';

  const bad = mockRes();
  await handler(
    req('POST', `/api/brag?action=comment&id=${id}`, { headers: { 'x-device-id': DEVICE_C }, body: { name: '', text: 'hi' } }),
    bad,
  );
  assert.equal(bad.statusCode, 400, '검증 실패는 rate limit 을 소모하지 않는 별도 device 로 확인');

  const ok = mockRes();
  await handler(
    req('POST', `/api/brag?action=comment&id=${id}`, { headers: { 'x-device-id': DEVICE_A }, body: { name: '보도팬', text: '예쁘다' } }),
    ok,
  );
  assert.equal(ok.statusCode, 201, ok.body);
  assert.equal(ok.json.ok, true);
  assert.equal(ok.json.count, 1);
  assert.deepEqual(Object.keys(ok.json.comment).sort(), ['d', 'name', 'text', 'ts']);
  assert.equal(ok.json.comment.name, '보도팬');
  assert.equal('deviceId' in ok.json.comment, false);

  const limited = mockRes();
  await handler(
    req('POST', `/api/brag?action=comment&id=${id}`, { headers: { 'x-device-id': DEVICE_A }, body: { name: 'x', text: 'y' } }),
    limited,
  );
  assert.equal(limited.statusCode, 429);

  const otherDevice = mockRes();
  await handler(
    req('POST', `/api/brag?action=comment&id=${id}`, { headers: { 'x-device-id': DEVICE_B }, body: { name: '다른유저', text: '멋져요' } }),
    otherDevice,
  );
  assert.equal(otherDevice.statusCode, 201, '다른 device 는 rate limit 과 무관');

  const missing = mockRes();
  await handler(
    req('POST', '/api/brag?action=comment&id=nope', { headers: { 'x-device-id': DEVICE_A }, body: { name: 'x', text: 'y' } }),
    missing,
  );
  assert.equal(missing.statusCode, 404);
});

test('handler: GET comments 는 liked/likes/comments 를 한 번에, 없는 id 는 404', async () => {
  const redis = fakeRedis();
  const handler = createHandler({ redis, now: () => 9000, log: () => {} });
  const id = await seedGame(handler, 29);
  await handler(req('POST', `/api/brag?action=like&id=${id}`, { headers: { 'x-device-id': DEVICE_A } }), mockRes());
  await handler(
    req('POST', `/api/brag?action=comment&id=${id}`, { headers: { 'x-device-id': DEVICE_B }, body: { name: '댓글러', text: '좋아요' } }),
    mockRes(),
  );

  const mine = mockRes();
  await handler(req('GET', `/api/brag?action=comments&id=${id}`, { headers: { 'x-device-id': DEVICE_A } }), mine);
  assert.equal(mine.statusCode, 200);
  assert.deepEqual(mine.json, {
    ok: true,
    liked: true,
    likes: 1,
    comments: [{ name: '댓글러', text: '좋아요', ts: 9000, d: mine.json.comments[0].d }],
  });

  const notMine = mockRes();
  await handler(req('GET', `/api/brag?action=comments&id=${id}`, { headers: { 'x-device-id': DEVICE_B } }), notMine);
  assert.equal(notMine.json.liked, false, '좋아요는 device 별로 다르다');

  const missing = mockRes();
  await handler(req('GET', '/api/brag?action=comments&id=nope'), missing);
  assert.equal(missing.statusCode, 404);
});

test('handler: 목록(top/recent) 응답 각 항목에 likes/comments 카운트가 붙는다', async () => {
  const redis = fakeRedis();
  const handler = createHandler({ redis, log: () => {} });
  const id = await seedGame(handler, 31);
  await handler(req('POST', `/api/brag?action=like&id=${id}`, { headers: { 'x-device-id': DEVICE_A } }), mockRes());
  await handler(req('POST', `/api/brag?action=like&id=${id}`, { headers: { 'x-device-id': DEVICE_B } }), mockRes());
  await handler(
    req('POST', `/api/brag?action=comment&id=${id}`, { headers: { 'x-device-id': DEVICE_A }, body: { name: 'x', text: 'y' } }),
    mockRes(),
  );

  const top = mockRes();
  await handler(req('GET', '/api/brag?tab=top'), top);
  assert.equal(top.json.items[0].likes, 2);
  assert.equal(top.json.items[0].comments, 1);
  assert.equal('liked' in top.json.items[0], false, '목록엔 내 liked 여부를 붙이지 않는다');
});

/* ---------- 표시 ---------- */

test('relativeTime / statBadges', () => {
  const now = 1_000_000_000_000;
  assert.equal(relativeTime(now - 3000, now), '방금');
  assert.equal(relativeTime(now - 45_000, now), '45초 전');
  assert.equal(relativeTime(now - 5 * 60_000, now), '5분 전');
  assert.equal(relativeTime(now - 3 * 3_600_000, now), '3시간 전');
  assert.equal(relativeTime(now - 2 * 86_400_000, now), '2일 전');
  assert.equal(relativeTime(now - 15 * 86_400_000, now), '2주 전');
  assert.deepEqual(statBadges({ herringbone: 2, basket: 0, rows: 1, accent: 0 }), ['헤링본 2', '완성줄 1']);
  assert.deepEqual(statBadges({}), ['무늬 없음']);
});
