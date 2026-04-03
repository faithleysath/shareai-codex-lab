# s02-read-file

这是 ShareAI 教程第二节 `s02` 的 Bun + TypeScript 实践版本。

这一课延续 `s01` 的 agent loop，但把重点放到“加工具而不改循环”：

- 保留 `list_directory`
- 新增 `read_file`
- 使用 dispatch map 按工具名找到对应的本地 handler
- 让模型自己找到 `walk.ts`，再读出完整内容

你可以把这一课理解成：`s01` 学的是循环本身，`s02` 学的是如何让循环安全地驱动多个工具。

## 运行前准备

先在当前目录放好 `.env`，需要这三个变量：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

仓库根目录已经有模板 [`.env.example`](/Users/laysath/proj/shareai-codex-lab/.env.example)。

## 常用命令

安装依赖：

```bash
bun install
```

运行默认示例。

如果不传目录参数，程序会默认检查当前 lesson 目录内置的 `demo-target/`。模型不会被直接告知 `walk.ts` 的路径，它需要自己逐层发现：

```bash
bun run start
```

也可以指定一个固定目录给 agent：

```bash
bun run start -- .
bun run start -- ./demo-target/src
bun run start -- ..
```

开发模式：

```bash
bun run dev -- .
```

运行测试：

```bash
bun test
```

## 你会看到什么

命令行输出会刻意做成教学风格，包含：

- 当前模型、固定根目录、接口地址
- agent loop 的 6 步原理
- 当前注册的 dispatch map
- 每一轮发送请求前的 message stack
- 模型返回的是普通文本还是 tool call
- tool call 的原始 JSON 参数
- dispatch lookup 是否命中本地 handler
- `list_directory` 返回的一层目录 tree
- `read_file` 返回的文件内容
- 为什么把 tool result 追加回消息后就能继续下一轮
- 最终答案、发现到的相对路径，以及总共用了几次工具调用

## 代码结构

- `index.ts`：主循环，负责维护 message history 与调用模型
- `src/env.ts`：读取并校验 `.env`
- `src/path-safety.ts`：固定根目录内的路径校验
- `src/directory-tool.ts`：安全目录工具
- `src/read-file-tool.ts`：安全读文件工具
- `src/tool-registry.ts`：把 tool schema 和 handler 组织成 dispatch map
- `src/pretty.ts`：命令行美化输出
- `src/directory-tool.test.ts`：目录工具测试
- `src/read-file-tool.test.ts`：读文件工具测试

## 原理拆解

第二课最核心的一句话是：

- loop 基本不变
- 新能力来自新增工具和工具分发

如果第一课是在学“agent 怎么循环”，那第二课就是在学“一个已经会循环的 agent，怎么安全地长出更多能力”。

### 这节课到底新增了什么

相比 `s01`，第二课多了两件关键事情：

- 新增一个工具 `read_file`
- 把工具执行改造成 dispatch map

现在模型不只是能列目录，还能在发现具体路径之后读取单个文件内容。

### 这节课的完整链路

你可以把第二课理解成下面这条链路：

1. 启动程序，读取 `.env`。
2. 创建 `OpenAI` 客户端。
3. 创建两个工具：
   - `list_directory`
   - `read_file`
4. 把这两个工具一起注册到 `toolRegistry`。
5. 把工具 schema 连同消息历史一起发给模型。
6. 模型先用 `list_directory` 探索目录结构。
7. 一旦它发现了具体目标文件路径，再调用 `read_file`。
8. 本地代码通过 dispatch map 找到正确 handler 执行。
9. 把工具结果继续追加回消息历史。
10. 当模型认为信息足够时，输出最终答案。

你会发现，这个链路和第一课的 loop 几乎一样。真正变化的是：

- 工具数量增加了
- 工具分发方式变得更工程化了

### 什么是 dispatch map

第二课最值得理解清楚的概念，就是 dispatch map。

它本质上就是一个“工具名 -> 本地函数”的映射表。

可以粗略理解成：

```ts
handlers["list_directory"] -> directoryTool.execute
handlers["read_file"] -> readFileTool.execute
```

所以当模型说：

- 我要调用 `list_directory`

本地代码就去找：

- `handlers["list_directory"]`

当模型说：

- 我要调用 `read_file`

本地代码就去找：

- `handlers["read_file"]`

这比第一课那种“只有一个工具，所以直接 if 判断”更适合扩展。

### 为什么第二课要引入 dispatch map

因为从两个工具开始，硬编码就开始变丑了。

如果继续沿用第一课的思路，代码会慢慢变成这样：

```ts
if (toolName === "...") { ... }
else if (toolName === "...") { ... }
else if (toolName === "...") { ... }
```

工具一多，就会越来越难维护。

dispatch map 的好处是：

- 新增工具时，不需要改 loop 结构
- 只需要新增一个 handler 并注册进去
- 工具扩展的成本更低

这就是第二课最重要的工程意识。

### `read_file` 和 `list_directory` 的职责分工

第二课里，这两个工具是刻意分开的：

- `list_directory`：负责探索结构
- `read_file`：负责读取内容

这样拆开有两个好处：

- 每个工具职责单一，边界清晰
- 模型必须先发现路径，再读取文件

这和直接给一个“万能文件系统工具”不一样。我们是在故意把能力拆细，让 agent 的行为过程更可观察。

### 为什么不直接告诉模型 `walk.ts` 的路径

因为第二课想教的不是“读文件 API 怎么写”，而是：

- 模型如何先探索
- 再根据探索结果决定下一步工具调用

如果一开始就把 `src/lib/walk.ts` 告诉模型，那它完全可以直接调用 `read_file`，这样就看不到“目录发现 -> 文件读取”这个多工具协作过程了。

所以我们故意只告诉它：

- 目标文件叫 `walk.ts`
- 但路径你自己找

这会迫使它先使用 `list_directory`。

### `read_file` 为什么也要做路径限制

因为第二课虽然增加了能力，但安全边界不能丢。

`read_file` 也和 `list_directory` 一样，受固定根目录约束：

- 只能访问固定根目录内的路径
- 不能用 `..` 逃逸
- 不能把目录当文件读

所以第二课不是“能力更强了就更危险”，而是“能力变多了，但每个能力都还是受控的”。

### 第二课和第一课的真正区别

第一课里，你主要看到的是：

- 一个 loop
- 一个工具

第二课里，你主要看到的是：

- 同一个 loop
- 多个工具
- 一个 dispatch map

所以第二课真正要你建立的感觉是：

- 不要把 agent 理解成“某个神奇大 prompt”
- 它更像一个小型 runtime
- 模型负责决策
- 本地代码负责提供能力、做边界控制、做工具分发

### 为什么第二课还不需要 todo

第二课的默认任务是：

1. 找到 `walk.ts`
2. 读出它的内容

虽然比第一课多了一步，但整体还是一个短路径任务。

它的特点是：

- 目标很单一
- 状态不复杂
- 不太容易中途漂移

所以第二课更适合把注意力放在：

- 多工具协作
- dispatch map

而不是过早引入 todo 系统。

todo 是第三课才真正开始有价值的东西，因为那时任务已经明显变成多阶段调查了。

## 这节课学到的核心

1. `s02` 最重要的点是：新增工具时，不需要重写 agent loop。
2. dispatch map 让“模型请求哪个工具”和“本地执行哪个函数”之间的关系变得非常清楚。
3. 目录发现 + 文件读取是一个很好的双工具例子，因为它天然体现“先探索，再读取”。
