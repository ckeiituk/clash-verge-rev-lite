# HTTP-заголовки подписки

Справочник по заголовкам, которыми сервер подписки управляет поведением OutClash,
и по контракту отправки логов.

Все заголовки ответа матчятся **по суффиксу** и без учёта регистра
(`key.toLowerCase().endsWith('<имя>')`), поэтому серверу можно отдавать их с любым
префиксом: `logs-upload-url`, `x-logs-upload-url` и `X-Logs-Upload-URL` эквивалентны.
Парсинг — в `createProfile()` (`src/main/config/profile.ts`), выполняется при каждом
скачивании/обновлении подписки.

---

## Заголовки запроса (клиент → сервер)

При скачивании подписки клиент отправляет:

| Заголовок | Значение |
|-----------|----------|
| `User-Agent` | UA профиля (`ua`) или глобальный из настроек |
| `x-hwid` | идентификатор устройства (или `customHwid` профиля) |
| `x-device-os` | ОС (`Windows` / `Linux` / `macOS`) |
| `x-ver-os` | версия ОС |
| `x-device-model` | модель устройства |

---

## Заголовки ответа (сервер → клиент)

| Заголовок | Куда пишется | Эффект |
|-----------|--------------|--------|
| `profile-title` | `ProfileItem.name` | имя профиля; поддерживает префикс `base64:` |
| `content-disposition` | `ProfileItem.name` | fallback-имя, если `profile-title` не пришёл |
| `profile-web-page-url` | `ProfileItem.home` | пункт «Домашняя страница» в меню профиля |
| `support-url` | `ProfileItem.supportUrl` | кнопка «Поддержка» (Home и меню профиля) |
| `profile-update-interval` | `ProfileItem.interval` (мин × 60) | интервал автообновления; лочит поле в UI (`locked`) |
| `subscription-userinfo` | `ProfileItem.extra` | трафик/срок действия (`upload; download; total; expire`) |
| `profile-logo` | `ProfileItem.logo` | логотип (скачивается в base64) |
| `announce` | `ProfileItem.announce` | баннер-объявление на Home; `base64:`, `\n` поддерживаются |
| `global-mode` | `ProfileItem.globalMode` | разрешение глобального режима (`!== 'false'`) |
| `custom-css` | `ProfileItem.customCss` | тема профиля (см. [custom-styles.md](custom-styles.md)) |
| `logs-upload-url` | `ProfileItem.logsUploadUrl` | адрес приёмника логов (см. ниже) |
| `outclash-update-channel` | `AppConfig.updateChannel` | канал обновлений `stable`/`alpha`; игнорируется после ручного выбора (`updateChannelLocked`) |
| `x-hwid-limit`, `x-hwid-max-devices-reached` | — | при `true` подписка отклоняется с алертом лимита устройств |

---

## Отправка логов (`logs-upload-url`)

Значение — абсолютный `http(s)`-URL. Невалидные значения молча игнорируются.

Приоритет адреса (первый непустой валидный):

1. `ProfileItem.customLogsUploadUrl` — ручное переопределение в настройках профиля;
2. `AppConfig.logsUploadUrl` — глобальное переопределение (Настройки → Продвинутые);
3. `ProfileItem.logsUploadUrl` — значение из заголовка активного профиля.

Кнопка «Отправить логи» на главной странице видна, только когда эффективный адрес
непуст. По клику открывается выбор дневных лог-файлов (`<userData>/logs/*.log`),
выбранные файлы упаковываются в zip и отправляются одним запросом.

### Контракт запроса

`POST <url>`, тело `multipart/form-data`:

| Поле | Содержимое |
|------|-----------|
| `file` | zip-архив (`application/zip`), имя `outclash-logs-<hwid>-<ts>.zip`; внутри — выбранные дневные `.log` |
| `hwid` | идентификатор устройства |
| `app_version` | версия приложения |
| `os` | ОС |
| `os_version` | версия ОС |
| `device_model` | модель устройства |
| `profile_id` | id активного профиля |
| `profile_name` | имя активного профиля |
| `timestamp` | ISO-8601 момент отправки |

Заголовки запроса — те же, что при скачивании подписки (`User-Agent`, `x-hwid`,
`x-device-os`, `x-ver-os`, `x-device-model`).

Запрос идёт напрямую; если у профиля включено «Обновлять через прокси»
(`useProxy`), то через mixed-port работающего ядра. Таймаут — 60 секунд. Любой
не-2xx ответ считается ошибкой и показывается пользователю; модалка остаётся
открытой для повтора.

Реализация: `src/main/resolve/logsUploader.ts`.
