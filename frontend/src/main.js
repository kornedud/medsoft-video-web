import "./style.css";
import { apiUrl } from "./api.js";

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
        <a href="/app/" class="btn" style="margin-bottom:0.75rem;text-decoration:none;display:inline-flex">Перейти к звонкам</a>
        <p class="hint">Позвоните зарегистрированным пользователям или создайте комнату по ссылке.</p>
      </section>
    </main>
  `;

  document.getElementById("logout-btn").addEventListener("click", () => logout());
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
