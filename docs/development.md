# Розробка й перевірки

## Вимоги

- **Godot 4.7.2 .NET** і **.NET 8 SDK**. Для створення збірок потрібні шаблони експорту **4.7.2 .NET**.
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
Стан стартової сцени описано в [можливостях проєкту](features.md).

## Структура репозиторію

| Шлях | Призначення |
| --- | --- |
| [`project.godot`](../project.godot) | Початкова сцена, рендерер і розмір вікна |
| [`Tyman.csproj`](../Tyman.csproj) | Версія Godot .NET SDK та параметри компіляції C# |
| [`scenes/main.tscn`](../scenes/main.tscn) | Кореневий 3D-вузол і підключення `Main.cs` |
| [`scripts/Main.cs`](../scripts/Main.cs) | Скрипт, який підтверджує запуск C#-сцени |
| [`export_presets.cfg`](../export_presets.cfg) | Профілі експорту Windows/Linux |
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | Події запуску CI |
| [`.github/workflows/build.yml`](../.github/workflows/build.yml) | Спільні тести, експорт і пакування |
| [`.github/workflows/releases.yml`](../.github/workflows/releases.yml) | Підготовка RC й публікація stable |
| [`.github/release/release.cjs`](../.github/release/release.cjs) | Релізний контролер і перевірка файлів |
| [`.github/release/package.json`](../.github/release/package.json) | Залежності та команда тестів автоматики |
| [`.github/release/test/release.test.cjs`](../.github/release/test/release.test.cjs) | 16 сценаріїв перевірки релізної логіки |
| [`.github/CODEOWNERS`](../.github/CODEOWNERS) | Власники коду для всіх файлів |

Файли `.cs.uid` зберігаються разом зі сценаріями. Каталоги `.godot/`,
`node_modules/`, `build/`, `dist/` і локальні налаштування `.vscode/`
виключені з Git через [`.gitignore`](../.gitignore).

## Перевірки у Windows PowerShell

Виконуйте команди з кореня репозиторію. У першому рядку підставте власний шлях
до консольного виконуваного файла Godot:

```powershell
$godotExe = 'C:\Tools\Godot\Godot_v4.7.2-stable_mono_win64_console.exe'

npm.cmd ci --prefix .github/release --ignore-scripts
npm.cmd test --prefix .github/release

dotnet build Tyman.csproj
& $godotExe --headless --editor --path . --import
& $godotExe --headless --path . --quit-after 2
```

`npm.cmd` дозволяє викликати npm без запуску PowerShell-скрипта `npm.ps1`.
`--ignore-scripts` під час встановлення залежностей вимикає їхні інсталяційні
сценарії; тести запускаються окремою командою.

## Перевірки в Linux або Bash

Ці команди припускають, що Godot 4.7.2 .NET доступний як `godot`:

```sh
npm ci --prefix .github/release --ignore-scripts
npm test --prefix .github/release
dotnet build Tyman.csproj
godot --headless --editor --path . --import
godot --headless --path . --quit-after 2
```

Рядок `TYMAN C# ready` підтверджує, що Godot завантажив сцену й виконав C#-метод `_Ready()`.

## Експорт гри

Спочатку встановіть у редакторі шаблони експорту **Godot 4.7.2 .NET**.
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

Зберігайте весь каталог експорту: виконуваний файл, `tyman.pck` і файли .NET.

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
git add scripts/Main.cs
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

Власники всіх файлів — `@alx1115` і `@qwer605`. Review можна запитати за потреби;
обов’язкове схвалення іншим учасником чи власником коду не вимагається.
Автор не може схвалити власний PR.
Для схвалення чужого PR відкрийте **Files changed → Review changes → Approve → Submit review**.
Якщо review вже було надано, після нових змін його схвалення скидається.

CI поки не додано до rulesets як обов'язковий status check. Перед злиттям
перевіряйте успішність запуску **CI** й перевірки **checks / Checks**.

## Як працює CI

CI стартує для PR у `main` або `release/*`, а також після push у `main`.
Для PR перевіряється підготовлений GitHub merge-коміт.
Новий запуск того самого PR або ref скасовує попередній незавершений запуск CI.

Спільний workflow **Build game**:

1. Отримує точний коміт і встановлює Node.js 24.
2. Встановлює залежності з lock-файла та запускає 16 релізних тестів.
3. Встановлює .NET SDK, Godot .NET і шаблони з `.godot-version`.
4. Компілює C#, імпортує проєкт і перевіряє запуск стартової сцени.
5. Експортує Windows/Linux і перевіряє наявність непорожніх бінарних файлів та PCK.
6. Запускає Linux-гру headless на 60 кадрів і перевіряє повідомлення від C#-скрипту.
7. Пакує дві збірки й точні вихідні файли коміту.
8. Зберігає архіви як артефакт GitHub Actions на **14 днів**.

Назва артефакту CI — `game-ci-RUN_ID-ATTEMPT`. Завантаження доступне через
**Actions → CI → потрібний запуск → Artifacts**.
У звичайному CI є три ZIP-архіви; маніфест і `SHA256SUMS` додаються лише під час
підготовки релізного кандидата. CI самостійно не створює GitHub Release.
