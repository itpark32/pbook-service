const normalized = { mode: "normalized_text" };
const clone = (value) => JSON.parse(JSON.stringify(value));

const defaultHints = (topic) => [
  `Сначала выделите данные и результат: ${topic}.`,
  "Проверьте отдельный граничный случай до отправки решения.",
  "Не выводите поясняющий текст: проверяется только ответ программы."
];

const stdin = (title, statement, solution, cases, starterCode = "# Напишите решение здесь.\n", hints = defaultHints("эту операцию")) => ({
  title,
  statement,
  starterCode,
  solution,
  hints,
  examples: [{ input: cases[0][0], output: cases[0][1] }],
  judge: {
    type: "stdin_stdout",
    comparison: normalized,
    tests: cases.map(([input, expectedOutput]) => ({ input, expectedOutput }))
  }
});

const func = (title, statement, functionName, solution, cases, starterCode, structuralConstraints, hints = defaultHints("значение, которое возвращает функция")) => ({
  title,
  statement,
  starterCode: starterCode ?? `def ${functionName}(...):\n    pass\n`,
  solution,
  hints,
  examples: [{ input: JSON.stringify(cases[0][0]), output: JSON.stringify(cases[0][1]) }],
  judge: {
    type: "function",
    functionName,
    tests: cases.map(([args, expectedReturn]) => ({ args, expectedReturn })),
    ...(structuralConstraints ? { structuralConstraints } : {})
  }
});

const fileTask = (title, statement, solution, inputFiles, expectedStdout, expectedFiles = [], hints = ["Откройте файл через with, чтобы он закрылся автоматически.", "Удаляйте перевод строки только там, где он мешает обработке.", "Сверьте имя выходного файла с условием."]) => ({
  title,
  statement,
  starterCode: "# Файлы уже находятся в рабочей папке.\n",
  solution,
  hints,
  examples: [],
  fileExamples: [{ title: "Пример файлов", files: inputFiles }],
  judge: {
    type: "files",
    comparison: normalized,
    tests: [{ inputFiles, ...(expectedStdout !== undefined ? { expectedStdout } : {}), ...(expectedFiles.length ? { expectedFiles } : {}) }]
  }
});

