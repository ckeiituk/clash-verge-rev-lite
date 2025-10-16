# GitHub Workflows Documentation

Полная документация по CI/CD процессам в проекте OutClash.

## Обзор

В проекте настроено 8 GitHub Actions workflows для автоматизации сборки, тестирования и релиза.

---

## 1. Auto Build (autobuild.yml)

**Назначение**: Автоматическая сборка для тестирования изменений

### Конфигурация
- **Триггер**: `workflow_dispatch` (ручной запуск)
- **Расписание**: закомментировано (раньше было 4 раза в день по UTC+8)
- **Права**: `write-all`
- **Тег**: `autobuild`
- **Канал**: `AutoBuild`

### Логика работы

#### Job 1: check_commit
Проверяет, нужна ли сборка:
- Если `workflow_dispatch` — всегда собирает
- Иначе проверяет:
  - Изменилась ли версия в `package.json`
  - Изменились ли `src/` или `src-tauri/`
- Вывод: `should_run` (true/false)

#### Job 2: update_tag
Обновляет git-тег и создает release:
- Принудительно пересоздает тег `autobuild`
- Извлекает changelog из `UPDATELOG.md` (первая секция после `## v`)
- Создает prerelease с подробным описанием вариантов скачивания
- Включает `generate_release_notes: true`

#### Job 3: clean_old_assets
Удаляет старые артефакты:
- Получает список всех assets из release `autobuild`
- Удаляет те, которые не содержат текущую версию из `package.json`
- Цель: держать только актуальные файлы

#### Job 4: autobuild-x86-windows-macos-linux
Основные сборки для x86 и ARM:

**Матрица платформ**:
```yaml
- windows-latest: x86_64-pc-windows-msvc
- windows-latest: aarch64-pc-windows-msvc
- macos-latest: aarch64-apple-darwin
- macos-latest: x86_64-apple-darwin
- ubuntu-22.04: x86_64-unknown-linux-gnu
```

**Процесс**:
1. Установка Rust + target
2. Кэширование Rust (сохраняется только для ветки `dev`)
3. Установка системных зависимостей (Linux: libwebkit2gtk, etc.)
4. `pnpm install` + `pnpm prebuild <target>`
5. `pnpm release-version autobuild` (обновляет версию в metadata)
6. Tauri build с подписью (`TAURI_PRIVATE_KEY`)
7. Автоматическая загрузка в release `autobuild`

**Особенности**:
- `NODE_OPTIONS: "--max_old_space_size=4096"` — увеличенная память для Node.js
- Rust cache сохраняется только для `dev` ветки
- Все артефакты подписываются для автообновлений

#### Job 5: autobuild-arm-linux
Специальная сборка для ARM Linux (cross-compilation):

**Матрица**:
```yaml
- ubuntu-22.04: aarch64-unknown-linux-gnu (arm64)
- ubuntu-22.04: armv7-unknown-linux-gnueabihf (armhf)
```

**Процесс**:
1. Настройка multi-arch репозиториев Ubuntu (ports.ubuntu.com)
2. Добавление архитектуры через `dpkg --add-architecture`
3. Установка cross-компиляторов:
   - `gcc-aarch64-linux-gnu` / `g++-aarch64-linux-gnu`
   - `gcc-arm-linux-gnueabihf` / `g++-arm-linux-gnueabihf`
4. Установка библиотек для целевой архитектуры
5. Настройка `PKG_CONFIG_*` переменных
6. Сборка через `pnpm build --target <target>`
7. Загрузка `.deb` и `.rpm` пакетов

**Особенности**:
- Использует отдельные репозитории для x86 и ARM
- Требует специальных переменных окружения для pkg-config
- Не использует `tauri-action` (ручная сборка через `pnpm build`)

#### Job 6: autobuild-x86-arm-windows_webview2
Сборка Windows с встроенным WebView2:

**Матрица**:
```yaml
- windows-latest: x86_64-pc-windows-msvc (x64)
- windows-latest: aarch64-pc-windows-msvc (arm64)
```

