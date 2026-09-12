# Отчёт импорта методички

Источник: `itpark32/python-school-metodichka`, commit `8c9bd0ba5b36493505325d14b803b69d299e3e5b`.
Импортирован пакет: **A–F**. Уроков: **47**, практикумов: **6**.

## Преобразования

- reading-time и HTML-теги перенесены в lesson.json;
- MkDocs admonitions преобразованы в обычный Markdown или details;
- topic-nav удалён, внутренние ссылки заменены маршрутами платформы;
- экзаменационные ярлыки и привязка к номеру задания удалены;
- attr_list удалён после переноса семантики; неизвестный потенциально lossy-синтаксис останавливает импорт;
- каждому уроку добавлены цель, 2 guided-задачи, checkpoint и проверяемое reference solution.

## Аудит прежнего контента

Прежние уроки по функциям, рекурсии, файлам и сортировке были содержательно нормальными: понятные примеры, типичные ошибки и рабочие задачи. Их проблема была не в качестве объяснений, а в неполном покрытии программы. Урок `if и else` объединял SK05–SK07 и был слишком широким; теперь материал разделён на три самостоятельных урока. Все пять прежних тем пересобраны из закреплённого источника и проходят те же gates, что новый контент.

## Использованные исходники

- `docs/algorithms/python-sort.md` → `python-algorithms-python-sort`
- `docs/algorithms/search.md` → `python-algorithms-binary-search`
- `docs/algorithms/simple-sorts.md` → `python-algorithms-selection-sort`
- `docs/basics/conditions.md` → `python-branches-if-else`, `python-branches-elif-ranges`, `python-branches-compound`
- `docs/basics/debugging.md` → `python-debugging-basics`
- `docs/basics/div-mod-digits.md` → `python-basics-div-mod-digits`
- `docs/basics/input-output-variables.md` → `python-basics-input-output`
- `docs/basics/logic.md` → `python-basics-logic`, `python-branches-compound`
- `docs/basics/types-arithmetic.md` → `python-basics-types-arithmetic`
- `docs/brute-force/basics.md` → `python-brute-force-basics`
- `docs/collections/dicts-frequency.md` → `python-collections-dicts-frequency`
- `docs/collections/tuples-sets.md` → `python-collections-sets`
- `docs/complexity/basics.md` → `python-complexity-basics`
- `docs/files/basics.md` → `python-files-basics`
- `docs/files/numbers.md` → `python-files-numbers`
- `docs/files/text.md` → `python-files-text`
- `docs/functions/basics.md` → `python-functions-basics`
- `docs/functions/scope-decomposition.md` → `python-functions-scope-decomposition`
- `docs/graphs/basics.md` → `python-graphs-basics`, `python-graphs-traversal`
- `docs/graphs/paths.md` → `python-graphs-traversal`, `python-graphs-paths`
- `docs/lists/2d-lists.md` → `python-lists-2d`, `python-lists-matrices`
- `docs/lists/basics.md` → `python-lists-basics`, `python-lists-mutation`
- `docs/lists/linear-search.md` → `python-lists-linear-search`
- `docs/lists/neighbours.md` → `python-lists-neighbours`
- `docs/lists/processing.md` → `python-lists-processing`
- `docs/loops/accumulators.md` → `python-loops-accumulators`, `python-loops-min-max-average`
- `docs/loops/for-range.md` → `python-loops-for-range`
- `docs/loops/nested-loops.md` → `python-loops-nested`
- `docs/loops/sequences.md` → `python-loops-sequences`
- `docs/loops/tracing.md` → `python-loops-tracing`
- `docs/loops/while.md` → `python-loops-while`
- `docs/numbers/bases.md` → `python-numbers-bases`
- `docs/numbers/divisibility-divisors.md` → `python-numbers-divisibility-divisors`
- `docs/numbers/primes-gcd.md` → `python-numbers-primes-gcd`
- `docs/python-plus/exceptions.md` → `python-debugging-basics`
- `docs/recursion/basics.md` → `python-recursion-basics`
- `docs/recursion/calculations.md` → `python-recursion-calculations`
- `docs/strings/algorithms.md` → `python-strings-algorithms`, `python-strings-runs`
- `docs/strings/basics.md` → `python-strings-basics`
- `docs/strings/methods-slices.md` → `python-strings-methods-slices`

`docs/exams/**` и самостоятельный маршрут Python+ намеренно не импортируются: они не входят в target curriculum. Фрагмент про исключения используется только как дополнительный источник урока об отладке. DP создан как новый материал, потому что в методичке нет отдельного исходного урока.
