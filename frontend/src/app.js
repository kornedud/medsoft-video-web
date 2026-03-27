import "./style.css";
import { apiUrl, readApiError, wsPresenceUrl } from "./api.js";

const root = document.getElementById("app");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function logout() {
  try {
    await fetch(apiUrl("/auth/logout"), {
      method: "POST",
      credentials: "include",
    });
  } catch {
    /* ignore */
  }
  window.location.href = "/login.html";
}

function renderGate(message) {
  root.innerHTML = `
    <main class="shell">
      <nav class="nav"><a href="/" class="nav-btn">На главную</a></nav>
      <h1>Нужен вход</h1>
      <section class="card" aria-live="polite">
        <p class="status status--err">${escapeHtml(message)}</p>
        <nav class="nav" style="margin-top:1rem"><a href="/login.html" class="nav-btn">Перейти ко входу</a></nav>
      </section>
    </main>
  `;
}

async function main() {
  const notice = sessionStorage.getItem("authNotice");
  if (notice) sessionStorage.removeItem("authNotice");

  const res = await fetch(apiUrl("/auth/me"), { credentials: "include" });

  if (res.status === 401) {
    renderGate(
      (await readApiError(res)) || "Эта страница доступна только после входа.",
    );
    return;
  }

  if (!res.ok) {
    renderGate(await readApiError(res));
    return;
  }

  const currentUser = await res.json();
  renderApp(currentUser, notice);
}

function renderApp(currentUser, notice) {
  const noticeBlock =
    notice == null
      ? ""
      : `<p class="form-msg form-msg--ok" role="status">${escapeHtml(notice)}</p>`;

  root.innerHTML = `
    <div class="app-layout">
      <aside class="sidebar">
        <div class="sidebar__header">
          <div class="sidebar__current-user">
            <div class="sidebar__avatar">${escapeHtml(currentUser.login[0].toUpperCase())}</div>
            <div class="sidebar__user-info">
              <span class="sidebar__user-name">${escapeHtml(currentUser.login)}</span>
              <span class="sidebar__user-status">В сети</span>
            </div>
          </div>
          <button type="button" class="sidebar__logout" id="logout-btn" title="Выйти">Выйти</button>
        </div>
        <div class="sidebar__section-title">Пользователи</div>
        <div class="sidebar__users" id="user-list">
          <div class="sidebar__loading">Загрузка…</div>
        </div>
        <div class="sidebar__footer">
          <a href="/" class="sidebar__home-link">На главную</a>
        </div>
      </aside>
      <main class="app-main">
        ${noticeBlock}
        <div class="app-main__welcome" id="main-content">
          <h1>Телеконсультация</h1>
          <p class="lead">Выберите пользователя слева, чтобы начать звонок, или создайте комнату по ссылке.</p>
          <section class="card">
            <button type="button" class="btn" id="create-room-btn">Создать звонок по ссылке</button>
            <div id="room-offer" class="room-offer" hidden>
              <label class="field room-offer__label">
                <span>Ссылка на комнату</span>
                <input type="text" id="room-link" readonly class="room-offer__input" />
              </label>
              <div class="room-offer__actions">
                <button type="button" class="btn btn--secondary" id="copy-room-link">Копировать</button>
                <a id="open-room" href="#" target="_blank" rel="noopener" class="btn">Открыть комнату</a>
              </div>
              <p class="hint" id="copy-hint" hidden>Ссылка скопирована.</p>
            </div>
          </section>
        </div>
      </main>
    </div>

    <div class="call-modal-overlay" id="incoming-call-modal" hidden>
      <div class="call-modal">
        <div class="call-modal__icon call-modal__icon--incoming">📞</div>
        <h2 class="call-modal__title">Входящий звонок</h2>
        <p class="call-modal__caller" id="incoming-caller-name"></p>
        <div class="call-modal__actions">
          <button type="button" class="call-modal__btn call-modal__btn--accept" id="accept-call-btn">Принять</button>
          <button type="button" class="call-modal__btn call-modal__btn--decline" id="decline-call-btn">Отклонить</button>
        </div>
      </div>
    </div>

    <div class="call-modal-overlay" id="outgoing-call-modal" hidden>
      <div class="call-modal">
        <div class="call-modal__icon">📱</div>
        <h2 class="call-modal__title">Вызов…</h2>
        <p class="call-modal__caller" id="outgoing-callee-name"></p>
        <div class="call-modal__actions">
          <button type="button" class="call-modal__btn call-modal__btn--decline" id="cancel-call-btn">Отмена</button>
        </div>
      </div>
    </div>
  `;

  initApp(currentUser);
}