**Процесс**:
1. Скачивание фиксированной версии WebView2 Runtime (133.0.3065.92)
2. Распаковка `.cab` архива в `src-tauri/`
3. Подмена конфигурации: `tauri.windows.conf.json` → `webview2.<arch>.json`
4. Обычная сборка через `tauri-action`
5. Переименование: `*-setup.exe` → `*_fixed_webview2-setup.exe`
6. Создание portable версии: `pnpm portable-fixed-webview2`

**Зачем нужно**:
- Для корпоративных систем, где нельзя установить WebView2
- Увеличивает размер инсталлятора на ~120MB

---

## 2. Release Build (release.yml)

**Назначение**: Официальные стабильные релизы

### Конфигурация
- **Триггер**:
  - `push` тега формата `v*.*.*` в ветку `main`
  - ⚠️ `workflow_dispatch` отключен (чтобы избежать дублирования)
- **Права**: `write-all`

### Логика работы

#### Job 1: check_tag_version
Проверка консистентности версий:
```bash
TAG_REF="${GITHUB_REF##*/}"  # Например: v1.7.8
PKG_VERSION=$(jq -r .version package.json)  # Например: 1.7.8

# Проверка: TAG_REF == "v$PKG_VERSION"
```

Выходит с ошибкой, если версии не совпадают.

#### Job 2: create_release_notes
Создание описания релиза:
1. Извлекает changelog из `UPDATELOG.md`
2. Форматирует с инструкциями по скачиванию
3. Использует часовой пояс `Europe/Moscow` для даты
4. Создает release с красивым описанием и бейджами:
   ```markdown
   ### Linux
   [![DEB x64](badge)](link)
   [![RPM x64](badge)](link)

   ### Windows
   [![EXE x64](badge)](link)
   ```

**Особенности**:
- macOS секция закомментирована (нет сертификата)
- Использует `softprops/action-gh-release@v2`
- Не генерирует автоматические release notes (в отличие от autobuild)

#### Job 3: release
Основные сборки:

**Матрица**:
```yaml
- windows-latest: x86_64-pc-windows-msvc
- windows-latest: aarch64-pc-windows-msvc
- ubuntu-22.04: x86_64-unknown-linux-gnu
# macOS builds disabled (no certificate)
```

**Процесс**:
1. Стандартная установка toolchain
2. Rust cache (без сохранения: `save-if: false`)
3. `pnpm install` + `pnpm prebuild`
4. Tauri build с подписью
5. **Переименование артефактов** (убирает версию из имени):
   - Windows: `OutClash_1.7.8_x64-setup.exe` → `OutClash_x64-setup.exe`
   - Linux: `outclash_1.7.8_amd64.deb` → `OutClash_amd64.deb`
6. Загрузка в release `v<version>`

**Зачем переименование?**
- Упрощает автоматизацию скачивания (стабильные имена файлов)
- Версия уже есть в теге релиза

#### Job 4: release-for-linux-arm
ARM сборки для Linux (аналогично autobuild):
- Та же логика cross-compilation
- Переименование артефактов
- Загрузка в тот же release

#### Job 5: release-for-fixed-webview2
Windows с встроенным WebView2:
- Аналогично autobuild
- Переименование включает версию: `OutClash_1.7.8_x64_fixed_webview2-setup.exe` → `OutClash_x64_fixed_webview2-setup.exe`

#### Job 6: release-update
Генерация файлов автообновлений:
```bash
pnpm updater  # Создает latest.json для основной версии
```

**Зависимости**: ждет завершения `release` и `release-for-linux-arm`

#### Job 7: release-update-for-fixed-webview2
Генерация updater для WebView2 версии:
```bash
pnpm updater-fixed-webview2
```

#### Job 8: push-notify-to-telegram
Уведомления в Telegram:
1. Извлекает changelog из `UPDATELOG.md`
2. Форматирует для Telegram (markdown):
   ```
   Вышло обновление!

   *v1.7.8*
   - Feature 1
   - Feature 2

   [Ссылка на релиз](github.com/...)
   ```
