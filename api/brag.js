// Vercel Function (Node runtime, ESM). 실제 처리는 brag-handler.js.
import { Redis } from '@upstash/redis';
import { createHandler } from '../brag-handler.js';

const url = process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN;

const handler = url && token
  ? createHandler({ redis: new Redis({ url, token }) })
  : async (req, res) => {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: '저장소가 설정되지 않았다' }));
    };

export default handler;
