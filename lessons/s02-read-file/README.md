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

## 这节课学到的核心

1. `s02` 最重要的点是：新增工具时，不需要重写 agent loop。
2. dispatch map 让“模型请求哪个工具”和“本地执行哪个函数”之间的关系变得非常清楚。
3. 目录发现 + 文件读取是一个很好的双工具例子，因为它天然体现“先探索，再读取”。