3. Отправляет в канал: `${{ secrets.TELEGRAM_TO_CHANNEL }}`
4. Отправляет в группу: `${{ secrets.TELEGRAM_TO_GROUP }}`

**Зависимости**: ждет обе jobs генерации updater

---

## 3. Alpha Build (alpha.yml)

**Назначение**: Тестовые релизы для ранних тестеров

### Конфигурация
- **Триггер**: `workflow_dispatch` (ручной)
- **Тег**: `alpha`
- **Канал**: `Alpha`
- **Версия**: должна содержать `-alpha` (например: `v1.7.8-alpha.1`)

**Закомментированные триггеры**:
```yaml
# push:
#   branches: [dev]
#   tags: ["v*.*.*-alpha*"]
```

### Логика работы

#### Job 1: check_alpha_tag
Проверка alpha-версии:
```bash
# Тег должен содержать "-alpha"
[[ "$TAG_REF" =~ -alpha ]] || exit 1

# package.json тоже должен быть alpha
[[ "$PKG_VERSION" == *alpha* ]] || exit 1

# Версии должны совпадать
[[ "$TAG_REF" == "v$PKG_VERSION" ]] || exit 1
```

#### Job 2: delete_old_assets
Автоматическая очистка старых alpha-релизов:

**Алгоритм**:
1. Получает все теги через GitHub API
2. Фильтрует по паттерну `/-alpha.*/`
3. Получает дату commit для каждого alpha-тега
4. Сортирует по дате (новые первыми)
5. **Оставляет только последний alpha-релиз**
6. Для каждого старого:
   - Удаляет все assets
   - Удаляет release
   - Удаляет git тег

**Зачем?**
- Не засорять releases множеством alpha-версий
- Alpha-релизы нужны только для текущего тестирования

#### Job 3: update_tag
Создание/обновление release `alpha`:
- Аналогично autobuild
- Описание на русском языке
- Включает FAQ и рекламу VPN (狗狗加速)

#### Jobs 4-6: Сборки
Полный набор сборок для всех платформ:
- `alpha-x86-windows-macos-linux`: основные платформы
- `alpha-arm-linux`: ARM Linux
- `alpha-x86-arm-windows_webview2`: Windows с WebView2

**Отличия от autobuild**:
- Закомментирована строка `pnpm release-version` (версия берется из package.json)
- Поддержка macOS signing (если есть секреты):
  ```yaml
  APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
  APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
  APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
  APPLE_ID: ${{ secrets.APPLE_ID }}
  APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
  APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
  ```

---

## 4. Development Test (dev.yml)

**Назначение**: Быстрое тестирование сборок для разработки

### Конфигурация
- **Триггер**: только `workflow_dispatch`
- **Права**: `write-all`

### Матрица
```yaml
- windows-latest: x86_64-pc-windows-msvc (bundle: nsis)
- macos-latest: aarch64-apple-darwin (bundle: dmg)
- macos-latest: x86_64-apple-darwin (bundle: dmg)
```

**Особенности**:
- Только 3 платформы (самые распространенные)
- Linux НЕ включен
- Указан конкретный bundle type (`-b nsis/dmg`)
- Node.js 20 (в других workflows 22)

### Процесс
1. Обычная сборка через `tauri-action`
2. Поддержка macOS signing (если есть сертификаты)
3. **Загрузка в GitHub Artifacts** (не release!)
4. Артефакты именуются по target

**Использование**:
- Для быстрой проверки перед PR
- Для тестирования на конкретных платформах
- Артефакты доступны 90 дней через Actions UI

---

## 5. Clippy Lint (clippy.yml)

**Назначение**: Автоматическая проверка качества Rust кода

### Конфигурация
- **Триггер**: `pull_request`
- **Матрица**: Windows, macOS, Linux (основные платформы)

### Процесс
1. Setup Rust + target
2. Rust cache (без сохранения)
3. Установка системных зависимостей
4. `pnpm install` + `pnpm prebuild`
5. **Сборка web assets**: `pnpm web:build`
   - Важно! Clippy нужны готовые assets для проверки
