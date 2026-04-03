# s04-subagent

这是 ShareAI 教程第四节 `s04` 的 Bun + TypeScript 实践版本。

这一课的重点是“父代理把探索工作委派给子代理”，而不是继续让父代理自己读很多文件。

- 保留 `list_directory`
- 保留 `read_file`
- 新增父代理专属工具 `task`
- `task` 会启动一个 fresh context 的子代理
- 子代理只能使用基础文件工具，不能继续生成子代理

你可以把这一课理解成：`s01` 学循环，`s02` 学多工具分发，`s03` 学计划管理，`s04` 学上下文隔离和委派。

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

运行默认示例：

```bash
bun run start
```

也可以指定一个固定目录给父代理：

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
- parent loop 的 6 步原理
- parent 和 child 各自可见的 dispatch map
- 子代理启动时的委派 prompt
- parent round 和 child round 分开展示
- child 自己的工具调用过程
- child 最终只返回一段 summary 给 parent
- parent 最后基于 child summary 输出答案

## 代码结构

- `index.ts`：组装 parent agent、child agent 和默认任务
- `src/agent-runner.ts`：通用的 agent loop 执行器，parent 和 child 共用
- `src/env.ts`：读取并校验 `.env`
- `src/path-safety.ts`：固定根目录内的路径校验
- `src/directory-tool.ts`：安全目录工具
- `src/read-file-tool.ts`：安全读文件工具
- `src/task-tool.ts`：父代理专属的 `task` 工具
- `src/tool-registry.ts`：分别构建 base registry 和 parent registry
- `src/pretty.ts`：区分 parent/child 的命令行输出
- `src/directory-tool.test.ts`：目录工具测试
- `src/read-file-tool.test.ts`：读文件工具测试
- `src/task-tool.test.ts`：task 工具测试

## 原理拆解

第四课最重要的一句话是：

- 父代理不需要知道探索过程里的所有细节
- 父代理只需要拿到子代理产出的摘要

### 什么是子代理

这里的“子代理”，不是另一个进程，也不是另一个系统服务。

它本质上只是：

- 同一个程序里再次运行一遍 agent loop
- 但给它一套全新的 `messages[]`
- 再给它一套更受限的工具

也就是说，子代理的关键不是“更强”，而是“上下文隔离”。

### parent 和 child 的区别

在这一课里：

- parent 有 `task`、`list_directory`、`read_file`
- child 只有 `list_directory`、`read_file`

这意味着：

- parent 可以决定要不要委派
- child 只能做具体探索，不能继续生成新的子代理

这种限制是故意的，因为它能让结构保持清晰，不会出现无限递归委派。

### `task` 工具到底做了什么

`task` 是 parent 可见的一个工具。

当模型调用它时，本地代码会：

1. 读取工具参数里的 `prompt`
2. 启动一个 child agent
3. 把这段 prompt 作为 child 的任务说明
4. 让 child 用自己的 fresh context 去探索
5. 等 child 完成后，只把最终 summary 返回给 parent

所以 `task` 不是“帮 parent 做一步工具调用”，而是“帮 parent 临时雇一个小代理去做探索”。

### 为什么说 child 是 fresh context

因为 child 启动时，不会继承 parent 那一长串消息历史。

child 只有：

- 一条自己的 system prompt
- 一条委派来的 user prompt

所以 child 不会被 parent 前面那堆讨论、工具返回、中间草稿污染。

这就是第四课最关键的价值：

- 把探索性工作放进一个新的上下文里做
- 让 parent 保持干净

### 这节课的完整链路

可以把整个过程理解成：

1. parent 收到用户任务。
2. parent 拿到自己的工具列表。
3. parent 决定调用 `task`。
4. `task` 工具启动 child。
5. child 用 fresh context 调用 `list_directory` / `read_file` 进行探索。
6. child 生成最终 summary。
7. 本地代码把这段 summary 作为 `task` 的工具返回值交回 parent。
8. parent 基于这段 summary 输出最终答案。

注意这里最重要的一点：

- child 的中间工具调用不会进入 parent 的 `messages[]`

parent 只会看到一条工具结果：

- “这是 child 的总结”

### 为什么第四课不继续用 todo

因为第四课的重点已经从“计划管理”切换到了“上下文隔离”。

如果继续把 todo 也塞进来，注意力会被打散，你会分不清：

- 到底是 todo 在帮忙
- 还是 subagent 在帮忙

所以这一课故意把结构收回到更简单的三工具体系：

- `task`
- `list_directory`
- `read_file`

这样你能更清楚看到：真正的新能力来自“委派”，不是来自更多附加状态。

### 为什么这个 demo 任务适合子代理

这次默认任务不是单纯找一个文件，而是让 child 去回答：

1. 这个项目用什么测试框架
2. `API_TOKEN` 在哪里定义
3. 哪个文件直接把它发送或暴露给上游

这种任务的特点是：

- 需要读多个目录
- 需要读多个文件
- 需要做一点综合判断

这正是子代理很适合做的事情，因为 parent 不需要记住所有细节文件内容，只要最后收一份可靠摘要就够了。

### 这节课和前三课的关系

和 `s01` 相比：

- loop 本身没有本质变化

和 `s02` 相比：

- 多工具分发还在
- 但多了一个“工具返回值本身来自另一轮 agent loop”的结构

和 `s03` 相比：

- 不再强调显式计划
- 转而强调上下文切分

所以第四课真正要建立的直觉是：

- 有些任务不适合让一个 agent 自己把所有细节都记住
- 更好的做法是把脏活交给 child
- parent 只保留高价值结论

## 这节课学到的核心

1. 子代理的价值不在“更聪明”，而在“上下文隔离”。
2. `task` 工具本质上是在本地启动一个 fresh-context agent loop。
3. parent 只接收 child 的摘要，这能显著减少上下文污染。
