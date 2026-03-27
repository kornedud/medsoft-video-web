import "./style.css";
import { apiUrl } from "./api.js";

const root = document.getElementById("app");

async function fetchHealth() {
  const res = await fetch(apiUrl("/health"), { credentials: "include" });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

function render(status, detail) {
  root.innerHTML = `
    <main class="shell">
      <p class="nav"><a href="/register.html">Регистрация</a> · <a href="/login.html">Вход</a> · <a href="/app/">Приложение</a></p>
      <h1>Телеконсультация</h1>
      <p class="lead">Проверка связи с API</p>
      <section class="card" aria-live="polite">
        <p class="status status--${status}">${detail}</p>
      </section>
    </main>
  `;
}

render("pending", "Запрос к backend…");

fetchHealth()
  .then((data) => {
    render("ok", `Backend отвечает: ${JSON.stringify(data)}`);
  })
  .catch((err) => {
    render("err", `Ошибка: ${err.message}`);
  });