6. Запуск Clippy:
   ```bash
   cargo clippy \
     --manifest-path src-tauri/Cargo.toml \
     --all-targets \
     --all-features \
     -- -D warnings
   ```

**Флаги**:
- `--all-targets`: проверяет `lib`, `bin`, `tests`, `benches`, `examples`
- `--all-features`: включает все feature flags
- `-D warnings`: любое предупреждение = ошибка

**Что проверяет**:
- Стиль кода (naming conventions)
- Potential bugs (unnecessary clones, etc.)
- Performance issues
- Unsafe code patterns
- Deprecated API usage

---

## 6. Check Formatting (fmt.yml)

**Назначение**: Проверка форматирования кода

### Конфигурация
- **Триггер**: `pull_request`
- **Jobs**: `rustfmt`, `prettier`, `taplo` (закомментирован)

### Job 1: rustfmt
Проверка форматирования Rust кода:
```bash
cargo fmt \
  --manifest-path ./src-tauri/Cargo.toml \
  --all \
  -- --check
```

**Флаги**:
- `--all`: проверяет все пакеты в workspace
- `--check`: только проверка (не модифицирует файлы)

### Job 2: prettier
Проверка форматирования frontend кода:
```bash
pnpm install --frozen-lockfile
pnpm format:check
```

**Что проверяет**:
- TypeScript/JavaScript (`.ts`, `.tsx`, `.js`, `.jsx`)
- CSS/SCSS
- JSON
- Markdown
- YAML

**Конфигурация**: `.prettierrc` в корне проекта

### Job 3: taplo (закомментирован)
Проверка TOML файлов:
- `Cargo.toml`
- `tauri.conf.json` (если в TOML формате)

**Почему закомментирован?**
- Возможно, проект не использует строгое форматирование TOML
- Или taplo слишком строгий для текущего кода

---

## 7. Updater CI (updater.yml)

**Назначение**: Генерация файлов для автообновлений

### Конфигурация
- **Триггер**: `workflow_dispatch` (ручной)
- **Права**: `write-all`

### Jobs

#### Job 1: release-update
Генерация `latest.json` для основной версии:
```bash
pnpm updater
```

**Что создает**:
```json
{
  "version": "v1.7.8",
  "notes": "Update notes from UPDATELOG.md",
  "pub_date": "2025-01-15T12:00:00Z",
  "platforms": {
    "darwin-x86_64": { "signature": "...", "url": "..." },
    "darwin-aarch64": { "signature": "...", "url": "..." },
    "linux-x86_64": { "signature": "...", "url": "..." },
    "windows-x86_64": { "signature": "...", "url": "..." }
  }
}
```

#### Job 2: release-update-for-fixed-webview2
Генерация updater для WebView2 версии:
```bash
pnpm updater-fixed-webview2
```

**Различия**:
- Отдельный `latest.json` для WebView2 варианта
- Ссылки на `*_fixed_webview2-setup.exe` файлы
- Пользователи с WebView2 версией обновляются только на WebView2

**Когда запускать**:
- После релиза (автоматически в `release.yml`)
- Вручную, если нужно пересоздать updater файлы

---

## 8. Cross Platform Cargo Check (cross_check.yaml)

**Назначение**: Быстрая проверка компиляции без полной сборки

### Конфигурация
- **Триггер**: `workflow_dispatch` (push/PR закомментированы)
- **Права**: `contents: read` (только чтение)
- **Среда**: `RUSTFLAGS="-D warnings"` (warnings = errors)

### Матрица
```yaml
- macos-latest: aarch64-apple-darwin
- windows-latest: x86_64-pc-windows-msvc
- ubuntu-latest: x86_64-unknown-linux-gnu
```

**Только основные платформы!** ARM-варианты не проверяются.

### Процесс
1. Setup Rust + target
2. `pnpm install` + `pnpm prebuild`
3. Rust cache (без сохранения)
4. **Cargo check**:
   ```bash
   cargo check \
     --target <target> \
     --workspace \
     --all-features
   ```

**Отличия от полной сборки**:
- `cargo check` только проверяет компиляцию (не генерирует бинарник)
- В 5-10 раз быстрее
- Не требует web assets
- Не требует Tauri bundling

