import "./style.css";
import { apiUrl, readApiError } from "./api.js";

const root = document.getElementById("app");

function escapeHtml(s) {
  return s
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
      <p class="nav"><a href="/">На главную</a></p>
      <h1>Нужен вход</h1>
      <section class="card" aria-live="polite">
        <p class="status status--err">${escapeHtml(message)}</p>
        <p class="nav" style="margin-top:1rem"><a href="/login.html">Перейти ко входу</a></p>
      </section>
    </main>
  `;
}

function renderApp(user, notice) {
  const noticeBlock =
    notice == null
      ? ""
      : `<p class="form-msg form-msg--ok" role="status">${escapeHtml(notice)}</p>`;

  root.innerHTML = `
    <main class="shell">
      <p class="nav"><a href="/">На главную</a> · <a href="/register.html">Регистрация</a></p>
      ${noticeBlock}
      <h1>Приложение</h1>
      <section class="card">
        <p>Вы вошли как <strong>${escapeHtml(user.login)}</strong> (id: ${user.id}).</p>
        <h2 class="h2">Звонок по ссылке</h2>
        <p class="hint">Создайте комнату, скопируйте ссылку и отправьте её второму участнику (ему не нужна регистрация).</p>
        <button type="button" class="btn" id="create-room-btn">Создать звонок</button>
        <div id="room-offer" class="room-offer" hidden>
          <label class="field room-offer__label">
            <span>Ссылка на комнату</span>
            <input type="text" id="room-link" readonly class="room-offer__input" />
          </label>
          <button type="button" class="btn btn--secondary" id="copy-room-link">Копировать</button>
          <p class="hint" id="copy-hint" hidden>Ссылка скопирована.</p>
          <p class="nav" style="margin-top: 0.75rem"><a id="open-room" href="#" target="_blank" rel="noopener">Открыть комнату</a></p>
        </div>
        <button type="button" class="btn btn--secondary" id="logout-btn">Выйти</button>
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
  if (notice) {
    sessionStorage.removeItem("authNotice");
  }

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

  const user = await res.json();
  renderApp(user, notice);
}

main();
