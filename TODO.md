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
