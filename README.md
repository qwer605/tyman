# TYMAN

Стартовий 3D-проєкт на **Godot 4.7.2 .NET** і C#.
Початкова [сцена](scenes/main.tscn) порожня, а [скрипт `Main.cs`](scripts/Main.cs)
підтверджує її запуск. Рендерер — **GL Compatibility**. Цільові платформи —
Windows і Linux.

## Швидкий запуск

1. Установіть **Godot 4.7.2 .NET** і **.NET 8 SDK**. Версію Godot зафіксовано в [`.godot-version`](.godot-version).
2. Імпортуйте файл [`project.godot`](project.godot) через менеджер проєктів Godot.
3. Відкрийте проєкт і натисніть **F5**.

Після запуску у виводі Godot з’явиться `TYMAN C# ready`.

## Робота над грою

Основна гілка — `main`. Зміни потрапляють до неї через pull request.
Завдання та помилки ведіть у [GitHub Issues](https://github.com/qwer605/tyman/issues)
за [стандартом TYMAN](docs/issues.md).

## Перевірки й збірки

Команди нижче перевіряють запуск без графічного вікна. Виконуйте їх із кореня
репозиторію. Команда `godot` має вказувати на Godot .NET.

```sh
dotnet build Tyman.sln
godot --headless --editor --path . --import
godot --headless --path . --quit-after 2
```

CI запускається для PR у `main` і `release/*` та після push у `main`. Він
збирає Windows і Linux та перевіряє запуск Linux-збірки. Архіви доступні
**14 днів** у **Actions → CI → потрібний запуск → Artifacts**.

Для локального експорту встановіть шаблони **Godot 4.7.2 .NET**.
Команди для Windows і Linux та перевірки релізної автоматики наведено
в [посібнику з розробки](docs/development.md).

## Випуск версії

Workflow **Releases** у гілці `main` готує кандидата дією `prepare`.
Після перевірки кандидата дія `publish-stable` публікує ті самі архіви.
Порядок дій і виправлення кандидатів описано в [релізному процесі](docs/releases.md).

## Документація

- [Стан проєкту й попередній прототип](docs/features.md)
- [Контекст для агентів](AGENTS.md)
