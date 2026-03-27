import "./style.css";
import { apiUrl, readApiError } from "./api.js";
import { validateLogin, validatePassword } from "./validation.js";

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
      <nav class="nav"><a href="/app/" class="nav-btn">На главную</a><a href="/login.html" class="nav-btn">Вход</a></nav>
      <h1>Регистрация</h1>
      <p class="lead">Создайте логин и пароль по правилам ниже.</p>
      ${msgBlock}
      <form class="card form" id="reg-form" novalidate>
        <label class="field">
          <span>Логин</span>
          <input name="login" type="text" autocomplete="username" required minlength="3" maxlength="16" />
        </label>
        <label class="field">
          <span>Пароль</span>
          <input name="password" type="password" autocomplete="new-password" required minlength="10" maxlength="16" />
        </label>
        <p class="hint">Логин: 3–16 символов, [a-zA-Z0-9_]. Пароль: 10–16 символов, строчная и заглавная буква, цифра, спецсимвол из !@#$%^&amp;*()_-+=</p>
        <button type="submit" class="btn">Зарегистрироваться</button>
      </form>
    </main>
  `;

  const form = document.getElementById("reg-form");
  form.addEventListener("submit", onSubmit);
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
  const pe = validatePassword(password);
  if (pe) {
    renderForm(pe, "err");
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const res = await fetch(apiUrl("/auth/register"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ login, password }),
    });

    if (res.ok) {
      const data = await res.json();
      root.innerHTML = `
        <main class="shell">
          <nav class="nav"><a href="/app/" class="nav-btn">На главную</a><a href="/login.html" class="nav-btn">Вход</a></nav>
          <h1>Готово</h1>
          <section class="card" aria-live="polite">
            <p class="status status--ok">Регистрация прошла успешно.</p>
            <p class="success-id">Ваш id: <strong>${escapeHtml(String(data.id))}</strong>, логин: <strong>${escapeHtml(data.login)}</strong></p>
          </section>
        </main>
      `;
      return;
    }

    const errText = await readApiError(res);
    renderForm(errText, "err");
  } catch {
    renderForm("Не удалось связаться с сервером.", "err");
  } finally {
    const btn = document.querySelector("#reg-form button[type=submit]");
    if (btn) btn.disabled = false;
  }
}

renderForm(null, null);
