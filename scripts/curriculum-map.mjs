export const sections = [
  { id: "basics", title: "Основы Python" },
  { id: "branches", title: "Ветвления и отладка" },
  { id: "loops", title: "Циклы и последовательности" },
  { id: "strings", title: "Строки" },
  { id: "lists", title: "Списки и матрицы" },
  { id: "collections", title: "Множества и словари" },
  { id: "functions", title: "Функции" },
  { id: "recursion", title: "Рекурсия" },
  { id: "files", title: "Файлы" },
  { id: "algorithms", title: "Поиск и сортировка" },
  { id: "numbers", title: "Числовые алгоритмы" },
  { id: "efficiency", title: "Перебор и эффективность" },
  { id: "dp", title: "Динамическое программирование" },
  { id: "graphs", title: "Графы" }
];

const lesson = (id, sectionId, slug, title, skillIds, sources, batch, family, focus) => ({
  id, sectionId, slug, title, skillIds, sources, batch, family, focus
});

export const lessons = [
  lesson("python-basics-input-output", "basics", "input-output", "Ввод, вывод и переменные", ["SK01"], ["docs/basics/input-output-variables.md"], "A", "io", "читать данные, сохранять их в переменных и выводить результат"),
  lesson("python-basics-types-arithmetic", "basics", "types-arithmetic", "Типы и арифметика", ["SK02"], ["docs/basics/types-arithmetic.md"], "A", "arithmetic", "выбирать числовой тип и составлять арифметические выражения"),
  lesson("python-basics-div-mod-digits", "basics", "div-mod-digits", "Целочисленное деление и цифры", ["SK03"], ["docs/basics/div-mod-digits.md"], "A", "digits", "использовать // и % для работы с цифрами числа"),
  lesson("python-basics-logic", "basics", "logic", "Сравнения и логика", ["SK04"], ["docs/basics/logic.md"], "A", "logic", "составлять сравнения и логические выражения"),
  lesson("python-branches-if-else", "branches", "if-else", "if и else", ["SK05"], ["docs/basics/conditions.md"], "A", "branch", "выбирать ровно один из двух вариантов с if и else"),
  lesson("python-branches-elif-ranges", "branches", "elif-ranges", "elif и диапазоны", ["SK06"], ["docs/basics/conditions.md"], "A", "ranges", "разбивать значения на несколько взаимоисключающих диапазонов"),
  lesson("python-branches-compound", "branches", "compound", "Составные и вложенные условия", ["SK07"], ["docs/basics/conditions.md", "docs/basics/logic.md"], "A", "logic", "объединять и вкладывать условия без лишних ветвей"),
  lesson("python-debugging-basics", "branches", "debugging", "Отладка и трассировка ошибок", ["SK08"], ["docs/basics/debugging.md", "docs/python-plus/exceptions.md"], "A", "debug", "находить синтаксические, исполнительные и логические ошибки"),

  lesson("python-loops-while", "loops", "while", "Цикл while", ["SK09"], ["docs/loops/while.md"], "B", "loops", "повторять действия, пока условие истинно"),
  lesson("python-loops-for-range", "loops", "for-range", "Цикл for и range", ["SK10"], ["docs/loops/for-range.md"], "B", "loops", "перебирать известный диапазон значений"),
  lesson("python-loops-nested", "loops", "nested", "Вложенные циклы", ["SK11"], ["docs/loops/nested-loops.md"], "B", "nested", "строить перебор пар и таблиц вложенными циклами"),
  lesson("python-loops-accumulators", "loops", "accumulators", "Счётчики, суммы и произведения", ["SK12"], ["docs/loops/accumulators.md"], "B", "aggregate", "накапливать количество, сумму и произведение"),
  lesson("python-loops-min-max-average", "loops", "min-max-average", "Минимум, максимум и среднее", ["SK13"], ["docs/loops/accumulators.md"], "B", "aggregate", "находить экстремумы и среднее без хранения всей последовательности"),
  lesson("python-loops-sequences", "loops", "sequences", "Последовательности и ввод до стоп-сигнала", ["SK14"], ["docs/loops/sequences.md"], "B", "sequence", "обрабатывать поток значений и корректно работать со стоп-сигналом"),
  lesson("python-loops-tracing", "loops", "tracing", "Трассировка программ", ["SK15"], ["docs/loops/tracing.md"], "B", "trace", "пошагово определять значения переменных и результат программы"),

  lesson("python-strings-basics", "strings", "basics", "Строки: символы и индексы", ["SK16"], ["docs/strings/basics.md"], "C", "string", "перебирать символы строки и безопасно использовать индексы"),
  lesson("python-strings-methods-slices", "strings", "methods-slices", "Методы строк и срезы", ["SK17"], ["docs/strings/methods-slices.md"], "C", "string", "преобразовывать строки методами и срезами"),
  lesson("python-strings-algorithms", "strings", "algorithms", "Поиск, подсчёт и преобразование строк", ["SK18"], ["docs/strings/algorithms.md"], "C", "string", "решать строковые задачи одним проходом"),
  lesson("python-strings-runs", "strings", "runs", "Состояние и серии символов", ["SK18"], ["docs/strings/algorithms.md"], "C", "runs", "хранить состояние прохода и находить серии символов"),
  lesson("python-lists-basics", "lists", "basics", "Создание списка, ввод и индексы", ["SK19"], ["docs/lists/basics.md"], "C", "list", "создавать списки, читать элементы и обращаться по индексам"),
  lesson("python-lists-mutation", "lists", "mutation", "Изменение списков", ["SK19"], ["docs/lists/basics.md"], "C", "list", "изменять элементы и осознанно применять методы списка"),
  lesson("python-lists-processing", "lists", "processing", "Обработка списков", ["SK20"], ["docs/lists/processing.md"], "C", "list", "фильтровать, преобразовывать и агрегировать элементы списка"),
  lesson("python-lists-linear-search", "lists", "linear-search", "Линейный поиск", ["SK21"], ["docs/lists/linear-search.md"], "C", "search", "находить элемент и его индекс линейным проходом"),
  lesson("python-lists-neighbours", "lists", "neighbours", "Соседи, пары и тройки", ["SK22"], ["docs/lists/neighbours.md"], "C", "neighbours", "обрабатывать соседние элементы без выхода за границы"),
  lesson("python-lists-2d", "lists", "2d-lists", "Двумерные списки", ["SK23"], ["docs/lists/2d-lists.md"], "C", "matrix", "создавать матрицы и обходить строки и столбцы"),
  lesson("python-lists-matrices", "lists", "matrix-algorithms", "Алгоритмы обработки матриц", ["SK23"], ["docs/lists/2d-lists.md"], "C", "matrix", "считать характеристики строк, столбцов и диагоналей"),
  lesson("python-collections-sets", "collections", "sets", "Множества", ["SK24"], ["docs/collections/tuples-sets.md"], "C", "set", "хранить уникальные значения и выполнять операции над множествами"),
  lesson("python-collections-dicts-frequency", "collections", "dicts-frequency", "Словари и частоты", ["SK25"], ["docs/collections/dicts-frequency.md"], "C", "dict", "связывать ключи со значениями и строить таблицы частот"),

  lesson("python-functions-basics", "functions", "basics", "Функции: параметры и return", ["SK26"], ["docs/functions/basics.md"], "D", "function", "объявлять функции, передавать аргументы и возвращать результат"),
  lesson("python-functions-scope-decomposition", "functions", "scope-decomposition", "Декомпозиция и область видимости", ["SK27"], ["docs/functions/scope-decomposition.md"], "D", "function", "разделять решение на функции и управлять локальными данными"),
  lesson("python-recursion-basics", "recursion", "basics", "Основы рекурсии", ["SK28"], ["docs/recursion/basics.md"], "D", "recursion", "задавать базовый случай и рекурсивный переход"),
  lesson("python-recursion-calculations", "recursion", "calculations", "Рекурсивные вычисления и трассировка", ["SK29"], ["docs/recursion/calculations.md"], "D", "recursion", "трассировать стек вызовов и проверять завершение рекурсии"),
  lesson("python-files-basics", "files", "basics", "Чтение и запись файлов", ["SK30"], ["docs/files/basics.md"], "D", "files", "безопасно читать и записывать текстовые файлы"),
  lesson("python-files-numbers", "files", "numbers", "Числовые данные в файлах", ["SK31"], ["docs/files/numbers.md"], "D", "files", "обрабатывать числа из файла потоково"),
  lesson("python-files-text", "files", "text", "Текстовые данные в файлах", ["SK32"], ["docs/files/text.md"], "D", "files", "обрабатывать строки, слова и частоты из файла"),

  lesson("python-algorithms-binary-search", "algorithms", "binary-search", "Двоичный поиск", ["SK33"], ["docs/algorithms/search.md"], "E", "binary", "искать значение в отсортированном массиве за логарифмическое время"),
  lesson("python-algorithms-selection-sort", "algorithms", "selection-sort", "Простые сортировки", ["SK34"], ["docs/algorithms/simple-sorts.md"], "E", "simple_sort", "реализовывать сортировку выбором и понимать её шаги"),
  lesson("python-algorithms-python-sort", "algorithms", "python-sort", "sort, sorted и key", ["SK35"], ["docs/algorithms/python-sort.md"], "E", "sort", "сортировать данные встроенными средствами и задавать ключ"),
  lesson("python-numbers-divisibility-divisors", "numbers", "divisibility-divisors", "Делимость и делители", ["SK36"], ["docs/numbers/divisibility-divisors.md"], "E", "divisors", "проверять делимость и эффективно перечислять делители"),
  lesson("python-numbers-primes-gcd", "numbers", "primes-gcd", "Простые числа и НОД", ["SK37"], ["docs/numbers/primes-gcd.md"], "E", "number", "проверять простоту и вычислять НОД алгоритмом Евклида"),
  lesson("python-numbers-bases", "numbers", "bases", "Системы счисления", ["SK38"], ["docs/numbers/bases.md"], "E", "bases", "переводить целые числа между позиционными системами"),
  lesson("python-brute-force-basics", "efficiency", "brute-force", "Полный перебор", ["SK39"], ["docs/brute-force/basics.md"], "E", "brute", "строить полный перебор и отсеивать неподходящие варианты"),
  lesson("python-complexity-basics", "efficiency", "complexity", "Оценка сложности", ["SK40"], ["docs/complexity/basics.md"], "E", "complexity", "оценивать число операций и выбирать подходящий алгоритм"),

  lesson("python-dp-basics", "dp", "basics", "Основы динамического программирования", ["SK41"], [], "F", "dp", "выделять состояние, переход и базовые значения"),
  lesson("python-graphs-basics", "graphs", "basics", "Представление графа", ["SK42"], ["docs/graphs/basics.md"], "F", "graph", "хранить граф списками смежности"),
  lesson("python-graphs-traversal", "graphs", "traversal", "Обходы DFS и BFS", ["SK43"], ["docs/graphs/basics.md", "docs/graphs/paths.md"], "F", "graph", "обходить достижимые вершины в глубину и ширину"),
  lesson("python-graphs-paths", "graphs", "paths", "Пути в графах", ["SK44"], ["docs/graphs/paths.md"], "F", "graph_paths", "находить пути и расстояния в графе")
];

export const practicums = [
  { id: "python-practicum-first-programs", slug: "first-programs", title: "Практикум 1. Первые программы", batch: "A", count: 12 },
  { id: "python-practicum-loops", slug: "loops", title: "Практикум 2. Циклы", batch: "B", count: 15 },
  { id: "python-practicum-data", slug: "data", title: "Практикум 3. Строки и коллекции", batch: "C", count: 15 },
  { id: "python-practicum-functions-files", slug: "functions-files", title: "Практикум 4. Функции, рекурсия и файлы", batch: "D", count: 12 },
  { id: "python-practicum-algorithms", slug: "algorithms", title: "Практикум 5. Алгоритмы", batch: "E", count: 15 },
  { id: "python-practicum-final", slug: "final", title: "Практикум 6. Итоговый", batch: "F", count: 20 }
];

export const batchOrder = ["A", "B", "C", "D", "E", "F"];
