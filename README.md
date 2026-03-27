# Телеконсультация

Веб-приложение для peer-to-peer видеозвонков через WebRTC.

**Ссылка:** https://213-165-217-18.nip.io

## Запуск

### Development

```bash
docker-compose up --build
```

Фронтенд: http://localhost:5173, бэкенд: http://localhost:8000

### Production

1. Создайте `.env` в корне проекта:

```env
DOMAIN=213-165-217-18.nip.io
POSTGRES_PASSWORD=your_password
SESSION_SECRET=your_random_secret
TURN_USER=teleconsult
TURN_PASS=your_turn_password
```

2. Запустите:

```bash
docker-compose -f docker-compose.prod.yml up --build -d
```

## База данных

### Таблица `users`

| Колонка | Описание |
|---------|----------|
| `id` | Идентификатор пользователя |
| `login` | Логин (3–16 символов, `[a-zA-Z0-9_]`, уникальный) |
| `password_hash` | Хеш пароля (BCrypt) |
| `created_at` | Дата регистрации |

### Таблица `rooms`

| Колонка | Описание |
|---------|----------|
| `id` | Идентификатор комнаты (UUID) |
| `share_token` | Токен для ссылки-приглашения (уникальный) |
| `creator_user_id` | Создатель комнаты (FK → `users.id`) |
| `status` | `active` или `ended` |
| `created_at` | Дата создания |
| `ended_at` | Дата завершения |

## API

### Аутентификация

| Эндпоинт | Описание |
|----------|----------|
| `POST /auth/register` | Регистрация. Тело: `{login, password}`. Ответ: `{id, login}` |
| `POST /auth/login` | Вход. Тело: `{login, password}`. Устанавливает cookie `tc_session` |
| `POST /auth/logout` | Выход. Удаляет cookie |
| `GET /auth/me` | Текущий пользователь: `{id, login}` |
| `GET /auth/users` | Список всех пользователей (кроме текущего) |

### Комнаты

| Эндпоинт | Описание |
|----------|----------|
| `POST /rooms` | Создать комнату. Ответ: `{room_id, share_token}` |
| `GET /rooms/by-token/{token}` | Статус комнаты: участники, заполненность |
| `POST /rooms/by-token/{token}/join` | Войти в комнату. Тело: `{client_id}` |
| `POST /rooms/by-token/{token}/leave` | Покинуть комнату. Тело: `{client_id}` |
| `POST /rooms/{id}/end` | Завершить звонок для всех |

### WebSocket

| Эндпоинт | Описание |
|----------|----------|
| `WS /ws/room/{token}?client_id=...` | Сигнализация WebRTC (offer/answer/ICE). Максимум 2 участника на комнату |
| `WS /ws/presence` | Онлайн-статус пользователей, входящие/исходящие вызовы |
