import "./style.css";
import { apiUrl, readApiError, wsRoomUrl } from "./api.js";
import {
  addIceCandidate,
  addStreamToPc,
  createOffer,
  createPeerConnection,
  getLocalStream,
  handleAnswer,
  handleOffer,
  stopAllTracks,
  toggleTrack,
} from "./webrtc.js";

const root = document.getElementById("app");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getShareTokenFromUrl() {
  const q = new URLSearchParams(window.location.search);
  return q.get("t") || q.get("token") || "";
}

async function resolveClientId() {
  const res = await fetch(apiUrl("/auth/me"), { credentials: "include" });
  if (res.ok) {
    const u = await res.json();
    return `user-${u.id}`;
  }
  let g = sessionStorage.getItem("tc_room_client");
  if (!g) {
    g = crypto.randomUUID();
    sessionStorage.setItem("tc_room_client", g);
  }
  return `guest-${g}`;
}

function absoluteUrl(pathOrUrl) {
  return pathOrUrl.startsWith("http")
    ? pathOrUrl
    : new URL(pathOrUrl, window.location.origin).toString();
}

function leaveBeacon(shareToken, clientId) {
  const url = absoluteUrl(
    apiUrl(`/rooms/by-token/${encodeURIComponent(shareToken)}/leave`),
  );
  const body = JSON.stringify({ client_id: clientId });
  try {
    navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
  } catch {
    /* ignore */
  }
}

function render(html) {
  root.innerHTML = html;
}

async function fetchStatus(shareToken, clientId) {
  const path = apiUrl(`/rooms/by-token/${encodeURIComponent(shareToken)}`);
  const u = new URL(absoluteUrl(path));
  u.searchParams.set("client_id", clientId);
  return fetch(u.toString(), { credentials: "include" });
}

function renderCallEnded(message, kind) {
  render(`
    <main class="shell">
      <p class="nav"><a href="/">На главную</a> · <a href="/app/">Приложение</a></p>
      <h1>Звонок завершён</h1>
      <section class="card"><p class="status status--${kind}">${escapeHtml(message)}</p></section>
    </main>
  `);
}

function renderError(title, message) {
  render(`
    <main class="shell">
      <p class="nav"><a href="/">На главную</a> · <a href="/app/">Приложение</a></p>
      <h1>${escapeHtml(title)}</h1>
      <section class="card"><p class="status status--err">${escapeHtml(message)}</p></section>
    </main>
  `);
}

async function main() {
  const shareToken = getShareTokenFromUrl();
  if (!shareToken) {
    renderError("Комната", "В ссылке нет ключа комнаты (?t=…).");
    return;
  }

  const clientId = await resolveClientId();

  let res = await fetchStatus(shareToken, clientId);
  if (res.status === 404) { renderError("Комната", "Комната не найдена."); return; }
  if (!res.ok) { renderError("Ошибка", await readApiError(res)); return; }

  let st = await res.json();
  if (st.status !== "active") { renderError("Звонок", "Звонок завершён."); return; }
  if (st.is_full && !st.in_room) {
    renderError("Комната занята", "Уже два участника. Дождитесь окончания или попросите новую ссылку.");
    return;
  }

  if (!st.in_room) {
    const jr = await fetch(
      apiUrl(`/rooms/by-token/${encodeURIComponent(shareToken)}/join`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ client_id: clientId }),
      },
    );
    if (jr.status === 409) { renderError("Комната занята", await readApiError(jr)); return; }
    if (jr.status === 410) { renderError("Звонок", "Звонок завершён."); return; }
    if (!jr.ok) { renderError("Ошибка", await readApiError(jr)); return; }
    await jr.json();
    res = await fetchStatus(shareToken, clientId);
    st = await res.json();
  }

  startCall(shareToken, clientId, st);
}

