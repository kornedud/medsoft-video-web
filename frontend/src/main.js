import "./style.css";
import { apiUrl, readApiError } from "./api.js";

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
  } catch { /* ignore */ }
  window.location.reload();
}

function renderGuest() {
  root.innerHTML = `
    <main class="shell">
      <h1>Телеконсультация</h1>
      <p class="lead">Видеозвонки в браузере</p>
      <nav class="nav">
        <a href="/login.html" class="nav-btn">Вход</a>
        <a href="/register.html" class="nav-btn">Регистрация</a>
      </nav>
    </main>
  `;
}

function showToast(text) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function renderUser(user) {
  root.innerHTML = `
    <div class="user-bar">
      <span class="user-bar__name">${escapeHtml(user.login)}</span>
      <button type="button" class="user-bar__logout" id="logout-btn">Выйти</button>
    </div>
    <main class="shell">
      <h1>Телеконсультация</h1>
      <p class="lead">Видеозвонки в браузере</p>
      <section class="card">
        <p class="hint" style="margin-bottom:0.75rem">Создайте комнату, скопируйте ссылку и отправьте её второму участнику.</p>
        <button type="button" class="btn" id="create-room-btn">Создать звонок</button>
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
    </main>
  `;

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
}

async function main() {
  const notice = sessionStorage.getItem("authNotice");
  if (notice) sessionStorage.removeItem("authNotice");

  const res = await fetch(apiUrl("/auth/me"), { credentials: "include" });
  if (res.ok) {
    const user = await res.json();
    renderUser(user);
    if (notice) showToast(notice);
  } else {
    renderGuest();
  }
}

main();