const profiles = {
  io: [
    stdin("Эхо", "Прочитайте строку и выведите её без изменений.", "print(input())", [["Python\n", "Python\n"], ["42\n", "42\n"]]),
    stdin("Имя и приветствие", "Прочитайте имя и выведите: `Привет, <имя>!`", "name = input()\nprint(f'Привет, {name}!')", [["Аня\n", "Привет, Аня!\n"], ["Макс\n", "Привет, Макс!\n"]]),
    stdin("Сумма двух чисел", "Прочитайте два целых числа из одной строки и выведите их сумму.", "a, b = map(int, input().split())\nprint(a + b)", [["2 3\n", "5\n"], ["-4 9\n", "5\n"], ["0 0\n", "0\n"]])
  ],
  arithmetic: [
    stdin("Периметр прямоугольника", "Даны стороны прямоугольника. Выведите его периметр.", "a, b = map(int, input().split())\nprint(2 * (a + b))", [["3 5\n", "16\n"], ["1 1\n", "4\n"]]),
    stdin("Среднее трёх", "Даны три числа. Выведите их среднее арифметическое.", "a, b, c = map(float, input().split())\nprint((a + b + c) / 3)", [["3 6 9\n", "6.0\n"], ["1 2 3\n", "2.0\n"]]),
    stdin("Стоимость покупки", "Даны цена одной вещи и количество. Выведите общую стоимость.", "price, count = map(int, input().split())\nprint(price * count)", [["120 3\n", "360\n"], ["7 0\n", "0\n"]])
  ],
  digits: [
    stdin("Последняя цифра", "Выведите последнюю цифру неотрицательного целого числа.", "n = int(input())\nprint(n % 10)", [["247\n", "7\n"], ["0\n", "0\n"]]),
    stdin("Десятки", "Выведите цифру десятков неотрицательного числа.", "n = int(input())\nprint(n // 10 % 10)", [["247\n", "4\n"], ["8\n", "0\n"]]),
    stdin("Сумма цифр", "Дано трёхзначное неотрицательное число. Выведите сумму его цифр.", "n = int(input())\nprint(n // 100 + n // 10 % 10 + n % 10)", [["247\n", "13\n"], ["100\n", "1\n"]])
  ],
  branch: [
    stdin("Максимум двух", "Даны два целых числа. Выведите большее из них, используя if и else.", "a, b = map(int, input().split())\nif a > b:\n    print(a)\nelse:\n    print(b)", [["3 8\n", "8\n"], ["5 5\n", "5\n"], ["-2 -7\n", "-2\n"]]),
    stdin("Чётное или нечётное", "Выведите `even` для чётного числа и `odd` для нечётного.", "n = int(input())\nif n % 2 == 0:\n    print('even')\nelse:\n    print('odd')", [["8\n", "even\n"], ["-3\n", "odd\n"], ["0\n", "even\n"]]),
    stdin("Зачёт", "Дан балл. Выведите `PASS`, если он не меньше 60, иначе `FAIL`.", "score = int(input())\nif score >= 60:\n    print('PASS')\nelse:\n    print('FAIL')", [["60\n", "PASS\n"], ["59\n", "FAIL\n"], ["100\n", "PASS\n"]])
  ],
  conditions: [
    stdin("Знак числа", "Выведите `positive`, `negative` или `zero` в зависимости от числа.", "n = int(input())\nif n > 0:\n    print('positive')\nelif n < 0:\n    print('negative')\nelse:\n    print('zero')", [["8\n", "positive\n"], ["-2\n", "negative\n"], ["0\n", "zero\n"]]),
    stdin("В диапазоне", "Даны число, левая и правая границы. Выведите `YES`, если число лежит в диапазоне включительно, иначе `NO`.", "x, left, right = map(int, input().split())\nprint('YES' if left <= x <= right else 'NO')", [["5 1 10\n", "YES\n"], ["11 1 10\n", "NO\n"], ["1 1 10\n", "YES\n"]]),
    stdin("Делимость", "Выведите `YES`, если число положительное и делится на 3, иначе `NO`.", "n = int(input())\nprint('YES' if n > 0 and n % 3 == 0 else 'NO')", [["12\n", "YES\n"], ["-3\n", "NO\n"], ["10\n", "NO\n"]])
  ],
  loops: [
    stdin("Сумма от 1 до N", "Дано N ≥ 0. Выведите сумму целых чисел от 1 до N.", "n = int(input())\ntotal = 0\nfor value in range(1, n + 1):\n    total += value\nprint(total)", [["5\n", "15\n"], ["0\n", "0\n"]]),
    stdin("Количество кратных", "Даны N и K. Посчитайте числа от 1 до N, кратные K.", "n, k = map(int, input().split())\ncount = 0\nfor value in range(1, n + 1):\n    if value % k == 0:\n        count += 1\nprint(count)", [["10 3\n", "3\n"], ["4 9\n", "0\n"]]),
    stdin("Факториал", "Дано N ≥ 0. Выведите произведение чисел от 1 до N.", "n = int(input())\nproduct = 1\nfor value in range(2, n + 1):\n    product *= value\nprint(product)", [["5\n", "120\n"], ["0\n", "1\n"]])
  ],
  sequence: [
    stdin("Положительные элементы", "В первой строке N, во второй N целых чисел. Выведите количество положительных.", "n = int(input())\nvalues = list(map(int, input().split()))\nprint(sum(value > 0 for value in values[:n]))", [["5\n-1 2 0 3 4\n", "3\n"], ["0\n\n", "0\n"]]),
    stdin("Сумма чётных", "В первой строке N, во второй N чисел. Выведите сумму чётных элементов.", "n = int(input())\nvalues = list(map(int, input().split()))\nprint(sum(value for value in values[:n] if value % 2 == 0))", [["5\n1 2 3 4 5\n", "6\n"], ["3\n1 3 5\n", "0\n"]]),
    stdin("Максимум последовательности", "В первой строке N > 0, во второй N чисел. Найдите максимум.", "n = int(input())\nvalues = list(map(int, input().split()))\nmaximum = values[0]\nfor value in values[1:n]:\n    if value > maximum:\n        maximum = value\nprint(maximum)", [["5\n-3 8 2 8 1\n", "8\n"], ["1\n-7\n", "-7\n"]])
  ],
  string: [
    stdin("Количество букв a", "Прочитайте строку и выведите количество латинских букв `a`.", "text = input()\nprint(text.count('a'))", [["abracadabra\n", "5\n"], ["Python\n", "0\n"]]),
    stdin("Строка наоборот", "Выведите строку в обратном порядке.", "text = input()\nprint(text[::-1])", [["python\n", "nohtyp\n"], ["a\n", "a\n"]]),
    stdin("Палиндром", "Выведите `YES`, если строка читается одинаково в обе стороны, иначе `NO`.", "text = input()\nprint('YES' if text == text[::-1] else 'NO')", [["level\n", "YES\n"], ["python\n", "NO\n"], ["\n", "YES\n"]])
  ],
  runs: [
    func("Максимальная серия", "Реализуйте `max_run(text)`, возвращающую длину самой длинной серии одинаковых соседних символов.", "max_run", "def max_run(text):\n    best = current = 0\n    previous = None\n    for char in text:\n        if char == previous:\n            current += 1\n        else:\n            previous = char\n            current = 1\n        best = max(best, current)\n    return best", [[["aaabbc"], 3], [[""], 0], [["x"], 1]], "def max_run(text):\n    pass\n"),
    func("Число смен", "Реализуйте `changes(text)`: число позиций, где символ отличается от предыдущего.", "changes", "def changes(text):\n    return sum(text[i] != text[i - 1] for i in range(1, len(text)))", [[["aabcca"], 3], [[""], 0], [["xxx"], 0]]),
    func("Первая длинная серия", "Реализуйте `first_double(text)`: индекс первого символа первой пары одинаковых соседей или -1.", "first_double", "def first_double(text):\n    for i in range(len(text) - 1):\n        if text[i] == text[i + 1]:\n            return i\n    return -1", [[["abcc"], 2], [["abc"], -1], [["aa"], 0]])
  ],
  list: [
    func("Сумма положительных", "Верните сумму положительных элементов списка.", "positive_sum", "def positive_sum(values):\n    return sum(value for value in values if value > 0)", [[[[1, -2, 3]], 4], [[[-5, 0]], 0], [[[]], 0]]),
    func("Удвоение", "Верните новый список, в котором каждый элемент удвоен.", "doubled", "def doubled(values):\n    return [value * 2 for value in values]", [[[[1, -2, 0]], [2, -4, 0]], [[[]], []]]),
    func("Индексы чётных", "Верните индексы всех чётных элементов списка.", "even_indices", "def even_indices(values):\n    return [i for i, value in enumerate(values) if value % 2 == 0]", [[[[3, 4, 6]], [1, 2]], [[[1, 3]], []], [[[]], []]])
  ],
  search: [
    func("Первое вхождение", "Верните индекс первого вхождения target или -1.", "find_first", "def find_first(values, target):\n    for i, value in enumerate(values):\n        if value == target:\n            return i\n    return -1", [[[[4, 2, 4], 4], 0], [[[1, 2], 9], -1], [[[], 1], -1]]),
    func("Последнее вхождение", "Верните индекс последнего вхождения target или -1.", "find_last", "def find_last(values, target):\n    answer = -1\n    for i, value in enumerate(values):\n        if value == target:\n            answer = i\n    return answer", [[[[4, 2, 4], 4], 2], [[[1], 2], -1]]),
    func("Количество вхождений", "Верните количество элементов, равных target.", "count_target", "def count_target(values, target):\n    count = 0\n    for value in values:\n        if value == target:\n            count += 1\n    return count", [[[[1, 1, 2], 1], 2], [[[], 0], 0]])
  ],
  neighbours: [
    func("Рост относительно соседа", "Посчитайте элементы, которые больше предыдущего.", "greater_than_previous", "def greater_than_previous(values):\n    return sum(values[i] > values[i - 1] for i in range(1, len(values)))", [[[[1, 3, 2, 5]], 2], [[[1]], 0], [[[]], 0]]),
    func("Равные пары", "Посчитайте пары одинаковых соседних элементов.", "equal_pairs", "def equal_pairs(values):\n    return sum(values[i] == values[i - 1] for i in range(1, len(values)))", [[[[1, 1, 2, 2]], 2], [[[]], 0]]),
    func("Локальные максимумы", "Посчитайте элементы, которые больше обоих соседей.", "local_maxima", "def local_maxima(values):\n    return sum(values[i] > values[i - 1] and values[i] > values[i + 1] for i in range(1, len(values) - 1))", [[[[1, 4, 2, 5, 3]], 2], [[[1, 2]], 0]])
  ],
  matrix: [
    func("Суммы строк", "Верните список сумм строк матрицы.", "row_sums", "def row_sums(matrix):\n    return [sum(row) for row in matrix]", [[[[[1, 2], [3, 4]]], [3, 7]], [[[]], []]]),
    func("Главная диагональ", "Верните сумму главной диагонали квадратной матрицы.", "diagonal_sum", "def diagonal_sum(matrix):\n    return sum(matrix[i][i] for i in range(len(matrix)))", [[[[[1, 2], [3, 4]]], 5], [[[]], 0]]),
    func("Максимум матрицы", "Верните максимальный элемент матрицы или None для пустой матрицы.", "matrix_max", "def matrix_max(matrix):\n    return max((value for row in matrix for value in row), default=None)", [[[[[1, 7], [3]]], 7], [[[]], null]])
  ],
  set: [
    func("Число уникальных", "Верните количество различных элементов.", "unique_count", "def unique_count(values):\n    return len(set(values))", [[[[1, 2, 1]], 2], [[[]], 0]]),
    func("Общие значения", "Верните отсортированный список общих значений двух коллекций.", "common", "def common(left, right):\n    return sorted(set(left) & set(right))", [[[[3, 1, 2], [2, 3, 4]], [2, 3]], [[[], [1]], []]]),
    func("Только в одном", "Верните количество значений, встречающихся только в одной из двух коллекций.", "symmetric_count", "def symmetric_count(left, right):\n    return len(set(left) ^ set(right))", [[[[1, 2], [2, 3]], 2], [[[], []], 0]])
  ],
  dict: [
    func("Таблица частот", "Верните словарь частот элементов.", "frequencies", "def frequencies(values):\n    result = {}\n    for value in values:\n        result[value] = result.get(value, 0) + 1\n    return result", [[[["a", "b", "a"]], { a: 2, b: 1 }], [[[]], {}]]),
    func("Самый частый", "Верните самый частый элемент; при равенстве — лексикографически меньший. Для пустого списка верните None.", "most_frequent", "def most_frequent(values):\n    if not values:\n        return None\n    counts = {}\n    for value in values:\n        counts[value] = counts.get(value, 0) + 1\n    return min(counts, key=lambda value: (-counts[value], value))", [[[["b", "a", "b"]], "b"], [[[]], null]]),
    func("Инверсия словаря", "Поменяйте местами ключи и значения словаря с уникальными значениями.", "invert", "def invert(mapping):\n    return {value: key for key, value in mapping.items()}", [[[ { a: 1, b: 2 } ], { "1": "a", "2": "b" }]])
  ],
  function: [
    func("Чётность", "Реализуйте функцию `is_even(n)`, возвращающую логическое значение.", "is_even", "def is_even(n):\n    return n % 2 == 0", [[[4], true], [[-3], false], [[0], true]]),
    func("Максимум двух", "Реализуйте функцию `max_of_two(a, b)` без вызова max.", "max_of_two", "def max_of_two(a, b):\n    if a > b:\n        return a\n    return b", [[[2, 7], 7], [[5, 5], 5], [[-1, -3], -1]], undefined, { forbidCalls: ["max"] }),
    func("Сумма цифр", "Реализуйте функцию `sum_digits(n)` для неотрицательного целого числа.", "sum_digits", "def sum_digits(n):\n    total = 0\n    while n > 0:\n        total += n % 10\n        n //= 10\n    return total", [[[247], 13], [[0], 0], [[1000], 1]])
  ],
  recursion: [
    func("Рекурсивный факториал", "Реализуйте рекурсивную функцию `factorial(n)` для n ≥ 0.", "factorial", "def factorial(n):\n    if n <= 1:\n        return 1\n    return n * factorial(n - 1)", [[[5], 120], [[0], 1]], undefined, { requireRecursion: ["factorial"] }),
    func("Рекурсивная степень", "Реализуйте рекурсивную функцию `power(a, n)` для n ≥ 0.", "power", "def power(a, n):\n    if n == 0:\n        return 1\n    return a * power(a, n - 1)", [[[2, 5], 32], [[9, 0], 1]], undefined, { requireRecursion: ["power"] }),
    func("Рекурсивная сумма цифр", "Реализуйте рекурсивную функцию `digit_sum(n)` для n ≥ 0.", "digit_sum", "def digit_sum(n):\n    if n < 10:\n        return n\n    return n % 10 + digit_sum(n // 10)", [[[247], 13], [[0], 0]], undefined, { requireRecursion: ["digit_sum"] })
  ],
  files: [
    fileTask("Сумма чисел из файла", "В `input.txt` записаны целые числа через пробел. Выведите их сумму.", "with open('input.txt', encoding='utf-8') as source:\n    values = list(map(int, source.read().split()))\nprint(sum(values))", [{ path: "input.txt", content: "1 2 3 -1\n" }], "5\n"),
    fileTask("Удвоенные значения", "Прочитайте числа из `input.txt` и запишите их удвоенные значения в `output.txt` через пробел.", "with open('input.txt', encoding='utf-8') as source:\n    values = list(map(int, source.read().split()))\nwith open('output.txt', 'w', encoding='utf-8') as target:\n    target.write(' '.join(str(value * 2) for value in values))", [{ path: "input.txt", content: "2 -3 0\n" }], undefined, [{ path: "output.txt", content: "4 -6 0" }]),
    fileTask("Самая длинная строка", "В `lines.txt` записан текст. Запишите первую самую длинную строку без перевода строки в `answer.txt`.", "with open('lines.txt', encoding='utf-8') as source:\n    lines = [line.rstrip('\\n') for line in source]\nanswer = max(lines, key=len, default='')\nwith open('answer.txt', 'w', encoding='utf-8') as target:\n    target.write(answer)", [{ path: "lines.txt", content: "кот\nпрограммирование\nкод\n" }], undefined, [{ path: "answer.txt", content: "программирование" }])
  ],
  binary: [
    func("Двоичный поиск", "Верните индекс target в отсортированном списке или -1.", "binary_search", "def binary_search(values, target):\n    left, right = 0, len(values) - 1\n    while left <= right:\n        middle = (left + right) // 2\n        if values[middle] == target:\n            return middle\n        if values[middle] < target:\n            left = middle + 1\n        else:\n            right = middle - 1\n    return -1", [[[[1, 3, 5, 7], 5], 2], [[[1, 3], 2], -1], [[[], 1], -1]]),
    func("Левая граница", "Верните индекс первого элемента, не меньшего target.", "lower_bound", "def lower_bound(values, target):\n    left, right = 0, len(values)\n    while left < right:\n        middle = (left + right) // 2\n        if values[middle] < target:\n            left = middle + 1\n        else:\n            right = middle\n    return left", [[[[1, 3, 3, 7], 3], 1], [[[1, 2], 9], 2], [[[], 0], 0]]),
    func("Есть ли значение", "Верните True, если target есть в отсортированном списке.", "contains_sorted", "def contains_sorted(values, target):\n    left, right = 0, len(values)\n    while left < right:\n        middle = (left + right) // 2\n        if values[middle] < target:\n            left = middle + 1\n        else:\n            right = middle\n    return left < len(values) and values[left] == target", [[[[1, 4, 9], 4], true], [[[1, 4], 3], false]])
  ],
  sort: [
    func("Сортировка выбором", "Верните новый список, отсортированный выбором по возрастанию.", "selection_sort", "def selection_sort(values):\n    result = list(values)\n    for left in range(len(result)):\n        smallest = left\n        for i in range(left + 1, len(result)):\n            if result[i] < result[smallest]:\n                smallest = i\n        result[left], result[smallest] = result[smallest], result[left]\n    return result", [[[[3, 1, 2]], [1, 2, 3]], [[[]], []]]),
    func("По убыванию", "Верните новый список, отсортированный по убыванию.", "descending", "def descending(values):\n    return sorted(values, reverse=True)", [[[[3, 1, 2]], [3, 2, 1]], [[[]], []]]),
    func("По длине", "Верните строки, отсортированные сначала по длине, затем лексикографически.", "by_length", "def by_length(words):\n    return sorted(words, key=lambda word: (len(word), word))", [[[ ["bbb", "a", "cc", "bb"] ], ["a", "bb", "cc", "bbb"]], [[[]], []]])
  ],
  simple_sort: [
    func("Минимум в хвосте", "Верните индекс минимального элемента списка начиная с позиции start.", "minimum_index", "def minimum_index(values, start):\n    smallest = start\n    for i in range(start + 1, len(values)):\n        if values[i] < values[smallest]:\n            smallest = i\n    return smallest", [[[[5, 2, 7, 1], 1], 3], [[[3], 0], 0]], undefined, { forbidCalls: ["sorted"], forbidMethods: ["sort"] }),
    func("Один шаг выбора", "Верните копию списка после обмена первого элемента с минимальным.", "selection_step", "def selection_step(values):\n    result = list(values)\n    if not result:\n        return result\n    smallest = 0\n    for i in range(1, len(result)):\n        if result[i] < result[smallest]:\n            smallest = i\n    result[0], result[smallest] = result[smallest], result[0]\n    return result", [[[[4, 2, 3, 1]], [1, 2, 3, 4]], [[[]], []]], undefined, { forbidCalls: ["sorted"], forbidMethods: ["sort"] }),
    func("Полная сортировка выбором", "Верните новый список, отсортированный выбором. `sorted()` и `.sort()` запрещены.", "selection_sort", "def selection_sort(values):\n    result = list(values)\n    for left in range(len(result)):\n        smallest = left\n        for i in range(left + 1, len(result)):\n            if result[i] < result[smallest]:\n                smallest = i\n        result[left], result[smallest] = result[smallest], result[left]\n    return result", [[[[3, 1, 2]], [1, 2, 3]], [[[2, 2, -1]], [-1, 2, 2]], [[[]], []]], undefined, { forbidCalls: ["sorted"], forbidMethods: ["sort"] })
  ],
  number: [
    func("Делители", "Верните делители положительного n по возрастанию.", "divisors", "def divisors(n):\n    return [value for value in range(1, n + 1) if n % value == 0]", [[[6], [1, 2, 3, 6]], [[1], [1]]]),
    func("Простое число", "Верните True, если n — простое число.", "is_prime", "def is_prime(n):\n    if n < 2:\n        return False\n    divisor = 2\n    while divisor * divisor <= n:\n        if n % divisor == 0:\n            return False\n        divisor += 1\n    return True", [[[2], true], [[17], true], [[21], false], [[1], false]]),
    func("НОД", "Верните наибольший общий делитель двух неотрицательных чисел.", "gcd", "def gcd(a, b):\n    while b:\n        a, b = b, a % b\n    return a", [[[18, 24], 6], [[7, 0], 7]])
  ],
  bases: [
    func("В двоичную", "Верните двоичную запись неотрицательного n без префикса.", "to_binary", "def to_binary(n):\n    if n == 0:\n        return '0'\n    digits = ''\n    while n:\n        digits = str(n % 2) + digits\n        n //= 2\n    return digits", [[[10], "1010"], [[0], "0"]]),
    func("Из двоичной", "Верните значение корректной двоичной строки.", "from_binary", "def from_binary(text):\n    value = 0\n    for digit in text:\n        value = value * 2 + int(digit)\n    return value", [[["1010"], 10], [["0"], 0]]),
    func("Сумма цифр в основании", "Верните сумму цифр n в системе с основанием base от 2 до 10.", "base_digit_sum", "def base_digit_sum(n, base):\n    total = 0\n    while n:\n        total += n % base\n        n //= base\n    return total", [[[10, 2], 2], [[25, 10], 7], [[0, 3], 0]])
  ],
  brute: [
    func("Пары с заданной суммой", "Посчитайте пары индексов i < j, сумма элементов которых равна target.", "pair_count", "def pair_count(values, target):\n    count = 0\n    for i in range(len(values)):\n        for j in range(i + 1, len(values)):\n            if values[i] + values[j] == target:\n                count += 1\n    return count", [[[[1, 2, 3, 4], 5], 2], [[[], 0], 0]]),
    func("Тройки с заданной суммой", "Посчитайте тройки индексов i < j < k с суммой target.", "triple_count", "def triple_count(values, target):\n    count = 0\n    for i in range(len(values)):\n        for j in range(i + 1, len(values)):\n            for k in range(j + 1, len(values)):\n                if values[i] + values[j] + values[k] == target:\n                    count += 1\n    return count", [[[[1, 2, 3, 4], 6], 1], [[[], 0], 0]]),
    func("Лучший допустимый", "Верните наибольшее число из values, не превосходящее limit, или None.", "best_allowed", "def best_allowed(values, limit):\n    candidates = [value for value in values if value <= limit]\n    return max(candidates, default=None)", [[[[2, 9, 5], 6], 5], [[[8], 3], null]])
  ],
  dp: [
    func("Число способов", "Лягушка прыгает на 1 или 2 ступени. Верните число способов добраться до n.", "stairs", "def stairs(n):\n    ways = [0] * (n + 2)\n    ways[0] = 1\n    for i in range(n):\n        ways[i + 1] += ways[i]\n        ways[i + 2] += ways[i]\n    return ways[n]", [[[0], 1], [[4], 5], [[6], 13]]),
    func("Максимальная сумма без соседей", "Верните максимальную сумму несоседних неотрицательных элементов.", "max_non_adjacent", "def max_non_adjacent(values):\n    previous, current = 0, 0\n    for value in values:\n        previous, current = current, max(current, previous + value)\n    return current", [[[[2, 7, 9, 3, 1]], 12], [[[]], 0]]),
    func("Минимум монет", "Верните минимальное число монет из denominations для суммы amount или -1.", "min_coins", "def min_coins(amount, denominations):\n    dp = [amount + 1] * (amount + 1)\n    dp[0] = 0\n    for value in range(1, amount + 1):\n        for coin in denominations:\n            if coin <= value:\n                dp[value] = min(dp[value], dp[value - coin] + 1)\n    return -1 if dp[amount] > amount else dp[amount]", [[[6, [1, 3, 4]], 2], [[2, [3]], -1], [[0, [2]], 0]])
  ],
  graph: [
    func("Степени вершин", "По числу вершин и списку неориентированных рёбер верните степени вершин.", "degrees", "def degrees(n, edges):\n    result = [0] * n\n    for left, right in edges:\n        result[left] += 1\n        result[right] += 1\n    return result", [[[4, [[0, 1], [1, 2]]], [1, 2, 1, 0]], [[0, []], []]]),
    func("Достижимые вершины", "Верните отсортированные вершины, достижимые из start в неориентированном графе.", "reachable", "def reachable(n, edges, start):\n    graph = [[] for _ in range(n)]\n    for left, right in edges:\n        graph[left].append(right)\n        graph[right].append(left)\n    seen = {start}\n    stack = [start]\n    while stack:\n        vertex = stack.pop()\n        for neighbour in graph[vertex]:\n            if neighbour not in seen:\n                seen.add(neighbour)\n                stack.append(neighbour)\n    return sorted(seen)", [[[5, [[0, 1], [1, 2], [3, 4]], 0], [0, 1, 2]], [[1, [], 0], [0]]]),
    func("Кратчайшее расстояние", "Верните число рёбер кратчайшего пути между start и finish или -1.", "shortest_distance", "def shortest_distance(n, edges, start, finish):\n    graph = [[] for _ in range(n)]\n    for left, right in edges:\n        graph[left].append(right)\n        graph[right].append(left)\n    distance = [-1] * n\n    distance[start] = 0\n    queue = [start]\n    for vertex in queue:\n        for neighbour in graph[vertex]:\n            if distance[neighbour] == -1:\n                distance[neighbour] = distance[vertex] + 1\n                queue.append(neighbour)\n    return distance[finish]", [[[5, [[0, 1], [1, 2], [0, 3], [3, 2]], 0, 2], 2], [[3, [[0, 1]], 0, 2], -1]])
  ],
  graph_paths: [
    func("Число путей в DAG", "Для ориентированного ациклического графа верните число путей из start в finish.", "count_paths", "def count_paths(n, edges, start, finish):\n    graph = [[] for _ in range(n)]\n    for left, right in edges:\n        graph[left].append(right)\n    memo = {}\n    def visit(vertex):\n        if vertex == finish:\n            return 1\n        if vertex not in memo:\n            memo[vertex] = sum(visit(neighbour) for neighbour in graph[vertex])\n        return memo[vertex]\n    return visit(start)", [[[4, [[0, 1], [0, 2], [1, 3], [2, 3]], 0, 3], 2], [[3, [[0, 1]], 0, 2], 0]]),
    func("Взвешенное расстояние", "Верните длину кратчайшего пути в неориентированном графе с неотрицательными весами или -1.", "weighted_distance", "def weighted_distance(n, edges, start, finish):\n    import heapq\n    graph = [[] for _ in range(n)]\n    for left, right, weight in edges:\n        graph[left].append((right, weight))\n        graph[right].append((left, weight))\n    distance = [float('inf')] * n\n    distance[start] = 0\n    queue = [(0, start)]\n    while queue:\n        current, vertex = heapq.heappop(queue)\n        if current != distance[vertex]:\n            continue\n        for neighbour, weight in graph[vertex]:\n            candidate = current + weight\n            if candidate < distance[neighbour]:\n                distance[neighbour] = candidate\n                heapq.heappush(queue, (candidate, neighbour))\n    return -1 if distance[finish] == float('inf') else distance[finish]", [[[4, [[0, 1, 5], [0, 2, 1], [2, 1, 1], [1, 3, 2]], 0, 3], 4], [[2, [], 0, 1], -1]]),
    func("Восстановление пути", "Верните один кратчайший по числу рёбер путь от start к finish или пустой список.", "shortest_path", "def shortest_path(n, edges, start, finish):\n    graph = [[] for _ in range(n)]\n    for left, right in edges:\n        graph[left].append(right)\n        graph[right].append(left)\n    parent = {start: None}\n    queue = [start]\n    for vertex in queue:\n        for neighbour in graph[vertex]:\n            if neighbour not in parent:\n                parent[neighbour] = vertex\n                queue.append(neighbour)\n    if finish not in parent:\n        return []\n    path = []\n    vertex = finish\n    while vertex is not None:\n        path.append(vertex)\n        vertex = parent[vertex]\n    return path[::-1]", [[[4, [[0, 1], [1, 3], [0, 2], [2, 3]], 0, 3], [0, 1, 3]], [[3, [[0, 1]], 0, 2], []]])
  ]
};