function startCall(shareToken, clientId, roomData) {
  let ws = null;
  let pc = null;
  let localStream = null;
  let remoteStream = null;
  let camOn = true;
  let micOn = true;
  let ended = false;
  let polite = false;
  let makingOffer = false;

  render(`
    <main class="call-shell">
      <div class="call-videos">
        <div class="call-video-wrap call-video-wrap--remote">
          <video id="remote-video" class="call-video" autoplay playsinline></video>
          <p id="remote-status" class="call-overlay">Ожидание собеседника…</p>
        </div>
        <div class="call-video-wrap call-video-wrap--local">
          <video id="local-video" class="call-video call-video--local" autoplay playsinline muted></video>
        </div>
      </div>
      <div class="call-controls">
        <button id="btn-cam" class="ctrl-btn ctrl-btn--on" title="Камера">cam</button>
        <button id="btn-mic" class="ctrl-btn ctrl-btn--on" title="Микрофон">mic</button>
        <label class="ctrl-volume" title="Громкость собеседника">
          vol <input type="range" id="vol-slider" min="0" max="100" value="100" />
        </label>
        <button id="btn-hangup" class="ctrl-btn ctrl-btn--hangup" title="Завершить">end</button>
      </div>
      <p id="call-status" class="call-status">Подключение…</p>
    </main>
  `);

  const localVideo = document.getElementById("local-video");
  const remoteVideo = document.getElementById("remote-video");
  const remoteStatus = document.getElementById("remote-status");
  const callStatus = document.getElementById("call-status");
  const btnCam = document.getElementById("btn-cam");
  const btnMic = document.getElementById("btn-mic");
  const volSlider = document.getElementById("vol-slider");
  const btnHangup = document.getElementById("btn-hangup");

  function setCallStatus(text) { callStatus.textContent = text; }
  function setRemoteStatus(text, show) {
    remoteStatus.textContent = text;
    remoteStatus.hidden = !show;
  }

  function cleanup() {
    ended = true;
    if (ws && ws.readyState <= 1) ws.close();
    if (pc) { pc.close(); pc = null; }
    stopAllTracks(localStream);
    stopAllTracks(remoteStream);
  }

  function hangup() {
    if (ended) return;
    cleanup();
    renderCallEnded("Вы завершили звонок.", "ok");
  }

  function sendSignal(payload) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "signal", payload }));
    }
  }

  async function createPc() {
    pc = createPeerConnection({
      onTrack(ev) {
        if (!remoteStream) {
          remoteStream = new MediaStream();
          remoteVideo.srcObject = remoteStream;
        }
        remoteStream.addTrack(ev.track);
        setRemoteStatus("", false);
        remoteVideo.volume = volSlider.value / 100;
      },
      onIceCandidate(candidate) {
        sendSignal({ ice: candidate });
      },
      onStateChange(s) {
        if (s === "disconnected" || s === "failed") {
          setCallStatus("Соединение потеряно");
        }
        if (s === "connected") {
          setCallStatus("Соединение установлено");
        }
      },
    });

    if (localStream) addStreamToPc(pc, localStream);
  }

  async function startNegotiation() {
    if (!pc || ended) return;
    makingOffer = true;
    try {
      const offer = await createOffer(pc);
      sendSignal({ sdp: pc.localDescription });
    } finally {
      makingOffer = false;
    }
  }

  async function handleSignalMessage(payload, from) {
    if (!pc) return;

    if (payload.sdp) {
      const desc = payload.sdp;
      const isOffer = desc.type === "offer";
      const collision = isOffer && (makingOffer || pc.signalingState !== "stable");
      if (collision && !polite) return;

      if (isOffer) {
        const answer = await handleOffer(pc, desc);
        sendSignal({ sdp: pc.localDescription });
      } else {
        await handleAnswer(pc, desc);
      }
    }

    if (payload.ice) {
      await addIceCandidate(pc, payload.ice);
    }
  }

  async function onWsMessage(ev) {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === "pong") return;

    if (m.type === "system") {
      if (m.event === "connected") {
        setCallStatus(`Подключено (${m.participant_count}/2)`);
        polite = m.participant_count === 1;
      }
      if (m.event === "peer_joined") {
        setCallStatus("Собеседник подключился");
        setRemoteStatus("Устанавливается соединение…", true);
        await startNegotiation();
      }
      if (m.event === "peer_left") {
        setCallStatus("Собеседник отключился");
        setRemoteStatus("Собеседник отключился", true);
        if (remoteStream) {
          for (const t of remoteStream.getTracks()) t.stop();
          remoteStream = null;
          remoteVideo.srcObject = null;
        }
        if (pc) { pc.close(); pc = null; }
        await createPc();
      }
      if (m.event === "room_ended") {
        cleanup();
        renderCallEnded("Звонок завершён создателем.", "err");
      }
      return;
    }

    if (m.type === "signal") {
      await handleSignalMessage(m.payload, m.from);
    }
  }

  async function init() {
    try {
      localStream = await getLocalStream();
    } catch (e) {
      renderError("Камера", `Не удалось получить доступ к камере/микрофону: ${e.message}`);
      return;
    }
    localVideo.srcObject = localStream;

    await createPc();

    const url = wsRoomUrl(shareToken, clientId);
    ws = new WebSocket(url);
    ws.onopen = () => setCallStatus("WebSocket соединено, ожидание…");
    ws.onclose = (ev) => {
      if (!ended) setCallStatus(`WebSocket закрыт (${ev.code})`);
    };
    ws.onerror = () => {
      if (!ended) setCallStatus("Ошибка WebSocket");
    };
    ws.onmessage = onWsMessage;

    window.addEventListener("beforeunload", () => {
      cleanup();
      leaveBeacon(shareToken, clientId);
    });

    btnCam.addEventListener("click", () => {
      camOn = toggleTrack(localStream, "video");
      btnCam.classList.toggle("ctrl-btn--on", camOn);
      btnCam.classList.toggle("ctrl-btn--off", !camOn);
    });
    btnMic.addEventListener("click", () => {
      micOn = toggleTrack(localStream, "audio");
      btnMic.classList.toggle("ctrl-btn--on", micOn);
      btnMic.classList.toggle("ctrl-btn--off", !micOn);
    });
    volSlider.addEventListener("input", () => {
      remoteVideo.volume = volSlider.value / 100;
    });
    btnHangup.addEventListener("click", async () => {
      hangup();
      leaveBeacon(shareToken, clientId);
      try {
        await fetch(apiUrl(`/rooms/by-token/${encodeURIComponent(shareToken)}/leave`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ client_id: clientId }),
        });
      } catch { /* ignore */ }
    });
  }

  init();
}

main();
