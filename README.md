# Телеконсультация

Веб-приложение для видеозвонков: отдельный **frontend** (Vite + vanilla JS) и **backend** (FastAPI + PostgreSQL). Разработка ведётся по этапам; завершены **этапы 1–7** (включая production-ready инфраструктуру).

## Этап 1 — что есть

- Backend: FastAPI, `GET /health` (проверка подключения к PostgreSQL), CORS под origin фронта
- SQLAlchemy 2 (async) + asyncpg, Alembic
- Frontend: стартовая страница и запрос к API (через прокси Vite или `VITE_API_URL`)
- `docker-compose.yml`: PostgreSQL, backend, frontend для локальной разработки
- `.env.example` с описанием переменных

## Этап 2 — что добавлено

- Таблица `users` (id, login unique, password_hash, created_at), миграция `002_users`
- `POST /auth/register` — создание пользователя, bcrypt (`BCRYPT_ROUNDS`, по умолчанию 12)
- Валидация логина и пароля на backend (Pydantic + общие правила в `app/validators.py`) и на frontend (`src/validation.js`)
- Страница http://localhost:5173/register.html — форма, успех с **id** и логином, понятные ошибки (в т.ч. 409 при занятом логине)

## Этап 3 — что добавлено

- `POST /auth/login` — проверка логина/пароля (одинаковое сообщение при ошибке), выдача **подписанной** cookie `tc_session` (HttpOnly, **SameSite=Lax**, **Secure** включается через `COOKIE_SECURE=true` в production)
- `POST /auth/logout` — сброс cookie
- `GET /auth/me` — текущий пользователь `{ id, login }`, без сессии — **401**
- Зависимость `get_current_user` (`app/auth/deps.py`), подпись токена — `itsdangerous`
- Страницы: http://localhost:5173/login.html и http://localhost:5173/app/ — без входа `/app/` показывает запрет и ссылку на вход; после входа — приветствие и кнопка «Выйти»

## Этап 4 — что добавлено

- Таблица **`rooms`** (uuid `id`, уникальный `share_token`, `creator_user_id`, `status`, `created_at`, `ended_at`), миграция **`003_rooms`**
- **`POST /rooms`** (только авторизованный) — создать комнату; ответ `{ room_id, share_token }`
- **`GET /rooms/by-token/{token}`** — статус комнаты и число участников (публично); опционально `client_id` для учёта «уже внутри»; **`may_end_call`** если вошёл создатель
- **`POST .../join`** / **`POST .../leave`** с телом `{ client_id }` — учёт до **двух** участников в **памяти процесса** (перезапуск backend сбрасывает счётчик)
- **`POST /rooms/{room_id}/end`** — завершить звонок (только создатель)
- В **`/app/`**: кнопка «Создать звонок», поле ссылки, «Копировать», открыть комнату
- Страница **`/room.html?t=…`**: вход без регистрации (гость получает стабильный `client_id` в `sessionStorage`); при двух участниках третий видит **«Комната занята»**; создатель может **завершить звонок**; при уходе со страницы отправляется **leave** (sendBeacon, best-effort)

## Этап 5 — что добавлено

- **WebSocket** `GET ws://…/ws/room/{share_token}?client_id=…` — проверка **Origin** по `FRONTEND_ORIGINS` (как и CORS); без допустимого Origin соединение закрывается
- Учёт сокетов в **`SignalingHub`** (до 2 на комнату, замена сокета при переподключении с тем же `client_id`); при завершении звонка сокеты закрываются
- Сообщения JSON: **`ping`/`pong`**, **`signal`** с произвольным `payload` — пересылается второму участнику (без медиа)
- Системные события: `connected`, `peer_joined`, `peer_left`, `room_full`, `room_ended`
- **Vite** проксирует **`/ws`** на backend (вместе с `/api`)
- Страница комнаты: блок статуса WebSocket и **лог** последних сообщений (диагностика)

## Этап 6 — что добавлено

- **`src/webrtc.js`** — обёртка: `getUserMedia`, `RTCPeerConnection` (STUN `stun.l.google.com`), offer/answer/ICE, toggle camera/mic, stop tracks
- Страница комнаты теперь показывает **полноценный видеозвонок**: локальное видео (PiP, зеркальное), удалённое видео на весь экран
- **Управление:** кнопки **cam** / **mic** (вкл/выкл), **vol** (слайдер громкости собеседника), **end** (завершить)
- Согласование **offer/answer/ICE** через WS (`type: "signal"`, `payload: { sdp }` / `{ ice }`)
- «Вежливый» peer (polite = тот, кто первый) — корректная обработка одновременных offer (glare)
- **peer_left** → remote stream сбрасывается, PeerConnection пересоздаётся (готов к новому собеседнику)
- **room_ended** → cleanup, экран «Звонок завершён»
- **beforeunload** → cleanup + sendBeacon