function withThreeTests(base) {
  const task = clone(base);
  const tests = task.judge.tests;
  // A third execution covers a separate transport form where older source tasks
  // had only two examples. The reference solution is still executed for each.
  while (tests.length < 3) {
    const sample = clone(tests[tests.length % Math.max(1, tests.length)]);
    if (task.judge.type === "stdin_stdout") sample.input = `${sample.input}\n`;
    tests.push(sample);
  }
  return task;
}

function shaped(base, title, skill, details) {
  const task = withThreeTests(base);
  task.title = title;
  task.statement = `${details}\n\nТренируемый приём: ${skill}.`;
  task.hints = [
    `Определите, какие данные нужны для шага «${skill}».`,
    "Проследите решение на одном небольшом примере вручную.",
    "Проверьте крайний случай из тестов до отправки."
  ];
  return task;
}

const profile = (skill, tasks) => tasks.map(([base, title, statement]) => shaped(base, title, skill, statement));

// This is the authoring source of truth. Every lesson has three deliberately
// chosen tasks: two guided steps and a checkpoint. It does not fall back to a
// broad family alias, which used to make unrelated lessons look alike.
export const lessonProfiles = {
  "python-basics-input-output": profile("ввод одной и нескольких строк", [
    [profiles.io[0], "Сообщение без изменений", "Прочитайте сообщение пользователя и передайте его на экран без преобразований."],
    [profiles.io[1], "Приветствие по имени", "Соберите строку приветствия из введённого имени."],
    [profiles.io[2], "Итог двух показаний", "Прочитайте два целых показания и выведите их суммарное значение."]
  ]),
  "python-basics-types-arithmetic": profile("целые, вещественные числа и арифметические операции", [
    [profiles.arithmetic[2], "Стоимость набора", "По цене и количеству вычислите стоимость набора."],
    [profiles.arithmetic[0], "Рамка участка", "По двум сторонам прямоугольника найдите длину его рамки."],
    [profiles.arithmetic[1], "Средняя оценка", "По трём вещественным оценкам найдите среднее значение."]
  ]),
  "python-basics-div-mod-digits": profile("целочисленное деление и остаток", [
    [profiles.digits[0], "Последняя цифра кода", "Из неотрицательного целого кода выведите последнюю цифру."],
    [profiles.digits[1], "Цифра десятков", "Из неотрицательного числа выделите цифру разряда десятков."],
    [profiles.digits[2], "Контрольная сумма номера", "Для трёхзначного номера вычислите сумму его цифр без преобразования в строку."]
  ]),
  "python-basics-logic": profile("сравнения, and и or", [
    [profiles.conditions[2], "Подходит ли число", "Проверьте одновременно положительность числа и делимость на 3."],
    [profiles.conditions[1], "Проверка границ", "Определите, принадлежит ли число закрытому числовому промежутку."],
    [profiles.branch[1], "Чётный пропуск", "Выведите метку в зависимости от результата проверки остатка при делении на 2."]
  ]),
  "python-branches-if-else": profile("две взаимоисключающие ветви", [
    [profiles.branch[1], "Чётность через if", "Выберите одну из двух меток по чётности введённого числа."],
    [profiles.branch[2], "Порог зачёта", "Сравните балл с проходным значением и выведите результат."],
    [profiles.branch[0], "Большее показание", "Выведите большее из двух показаний через полную конструкцию if/else."]
  ]),
  "python-branches-elif-ranges": profile("цепочка elif и интервалы", [
    [profiles.conditions[0], "Класс знака", "Разделите число на три случая: положительное, отрицательное и ноль."],
    [profiles.conditions[1], "Температурный коридор", "Проверьте попадание значения в заданный включительный диапазон."],
    [profiles.branch[2], "Категория результата", "Сначала отделите проходной балл, затем выведите одну подходящую категорию."]
  ]),
  "python-branches-compound": profile("составные условия", [
    [profiles.conditions[2], "Допуск по двум условиям", "Выведите YES, только если число одновременно положительно и кратно трём."],
    [profiles.conditions[1], "Внутри отрезка", "Используйте два сравнения, чтобы проверить обе границы отрезка."],
    [profiles.conditions[0], "Сигнал состояния", "С помощью if/elif/else напечатайте состояние датчика по знаку значения."]
  ]),
  "python-debugging-basics": profile("чтение трассировки и проверка ветвей", [
    [profiles.branch[1], "Исправьте метку чётности", "Напишите короткую программу без перепутанной ветви для чётного и нечётного числа."],
    [profiles.conditions[0], "Три исхода без пропуска", "Проверьте, что ноль не попадает ни в положительный, ни в отрицательный случай."],
    [profiles.branch[0], "Равные числа", "Исправьте сравнение так, чтобы равные два числа тоже давали корректный ответ."]
  ]),
  "python-loops-while": profile("цикл while и изменяемое состояние", [
    [profiles.loops[0], "Сумма до N", "Накапливайте сумму чисел от 1 до N, двигая счётчик."],
    [profiles.loops[2], "Произведение шагов", "Через повторение умножьте числа от 1 до N; для нуля оставьте единицу."],
    [profiles.digits[2], "Сумма цифр по шагам", "Разберите трёхзначное число на цифры и проверьте вычисление на нуле."]
  ]),
  "python-loops-for-range": profile("for и range", [
    [profiles.loops[0], "Лестница чисел", "Пройдите все числа от 1 до N с помощью range и найдите их сумму."],
    [profiles.loops[1], "Кратные на отрезке", "Переберите числа от 1 до N и посчитайте подходящие по остатку."],
    [profiles.loops[2], "Факториал диапазона", "Постройте произведение последовательности от 1 до N циклом for."]
  ]),
  "python-loops-nested": profile("вложенные циклы", [
    [profiles.brute[0], "Пары с суммой", "Переберите все пары индексов с i меньше j и посчитайте нужные пары."],
    [profiles.simple_sort[0], "Минимум в хвосте", "Для заданной позиции пройдите оставшуюся часть списка и найдите индекс минимума."],
    [profiles.brute[1], "Тройки с суммой", "Переберите упорядоченные тройки индексов без повторного подсчёта."]
  ]),
  "python-loops-accumulators": profile("накопитель суммы и счётчика", [
    [profiles.sequence[0], "Счётчик положительных", "Пройдите последовательность и увеличивайте счётчик только для положительных элементов."],
    [profiles.sequence[1], "Накопитель чётных", "Сложите только чётные элементы, не используя готовую агрегацию."],
    [profiles.loops[0], "Сумма последовательности", "Организуйте отдельную переменную-накопитель для суммы от 1 до N."]
  ]),
  "python-loops-min-max-average": profile("ручное обновление экстремума и суммы", [
    [profiles.sequence[2], "Максимум потока", "Инициализируйте максимум первым элементом и обновляйте его при проходе."],
    [profiles.sequence[0], "Сколько выше нуля", "Сначала посчитайте нужные элементы, затем выведите накопленный счётчик."],
    [profiles.sequence[1], "Сумма для среднего", "Накопите сумму подходящих значений как подготовку к вычислению среднего."]
  ]),
  "python-loops-sequences": profile("обработка последовательности из N чисел", [
    [profiles.sequence[0], "Положительные в последовательности", "По N и последовательности выведите число положительных членов."],
    [profiles.sequence[1], "Чётная сумма последовательности", "Обработайте ровно N чисел и сложите те из них, которые делятся на 2."],
    [profiles.sequence[2], "Наибольший член", "Найдите максимальный элемент последовательности без max()."]
  ]),
  "python-loops-tracing": profile("трассировка цикла", [
    [profiles.loops[1], "След счётчика кратных", "Проследите, на каких шагах счётчик кратных увеличивается."],
    [profiles.loops[0], "След накопителя", "Проверьте значения накопителя суммы после каждого прохода range."],
    [profiles.sequence[2], "След максимума", "Проследите замену текущего максимума на последовательности со повторяющимся лидером."]
  ]),
  "python-strings-basics": profile("строки, индексы и длину", [
    [profiles.string[0], "Буква в сообщении", "Посчитайте количество букв a в одной введённой строке."],
    [profiles.string[1], "Обратная подпись", "Выведите символы строки в обратном порядке."],
    [profiles.string[2], "Зеркальное слово", "Сравните строку с её обратной записью и определите палиндром."]
  ]),
  "python-strings-methods-slices": profile("методы строк и срезы", [
    [profiles.string[0], "Подсчёт символа методом", "Используйте строковый метод, чтобы узнать число букв a."],
    [profiles.string[1], "Разворот срезом", "Получите обратную строку срезом, а не ручной перестановкой."],
    [profiles.string[2], "Палиндром срезом", "Проверьте равенство исходной строки и строки, полученной обратным срезом."]
  ]),
  "python-strings-algorithms": profile("проход по символам и состояние", [
    [profiles.runs[2], "Первая соседняя пара", "Во время прохода найдите индекс первого одинакового соседства."],
    [profiles.runs[1], "Количество смен", "Посчитайте позиции, где очередной символ отличается от предыдущего."],
    [profiles.runs[0], "Самая длинная серия", "Храните длину текущей серии и лучший результат при одном проходе."]
  ]),
  "python-strings-runs": profile("серии одинаковых символов", [
    [profiles.runs[2], "Старт первой серии", "Найдите начало первой серии длиной не меньше двух."],
    [profiles.runs[1], "Границы серий", "Количество смен символа равно количеству границ между сериями."],
    [profiles.runs[0], "Длина лучшей серии", "Реализуйте функцию с текущей и максимальной длиной серии."]
  ]),
  "python-lists-basics": profile("создание списка, индексы и проход", [
    [profiles.list[1], "Удвоенный список", "Верните новый список с удвоенными значениями исходного списка."],
    [profiles.list[2], "Позиции чётных", "Соберите индексы элементов, для которых остаток от деления на 2 равен нулю."],
    [profiles.list[0], "Положительная сумма", "Пройдите список и сложите только положительные значения."]
  ]),
  "python-lists-mutation": profile("изменение списка по индексу", [
    [profiles.list[1], "Новая копия с изменениями", "Верните список после преобразования каждого элемента, не меняя входной объект."],
    [profiles.simple_sort[1], "Обмен с минимумом", "Скопируйте список и выполните один обмен по найденному индексу."],
    [profiles.search[2], "Подсчёт до изменения", "Перед заменой элементов проверьте, сколько раз встречается целевое значение."]
  ]),
  "python-lists-processing": profile("фильтрация и преобразование списка", [
    [profiles.list[0], "Сумма полезных значений", "Отберите положительные элементы и получите их суммарный вклад."],
    [profiles.list[1], "Преобразованный маршрут", "Постройте отдельный список, умножая каждый входной элемент на два."],
    [profiles.list[2], "Индексы фильтра", "Сохраните номера элементов, которые проходят проверку чётности."]
  ]),
  "python-lists-linear-search": profile("линейный поиск", [
    [profiles.search[0], "Первый нужный индекс", "Остановите поиск на первом вхождении цели или верните -1."],
    [profiles.search[1], "Последний нужный индекс", "При проходе обновляйте ответ на каждом совпадении."],
    [profiles.search[2], "Частота цели", "Подсчитайте совпадения с целевым значением за один проход."]
  ]),
  "python-lists-neighbours": profile("соседние элементы", [
    [profiles.neighbours[0], "Рост после соседа", "Сравните каждый элемент, кроме первого, с предыдущим."],
    [profiles.neighbours[1], "Равные соседние пары", "Посчитайте границы, на которых два соседних элемента равны."],
    [profiles.neighbours[2], "Локальные вершины", "Проверьте внутренние элементы по двум соседям."]
  ]),
  "python-lists-2d": profile("двумерные списки", [
    [profiles.matrix[0], "Сумма каждой строки", "Для каждой строки матрицы вычислите отдельную сумму."],
    [profiles.matrix[2], "Наибольшее в таблице", "Пройдите все строки и элементы, чтобы найти общий максимум."],
    [profiles.matrix[1], "Диагональ таблицы", "Используйте одинаковые индексы строки и столбца для главной диагонали."]
  ]),
  "python-lists-matrices": profile("матрицы и координаты", [
    [profiles.matrix[0], "Итоги строк матрицы", "Верните список результатов, по одному для каждой строки."],
    [profiles.matrix[1], "Сумма главной диагонали", "Обработайте только клетки, у которых номера строки и столбца совпадают."],
    [profiles.matrix[2], "Максимальный элемент матрицы", "Найдите максимум прямоугольной таблицы и предусмотрите пустую матрицу."]
  ]),
  "python-collections-sets": profile("множества и уникальные значения", [
    [profiles.set[0], "Сколько разных кодов", "Преобразуйте последовательность в множество и определите количество уникальных значений."],
    [profiles.set[1], "Общие участники", "Найдите пересечение двух наборов и верните его в отсортированном виде."],
    [profiles.set[2], "Только один список", "Определите количество значений из симметрической разности двух наборов."]
  ]),
  "python-collections-dicts-frequency": profile("словари и таблицы частот", [
    [profiles.dict[0], "Частоты букв", "Постройте словарь: каждому элементу поставьте в соответствие число встреч."],
    [profiles.dict[2], "Обратное соответствие", "Для уникальных значений поменяйте местами ключ и значение словаря."],
    [profiles.dict[1], "Частый победитель", "Выберите наиболее частый элемент, предусмотрев пустой вход и ничью."]
  ]),
  "python-functions-basics": profile("параметры и return", [
    [profiles.function[0], "Функция чётности", "Напишите функцию, которая получает число и возвращает булево значение."],
    [profiles.function[1], "Функция большего", "Верните большее из двух чисел с помощью if, не вызывая max."],
    [profiles.function[2], "Функция суммы цифр", "Верните сумму цифр неотрицательного числа через return."]
  ]),
  "python-functions-scope-decomposition": profile("локальные переменные и декомпозиция", [
    [profiles.function[0], "Изолированная проверка", "Оставьте вычисления внутри функции и верните результат вызывающему коду."],
    [profiles.function[1], "Помощник сравнения", "Выделите сравнение двух параметров в отдельную функцию без глобальных переменных."],
    [profiles.function[2], "Помощник обработки цифр", "Разместите накопитель внутри функции и верните только итоговое значение."]
  ]),
  "python-recursion-basics": profile("базовый случай и рекурсивный вызов", [
    [profiles.recursion[0], "Факториал с базой", "Задайте базовый случай n меньше или равно 1 и рекурсивный шаг."],
    [profiles.recursion[1], "Степень рекурсией", "Сведите степень с показателем n к степени с показателем n - 1."],
    [profiles.recursion[2], "Сумма цифр рекурсией", "Для одного разряда верните его, иначе отделите последнюю цифру и вызовите функцию снова."]
  ]),
  "python-recursion-calculations": profile("трассировка рекурсивных вычислений", [
    [profiles.recursion[1], "Цепочка степеней", "Проследите уменьшение показателя до нуля и возврат произведений."],
    [profiles.recursion[2], "Цепочка цифр", "Проследите отделение последней цифры и достижение одноразрядного числа."],
    [profiles.recursion[0], "Возврат факториала", "Проверьте базу и порядок умножений при возврате из рекурсивных вызовов."]
  ]),
  "python-files-basics": profile("чтение и запись файлов", [
    [profiles.files[0], "Сумма из input.txt", "Откройте входной файл, прочитайте числа и выведите итог в стандартный вывод."],
    [profiles.files[1], "Запись удвоенных чисел", "Прочитайте input.txt и сохраните преобразованные числа в output.txt."],
    [profiles.files[2], "Длинная строка в файл", "Прочитайте lines.txt и запишите первую самую длинную строку в answer.txt."]
  ]),
  "python-files-numbers": profile("числовые данные в файлах", [
    [profiles.files[0], "Числовой итог файла", "Разберите числа из input.txt и вычислите их сумму."],
    [profiles.files[1], "Преобразование файла чисел", "Запишите в output.txt числа из входного файла после удвоения."],
    [profiles.sequence[1], "Поток чётных чисел", "Проверьте логику накопителя чётных значений, применимую к числам из файла."]
  ]),
  "python-files-text": profile("текстовые файлы и строки", [
    [profiles.files[2], "Самая длинная строка файла", "Обработайте построчный текст и запишите ответ без завершающего перевода строки."],
    [profiles.string[0], "Символ в строке файла", "Подсчитайте целевой символ в прочитанной строке текста."],
    [profiles.dict[0], "Частоты слов файла", "Соберите частоты элементов после чтения текстовых данных."]
  ]),
  "python-algorithms-binary-search": profile("границы двоичного поиска", [
    [profiles.binary[2], "Есть ли ключ", "Проверьте присутствие ключа в отсортированном списке сужением диапазона."],
    [profiles.binary[1], "Левая граница ключа", "Найдите первую позицию, на которой значение не меньше цели."],
    [profiles.binary[0], "Индекс бинарным поиском", "Верните индекс цели в отсортированном списке или -1."]
  ]),
  "python-algorithms-selection-sort": profile("сортировка выбором", [
    [profiles.simple_sort[0], "Минимум неотсортированного хвоста", "Найдите индекс наименьшего элемента в части списка после start."],
    [profiles.simple_sort[1], "Первый шаг выбора", "Поменяйте первый элемент с минимумом, не используя готовую сортировку."],
    [profiles.simple_sort[2], "Полный проход выбором", "Соберите отсортированную копию последовательными поисками минимума."]
  ]),
  "python-algorithms-python-sort": profile("sorted, sort и ключ сортировки", [
    [profiles.sort[1], "Порядок по убыванию", "Используйте встроенную сортировку для создания нового списка по убыванию."],
    [profiles.sort[2], "Слова по длине", "Задайте ключ: сначала длина слова, затем лексикографический порядок."],
    [profiles.sort[0], "Сравнение подходов", "Верните упорядоченный список и объясните выбор встроенного алгоритма для этой задачи."]
  ]),
  "python-numbers-divisibility-divisors": profile("делимость и делители", [
    [profiles.conditions[2], "Проверка кратности", "По остатку при делении определите, соответствует ли число условию кратности."],
    [profiles.number[0], "Все делители", "Переберите возможные делители положительного числа и соберите подходящие."],
    [profiles.number[1], "Проверка простоты", "Используйте проверку делителей до квадратного корня как контрольный алгоритм."]
  ]),
  "python-numbers-primes-gcd": profile("простые числа и алгоритм Евклида", [
    [profiles.number[1], "Признак простого", "Отделите числа меньше двух и ищите делитель до квадратного корня."],
    [profiles.number[2], "НОД по остаткам", "Повторяйте замену пары чисел, пока второй остаток не станет равен нулю."],
    [profiles.number[0], "Делители для проверки", "Верните все делители как способ проверить рассуждение о простоте числа."]
  ]),
  "python-numbers-bases": profile("позиционные системы счисления", [
    [profiles.bases[0], "Запись в двоичной системе", "Последовательно выделяйте остатки деления на 2 и соберите запись числа."],
    [profiles.bases[1], "Чтение двоичной записи", "Наращивайте значение слева направо, умножая предыдущий результат на 2."],
    [profiles.bases[2], "Сумма цифр в основании", "Разбирайте число остатками при делении на заданное основание."]
  ]),
  "python-brute-force-basics": profile("полный перебор", [
    [profiles.brute[0], "Подходящие пары", "Переберите все пары разных индексов и проверьте сумму."],
    [profiles.brute[1], "Подходящие тройки", "Добавьте третий вложенный цикл, соблюдая порядок индексов."],
    [profiles.brute[2], "Лучший допустимый вариант", "Переберите кандидатов и оставьте лучший, не превышающий ограничение."]
  ]),
  "python-complexity-basics": profile("оценку числа операций", [
    [profiles.search[0], "Один проход поиска", "Решите задачу за линейный проход и отметьте, что число проверок растёт как N."],
    [profiles.brute[0], "Два вложенных прохода", "Посчитайте пары и сравните число шагов с квадратичной оценкой."],
    [profiles.brute[1], "Три вложенных прохода", "Постройте перебор троек и соотнесите его с кубической сложностью."]
  ]),
  "python-dp-basics": profile("состояние, базу и переход динамического программирования", [
    [profiles.dp[0], "Пути по ступеням", "Определите число способов попасть на ступень через ответы для предыдущих ступеней."],
    [profiles.dp[1], "Несоседний выбор", "Поддерживайте лучший ответ с учётом последнего выбранного или пропущенного элемента."],
    [profiles.dp[2], "Минимум монет", "Заполните таблицу минимальных количеств монет от нуля до нужной суммы."]
  ]),
  "python-graphs-basics": profile("список смежности", [
    [profiles.graph[0], "Степени вершин", "По рёбрам неориентированного графа постройте список степеней вершин."],
    [profiles.graph[1], "Компонента старта", "Соберите список смежности и определите достижимые от start вершины."],
    [profiles.graph[2], "Расстояние по рёбрам", "На графе со списком смежности найдите длину кратчайшего пути в рёбрах."]
  ]),
  "python-graphs-traversal": profile("обходы DFS и BFS", [
    [profiles.graph[1], "Достижимые DFS", "Используйте стек или очередь, чтобы отметить все достижимые вершины."],
    [profiles.graph[2], "Расстояния BFS", "Обходите граф слоями и запишите первое расстояние до каждой вершины."],
    [profiles.graph_paths[2], "Восстановление BFS-пути", "Сохраните родителя при первом посещении вершины и восстановите путь."]
  ]),
  "python-graphs-paths": profile("пути и расстояния в графах", [
    [profiles.graph_paths[0], "Число путей DAG", "Посчитайте пути по ориентированному ациклическому графу с мемоизацией."],
    [profiles.graph_paths[1], "Взвешенное расстояние", "Поддерживайте лучшую известную дистанцию и выбирайте следующую вершину по весу."],
    [profiles.graph_paths[2], "Один кратчайший путь", "После BFS восстановите последовательность вершин от финиша к старту."]
  ])
};

