// Redis 저장소 접근. redis 클라이언트를 주입받아 테스트에서는 가짜로 바꿔 끼운다.
// 구조: ZSET brag:top (score → id), LIST brag:recent (최근 200), STRING brag:e:{id} (JSON)
// node:crypto 를 쓰므로 서버 전용 — 브라우저 번들(board.js/brag.js)은 이 파일을 import 하지 않는다.
import { createHash } from 'node:crypto';
import { publicEntry } from './brag-validate.js';

export const KEYS = Object.freeze({
  top: 'brag:top',
  recent: 'brag:recent',
  entry: (id) => `brag:e:${id}`,
  rate: (ip) => `brag:rl:${ip}`,
  likes: (id) => `brag:likes:${id}`,
  comments: (id) => `brag:comments:${id}`,
  commentRate: (id, deviceId) => `brag:crl:${id}:${deviceId}`,
});

export const RECENT_KEEP = 200;
export const TOP_LIMIT = 50;
export const RECENT_LIMIT = 20;
export const RATE_LIMIT = 5;
export const RATE_WINDOW_SEC = 60;
export const COMMENT_KEEP = 200;
export const COMMENT_LIST_LIMIT = 50;
export const COMMENT_RATE_WINDOW_SEC = 10;

// 분당 요청 수를 세고 한도를 넘으면 false
export async function allowRequest(redis, ip, { limit = RATE_LIMIT, windowSec = RATE_WINDOW_SEC } = {}) {
  const key = KEYS.rate(ip);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSec);
  return count <= limit;
}

// 저장 후 순위(1부터)를 돌려준다
export async function saveEntry(redis, entry) {
  const tx = redis.multi();
  tx.set(KEYS.entry(entry.id), entry);
  tx.zadd(KEYS.top, { score: entry.score, member: entry.id });
  tx.lpush(KEYS.recent, entry.id);
  tx.ltrim(KEYS.recent, 0, RECENT_KEEP - 1);
  await tx.exec();
  const rank = await redis.zrevrank(KEYS.top, entry.id);
  return rank === null ? null : rank + 1;
}

async function fetchEntries(redis, ids) {
  if (ids.length === 0) return [];
  const raw = await redis.mget(...ids.map(KEYS.entry));
  return raw.map((e) => (typeof e === 'string' ? JSON.parse(e) : e)).filter(Boolean).map(publicEntry);
}

export async function listTop(redis, limit = TOP_LIMIT) {
  const ids = await redis.zrange(KEYS.top, 0, limit - 1, { rev: true });
  const items = await fetchEntries(redis, ids);
  return items.map((item, i) => ({ ...item, rank: i + 1 }));
}

export async function listRecent(redis, limit = RECENT_LIMIT) {
  const ids = await redis.lrange(KEYS.recent, 0, limit - 1);
  return fetchEntries(redis, ids);
}

export async function entryExists(redis, id) {
  return Boolean(await redis.exists(KEYS.entry(id)));
}

// 댓글에는 deviceId 원문 대신 짧은 해시만 남긴다(다른 사람 글인지 구분하는 용도, 신원 아님).
export function hashDeviceId(deviceId) {
  return createHash('sha256').update(deviceId).digest('hex').slice(0, 8);
}

// 댓글 저장 형태. deviceId 원문은 해시로만 남긴다.
export function makeComment({ name, text }, { at, deviceId }) {
  return Object.freeze({ name, text, ts: at, d: hashDeviceId(deviceId) });
}

// 좋아요 토글. SADD/SREM + SCARD. 반환값의 liked 는 토글 후 상태.
export async function toggleLike(redis, id, deviceId) {
  const key = KEYS.likes(id);
  const already = await redis.sismember(key, deviceId);
  if (already) await redis.srem(key, deviceId);
  else await redis.sadd(key, deviceId);
  const count = await redis.scard(key);
  return { liked: !already, count };
}

export async function isLiked(redis, id, deviceId) {
  return Boolean(await redis.sismember(KEYS.likes(id), deviceId));
}

export async function likeCount(redis, id) {
  return redis.scard(KEYS.likes(id));
}

// 같은 (id, deviceId) 는 댓글당 windowSec 초에 한 번만 — SET NX EX
export async function allowComment(redis, id, deviceId, { windowSec = COMMENT_RATE_WINDOW_SEC } = {}) {
  const ok = await redis.set(KEYS.commentRate(id, deviceId), '1', { nx: true, ex: windowSec });
  return ok === 'OK' || ok === true;
}

// RPUSH 로 뒤에 붙이고 최근 COMMENT_KEEP개만 남긴다(삭제 없음, 오래된 것부터 밀려난다)
export async function addComment(redis, id, comment) {
  const key = KEYS.comments(id);
  const tx = redis.multi();
  tx.rpush(key, comment);
  tx.ltrim(key, -COMMENT_KEEP, -1);
  await tx.exec();
}

export async function listComments(redis, id, limit = COMMENT_LIST_LIMIT) {
  const raw = await redis.lrange(KEYS.comments(id), -limit, -1);
  const items = raw.map((c) => (typeof c === 'string' ? JSON.parse(c) : c));
  return items.reverse(); // 최신순
}

export async function commentCount(redis, id) {
  return redis.llen(KEYS.comments(id));
}

// N+1 방지: 파이프라인 하나로 목록 전체의 좋아요·댓글 수를 한 번에 가져온다
export async function attachCounts(redis, items) {
  if (items.length === 0) return items;
  const pipe = redis.pipeline();
  for (const item of items) {
    pipe.scard(KEYS.likes(item.id));
    pipe.llen(KEYS.comments(item.id));
  }
  const results = await pipe.exec();
  return items.map((item, i) => ({
    ...item,
    likes: Number(results[i * 2]) || 0,
    comments: Number(results[i * 2 + 1]) || 0,
  }));
}
