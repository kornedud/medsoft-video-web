export function apiBase() {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  return "";
}

export function apiUrl(path) {
  const base = apiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : `/api${p}`;
}

export function wsRoomUrl(shareToken, clientId) {
  const encTok = encodeURIComponent(shareToken);
  const encCid = encodeURIComponent(clientId);
  const path = `/ws/room/${encTok}?client_id=${encCid}`;
  const base = apiBase();
  if (base) {
    const ws = base.replace(/^http/, "ws");
    return `${ws}${path}`;
  }
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}${path}`;
}

export async function readApiError(res) {
  try {
    const body = await res.json();
    if (typeof body.detail === "string") {
      return body.detail;
    }
    if (Array.isArray(body.detail)) {
      return body.detail.map((e) => e.msg).join(" ");
    }
  } catch {
    /* ignore */
  }
  return `Запрос не выполнен (код ${res.status}).`;
}
