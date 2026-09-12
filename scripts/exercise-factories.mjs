const normalized = { mode: "normalized_text" };

const stdin = (title, statement, solution, cases, starterCode = "") => ({
  title,
  statement,
  starterCode,
  solution,
  hints: ["Разберите входные данные до вычислений.", "Проверьте решение на граничном примере."],
  examples: [{ input: cases[0][0], output: cases[0][1] }],
  judge: {
    type: "stdin_stdout",
    comparison: normalized,
    tests: cases.map(([input, expectedOutput]) => ({ input, expectedOutput }))
  }
});

const func = (title, statement, functionName, solution, cases, starterCode, structuralConstraints) => ({
  title,
  statement,
  starterCode: starterCode ?? `def ${functionName}(...):\n    pass\n`,
  solution,
  hints: ["Сначала сформулируйте, что функция должна вернуть.", "Проверьте пустые и граничные данные."],
  examples: [{ input: JSON.stringify(cases[0][0]), output: JSON.stringify(cases[0][1]) }],
  judge: {
    type: "function",
    functionName,
    tests: cases.map(([args, expectedReturn]) => ({ args, expectedReturn })),
    ...(structuralConstraints ? { structuralConstraints } : {})
  }
});

const fileTask = (title, statement, solution, inputFiles, expectedStdout, expectedFiles = []) => ({
  title,
  statement,
  starterCode: "# Файлы уже находятся в рабочей папке.\n",
  solution,
  hints: ["Откройте файл через with, чтобы он закрылся автоматически.", "Удаляйте перевод строки только там, где он мешает обработке."],
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

const aliases = {
  logic: "conditions", ranges: "conditions", debug: "conditions",
  nested: "loops", aggregate: "sequence", trace: "sequence",
  files: "files", divisors: "number", complexity: "brute"
};

export function tasksForFamily(family) {
  const key = aliases[family] ?? family;
  return profiles[key] ?? profiles.sequence;
}

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
  const tasks = tasksForFamily(lesson.family);
  const ids = [`${lesson.id}-guided-1`, `${lesson.id}-guided-2`, `${lesson.id}-checkpoint`];
  return tasks.map((task, index) => materialize(
    task,
    { type: "lesson", id: lesson.id },
    ids[index],
    index === 2 ? "checkpoint" : "guided",
    index === 0 ? "intro" : index === 1 ? "standard" : "challenge"
  ));
}

export function practicumExercises(practicum, availableLessons) {
  const pool = availableLessons.flatMap((lesson) => tasksForFamily(lesson.family));
  return Array.from({ length: practicum.count }, (_, index) => {
    const base = pool[(index * 5 + practicum.batch.charCodeAt(0)) % pool.length];
    return materialize(
      { ...base, title: `${index + 1}. ${base.title}` },
      { type: "practicum", id: practicum.id },
      `${practicum.id}-task-${String(index + 1).padStart(2, "0")}`,
      "practicum",
      index < Math.ceil(practicum.count / 3) ? "intro" : index < Math.ceil(practicum.count * 2 / 3) ? "standard" : "challenge"
    );
  });
}
