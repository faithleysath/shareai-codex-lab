# s01-agent-loop

这是 ShareAI 教程第一节 `s01` 的 Bun + TypeScript 实践版本。

这一课我们没有开放危险的 shell，而是实现了一个更安全、更容易观察原理的例子：

- 模型只能调用一个本地工具 `list_directory`
- 这个工具只能读取固定根目录内部的内容
- 每次只返回一层目录内容
- agent 必须通过循环多次调用工具，才能拼出完整 tree

这正好能把 `agent loop` 的本质看得很清楚：模型提工具请求，本地代码执行工具，再把结果喂回模型继续思考。

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

如果不传目录参数，程序会默认检查当前 lesson 目录内置的 `demo-target/`，这样更适合观察多轮循环：

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
- agent loop 的 5 步原理
- 每一轮发送请求前的 message stack
- 模型返回的是普通文本还是 tool call
- tool call 的原始 JSON 参数
- 本地工具返回的一层目录 tree
- 为什么把 tool result 追加回消息后就能继续下一轮
- 最终答案和总共用了几次工具调用

## 代码结构

- `index.ts`：主循环，负责维护 message history 与调用模型
- `src/env.ts`：读取并校验 `.env`
- `src/directory-tool.ts`：安全目录工具与参数校验
- `src/pretty.ts`：命令行美化输出
- `src/directory-tool.test.ts`：工具安全性和行为测试

## 这节课学到的核心

1. Agent loop 不神秘，本质就是“请求模型 -> 执行工具 -> 追加结果 -> 再请求模型”。
2. 工具越受限，越容易理解 agent 的行为边界。
3. 一层一层列目录这个例子非常适合学习，因为它天然需要多轮循环。
