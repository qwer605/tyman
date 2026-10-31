# Розробка й перевірки

## Вимоги

- **Godot 4.7.2 Standard**; для створення збірок — шаблони експорту 4.7.2.
  У грі використовується GDScript; .NET SDK не потрібен.
- **Git** для отримання коду та роботи з гілками.
- **Node.js 24** і npm для релізної автоматики, як у CI.
  Мінімальна підтримувана версія її пакета — Node.js 22.

Версії Godot і шаблонів мають відповідати [`.godot-version`](../.godot-version).
Для запуску гри через редактор шаблони експорту та Node.js не потрібні.

## Отримання й запуск проєкту

```sh
git clone https://github.com/qwer605/tyman.git
cd tyman
```

У менеджері проєктів Godot виберіть **Import**, відкрийте `project.godot`,
а в редакторі натисніть **F5**. Початкова сцена вже вказана в налаштуваннях.
Опис механік і керування: [Можливості проєкту](features.md).

Якщо редактор пропонує створити .NET-рішення, для поточної GDScript-гри воно не потрібне.

## Структура репозиторію

| Шлях | Призначення |
| --- | --- |
| [`project.godot`](../project.godot) | Початкова сцена, рендерер і розмір вікна |
| [`scenes/main.tscn`](../scenes/main.tscn) | Кореневий вузол і підключення сценарію світу |
| [`scripts/player.gd`](../scripts/player.gd) | Клавіші, рух, стрибок, камера та повернення на старт |
| [`scripts/world.gd`](../scripts/world.gd) | Геометрія, світло, кристали й HUD |
| [`tests/smoke.gd`](../tests/smoke.gd) | Ігрові перевірки без графічного вікна |
| [`export_presets.cfg`](../export_presets.cfg) | Профілі експорту Windows/Linux |
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Події запуску CI |
| [`.github/workflows/build.yml`](../.github/workflows/build.yml) | Спільні тести, експорт і пакування |
| [`.github/workflows/releases.yml`](../.github/workflows/releases.yml) | Підготовка RC й публікація stable |
| [`.github/release/release.cjs`](../.github/release/release.cjs) | Релізний контролер і перевірка файлів |
| [`.github/release/package.json`](../.github/release/package.json) | Залежності та команда тестів автоматики |
| [`.github/release/test/release.test.cjs`](../.github/release/test/release.test.cjs) | 16 сценаріїв перевірки релізної логіки |
| [`.github/CODEOWNERS`](../.github/CODEOWNERS) | Власники коду для всіх файлів |

Файли `.gd.uid` зберігаються разом зі сценаріями. Каталоги `.godot/`,
`node_modules/`, `build/`, `dist/` і локальні налаштування `.vscode/`
виключені з Git через [`.gitignore`](../.gitignore).

## Перевірки у Windows PowerShell

Виконуйте команди з кореня репозиторію. У першому рядку підставте власний шлях
до консольного виконуваного файла Godot:

```powershell
$godotExe = 'C:\Tools\Godot\Godot_v4.7.2-stable_win64_console.exe'

npm.cmd ci --prefix .github/release --ignore-scripts
npm.cmd test --prefix .github/release

& $godotExe --headless --editor --path . --import
& $godotExe --headless --path . --script tests/smoke.gd
```

`npm.cmd` дозволяє викликати npm без запуску PowerShell-скрипта `npm.ps1`.
`--ignore-scripts` під час встановлення залежностей вимикає їхні інсталяційні
сценарії; тести запускаються окремою командою.

## Перевірки в Linux або Bash

Ці команди припускають, що Godot 4.7.2 доступний як `godot`:

```sh
npm ci --prefix .github/release --ignore-scripts
npm test --prefix .github/release
godot --headless --editor --path . --import
godot --headless --path . --script tests/smoke.gd
```

Після успішної перевірки гри виводиться
`PASS: landing, movement, jump, pickup, respawn`.
Помилка перевірки повертає ненульовий код завершення.
Headless-тести перевіряють логіку без зображення; камеру й вигляд сцени
перевіряйте звичайним запуском.

## Експорт гри

Спочатку встановіть у редакторі шаблони експорту **Godot 4.7.2**.
Обидві платформи можна експортувати в CI на Linux.

PowerShell, із раніше визначеною змінною `$godotExe`:

```powershell
New-Item -ItemType Directory -Force -Path build/linux, build/windows | Out-Null
& $godotExe --headless --path . --export-release Linux build/linux/tyman.x86_64
& $godotExe --headless --path . --export-release Windows build/windows/tyman.exe
```

Bash:

```sh
mkdir -p build/linux build/windows
godot --headless --path . --export-release Linux build/linux/tyman.x86_64
godot --headless --path . --export-release Windows build/windows/tyman.exe
```

Поруч із кожним виконуваним файлом створюється `tyman.pck`. Зберігайте їх разом;
експортні профілі не вбудовують PCK у бінарний файл.

На відповідній платформі перевірте запуск збірки без графіки:

```powershell
& .\build\windows\tyman.exe --headless --quit-after 60
```

```sh
timeout 30s build/linux/tyman.x86_64 --headless --quit-after 60
```

## Робочі гілки й fork

Fork — копія всього репозиторію в іншому акаунті. Створювати новий fork
для кожної задачі не потрібно. Робоча гілка містить зміни конкретної задачі.

Для роботи в основному репозиторії:

```sh
git fetch origin
git switch -c feat/my-feature origin/main
# Змініть код і перевірте його.
git add scripts/player.gd
git commit -m "feat: add player ability"
git push -u origin feat/my-feature
```

У прикладі додано один конкретний змінений файл; для своєї задачі вкажіть потрібні шляхи.
Відкрийте PR із робочої гілки в `qwer605/tyman:main`.

Для роботи через fork `origin` має вказувати на ваш fork. Один раз додайте
основний репозиторій як `upstream`, потім отримуйте актуальні зміни:

```sh
git remote add upstream https://github.com/qwer605/tyman.git
git fetch upstream
git switch -c feat/my-feature upstream/main
```

Після коміту й push у свій `origin` відкрийте PR **в основний репозиторій**.
Для виправлення RC створюйте гілку від `release/X.Y.Z`, а PR спрямовуйте в цю ж
релізну гілку. Приклад: [Релізний процес](releases.md).

## Коміти й схвалення PR

Для автоматичної версії потрібні Conventional Commits в історії, яка входить до релізу:

```text
fix: correct player respawn
feat: add collectible crystals
feat!: change save format
docs: describe the release process
```

Звичайний merge зберігає окремі коміти. При **Squash and merge** повідомлення
підсумкового коміту має передавати найзначущішу зміну PR.
Перевірте його перед злиттям: правильного заголовка PR недостатньо,
якщо повідомлення squash-коміту змінено вручну.

Власники всіх файлів — `@alx1115` і `@qwer605`. Автор не може схвалити власний PR.
Для схвалення чужого PR відкрийте **Files changed → Review changes → Approve → Submit review**.
Після нових змін схвалення потрібно поновити. Останню порцію змін має схвалити
інша особа, ніж та, що виконала останній push.

CI поки не додано до rulesets як обов'язковий status check. Перед злиттям
перевіряйте успішність запуску **CI** й перевірки **checks / Checks**.

## Як працює CI

CI стартує для PR у `main` або `release/*`, а також після push у `main`.
Для PR перевіряється підготовлений GitHub merge-коміт.
Новий запуск того самого PR або ref скасовує попередній незавершений запуск CI.

Спільний workflow **Build game**:

1. Отримує точний коміт і встановлює Node.js 24.
2. Встановлює залежності з lock-файла та запускає 16 релізних тестів.
3. Встановлює Godot і шаблони з `.godot-version`, кешує завантаження.
4. Імпортує проєкт і запускає п'ять перевірок ігрових механік.
5. Експортує Windows/Linux і перевіряє наявність непорожніх бінарних файлів та PCK.
6. Запускає Linux-гру headless на 60 кадрів, максимум на 30 секунд.
7. Пакує дві збірки й точні вихідні файли коміту.
8. Зберігає архіви як артефакт GitHub Actions на **14 днів**.

Назва артефакту CI — `game-ci-RUN_ID-ATTEMPT`. Завантаження доступне через
**Actions → CI → потрібний запуск → Artifacts**.
У звичайному CI є три ZIP-архіви; маніфест і `SHA256SUMS` додаються лише під час
підготовки релізного кандидата. CI самостійно не створює GitHub Release.
