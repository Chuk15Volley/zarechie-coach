# Korenchuk Performance System

Отдельный Next.js проект для тренера S&C. Приложение помогает выбирать игрока,
генерировать тренировку или разминку на конкретный день, сохранять результат и
использовать историю нагрузок в следующих решениях.

## Связь с ReadySix

В режиме `primary` проект получает состав и состояние игроков обеих организаций
через защищённый read-only API ReadySix: WHOOP-метрики, опросники, утренние
чек-ины, нейротесты, ограничения и решение по допустимой нагрузке.
Сгенерированные тренировки, разминки, 1RM, фактические веса, тоннаж и библиотека
упражнений остаются в собственном хранилище этого приложения.

## Основные части

- `pages/index.js` — главный экран тренера.
- `pages/library.js` — библиотека упражнений.
- `pages/player/[id].js` — публичная карточка игрока.
- `pages/api/players/list.js` — загрузка состава.
- `pages/api/programs/generate.js` — основная генерация тренировки через OpenAI Responses API.
- `pages/api/programs/generate-warmup.js` и `pages/api/warmup/generate.js` — генерация разминки через OpenAI.
- `pages/api/programs/save.js` / `get.js` — сохранение и загрузка тренировки.
- `lib/playerData.js` — сбор данных игрока.
- `lib/redis.js` — REST-клиент Upstash Redis.

## Переменные среды

| Переменная | Назначение |
|---|---|
| `KV_REST_API_URL` | URL Upstash Redis |
| `KV_REST_API_TOKEN` | токен Upstash Redis |
| `TRAINER_API_KEY` | обязательный серверный ключ доступа тренера |
| `SESSION_SECRET` | рекомендуемый отдельный секрет подписи сессии, не короче 32 символов |
| `BACKUP_ENCRYPTION_KEY` | отдельный секрет AES-256 для шифрования резервных копий, не короче 32 символов |
| `CRON_SECRET` | секрет авторизации ежедневного задания резервного копирования |
| `SESSION_TTL_SECONDS` | срок HttpOnly-сессии; по умолчанию 12 часов, диапазон 15 минут–7 дней |
| `REDIS_TIMEOUT_MS` | таймаут Redis REST-запроса; по умолчанию 5000 мс |
| `OPENAI_API_KEY` | ключ OpenAI для генерации тренировок, разминок и AI-помощников |
| `READYSIX_URL` | серверный URL ReadySix |
| `READYSIX_INTEGRATION_MODE` | `legacy` или `primary`; по умолчанию `legacy` |
| `READYSIX_ZARECHIE_MODE` | необязательный override режима для «Заречья» |
| `READYSIX_NK_MODE` | необязательный override режима для NK Performance |
| `READYSIX_ZARECHIE_API_KEY` | read-only ключ ReadySix, привязанный к «Заречью» |
| `READYSIX_NK_API_KEY` | read-only ключ ReadySix, привязанный к NK Performance |

При `primary` отсутствие URL, ключа, правильной организации или совместимой
версии контракта завершает запрос ошибкой. Скрытого чтения устаревших данных нет.

## Локальный запуск

```bash
npm install
npm run dev
```

Требуется Node.js 24.x. Вход выполняется ключом тренера, после чего
браузер получает подписанную `HttpOnly`, `Secure`, `SameSite=Strict` сессию.
Ключ не сохраняется в `localStorage`.

## Проверка

```bash
npm test
npm run build
npm audit --omit=dev
```