**Использование**:
- Для быстрой проверки после рефакторинга
- Для проверки cross-platform совместимости
- Перед созданием PR

**Почему закомментированы триггеры?**
- Возможно, слишком много запусков на каждый push
- Или Clippy workflow дублирует функционал

---

## Секреты GitHub

Для работы workflows требуются следующие секреты:

### Обязательные
- `GITHUB_TOKEN` — автоматически предоставляется GitHub Actions
- `TAURI_PRIVATE_KEY` — приватный ключ для подписи обновлений
- `TAURI_KEY_PASSWORD` — пароль от приватного ключа

### Для Telegram уведомлений
- `TELEGRAM_TO_CHANNEL` — ID канала для уведомлений
- `TELEGRAM_TO_GROUP` — ID группы для уведомлений
- `TELEGRAM_TOKEN` — bot token

### Для macOS signing (опционально)
- `APPLE_CERTIFICATE` — base64-encoded сертификат
- `APPLE_CERTIFICATE_PASSWORD` — пароль от сертификата
- `APPLE_SIGNING_IDENTITY` — имя signing identity
- `APPLE_ID` — Apple ID для нотаризации
- `APPLE_PASSWORD` — app-specific password
- `APPLE_TEAM_ID` — Team ID разработчика

**Текущий статус**: macOS signing отключен в release workflow (нет сертификатов)

---

## Общие паттерны

### Кэширование Rust
```yaml
- uses: Swatinem/rust-cache@v2
  with:
    workspaces: src-tauri
    cache-all-crates: true  # Только в autobuild
    save-if: ${{ github.ref == 'refs/heads/dev' }}
```

**Логика**:
- Кэш сохраняется только для ветки `dev`
- PR и другие ветки только читают кэш
- В релизах: `save-if: false` (только чтение)

### NODE_OPTIONS
```yaml
NODE_OPTIONS: "--max_old_space_size=4096"
```

**Зачем**: Vite/Rollup требуют много памяти для больших проектов

### Cross-compilation для ARM Linux
Сложная настройка с multi-arch репозиториями:
1. Добавление `ports.ubuntu.com` для ARM
2. `dpkg --add-architecture arm64/armhf`
3. Установка cross-компиляторов
4. Настройка `PKG_CONFIG_PATH` и `PKG_CONFIG_SYSROOT_DIR`
5. Ручная сборка через `pnpm build` (не `tauri-action`)

### Переименование артефактов
Release workflow убирает версию из имен файлов для стабильных ссылок:
```bash
# Windows
OutClash_1.7.8_x64-setup.exe → OutClash_x64-setup.exe

# Linux
outclash_1.7.8_amd64.deb → OutClash_amd64.deb
outclash-1.7.8-1.x86_64.rpm → OutClash.x86_64.rpm
```

---

## Оптимизации и best practices

### 1. Concurrency control
```yaml
concurrency:
  group: "${{ github.workflow }} - ${{ github.head_ref || github.ref }}"
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}
```
- Отменяет предыдущий запуск workflow при новом push
- НЕ отменяет для `main` (релизы должны завершиться)

### 2. Fail-fast strategy
```yaml
strategy:
  fail-fast: false
```
- Продолжает сборки других платформ, даже если одна упала
- Важно для cross-platform проектов

### 3. Prebuild по target
```bash
pnpm run prebuild ${{ matrix.target }}
```
- Скачивает правильную версию Mihomo core для target
- Избегает несовместимости архитектур

### 4. Очистка старых артефактов
- `autobuild`: удаляет только старые версии в теге `autobuild`
- `alpha`: удаляет все старые alpha-релизы полностью

---

## Типичные проблемы и решения

### 1. Ошибка "Tag version mismatch"
**Причина**: версия в `package.json` не совпадает с тегом

**Решение**:
```bash
# Проверить версию
cat package.json | jq .version

# Обновить версию
pnpm version 1.7.8  # Без 'v' префикса

# Создать тег
git tag v1.7.8
git push origin v1.7.8
```