function materialize(base, owner, id, kind, difficulty) {
  return {
    schemaVersion: 1,
    id,
    owner,
    kind,
    title: base.title,
    statement: base.statement,
    difficulty,
    starterCode: base.starterCode,
    hints: base.hints,
    solution: base.solution,
    examples: base.examples,
    ...(base.fileExamples ? { fileExamples: base.fileExamples } : {}),
    judge: base.judge
  };
}

export function lessonExercises(lesson) {
  const tasks = lessonProfiles[lesson.id];
  if (!tasks || tasks.length !== 3) throw new Error(`${lesson.id}: lesson profile must contain exactly three exercises`);
  const ids = [`${lesson.id}-guided-1`, `${lesson.id}-guided-2`, `${lesson.id}-checkpoint`];
  return tasks.map((task, index) => materialize(
    task,
    { type: "lesson", id: lesson.id },
    ids[index],
    index === 2 ? "checkpoint" : "guided",
    index === 0 ? "intro" : index === 1 ? "standard" : "challenge"
  ));
}

const curate = (lessonId, taskIndex, difficulty, idea, skills) => ({ lessonId, taskIndex, difficulty, idea, skills });

export const practicumProfiles = {
  "python-practicum-first-programs": [
    curate("python-basics-input-output", 0, "intro", "передача сообщения", ["SK01"]), curate("python-basics-input-output", 1, "intro", "сборка приветствия", ["SK01"]),
    curate("python-basics-types-arithmetic", 2, "intro", "стоимость покупки", ["SK02"]), curate("python-basics-types-arithmetic", 0, "intro", "периметр", ["SK02"]),
    curate("python-basics-div-mod-digits", 0, "intro", "последняя цифра", ["SK03"]), curate("python-basics-div-mod-digits", 2, "standard", "контрольная сумма", ["SK03"]),
    curate("python-basics-logic", 0, "standard", "условие допуска", ["SK04"]), curate("python-branches-if-else", 1, "standard", "пороговый выбор", ["SK05"]),
    curate("python-branches-elif-ranges", 0, "standard", "три состояния", ["SK06"]), curate("python-branches-compound", 0, "standard", "два критерия", ["SK07"]),
    curate("python-basics-logic", 1, "challenge", "проверка интервала", ["SK04"]), curate("python-branches-if-else", 2, "challenge", "выбор большего", ["SK05"])
  ],
  "python-practicum-loops": [
    curate("python-loops-while", 0, "intro", "накопление суммы", ["SK09"]), curate("python-loops-for-range", 1, "intro", "кратные в диапазоне", ["SK10"]),
    curate("python-loops-for-range", 2, "intro", "произведение диапазона", ["SK10"]), curate("python-loops-accumulators", 0, "intro", "счётчик положительных", ["SK12"]),
    curate("python-loops-accumulators", 1, "standard", "сумма чётных", ["SK12"]), curate("python-loops-min-max-average", 0, "standard", "поиск максимума", ["SK13"]),
    curate("python-loops-sequences", 0, "standard", "обработка N чисел", ["SK14"]), curate("python-loops-sequences", 2, "standard", "максимум последовательности", ["SK14"]),
    curate("python-loops-tracing", 0, "standard", "трассировка счётчика", ["SK15"]), curate("python-loops-nested", 0, "standard", "перебор пар", ["SK11"]),
    curate("python-loops-nested", 1, "challenge", "минимум в хвосте", ["SK11"]), curate("python-loops-nested", 2, "challenge", "перебор троек", ["SK11"]),
    curate("python-loops-while", 1, "challenge", "факториал while", ["SK09"]), curate("python-loops-min-max-average", 1, "challenge", "счётчик значений", ["SK13"]),
    curate("python-loops-tracing", 2, "challenge", "трассировка максимума", ["SK15"])
  ],
  "python-practicum-data": [
    curate("python-strings-basics", 0, "intro", "частота буквы", ["SK16"]), curate("python-strings-methods-slices", 1, "intro", "разворот строки", ["SK17"]),
    curate("python-strings-algorithms", 0, "standard", "первая пара", ["SK18"]), curate("python-strings-runs", 2, "standard", "длинная серия", ["SK19"]),
    curate("python-lists-basics", 1, "intro", "индексы чётных", ["SK20"]), curate("python-lists-mutation", 1, "standard", "обмен минимумом", ["SK21"]),
    curate("python-lists-processing", 0, "standard", "фильтрация", ["SK22"]), curate("python-lists-linear-search", 0, "standard", "первый индекс", ["SK23"]),
    curate("python-lists-neighbours", 2, "challenge", "локальные вершины", ["SK24"]), curate("python-lists-2d", 0, "standard", "суммы строк", ["SK24"]),
    curate("python-lists-matrices", 1, "challenge", "диагональ", ["SK24"]), curate("python-collections-sets", 1, "standard", "пересечение", ["SK24"]),
    curate("python-collections-dicts-frequency", 0, "standard", "частоты", ["SK25"]), curate("python-collections-dicts-frequency", 2, "challenge", "частый элемент", ["SK25"]),
    curate("python-strings-algorithms", 2, "challenge", "серии символов", ["SK18"])
  ],
  "python-practicum-functions-files": [
    curate("python-functions-basics", 0, "intro", "булева функция", ["SK26"]), curate("python-functions-basics", 1, "intro", "сравнение параметров", ["SK26"]),
    curate("python-functions-scope-decomposition", 1, "standard", "локальная функция", ["SK27"]), curate("python-functions-scope-decomposition", 2, "standard", "декомпозиция цифр", ["SK27"]),
    curate("python-recursion-basics", 0, "standard", "рекурсивный факториал", ["SK28"]), curate("python-recursion-calculations", 1, "standard", "трассировка цифр", ["SK29"]),
    curate("python-files-basics", 0, "intro", "сумма из файла", ["SK30"]), curate("python-files-basics", 1, "standard", "выходной файл", ["SK30"]),
    curate("python-files-numbers", 0, "standard", "числа в файле", ["SK31"]), curate("python-files-text", 0, "challenge", "самая длинная строка", ["SK32"]),
    curate("python-recursion-basics", 2, "challenge", "рекурсивная сумма цифр", ["SK28"]), curate("python-files-text", 2, "challenge", "частоты текста", ["SK32"])
  ],
  "python-practicum-algorithms": [
    curate("python-algorithms-binary-search", 0, "intro", "наличие ключа", ["SK33"]), curate("python-algorithms-binary-search", 1, "standard", "левая граница", ["SK33"]),
    curate("python-algorithms-selection-sort", 0, "intro", "минимум хвоста", ["SK34"]), curate("python-algorithms-selection-sort", 2, "challenge", "сортировка выбором", ["SK34"]),
    curate("python-algorithms-python-sort", 1, "standard", "ключ сортировки", ["SK35"]), curate("python-numbers-divisibility-divisors", 1, "standard", "перечень делителей", ["SK36"]),
    curate("python-numbers-primes-gcd", 0, "standard", "простое число", ["SK37"]), curate("python-numbers-primes-gcd", 1, "challenge", "алгоритм Евклида", ["SK37"]),
    curate("python-numbers-bases", 0, "standard", "двоичная запись", ["SK38"]), curate("python-numbers-bases", 1, "standard", "двоичное значение", ["SK38"]),
    curate("python-brute-force-basics", 0, "standard", "перебор пар", ["SK39"]), curate("python-brute-force-basics", 1, "challenge", "перебор троек", ["SK39"]),
    curate("python-complexity-basics", 0, "intro", "линейный поиск", ["SK40"]), curate("python-complexity-basics", 1, "standard", "квадратичный перебор", ["SK40"]),
    curate("python-complexity-basics", 2, "challenge", "кубический перебор", ["SK40"])
  ],
  "python-practicum-final": [
    curate("python-dp-basics", 0, "standard", "число путей", ["SK41"]), curate("python-dp-basics", 1, "challenge", "несоседний максимум", ["SK41"]),
    curate("python-dp-basics", 2, "challenge", "минимум монет", ["SK41"]), curate("python-graphs-basics", 0, "intro", "степени вершин", ["SK42"]),
    curate("python-graphs-basics", 1, "standard", "достижимость", ["SK42"]), curate("python-graphs-traversal", 0, "standard", "обход графа", ["SK43"]),
    curate("python-graphs-traversal", 1, "standard", "расстояние BFS", ["SK43"]), curate("python-graphs-traversal", 2, "challenge", "восстановление пути", ["SK43"]),
    curate("python-graphs-paths", 0, "challenge", "число путей DAG", ["SK44"]), curate("python-graphs-paths", 1, "challenge", "взвешенный путь", ["SK44"]),
    curate("python-graphs-paths", 2, "challenge", "кратчайший маршрут", ["SK44"]), curate("python-algorithms-binary-search", 2, "standard", "бинарный индекс", ["SK33"]),
    curate("python-algorithms-python-sort", 0, "standard", "сортировка данных", ["SK35"]), curate("python-numbers-primes-gcd", 1, "standard", "НОД", ["SK37"]),
    curate("python-brute-force-basics", 2, "challenge", "лучший кандидат", ["SK39"]), curate("python-collections-dicts-frequency", 1, "standard", "частотный выбор", ["SK25"]),
    curate("python-files-basics", 2, "standard", "файловый результат", ["SK30"]), curate("python-recursion-calculations", 0, "standard", "рекурсивная степень", ["SK29"]),
    curate("python-lists-matrices", 2, "standard", "матрица", ["SK24"]), curate("python-loops-nested", 2, "challenge", "тройки", ["SK11"])
  ]
};