function initApp(currentUser) {
  document.getElementById("logout-btn").addEventListener("click", () => logout());

  const offer = document.getElementById("room-offer");
  const linkInput = document.getElementById("room-link");
  const copyHint = document.getElementById("copy-hint");
  const openRoom = document.getElementById("open-room");

  document.getElementById("create-room-btn").addEventListener("click", async () => {
    const res = await fetch(apiUrl("/rooms"), {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      alert(await readApiError(res));
      return;
    }
    const data = await res.json();
    const url = `${window.location.origin}/room.html?t=${encodeURIComponent(data.share_token)}`;
    linkInput.value = url;
    openRoom.href = url;
    offer.hidden = false;
    copyHint.hidden = true;
  });

  document.getElementById("copy-room-link").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(linkInput.value);
      copyHint.hidden = false;
    } catch {
      linkInput.select();
      document.execCommand("copy");
      copyHint.hidden = false;
    }
  });

  const userListEl = document.getElementById("user-list");
  const incomingModal = document.getElementById("incoming-call-modal");
  const outgoingModal = document.getElementById("outgoing-call-modal");
  const incomingCallerName = document.getElementById("incoming-caller-name");
  const outgoingCalleeName = document.getElementById("outgoing-callee-name");

  let users = [];
  let onlineIds = new Set();
  let ws = null;
  let pendingIncoming = null;
  let outgoingTarget = null;
  let outgoingToken = null;

  function renderUserList() {
    if (users.length === 0) {
      userListEl.innerHTML = `<div class="sidebar__empty">Нет других пользователей</div>`;
      return;
    }

    userListEl.innerHTML = users
      .map((u) => {
        const isOnline = onlineIds.has(u.id);
        const statusClass = isOnline ? "online" : "offline";
        const statusText = isOnline ? "В сети" : "Не в сети";
        const canCall = isOnline;
        return `
          <div class="user-item" data-user-id="${u.id}">
            <div class="user-item__avatar">${escapeHtml(u.login[0].toUpperCase())}</div>
            <div class="user-item__info">
              <span class="user-item__name">${escapeHtml(u.login)}</span>
              <span class="user-item__status user-item__status--${statusClass}">${statusText}</span>
            </div>
            <button
              type="button"
              class="user-item__call-btn${canCall ? "" : " user-item__call-btn--disabled"}"
              data-call-user-id="${u.id}"
              data-call-login="${escapeHtml(u.login)}"
              ${canCall ? "" : "disabled"}
              title="${canCall ? "Позвонить" : "Пользователь не в сети"}"
            >Позвонить</button>
          </div>
        `;
      })
      .join("");

    userListEl.querySelectorAll("[data-call-user-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = parseInt(btn.dataset.callUserId, 10);
        const targetLogin = btn.dataset.callLogin;
        startOutgoingCall(targetId, targetLogin);
      });
    });
  }

  async function loadUsers() {
    try {
      const res = await fetch(apiUrl("/auth/users"), { credentials: "include" });
      if (res.ok) {
        users = await res.json();
        renderUserList();
      }
    } catch {
      userListEl.innerHTML = `<div class="sidebar__empty">Ошибка загрузки</div>`;
    }
  }

  function connectPresence() {
    const url = wsPresenceUrl();
    ws = new WebSocket(url);

    ws.onopen = () => {};

    ws.onclose = () => {
      setTimeout(() => connectPresence(), 3000);
    };

    ws.onerror = () => {};

    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }

      if (msg.type === "pong") return;

      if (msg.type === "online_list") {
        onlineIds = new Set(msg.user_ids);
        renderUserList();
        return;
      }

      if (msg.type === "user_online") {
        onlineIds.add(msg.user_id);
        renderUserList();
        return;
      }

      if (msg.type === "user_offline") {
        onlineIds.delete(msg.user_id);
        renderUserList();
        return;
      }

      if (msg.type === "incoming_call") {
        pendingIncoming = {
          fromUserId: msg.from_user_id,
          fromLogin: msg.from_login,
          shareToken: msg.share_token,
        };
        incomingCallerName.textContent = msg.from_login;
        incomingModal.hidden = false;
        return;
      }

      if (msg.type === "call_cancelled") {
        if (pendingIncoming && pendingIncoming.fromUserId === msg.from_user_id) {
          pendingIncoming = null;
          incomingModal.hidden = true;
        }
        return;
      }

      if (msg.type === "call_accepted") {
        outgoingModal.hidden = true;
        window.location.href = `/room.html?t=${encodeURIComponent(msg.share_token)}`;
        return;
      }

      if (msg.type === "call_declined") {
        outgoingModal.hidden = true;
        outgoingTarget = null;
        outgoingToken = null;
        showToast(`${msg.by_login} отклонил(а) звонок`);
        return;
      }
    };

    const pingInterval = setInterval(() => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify({ type: "ping" }));
      } else {
        clearInterval(pingInterval);
      }
    }, 25000);
  }

  async function startOutgoingCall(targetUserId, targetLogin) {
    const res = await fetch(apiUrl("/rooms"), {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      alert(await readApiError(res));
      return;
    }
    const data = await res.json();
    outgoingTarget = targetUserId;
    outgoingToken = data.share_token;

    outgoingCalleeName.textContent = targetLogin;
    outgoingModal.hidden = false;

    if (ws && ws.readyState === 1) {
      ws.send(
        JSON.stringify({
          type: "call_invite",
          target_user_id: targetUserId,
          share_token: data.share_token,
        }),
      );
    }

    setTimeout(() => {
      if (!outgoingModal.hidden && outgoingTarget === targetUserId) {
        outgoingModal.hidden = true;
        if (ws && ws.readyState === 1) {
          ws.send(
            JSON.stringify({
              type: "call_cancel",
              target_user_id: targetUserId,
            }),
          );
        }
        outgoingTarget = null;
        outgoingToken = null;
        showToast("Нет ответа");
      }
    }, 30000);
  }

  document.getElementById("accept-call-btn").addEventListener("click", () => {
    if (!pendingIncoming) return;
    const { fromUserId, shareToken } = pendingIncoming;

    if (ws && ws.readyState === 1) {
      ws.send(
        JSON.stringify({
          type: "call_accept",
          caller_user_id: fromUserId,
          share_token: shareToken,
        }),
      );
    }

    incomingModal.hidden = true;
    window.location.href = `/room.html?t=${encodeURIComponent(shareToken)}`;
  });

  document.getElementById("decline-call-btn").addEventListener("click", () => {
    if (!pendingIncoming) return;
    if (ws && ws.readyState === 1) {
      ws.send(
        JSON.stringify({
          type: "call_decline",
          caller_user_id: pendingIncoming.fromUserId,
        }),
      );
    }
    pendingIncoming = null;
    incomingModal.hidden = true;
  });

  document.getElementById("cancel-call-btn").addEventListener("click", () => {
    if (outgoingTarget != null && ws && ws.readyState === 1) {
      ws.send(
        JSON.stringify({
          type: "call_cancel",
          target_user_id: outgoingTarget,
        }),
      );
    }
    outgoingModal.hidden = true;
    outgoingTarget = null;
    outgoingToken = null;
  });

  function showToast(text) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  loadUsers();
  connectPresence();
}

main();
