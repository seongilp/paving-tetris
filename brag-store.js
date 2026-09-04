// Redis 저장소 접근. redis 클라이언트를 주입받아 테스트에서는 가짜로 바꿔 끼운다.
// 구조: ZSET brag:top (score → id), LIST brag:recent (최근 200), STRING brag:e:{id} (JSON)
import { publicEntry } from './brag-validate.js';

export const KEYS = Object.freeze({
  top: 'brag:top',
  recent: 'brag:recent',
  entry: (id) => `brag:e:${id}`,
  rate: (ip) => `brag:rl:${ip}`,
});

export const RECENT_KEEP = 200;
export const TOP_LIMIT = 50;
export const RECENT_LIMIT = 20;
export const RATE_LIMIT = 5;
export const RATE_WINDOW_SEC = 60;

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
