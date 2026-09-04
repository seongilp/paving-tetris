// 게임 종료 오버레이의 "자랑하기" — 닉네임 기억, POST /api/brag, 결과 표시
import { validateName } from './brag-validate.js';

const NAME_KEY = 'paving-tetris.name';
const IDS_KEY = 'paving-tetris.brag-ids';
const MAX_IDS = 50;

const readStore = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const writeStore = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 저장 불가 환경은 조용히 넘어간다 */
  }
};

export const readMyIds = () => {
  const ids = readStore(IDS_KEY, []);
  return Array.isArray(ids) ? ids : [];
};

const rememberId = (id) => writeStore(IDS_KEY, [id, ...readMyIds()].slice(0, MAX_IDS));

export async function submitBrag(payload, fetchImpl = fetch) {
  const res = await fetchImpl('/api/brag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({ ok: false, error: '응답을 읽을 수 없다' }));
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export function setupBrag() {
  const form = document.getElementById('brag-form');
  const input = document.getElementById('brag-name');
  const button = document.getElementById('brag-submit');
  const msg = document.getElementById('brag-msg');
  let getPayload = null;
  let busy = false;

  input.value = readStore(NAME_KEY, '') || '';

  const show = (text, tone = '') => {
    msg.className = `brag-msg ${tone}`.trim();
    msg.replaceChildren(text);
  };

  const showRank = ({ rank }) => {
    const link = document.createElement('a');
    link.href = 'board.html';
    link.textContent = '게시판 보기 →';
    const label = rank ? `등록 완료 — 현재 ${rank}위! ` : '등록 완료! ';
    msg.className = 'brag-msg ok';
    msg.replaceChildren(label, link);
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !getPayload) return;
    const name = validateName(input.value);
    if (!name.ok) return show(name.error, 'err');
    writeStore(NAME_KEY, name.value);
    busy = true;
    button.disabled = true;
    show('올리는 중…');
    try {
      const data = await submitBrag({ name: name.value, ...getPayload() });
      rememberId(data.id);
      showRank(data);
      form.classList.add('done');
    } catch (err) {
      show(err.message || '실패했다', 'err');
      button.disabled = false;
    } finally {
      busy = false;
      button.blur();
    }
  });

  return {
    // 게임이 끝났을 때 — 전송할 데이터를 만드는 함수를 받는다
    arm(payloadFactory) {
      getPayload = payloadFactory;
      button.disabled = false;
      form.classList.remove('done');
      show('');
    },
    reset() {
      getPayload = null;
      form.classList.remove('done');
      show('');
    },
  };
}
