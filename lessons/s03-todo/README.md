# s03-todo

这是 ShareAI 教程第三节 `s03` 的 Bun + TypeScript 实践版本。

这一课继续沿用前两节的 agent loop，但把重点放到“先计划，再执行”：

- 保留 `list_directory`
- 保留 `read_file`
- 新增状态化的 `todo_write`
- 在 todo 长时间不更新时注入 nag reminder

你可以把这一课理解成：`s01` 学循环，`s02` 学多工具分发，`s03` 学如何让 agent 在复杂任务里不漂移。

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

如果不传目录参数，程序会默认检查当前 lesson 目录内置的 `demo-target/`。这次任务比前两节更复杂：不仅要找到 `walk.ts`，还要追踪密码流向，所以更适合演示 todo 系统：

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
- agent loop 的 8 步原理
- 当前注册的 dispatch map
- `todo_write` 写入后的计划状态
- 每一轮发送请求前的 message stack
- 模型返回的是普通文本还是 tool call
- tool call 的原始 JSON 参数
- dispatch lookup 是否命中本地 handler
- `list_directory` 返回的一层目录 tree
- `read_file` 返回的文件内容
- todo 多轮未更新时触发的提醒
- 为什么把 tool result 追加回消息后就能继续下一轮
- 最终答案、发现到的相对路径、密码流向，以及总共用了几次工具调用

## 代码结构

- `index.ts`：主循环，负责维护 message history 与调用模型
- `src/env.ts`：读取并校验 `.env`
- `src/path-safety.ts`：固定根目录内的路径校验
- `src/directory-tool.ts`：安全目录工具
- `src/read-file-tool.ts`：安全读文件工具
- `src/todo-manager.ts`：内存中的 todo 状态
- `src/todo-tool.ts`：`todo_write` 工具
- `src/tool-registry.ts`：把 tool schema 和 handler 组织成 dispatch map
- `src/pretty.ts`：命令行美化输出
- `src/directory-tool.test.ts`：目录工具测试
- `src/read-file-tool.test.ts`：读文件工具测试
- `src/todo-manager.test.ts`：todo 状态校验测试

## 原理拆解

第三课最容易让人绕进去的点，就是“`todo_write` 是工具”和“todo 的内存状态管理”其实不是一回事。

可以先把它们拆开看：

- `todo_write`：这是模型可以调用的工具。
- `TodoManager`：这是我们本地 TypeScript 进程里的一个普通类，用来保存 todo 当前状态。

也就是说：

- 模型看得见的是工具 schema。
- 真正保存 todo 列表的是我们本地代码里的内存对象。
- 模型不能直接改内存，只能通过调用 `todo_write`，把新的 todo 列表交给本地代码。

### 什么叫“内存状态管理”

这里的“内存状态管理”，意思非常朴素：

- 程序启动时，我们在内存里创建一个 `TodoManager` 实例。
- 它内部有一个 `#items` 数组，保存当前 todo 列表。
- 每次模型调用 `todo_write`，本地代码就会校验参数，然后更新这个数组。
- 下一轮再调用时，程序还能记得上一轮的 todo 状态，因为这个对象还活着。

但它不是持久化存储：

- 不会写进数据库
- 不会写进文件
- 程序一退出，todo 状态就没了

这也是为什么它很适合做教学示例：足够简单，但已经能体现“agent 有内部状态”这件事。

### 这节课的完整链路

可以把整节课理解成下面这条链路：

1. 启动程序，创建 `OpenAI` 客户端。
2. 创建工具注册表 `toolRegistry`。
3. 在注册表里同时放入：
   - `todo_write`
   - `list_directory`
   - `read_file`
4. `todo_write` 内部持有一个 `TodoManager`，所以它不是无状态工具。
5. 模型拿到 system prompt、user prompt 和全部工具定义。
6. 模型先调用 `todo_write`，把当前计划写出来。
7. 本地代码执行 `todo_write`，把 todo 存进 `TodoManager`。
8. 本地代码把 todo 快照作为 `tool` message 追加回消息历史。
9. 模型继续调用 `list_directory` 和 `read_file` 推进任务。
10. 如果很多轮都没更新 todo，本地代码会主动插入一条 reminder。
11. 模型收到 reminder 后，通常会重新整理计划，再继续执行。
12. 当模型不再需要工具时，输出最终答案，循环结束。

## 这节课和前两节到底差在哪

### 和 s01 的区别