## Этап 7 — что добавлено

- **Production Dockerfile** для backend (`backend/Dockerfile`) — без `--reload`, 2 uvicorn workers
- **Multi-stage Dockerfile** для frontend (`frontend/Dockerfile`) — Node.js build → Caddy-alpine со статикой; TURN-переменные передаются через build args
- **Caddyfile** (`infra/caddy/Caddyfile`) — reverse proxy с автоматическим HTTPS (Let's Encrypt); маршрутизирует `/auth/*`, `/rooms/*`, `/ws/*`, `/health` на backend, остальное на frontend
- **coturn** (`infra/coturn/turnserver.conf`) — TURN-сервер для NAT traversal (WebRTC за симметричным NAT); `network_mode: host` для прямого UDP
- **`docker-compose.prod.yml`** — production compose: db, backend, frontend, caddy, coturn; все секреты через `.env`
- **ICE серверы** — `webrtc.js` теперь добавляет TURN-сервер из `VITE_TURN_URL`/`VITE_TURN_USER`/`VITE_TURN_PASS` (задаются при сборке)
- **`.env.prod.example`** — шаблон переменных для production

### Правила валидации

- **Логин:** 3–16 символов, только `[a-zA-Z0-9_]`
- **Пароль:** 10–16 символов; минимум одна строчная, одна заглавная, одна цифра, один спецсимвол из `!@#$%^&*()_-+=`

## Структура

```
video-web/
├── backend/
│   ├── Dockerfile          # production
│   ├── Dockerfile.dev      # local dev (hot-reload)
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── db.py
│   │   ├── validators.py
│   │   ├── auth/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── ws/             # signaling_hub
│   │   └── routers/        # auth.py, rooms.py, ws_signaling.py
│   └── migrations/
├── frontend/
│   ├── Dockerfile          # production (multi-stage: build → caddy static)
│   ├── Dockerfile.dev      # local dev (vite dev server)
│   ├── Caddyfile.static    # static file server inside frontend container
│   ├── app/index.html
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── room.html
│   └── src/
├── infra/
│   ├── caddy/Caddyfile     # reverse proxy (HTTPS, API, WS, static)
│   └── coturn/turnserver.conf
├── docker-compose.yml          # local dev
├── docker-compose.prod.yml     # production
├── .env.example                # dev env template
├── .env.prod.example           # production env template
└── README.md
```

## Docker локально без Docker Desktop (Colima)

На рабочей машине, где **Docker Desktop запрещён**, используйте [Colima](https://github.com/abiosoft/colima): он поднимает Docker Engine и контекст `docker`, с которым работает `docker-compose` или `docker compose`.

Кратко:

```bash
colima start
docker-compose version
```

Дальше команды такие же, как ниже. На **удалённом сервере** обычно стоит обычный Docker Engine — Colima не нужен.

**Ошибка `Cannot connect to the Docker daemon at unix:///Users/.../.colima/default/docker.sock`:** Colima не запущен или активен не тот Docker context. Выполните `colima start`, затем `docker info`. При необходимости: `docker context ls` и `docker context use colima` (имя см. в списке). После сбоев иногда помогает `colima stop` и снова `colima start`.

## Запуск через Docker Compose

Из корня репозитория (в этом проекте обычно используют классический CLI):

```bash
docker-compose up --build
```

Альтернатива — плагин Docker: `docker compose up --build`.

- Frontend: http://localhost:5173  
- Регистрация: http://localhost:5173/register.html  
- Вход: http://localhost:5173/login.html  
- Приложение (только после входа): http://localhost:5173/app/  
- Комната звонка: `http://localhost:5173/room.html?t=<share_token>`  
- Backend: http://localhost:8000  
- OpenAPI: http://localhost:8000/docs  
- PostgreSQL с **хоста** (psql, GUI): `localhost:5433` → контейнерный 5432 (user/password/db: `teleconsult`). Порт 5433 задан в `docker-compose.yml`, чтобы не конфликтовать с занятым на машине `:5432`.

При первом старте backend выполняет `alembic upgrade head`.

**После обновления кода** пересоберите backend-образ и примените миграции (`alembic upgrade head` в CMD образа при `docker compose up --build`).

## Локальный запуск без Docker (опционально)

1. PostgreSQL: либо контейнер из `docker compose` этого репозитория (с хоста порт **5433**), либо свой инстанс — тогда поправьте `DATABASE_URL` в `backend/.env`.

2. Backend (команды через **`.venv/bin/...`**, чтобы всегда использовался интерпретатор venv, а не системный Python из Homebrew):

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
# при необходимости отредактируйте DATABASE_URL (например :5432 для своего Postgres)
.venv/bin/python -m alembic upgrade head
.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Дефолт `DATABASE_URL` в коде и в `backend/.env.example` — **localhost:5433** (как проброс БД в `docker-compose.yml`). Корневой [.env.example](.env.example) дублирует настройки для справки.

**Если после `source .venv/bin/activate` команда `python -m alembic` даёт `No module named alembic`:** у вас в PATH всё ещё чужой `python` (часто `/opt/homebrew/...`). Проверка: `which python` должен быть `.../backend/.venv/bin/python`. Надёжнее не полагаться на `activate` и вызывать только **`.venv/bin/python`** и **`.venv/bin/pip`**, как в блоке выше.

**`command not found: alembic`:** используйте **`.venv/bin/python -m alembic`** (или полный путь к `alembic` в `.venv/bin/`), а не голый `alembic` без venv.

3. Frontend (другой терминал):

```bash
cd frontend
npm install
npm run dev
```

Если `VITE_API_URL` не задан, запросы идут на `/api/...`, Vite проксирует их на `http://localhost:8000` (см. `frontend/vite.config.js`).

## Переменные окружения

См. [backend/.env.example](backend/.env.example) и корневой [.env.example](.env.example). Кратко:

| Переменная | Где | Назначение |
|------------|-----|------------|
| `DATABASE_URL` | backend | `postgresql+asyncpg://...` |
| `FRONTEND_ORIGINS` | backend | Список origin через запятую для CORS |
| `BCRYPT_ROUNDS` | backend | Сложность bcrypt (4–31), по умолчанию 12 |
| `SESSION_SECRET` | backend | Секрет подписи cookie-сессии (в production — длинная случайная строка) |
| `COOKIE_SECURE` | backend | `true` при HTTPS (флаг **Secure** у cookie) |
| `VITE_API_URL` | frontend | Базовый URL API для браузера; пусто = прокси `/api` в dev |

### `password authentication failed for user "teleconsult"` (Alembic / backend)

Строка подключения: **`backend/.env`** → `DATABASE_URL`, иначе значение по умолчанию из кода: **`localhost:5433`**, пользователь `teleconsult` (под контейнерную БД из этого compose).

**Что сделать:**

1. Убедитесь, что есть `backend/.env` (`cp backend/.env.example backend/.env`) или подходит дефолт в `config.py`.

2. Если Postgres **в docker compose этого проекта** — контейнер слушает на хосте **5433** (уже в дефолте).

3. Если **свой Postgres на :5432** — в `backend/.env` укажите порт **5432** и свои учётные данные, либо создайте роль:
   ```sql
   CREATE USER teleconsult WITH PASSWORD 'teleconsult';
   CREATE DATABASE teleconsult OWNER teleconsult;
   ```

4. Если на **5432** у вас слушает **SSH-туннель** к другому серверу, дефолтный URL может ходить не туда или с неверным паролем — явно укажите хост, порт и учётные данные того инстанса, куда нужно.

## Ручная проверка

### Этап 1

1. `curl -s http://localhost:8000/health` → `{"status":"ok"}`
2. http://localhost:5173 — успешный ответ API на главной

### Этап 2

1. Открыть http://localhost:5173/register.html, зарегистрироваться с валидными логином/паролем — отображаются **id** и логин.
2. Повторная регистрация с тем же логином — сообщение, что логин занят (409).
3. Невалидный логин или пароль — ошибка на клиенте до запроса и/или ответ 422 от API с пояснением.
4. В БД в `users.password_hash` хранится строка bcrypt, не открытый пароль.

### Этап 3

1. Войти на http://localhost:5173/login.html — сообщение об успехе на странице `/app/`, отображаются логин и id.
2. Неверный логин/пароль — одно сообщение «Неверный логин или пароль».
3. Без входа открыть http://localhost:5173/app/ — предложение войти, не данные пользователя.
4. «Выйти» — снова `/app/` ведёт на запрет входа; `GET /auth/me` без cookie — 401.
5. В DevTools → Application → Cookies: для API-origin есть HttpOnly cookie `tc_session` (не читается из JS).

### Этап 4

1. Выполнить миграции: `cd backend && .venv/bin/python -m alembic upgrade head`.
2. Войти в `/app/`, нажать **Создать звонок** — появляется ссылка; **Копировать** и открыть в другом браузере / окне инкогнито (гость).
3. В двух клиентах отображается «Участников … из 2»; третий клиент с той же ссылкой — текст **«Комната занята»**.
4. Создатель нажимает **Завершить звонок** — у участников при следующем опросе статус «Комната закрыта»; повторный join — «Звонок завершён».
5. В Postgres таблица `rooms` содержит строку с `share_token` и вашим `creator_user_id`.

### Этап 5

1. Открыть комнату в двух браузерах (или окнах) — в блоке **Signaling** статус «соединено», в логе события `connected`, у второго при подключении первого — `peer_joined`.
2. В консоли DevTools у одного клиента:  
   `ws.send(JSON.stringify({type:'signal',payload:{test:1}}))`  
   (предварительно сохранить ссылку на сокет из вкладки Network → WS) — у второго в логе появляется сообщение с `payload`.
3. Завершить звонок создателем — оба WebSocket закрываются.
4. Третий клиент при полной комнате получает отказ на HTTP join (как в этапе 4); при попытке только WS — событие `room_full` и закрытие.

### Этап 6

1. Создать звонок в `/app/`, открыть ссылку **в двух разных** браузерах/окнах (или основной + инкогнито).
2. Оба участника видят **локальное видео** (PiP, зеркальное) и **удалённое видео** (на весь фон). Если видео нет — проверьте разрешение на камеру/микрофон и убедитесь, что URL начинается с `localhost` или `https://`.
3. Кнопка **cam** — включает/выключает камеру (у собеседника видео замирает).
4. Кнопка **mic** — включает/выключает микрофон (красный = выключен).
5. Слайдер **vol** — регулирует громкость удалённого аудио (с 0 до 100).
6. Кнопка **end** — завершает звонок; второй участник видит «Собеседник отключился».
7. Если собеседник закрыл вкладку — статус меняется на «Собеседник отключился», PeerConnection пересоздаётся (готов к новому).

Пример API:

```bash
curl -s -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"login":"demo_user","password":"Aa1!bbbbbb"}'
```

## Деплой на сервер (production)

### Что нужно

- VPS / облачный сервер с Docker и docker-compose
- Доменное имя, направленное A-записью на IP сервера
- Открытые порты: **80**, **443** (TCP+UDP), **3478** (UDP — TURN)

### Шаги

1. Склонируйте репозиторий на сервер.

2. Создайте `.env` из шаблона:

```bash
cp .env.prod.example .env
```

3. Заполните **обязательные** переменные в `.env`:

| Переменная | Что указать |
|---|---|
| `DOMAIN` | ваш домен, например `call.example.com` |
| `SESSION_SECRET` | длинная случайная строка (`openssl rand -hex 32`) |
| `POSTGRES_PASSWORD` | пароль базы |
| `TURN_USER` | имя пользователя для TURN (например `teleconsult`) |
| `TURN_PASS` | пароль TURN |

4. Запустите:

```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

Caddy автоматически получит TLS-сертификат от Let's Encrypt.

5. Откройте `https://<DOMAIN>` — должна загрузиться главная страница.

### Как это работает

```
Клиент (браузер)
    │
    ▼ :443 (HTTPS / WSS)
┌──────────┐
│  Caddy   │──── /auth/*, /rooms/*, /ws/*, /health ────► backend :8000
│  (TLS)   │──── всё остальное ────────────────────────► frontend :80 (статика)
└──────────┘
    │
    ▼ :3478 (UDP)
┌──────────┐
│  coturn  │  TURN-сервер для NAT traversal (WebRTC медиа)
└──────────┘
```

- **Caddy** — reverse proxy + автоматический HTTPS (Let's Encrypt). Проксирует API и WebSocket на backend, всё остальное раздаёт из frontend-контейнера (статика Vite build).
- **coturn** — TURN-сервер в режиме `network_mode: host` (нужен прямой доступ к UDP). Учётные данные (`TURN_USER`/`TURN_PASS`) передаются фронтенду на этапе сборки через `VITE_TURN_*` build args.
- **frontend** — multi-stage Docker image: Node.js собирает Vite, результат раздаётся встроенным Caddy внутри контейнера.
- **backend** — FastAPI + Alembic миграции при старте, 2 uvicorn workers.
- **Cookie** `tc_session` выставляется с флагом `Secure` (`COOKIE_SECURE=true`), поэтому авторизация работает **только через HTTPS**.

### Переменные окружения (production)

См. [.env.prod.example](.env.prod.example). Кратко:

| Переменная | Назначение |
|---|---|
| `DOMAIN` | Домен для Caddy (TLS) и TURN realm |
| `SESSION_SECRET` | Секрет подписи cookie |
| `POSTGRES_PASSWORD` | Пароль PostgreSQL |
| `POSTGRES_USER` | Пользователь PostgreSQL (по умолчанию `teleconsult`) |
| `POSTGRES_DB` | Имя базы (по умолчанию `teleconsult`) |
| `TURN_USER` | TURN логин (передаётся фронтенду при сборке) |
| `TURN_PASS` | TURN пароль |
| `TURN_SECRET` | (не используется в текущей конфигурации) |

### Обновление

```bash
git pull
docker-compose -f docker-compose.prod.yml up -d --build
```

Backend автоматически накатит миграции (`alembic upgrade head`) при старте.

## Следующие этапы

- Этап 8: звонки из списка пользователей (прямой вызов)
# medsoft-video-web
