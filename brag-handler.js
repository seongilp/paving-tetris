// /api/brag 요청 처리. redis·시계·id 생성기를 주입받아 함수 밖에서 직접 호출해 테스트한다.
import { verifySubmission, makeEntry, makeId, validateDeviceId, validateComment, MAX_BODY_BYTES } from './brag-validate.js';
import {
  allowRequest,
  saveEntry,
  listTop,
  listRecent,
  entryExists,
  toggleLike,
  isLiked,
  likeCount,
  allowComment,
  addComment,
  makeComment,
  listComments,
  commentCount,
  attachCounts,
} from './brag-store.js';

const LIST_CACHE = 'public, s-maxage=10, stale-while-revalidate=60';

const send = (res, status, payload, headers = {}) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(payload));
};

const fail = (res, status, error) => send(res, status, { ok: false, error }, { 'Cache-Control': 'no-store' });

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  const first = Array.isArray(fwd) ? fwd[0] : String(fwd || '').split(',')[0];
  return first.trim() || req.socket?.remoteAddress || 'unknown';
}

// 브라우저별 deviceId — X-Device-Id 헤더. 형식이 틀리면 실패를 그대로 돌려준다.
export function deviceIdOf(req) {
  const raw = req.headers['x-device-id'];
  return validateDeviceId(Array.isArray(raw) ? raw[0] : raw);
}

// Vercel 은 JSON 바디를 req.body 로 미리 파싱해 준다. 없으면 스트림에서 제한 크기까지만 읽는다.
export async function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > maxBytes) return { ok: false, error: '요청이 너무 크다' };
  if (req.body !== undefined) {
    if (typeof req.body === 'string') return parseJson(req.body, maxBytes);
    if (Buffer.isBuffer(req.body)) return parseJson(req.body.toString('utf8'), maxBytes);
    if (Buffer.byteLength(JSON.stringify(req.body)) > maxBytes) return { ok: false, error: '요청이 너무 크다' };
    return { ok: true, value: req.body };
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) return { ok: false, error: '요청이 너무 크다' };
    chunks.push(chunk);
  }
  return parseJson(Buffer.concat(chunks).toString('utf8'), maxBytes);
}

function parseJson(text, maxBytes) {
  if (Buffer.byteLength(text) > maxBytes) return { ok: false, error: '요청이 너무 크다' };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, error: 'JSON 을 읽을 수 없다' };
  }
}

function requestUrl(req) {
  return new URL(req.url || '/', 'http://local');
}

function tabOf(url) {
  const tab = url.searchParams.get('tab') || 'top';
  return tab === 'recent' ? 'recent' : tab === 'top' ? 'top' : null;
}

export function createHandler({ redis, now = Date.now, newId = makeId, log = console.error }) {
  async function handleListGet(req, res, url) {
    const tab = tabOf(url);
    if (!tab) return fail(res, 400, 'tab 은 top 또는 recent');
    const items = tab === 'top' ? await listTop(redis) : await listRecent(redis);
    const withCounts = await attachCounts(redis, items);
    return send(res, 200, { ok: true, tab, items: withCounts }, { 'Cache-Control': LIST_CACHE });
  }

  // 라이트박스가 열릴 때 한 번에: liked 여부 + 좋아요 수 + 댓글 목록
  async function handleCommentsGet(req, res, url) {
    const id = url.searchParams.get('id');
    if (!id) return fail(res, 400, 'id 가 필요하다');
    if (!(await entryExists(redis, id))) return fail(res, 404, '존재하지 않는 기록');
    const device = deviceIdOf(req);
    const [liked, likes, comments] = await Promise.all([
      device.ok ? isLiked(redis, id, device.value) : false,
      likeCount(redis, id),
      listComments(redis, id),
    ]);
    return send(res, 200, { ok: true, liked, likes, comments }, { 'Cache-Control': 'no-store' });
  }

  async function handleGet(req, res) {
    const url = requestUrl(req);
    const action = url.searchParams.get('action');
    if (action === 'comments') return handleCommentsGet(req, res, url);
    return handleListGet(req, res, url);
  }

  async function handleBragPost(req, res) {
    const ip = clientIp(req);
    if (!(await allowRequest(redis, ip))) return fail(res, 429, '너무 자주 자랑했다. 잠시 후 다시');
    const body = await readJsonBody(req);
    if (!body.ok) return fail(res, 413, body.error);
    const verified = verifySubmission(body.value);
    if (!verified.ok) return fail(res, 400, verified.error);
    const entry = makeEntry(verified.value, { id: newId(), at: now(), ip });
    const rank = await saveEntry(redis, entry);
    return send(res, 201, { ok: true, id: entry.id, rank, score: entry.score }, { 'Cache-Control': 'no-store' });
  }

  async function handleLikePost(req, res, url) {
    const id = url.searchParams.get('id');
    if (!id) return fail(res, 400, 'id 가 필요하다');
    const device = deviceIdOf(req);
    if (!device.ok) return fail(res, 400, device.error);
    if (!(await entryExists(redis, id))) return fail(res, 404, '존재하지 않는 기록');
    const { liked, count } = await toggleLike(redis, id, device.value);
    return send(res, 200, { ok: true, liked, count }, { 'Cache-Control': 'no-store' });
  }

  async function handleCommentPost(req, res, url) {
    const id = url.searchParams.get('id');
    if (!id) return fail(res, 400, 'id 가 필요하다');
    const device = deviceIdOf(req);
    if (!device.ok) return fail(res, 400, device.error);
    if (!(await entryExists(redis, id))) return fail(res, 404, '존재하지 않는 기록');
    if (!(await allowComment(redis, id, device.value))) return fail(res, 429, '너무 자주 댓글을 달았다. 잠시 후 다시');
    const body = await readJsonBody(req);
    if (!body.ok) return fail(res, 413, body.error);
    const verified = validateComment(body.value);
    if (!verified.ok) return fail(res, 400, verified.error);
    const comment = makeComment(verified.value, { at: now(), deviceId: device.value });
    await addComment(redis, id, comment);
    const count = await commentCount(redis, id);
    return send(res, 201, { ok: true, comment, count }, { 'Cache-Control': 'no-store' });
  }

  async function handlePost(req, res) {
    const url = requestUrl(req);
    const action = url.searchParams.get('action');
    if (action === 'like') return handleLikePost(req, res, url);
    if (action === 'comment') return handleCommentPost(req, res, url);
    return handleBragPost(req, res);
  }

  return async function handler(req, res) {
    try {
      if (req.method === 'GET') return await handleGet(req, res);
      if (req.method === 'POST') return await handlePost(req, res);
      res.setHeader('Allow', 'GET, POST');
      return fail(res, 405, '허용되지 않는 메서드');
    } catch (err) {
      log('[brag]', err);
      return fail(res, 500, '서버 오류');
    }
  };
}
