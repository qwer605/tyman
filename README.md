# Tyman

Стартовый 3D-проект на **Godot 4.7.2**, GDScript, рендерер Compatibility.

Откройте `project.godot` в Godot и нажмите **F5**. В тестовой сцене есть персонаж,
платформы и пять кристаллов для сбора. Графика создаётся кодом; внешние ассеты не нужны.

| Управление | Действие |
| --- | --- |
| WASD | Движение относительно камеры |
| Мышь | Поворот камеры |
| Space | Прыжок |
| R | Возврат на старт |
| Esc / клик | Освободить / захватить указатель |

## Структура

- `scenes/main.tscn` — стартовая сцена.
- `scripts/player.gd` — движение, камера и возврат после падения.
- `scripts/world.gd` — площадка, платформы, кристаллы и HUD.
- `tests/smoke.gd` — headless-проверки приземления, движения, прыжка, сбора и возврата.
- `export_presets.cfg` — Windows x86_64 и Linux x86_64.
- `.github/release/` — расчёт SemVer через закреплённый Release Please и публикация релизов.

## Проверки и сборки

```sh
npm ci --prefix .github/release --ignore-scripts
npm test --prefix .github/release
godot --headless --editor --path . --import
godot --headless --path . --script tests/smoke.gd
```

Для экспорта установите шаблоны Godot **той же версии**, что указана в `.godot-version`:

```sh
mkdir -p build/linux build/windows
godot --headless --path . --export-release Linux build/linux/tyman.x86_64
godot --headless --path . --export-release Windows build/windows/tyman.exe
```

CI запускает эти проверки, экспортирует обе платформы и проверяет запуск Linux-сборки.
Архивы доступны в **Actions → CI → Artifacts**. Это не релизы: CI не публикует версии.
Ручное тестирование графики и Windows-сборки остаётся частью проверки RC.

## Работа над задачами и релизами

Задачи проходят PR в `main`, где требуется одобрение `alx1115` или `qwer605`,
кроме автора PR. Можно использовать fork или рабочие ветки основного репозитория.

Кожне Issue отримує код `TMN-<номер>` у назві та пов’язану гілку з такою ж
назвою, наприклад `TMN-7`. Правила автоматизації та робота з чернетками:
[docs/issues.md](docs/issues.md).

Когда несколько задач готовы, запустите **Actions → Releases → Run workflow → prepare**.
Автоматика создаст ветку `release/X.Y.Z`, соберёт игру и опубликует RC для тестирования.
После проверки операция `publish-stable` опубликует те же файлы без пересборки.

Полный процесс, восстановление после ошибок и правила версий: [docs/releases.md](docs/releases.md).
