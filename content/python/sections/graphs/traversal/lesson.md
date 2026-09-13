# Обходы DFS и BFS

После урока вы сможете обходить достижимые вершины в глубину и ширину.

> **Фокус**
> - Нужно знать: список смежности, стек и очередь.
> - Нужно уметь: вести посещённые вершины и выбирать порядок обхода.
> - Полезно знать: вершину лучше пометить до повторного добавления в структуру.

## DFS использует стек

Стек заставляет продолжать путь в глубину. `visited` не даёт ходить по уже открытым вершинам.

```python
graph = [[1, 2], [0, 3], [0], [1]]
visited = [False] * len(graph)
stack = [0]
visited[0] = True
while stack:
    vertex = stack.pop()
    print(vertex)
    for neighbour in graph[vertex]:
        if not visited[neighbour]:
            visited[neighbour] = True
            stack.append(neighbour)
```

## BFS использует очередь

Очередь обрабатывает вершины слоями: старт, затем его соседей, затем следующий слой.

```python
graph = [[1, 2], [0, 3], [0], [1]]
visited = [False] * len(graph)
queue = [0]
head = 0
visited[0] = True
while head < len(queue):
    vertex = queue[head]
    head += 1
    print(vertex)
    for neighbour in graph[vertex]:
        if not visited[neighbour]:
            visited[neighbour] = True
            queue.append(neighbour)
```

## Частые ошибки

Не отмечайте вершину только после извлечения: она может попасть в структуру несколько раз. Не смешивайте LIFO и FIFO.

## Проверьте себя

1. Какая структура задаёт DFS?
2. Почему BFS идёт слоями?
3. Когда отмечать вершину посещённой?

## Перед практикой

В Guided 1 выполните обход. В Guided 2 выберите DFS или BFS по задаче.
