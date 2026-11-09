# Data-Driven Curriculum

Хакатонный MVP для методиста. Приложение помогает найти сложные темы, сравнить результаты учеников с разными учебниками и подготовить проект перераспределения учебных часов.

Предмет для демонстрации — математика 7-го класса. Данные и учебный план синтетические.

## Репозиторий

| Путь | Назначение |
| --- | --- |
| `SPEC.md` | Сценарий, данные, метрики и критерии готовности |
| `AGENTS.md` | Правила работы двух разработчиков и их Codex |
| `contracts/` | Контракт между интерфейсом и сервером |
| `scripts/` | Генерация демонстрационных данных |
| `data/` | Локальные CSV для разработки |
| `backend/` | FastAPI, pandas и SQLite |
| `frontend/` | React, Vite, TypeScript и Recharts |

## Демо-данные

Из корня репозитория с Python 3.10 или новее:

```sh
python3 scripts/generate_demo_data.py
```

Генератор использует стандартную библиотеку и seed 42. Он создаёт или перезаписывает `data/results.csv` (50 000 строк данных) и `data/topics.csv` (25 тем) в UTF-8. Чтобы записать их в другую папку, передай `--output-dir <путь>`.

В каждой школе по 400 учеников и представлены все три учебника. У школ разный средний входной балл. Три темы сложнее остальных. В синтетических данных у A выше прирост на задачах с уравнениями, у B — на выбранных темах геометрии, у C — на темах анализа данных. На хорошо освоенных темах есть резерв часов.

## Запуск API

Из корня репозитория с Python 3.11 или новее:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Сервер генерирует демонстрационный набор при запуске. В отдельном терминале можно проверить ответы:

```sh
curl -X POST http://127.0.0.1:8000/api/datasets/demo
curl 'http://127.0.0.1:8000/api/datasets/demo/overview?school_id=S01'
curl 'http://127.0.0.1:8000/api/datasets/demo/topics?school_id=S01'
curl 'http://127.0.0.1:8000/api/datasets/demo/textbook-comparison?topic_id=T09'
```

Маршрут тем возвращает статистику по всем 25 темам и ячейки `heatmap`. Для всех школ получается 125 ячеек, для `S01` — 25. Пример ответа для интерфейса — [demo-topics-s01.json](contracts/examples/demo-topics-s01.json).

Сравнение учебников требует `topic_id` и принимает необязательный `school_id`. Пример для линейных уравнений — [demo-textbook-comparison-t09.json](contracts/examples/demo-textbook-comparison-t09.json). `groups` содержит сводки по учебникам, `comparisons` — наблюдаемые различия прироста внутри сопоставимых групп.

Интерфейс может отправлять запросы на относительные пути `/api/…`. Для локальной разработки настрой прокси Vite для `/api` на `http://127.0.0.1:8000`. Поля ответов описаны в [контракте API](contracts/README.md).

Для запуска тестов генератора и API из корня проекта:

```sh
.venv/bin/python -m pip install -r backend/requirements-dev.txt
.venv/bin/python -m pytest -q
```
