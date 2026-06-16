# Заречье — AI-тренер (зал)

Отдельный Next.js проект, генерирующий программы силовой/кондиционной подготовки
для игроков волейбольной команды «Заречье» с помощью Claude.

## Связь с проектом zarechie

Этот проект **не хранит свои данные** — он читает тот же Upstash Redis,
что и основной дашборд `zarechie` (WHOOP-метрики, опросники, нейротесты).
Поэтому переменные `KV_REST_API_URL` и `KV_REST_API_TOKEN` должны быть
скопированы из проекта zarechie в Vercel-проект zarechie-coach.

Схема ключей Redis (общая с zarechie, см. также его `lib/redis.js` и API-роуты):
- `whoop:players` (SET id) + `whoop:player:{id}` — игроки с WHOOP
- `roster:players` (SET id) + `roster:player:{id}` — полный ростер (включая без WHOOP)
- `whoop:history:dates:{id}` (SET дат) + `whoop:history:{id}:{date}` — история WHOOP
- `survey:dates:{id}` (SET дат) + `survey:{id}:{date}` — вечерний опросник
- `survey:morning:{id}:{date}` — утренний чек-ин (без SET-индекса дат, итерация по диапазону дат)
- `neuro:data` — JSON-блоб нейротестов, ключ внутри — id игрока

## Структура

- `lib/redis.js` — REST-клиент Upstash (те же env vars, что в zarechie)
- `lib/auth.js` — проверка `x-api-key` против `TRAINER_API_KEY` (single-user, только полный доступ)
- `lib/playerData.js` — `getPlayerSnapshot(id, days)` собирает WHOOP/опросники/нейротесты игрока в один объект
- `pages/api/players/list.js` — список всех игроков (для выпадающего списка в UI)
- `pages/api/programs/generate.js` — основной эндпоинт: берёт снимок данных игрока,
  строит промпт с персоной топового S&C-тренера по волейболу и вызывает Claude
  (`claude-sonnet-4-6`) для генерации недельного микроцикла тренировок в зале
- `pages/index.js` — простой UI: ввод API-ключа, выбор игрока/цели/периода, вывод программы

## Переменные среды (Vercel)

| Переменная | Источник |
|---|---|
| `KV_REST_API_URL` | скопировать из проекта zarechie |
| `KV_REST_API_TOKEN` | скопировать из проекта zarechie |
| `TRAINER_API_KEY` | можно использовать тот же ключ, что в zarechie, или свой |
| `ANTHROPIC_API_KEY` | ключ Anthropic API (отдельно, не входит в zarechie) |

## Деплой

Аналогично zarechie — через Vercel CLI (`vercel --prod`), отдельный Vercel-проект.
Git remote не настроен по умолчанию (как и в zarechie).

## Локальный запуск

```bash
npm install
npm run dev
```