`s01` 的重点是：

- 先理解 agent loop 本身
- 明白“模型请求工具 -> 本地执行 -> 把结果喂回模型”

当时没有状态，也没有计划系统。

### 和 s02 的区别

`s02` 的重点是：

- 加工具时，loop 不用改
- 用 dispatch map 做工具分发

但 `s02` 里的工具基本还是“调用一次，返回一次”，没有“记住之前计划”的需求。

### s03 新增加的东西

`s03` 的重点是：

- 不只是加工具
- 还要让 agent 在多步任务里维持计划

所以第三课相比第二课，多了两层东西：

- 一个有状态工具 `todo_write`
- 一个提醒机制 nag reminder

## dispatch map 在这里怎么工作

前两节你已经见过 dispatch map，这一节它还是同一个思想：

- 模型说它要调用哪个工具
- 我们本地用工具名去查 handler

大致可以理解成：

```ts
handlers["todo_write"] -> todoWriteTool.execute
handlers["list_directory"] -> directoryTool.execute
handlers["read_file"] -> readFileTool.execute
```

所以第三课并不是“换了一种 loop”，而是：

- loop 还是那个 loop
- dispatch 还是那个 dispatch
- 只是其中一个 handler 变成了“会维护内部状态”的 handler

## `todo_write` 到底做了什么

`todo_write` 不是“追加一条 todo”，而是“用一份完整的新计划替换旧计划”。

这是故意这样设计的，因为这样更容易保持一致性：

- 模型每次提交的是“当前完整计划”
- 本地代码做完整校验
- 然后一次性替换

它会检查几件事：

- `items` 必须是数组
- 每个 item 必须有 `id`、`text`、`status`
- `status` 只能是 `pending` / `in_progress` / `completed`
- 同一个 `id` 不能重复
- 同一时刻最多只能有一个 `in_progress`

校验通过后，`TodoManager` 会返回一个快照给模型，包括：

- 总条目数
- 已完成数量
- 进行中数量
- 当前渲染后的 todo 列表

所以模型并不是“盲写 todo”，它每次都会看到本地代码返回的规范化结果。

## 为什么要限制“最多一个 in_progress”

这是一个很小但很重要的约束。

如果允许多个 `in_progress`，模型很容易把 todo 写成一堆“都在做”，最后失去计划的导向作用。

限制成最多一个 `in_progress` 后，todo 的语义就会清晰很多：

- 当前正在做哪一步
- 哪些已经做完
- 哪些还没开始

这会逼着 agent 明确“下一步到底是什么”。

## nag reminder 是怎么工作的

第三课里有一个简单的提醒逻辑：

- 如果连续几轮都没调用 `todo_write`
- 本地代码就会主动往消息历史里插入一条提醒

提醒的大意是：

- 你已经很多轮没更新计划了
- 这是个多步任务
- 如果进展变化了，请刷新 todo

这个提醒不是模型自己生成的，而是我们本地代码主动插进去的。

这点很关键，因为它说明：

- agent 的行为不只是“听模型”
- 本地 orchestrator 也可以设置护栏

这就是第三课一个很重要的工程意识：很多 agent 能力，其实来自“模型 + 本地控制逻辑”的组合。

## 为什么这次任务更适合 todo

你前面说“之前的任务可能不够复杂，用不上 todo 系统”，这个判断是对的。

像第二课那种任务：

- 找到 `walk.ts`
- 读出内容

步骤少、目标单一，其实不太需要 todo。

但第三课这个默认任务变成了：

1. 找文件
2. 读密码
3. 追踪密码流向
4. 总结结果

这就明显更像“调查任务”了。

在这种任务里，todo 的价值主要体现在：

- 防止模型忘掉中间目标
- 让阶段性成果显式记录下来
- 在多轮工具调用后仍然知道自己做到哪一步了

## 一个最重要的理解

第三课不是在说“所有 agent 都应该先写 todo”。

它真正想表达的是：

- 简单任务，不一定需要 todo
- 多步任务，todo 往往能显著提升稳定性

所以 todo 不是默认必选项，而是一种“复杂任务的组织工具”。

## 这节课学到的核心

1. `todo_write` 适合多步任务，不一定适合非常短的小任务。
2. todo 的价值不在“更聪明”，而在“把计划显式化”，减少中途漂移。
3. nag reminder 是一个简单但有效的护栏，当计划太久没更新时，可以把 agent 拉回到可控轨道。
