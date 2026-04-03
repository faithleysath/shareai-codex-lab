# shareai-codex-lab

这是一个跟着 [ShareAI 教程](https://learn.shareai.run/zh/) 学习的实验仓库。

从现在开始，这个仓库采用“每一节课一个独立子项目”的方式组织，避免不同章节之间互相干扰。

## 仓库约定

1. 每一节课都放在 `lessons/` 目录下。
2. 每一节课都是一个独立的 Bun/TypeScript 子项目，默认互不共享代码和依赖。
3. 目录名尽量和教程章节保持一致，推荐格式为 `s01-agent-loop`、`s02-...`。
4. 根目录主要放总说明、学习记录和协作约定，不默认作为可运行项目。
5. 即使不同章节会重复 `package.json`、`tsconfig.json`、`bun.lock`，也优先保留独立性，先保证学习过程清晰。

## 当前目录结构

```text
shareai-codex-lab/
  README.md
  lessons/
    s01-agent-loop/
      README.md
      package.json
      tsconfig.json
      bun.lock
      index.ts
    s02-read-file/
      README.md
      package.json
      tsconfig.json
      bun.lock
      index.ts
    s03-todo/
      README.md
      package.json
      tsconfig.json
      bun.lock
      index.ts
    s04-subagent/
      README.md
      package.json
      tsconfig.json
      bun.lock
      index.ts
```

## 当前进度

- `lessons/s01-agent-loop/` 已经作为第一节课的起始子项目创建好。
- `lessons/s01-agent-loop/` 现在是“安全列目录”的 agent loop 示例。
- `lessons/s02-read-file/` 现在是“列目录 + 读文件 + dispatch map”的第二节课示例。
- `lessons/s03-todo/` 现在是“todo_write + nag reminder + 多步调查任务”的第三节课示例。
- `lessons/s04-subagent/` 现在是“task 工具 + fresh-context child agent + 摘要回流”的第四节课示例。
- 暂时不预创建后续章节目录，需要做到哪一节再补哪一节。

## LLM 环境变量

仓库统一使用 OpenAI 兼容接口的三变量约定：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`

模板见 [`.env.example`](/Users/laysath/proj/shareai-codex-lab/.env.example)。

因为每一节课都是独立子项目，实际运行时请把模板复制到对应 lesson 目录并命名为 `.env`，例如：

```bash
cp .env.example lessons/s01-agent-loop/.env
```

## 运行第一节课

```bash
cd lessons/s01-agent-loop
bun install
bun run start
```

开发模式：

```bash
cd lessons/s01-agent-loop
bun run dev
```

## 后续使用方式

当你开始下一节课时，我们再新建对应目录，例如：

- `lessons/s02-.../`
- `lessons/s03-.../`

到时候可以根据需要：

- 从零新建一个最小 Bun 项目
- 复制上一节的成果作为新一节的起点

默认原则是：先让每一节的边界足够清楚，再考虑抽公共代码。
