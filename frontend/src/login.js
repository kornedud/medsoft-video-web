import "./style.css";
import { apiUrl, readApiError } from "./api.js";
import { validateLogin } from "./validation.js";

const root = document.getElementById("app");

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderForm(message, messageKind) {
  const msgBlock =
    message == null
      ? ""
      : `<p class="form-msg form-msg--${messageKind}" role="alert">${escapeHtml(message)}</p>`;

  root.innerHTML = `
    <main class="shell">
      <nav class="nav"><a href="/app/" class="nav-btn">На главную</a><a href="/register.html" class="nav-btn">Регистрация</a></nav>
      <h1>Вход</h1>
      <p class="lead">Войдите под существующим логином.</p>
      ${msgBlock}
      <form class="card form" id="login-form" novalidate>
        <label class="field">
          <span>Логин</span>
          <input name="login" type="text" autocomplete="username" required minlength="3" maxlength="16" />
        </label>
        <label class="field">
          <span>Пароль</span>
          <input name="password" type="password" autocomplete="current-password" required />
        </label>
        <button type="submit" class="btn">Войти</button>
      </form>
    </main>
  `;

  document.getElementById("login-form").addEventListener("submit", onSubmit);
}

async function onSubmit(ev) {
  ev.preventDefault();
  const form = ev.target;
  const login = form.login.value.trim();
  const password = form.password.value;

  const le = validateLogin(login);
  if (le) {
    renderForm(le, "err");
    return;
  }
  if (!password) {
    renderForm("Введите пароль.", "err");
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const res = await fetch(apiUrl("/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ login, password }),
    });

    if (res.ok) {
      const data = await res.json();
      sessionStorage.setItem("authNotice", data.message || "Вход выполнен успешно.");
      window.location.href = "/app/";
      return;
    }

    renderForm(await readApiError(res), "err");
  } catch {
    renderForm("Не удалось связаться с сервером.", "err");
  } finally {
    const btn = document.querySelector("#login-form button[type=submit]");
    if (btn) btn.disabled = false;
  }
}

renderForm(null, null);