### 2. Ошибка "TAURI_PRIVATE_KEY not set"
**Причина**: не настроен приватный ключ для подписи

**Решение**:
```bash
# Сгенерировать ключ (локально)
pnpm tauri signer generate

# Добавить в GitHub secrets
# Public key → в tauri.conf.json
# Private key → TAURI_PRIVATE_KEY secret
# Password → TAURI_KEY_PASSWORD secret
```

### 3. ARM Linux сборка падает с pkg-config ошибкой
**Причина**: неправильные пути к библиотекам

**Решение**: проверить переменные окружения:
```bash
export PKG_CONFIG_ALLOW_CROSS=1
export PKG_CONFIG_PATH=/usr/lib/aarch64-linux-gnu/pkgconfig/
export PKG_CONFIG_SYSROOT_DIR=/usr/aarch64-linux-gnu/
```

### 4. macOS build fails with "No signing identity"
**Причина**: нет сертификата для подписи

**Временное решение**: закомментировать macOS из матрицы

**Постоянное решение**: получить Apple Developer сертификат и добавить секреты

### 5. WebView2 version mismatch
**Причина**: изменилась версия WebView2 Runtime

**Решение**: обновить ссылки в workflows:
```yaml
# Найти: 133.0.3065.92
# Заменить на новую версию
# В autobuild.yml и release.yml (2 места)
```

---

## Workflow для релиза (пошаговый)

### 1. Подготовка релиза
```bash
# Обновить UPDATELOG.md
## v1.7.8
- Feature 1
- Bug fix 2

# Обновить версию
pnpm version 1.7.8

# Проверить изменения
git diff package.json src-tauri/tauri.conf.json
```

### 2. Коммит и тег
```bash
# Коммит изменений
git add .
git commit -m "chore: release v1.7.8"

# Создать тег
git tag v1.7.8

# Push в main
git push origin main
git push origin v1.7.8
```

### 3. Автоматический процесс
1. Триггерится `release.yml`
2. Проверяет версии
3. Собирает для всех платформ (~30-40 минут)
4. Создает release notes
5. Генерирует updater манифесты
6. Отправляет уведомления в Telegram

### 4. После релиза
```bash
# Проверить релиз на GitHub
# Проверить updater файлы (latest.json)
# Протестировать автообновление

# Опционально: вручную запустить updater workflow
gh workflow run updater.yml
```

---

## Полезные команды

### Локальная проверка перед CI
```bash
# Форматирование
pnpm format
cargo fmt --manifest-path src-tauri/Cargo.toml

# Проверка форматирования
pnpm format:check
cargo fmt --manifest-path src-tauri/Cargo.toml --check

# Clippy
pnpm clippy

# Сборка
pnpm build
```

### Просмотр workflows через gh CLI
```bash
# Список workflows
gh workflow list

# Запуск workflow
gh workflow run autobuild.yml

# Просмотр runs
gh run list --limit 5

# Просмотр логов
gh run view <run-id>
gh run view <run-id> --log-failed
```

### Работа с тегами
```bash
# Список тегов
git tag -l

# Удаление локального тега
git tag -d v1.7.8

# Удаление удаленного тега
git push origin :refs/tags/v1.7.8

# Пересоздание тега
git tag v1.7.8
git push --force origin v1.7.8
```

---

## Заключение

CI/CD система проекта OutClash построена на следующих принципах:

1. **Автоматизация**: от проверки кода до уведомлений пользователей
2. **Кросс-платформенность**: поддержка 6 архитектур (x64, ARM64, ARMv7) и 3 ОС
3. **Безопасность**: подписание всех обновлений для защиты пользователей
4. **Гибкость**: разные каналы (autobuild, alpha, release) для разных аудиторий
5. **Оптимизация**: умное кэширование и параллельные сборки

Система поддерживает полный жизненный цикл:
- Разработка → `dev.yml` (тестовые сборки)
- Тестирование → `autobuild.yml` (ночные билды)
- Предрелиз → `alpha.yml` (для early adopters)
- Продакшн → `release.yml` (официальные релизы)
