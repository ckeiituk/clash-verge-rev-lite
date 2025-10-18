# TODO:
- Реализовать лёгкое добавление правил
- Сменить логотип/дизайн
- Пересмотреть механизм уведомлений об обновлениях:
  - Всплывающий баннер на рабочем столе
  - Красный восклицательный или любой другой красный знак
- Левое меню пусть будет изначально открытым?
- Мб панель типо winamp на рабочей миниатюрная?
- Скрипт обновления Outbound Nigeria через Remnawave API (https://www.perplexity.ai/search/mozhno-li-kak-to-zadavat-outbo-coQ3ij7DTuaNYed5JvWnTA#2)

## Фича: периодический баннер напоминания об обновлении (черновые заметки)

- Провайдер `UpdateReminderProvider` (SWR + таймеры) и 2 варианта UI:
  - карточка в правом нижнем углу (пока не скроют);
  - тост (автоскрытие ~8с, без навязывания).
- Каденс показа:
  - первый показ через ~10 минут после обнаружения;
  - далее — раз в 24 часа (учитывает дреминг и фокус окна);
  - «Отложить» на: 1ч / 1д / 1н; «Пропустить эту версию» — больше не тревожить.
- Хранение состояния (`localStorage` → ключ `outclash:updateReminder`, строгая схема через zod):
  - `dismissedVersions`, `snoozedUntil`, `lastShownAtByVersion`, `lastNotificationAtByVersion`;
  - `preferredStyle` (card|toast), `pauseWhileFullscreen`, `manualPauseUntil`.
- Поведение в фоне (без открытия окна):
  - переключатель сборкой `VITE_UPDATE_REMINDER_BACKGROUND=os|attention|none`;
    - `os` — нативный системный тост (по умолчанию);
    - `attention` — мигание таскбара/дока `requestUserAttention(Informational)` без системного тоста;
    - `none` — ничего в фоне.
- Локальный тестовый источник обновления (без GitHub релиза):
  - включается флагом `VITE_UPDATE_REMINDER_FILE_SOURCE=true`;
  - файл `UPDATE.txt` в каталоге конфигурации Tauri (`appConfigDir/io.github.outclash/UPDATE.txt`), пример:
    ```
    version=0.9.99-test
    title=Internal Test Build
    staleness=hours:1
    body=• Feature: Try the new banner
    body=• Fix: Background attention mode
    ```
  - поля: `version` (обяз.), `title` (опц.), `body` (многострочно), `staleness` (ms/s/m/h/d);
  - при наличии файла — используется вместо сетевого чекера; `staleness` переопределяет интервал напоминаний.
- Фуллскрин‑гард (чтобы не мешать играм):
  - настройка в Advanced Settings: «Пауза напоминаний при полноэкранных приложениях» (по умолчанию ВКЛ);
  - на Windows: команда `detect_foreground_fullscreen` (winapi) сравнивает окно и монитор;
  - на других ОС — сейчас безопасный заглушечный false (план: доработать позже);
  - ручная пауза: меню «Пауза на…» (30м/1ч/4ч/1д) + «Возобновить».
- Интеграция с существующим UI:
  - `UpdateButton` слушает `outclash:open-update-viewer` — из баннера можно открыть текущий модал обновления;
  - обновлены `system-info-card` и настройки для использования общего чекера.
- I18n: добавлены строки `updateReminder.*` и `updateReminderSettings.*` во все локали.
- Dev‑инструменты:
  - плавающая панель (dev‑сборки) и глобальный хелпер `window.__OUTCLASH_UPDATE_REMINDER__`:
    - `trigger({ version, body, titleText })`, `showNow()`, `setStyle('card'|'toast')`,
      `setFullscreenGuard(bool)`, `pauseFor(ms)`, `resume()`, `reset()`, `getState()`;
  - документация: `docs/update-reminder-debug.md` (env‑флаги, формат файла, подсказки).

Примечания для релиза/отката:
- Всё тестовое поведение переключается env‑флагами; в проде локальный файл и dev‑панель выключены.
- Для полного отката фичи: удалить `UpdateReminderProvider`, связанный стейт/сервисы, UI‑компоненты и строки i18n,
  вернуть прямое использование плагина‑апдейтера в местах, где переключили на общий чекер.

### Как тестировать (шпаргалка)

- Dev‑сборка (быстрый ручной триггер) или форс‑панель в релизе:
  - `pnpm web:dev` (только UI) или `pnpm dev` (полный стек с Tauri).
  - Открой DevTools (F12) и используй глобальные хелперы:
    - `window.__OUTCLASH_UPDATE_REMINDER__.trigger({ version: "v9.9.9", body: "- Added X\n- Fixed Y", titleText: "Internal Test" })`
    - `window.__OUTCLASH_UPDATE_REMINDER__.showNow()` — показать сразу, без ожидания таймеров
    - `window.__OUTCLASH_UPDATE_REMINDER__.setStyle("card" | "toast")` — переключить вид
    - `window.__OUTCLASH_UPDATE_REMINDER__.setFullscreenGuard(true|false)` — включить/выключить гард
    - `window.__OUTCLASH_UPDATE_REMINDER__.pauseFor(60*60*1000)` / `resume()` — пауза/возобновление
    - `window.__OUTCLASH_UPDATE_REMINDER__.reset()` — сброс локального состояния

- Локальный UPDATE.txt (без GitHub релизов):
  - Запусти с флагом: `VITE_UPDATE_REMINDER_FILE_SOURCE=true pnpm dev` (или для релиза — `pnpm build` с тем же флагом).
  - Помести файл `UPDATE.txt` в каталог конфигурации Tauri:
    - Windows: `%APPDATA%/io.github.outclash/UPDATE.txt`
    - macOS: `~/Library/Application Support/io.github.outclash/UPDATE.txt`
    - Linux: `~/.config/io.github.outclash/UPDATE.txt`
  - Пример содержимого:
    ```
    version=0.9.99-test
    title=Internal Test Build
    staleness=minutes:5
    body=• Feature: Try the new banner
    body=• Fix: Background attention mode
    ```
  - Обнови `version` или просто перезапиши файл (mtime) — это считается «новым релизом». `staleness` задаёт интервал повторных напоминаний (по умолчанию 24ч).

- Поведение в фоне (без тоста ОС или с ним):
  - Сборочный флаг `VITE_UPDATE_REMINDER_BACKGROUND=os|attention|none`.
    - `os`: нативный тост ОС, когда окно в фоне/скрыто.
    - `attention`: только мигание таскбара/дока (`requestUserAttention`), без тостов.
    - `none`: ничего не делать в фоне.
  - Для проверки сверни окно и дождись напоминания.

- Фуллскрин‑гард / «режим игры»:
  - В Настройках → Advanced включи «Пауза напоминаний при полноэкранных приложениях».
  - Открой любое полноэкранное приложение (или игру) — баннер не должен появляться; напоминания откладываются.
  - Проверь ручную паузу: меню «Пауза на…» (30м/1ч/4ч/1д) и «Возобновить».

- Каденс и повторные напоминания:
  - Первый показ через ~10 минут после обнаружения. Чтобы не ждать — используй `showNow()` или поставь `staleness=minutes:1` в UPDATE.txt.
  - Повторы — раз в 24ч (или по `staleness`).

- Релизная проверка:
  - `pnpm build` и запусти бинарник из `src-tauri/target/release`.
  - По умолчанию в релизе dev‑панель выключена; при необходимости можно принудительно включить панель и хелперы: `VITE_UPDATE_REMINDER_DEBUG_FORCE=true pnpm build`.
  - Сбросить состояние: в консоли (`F12`) выполнить `localStorage.removeItem('outclash:updateReminder')`.