export function practicumExercises(practicum) {
  const plan = practicumProfiles[practicum.id];
  if (!plan || plan.length !== practicum.count) throw new Error(`${practicum.id}: practicum profile must contain ${practicum.count} exercises`);
  return plan.map((entry, index) => {
    const base = lessonProfiles[entry.lessonId]?.[entry.taskIndex];
    if (!base) throw new Error(`${practicum.id}: invalid curated source ${entry.lessonId}#${entry.taskIndex}`);
    const contextual = clone(base);
    contextual.title = `${index + 1}. ${entry.idea}`;
    contextual.statement = `Практикум: ${entry.idea}. ${base.statement}`;
    contextual.hints = [
      `Сначала вспомните основной приём: ${entry.idea}.`,
      "Запустите решение на обычном и граничном примере.",
      "Сверьте формат результата с условием, а не с пояснениями."
    ];
    return materialize(
      contextual,
      { type: "practicum", id: practicum.id },
      `${practicum.id}-task-${String(index + 1).padStart(2, "0")}`,
      "practicum",
      entry.difficulty
    );
  });
}

export function validateAuthoringProfiles() {
  const errors = [];
  for (const [lessonId, tasks] of Object.entries(lessonProfiles)) {
    if (!Array.isArray(tasks) || tasks.length !== 3) errors.push(`${lessonId}: expected exactly 3 exercises`);
  }
  for (const [practicumId, tasks] of Object.entries(practicumProfiles)) {
    if (!Array.isArray(tasks) || tasks.length === 0) errors.push(`${practicumId}: profile is empty`);
  }
  return errors;
}
