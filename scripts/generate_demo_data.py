"""Generate synthetic grade 7 math results and a sample curriculum."""

import argparse
import csv
import random
from dataclasses import dataclass
from pathlib import Path


SEED = 42
STUDENTS_PER_SCHOOL = 400
SCHOOL_BASELINES = (40, 45, 50, 55, 60)
TEXTBOOKS = ("A", "B", "C")
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parents[1] / "data"


@dataclass(frozen=True)
class Topic:
    name: str
    current_hours: int
    min_hours: int
    max_hours: int
    pre_offset: int = 0
    average_gain: int = 17
    preferred_textbook: str | None = None


TOPICS = (
    Topic("Числовые выражения", 4, 2, 6, pre_offset=10, average_gain=25),
    Topic("Степень с натуральным показателем", 5, 3, 7),
    Topic("Свойства степеней", 5, 3, 7),
    Topic("Одночлены", 4, 2, 6),
    Topic("Многочлены", 6, 4, 8),
    Topic("Умножение многочленов", 6, 4, 9),
    Topic("Формулы сокращённого умножения", 6, 4, 9),
    Topic("Разложение многочлена на множители", 5, 3, 8, pre_offset=-8, average_gain=8),
    Topic("Линейные уравнения", 5, 3, 8, preferred_textbook="A"),
    Topic("Текстовые задачи на уравнения", 5, 3, 8, preferred_textbook="A"),
    Topic("Системы линейных уравнений", 5, 3, 8, pre_offset=-8, average_gain=8),
    Topic("Координатная плоскость", 4, 2, 6, pre_offset=10, average_gain=25),
    Topic("Линейная функция и её график", 6, 4, 8),
    Topic("Прямая пропорциональность", 4, 2, 6),
    Topic("Таблицы и графики данных", 4, 2, 6, preferred_textbook="C"),
    Topic("Среднее, медиана и размах", 4, 2, 6, preferred_textbook="C"),
    Topic("Частота и относительная частота", 4, 2, 6),
    Topic("Смежные и вертикальные углы", 4, 2, 6, pre_offset=10, average_gain=25),
    Topic("Параллельные прямые", 5, 3, 7, preferred_textbook="B"),
    Topic("Признаки равенства треугольников", 6, 4, 9, preferred_textbook="B"),
    Topic("Равнобедренный треугольник", 4, 2, 6),
    Topic("Сумма углов треугольника", 4, 2, 6),
    Topic("Геометрические доказательства", 5, 3, 8, pre_offset=-8, average_gain=8),
    Topic("Неравенство треугольника", 4, 2, 6),
    Topic("Построения циркулем и линейкой", 5, 3, 7),
)


def bounded_score(value: float) -> int:
    return max(0, min(100, round(value)))


def generate(output_dir: Path) -> None:
    rng = random.Random(SEED)
    output_dir.mkdir(parents=True, exist_ok=True)
    topics = [(f"T{number:02d}", topic) for number, topic in enumerate(TOPICS, start=1)]

    with (output_dir / "topics.csv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(("topic_id", "topic_name", "current_hours", "min_hours", "max_hours"))
        for topic_id, topic in topics:
            writer.writerow((topic_id, topic.name, topic.current_hours, topic.min_hours, topic.max_hours))

    with (output_dir / "results.csv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(("student_id", "school_id", "textbook_id", "topic_id", "pre_score", "post_score"))
        student_number = 0
        for school_number, school_baseline in enumerate(SCHOOL_BASELINES, start=1):
            school_id = f"S{school_number:02d}"
            # Keep every textbook represented in each school and shuffle assignments.
            books = [TEXTBOOKS[index % len(TEXTBOOKS)] for index in range(STUDENTS_PER_SCHOOL)]
            rng.shuffle(books)
            for book in books:
                student_number += 1
                student_id = f"P{student_number:04d}"
                baseline = rng.gauss(school_baseline, 9)
                for topic_id, topic in topics:
                    pre = bounded_score(baseline + topic.pre_offset + rng.gauss(0, 5))
                    bonus = 10 if book == topic.preferred_textbook else 0
                    post = bounded_score(pre + topic.average_gain + bonus + rng.gauss(0, 6))
                    writer.writerow((student_id, school_id, book, topic_id, pre, post))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    args = parser.parse_args()
    generate(args.output_dir)
    students = len(SCHOOL_BASELINES) * STUDENTS_PER_SCHOOL
    print(f"Wrote {students * len(TOPICS):,} results and {len(TOPICS)} topics to {args.output_dir}")


if __name__ == "__main__":
    main()
