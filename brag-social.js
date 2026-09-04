// 좋아요·댓글 API 클라이언트 — board.js 라이트박스가 사용한다. 네트워크만 다루고 DOM 은 모른다.
const jsonHeaders = (deviceId) => ({ 'Content-Type': 'application/json', 'X-Device-Id': deviceId });

async function readJson(res) {
  const data = await res.json().catch(() => ({ ok: false, error: '응답을 읽을 수 없다' }));
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// 라이트박스가 열릴 때 한 번에: liked 여부·좋아요 수·댓글 목록
export async function fetchEntryDetail(id, deviceId, fetchImpl = fetch) {
  const res = await fetchImpl(`/api/brag?action=comments&id=${encodeURIComponent(id)}`, {
    headers: { 'X-Device-Id': deviceId },
  });
  return readJson(res);
}

export async function toggleLikeRequest(id, deviceId, fetchImpl = fetch) {
  const res = await fetchImpl(`/api/brag?action=like&id=${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: jsonHeaders(deviceId),
  });
  return readJson(res);
}

export async function postComment(id, deviceId, { name, text }, fetchImpl = fetch) {
  const res = await fetchImpl(`/api/brag?action=comment&id=${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: jsonHeaders(deviceId),
    body: JSON.stringify({ name, text }),
  });
  return readJson(res);
}
