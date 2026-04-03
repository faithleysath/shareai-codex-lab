# s05-skills

这是 ShareAI 教程第五节 `s05` 的 Bun + TypeScript 实践版本。

这一课的重点是“不要把完整 skill 全塞进 system prompt”，而是：

- 先在 system prompt 里放一个精简 skill 索引
- 再提供一个 `load_skill` 工具
- 让模型在需要时自己加载对应 skill
- 把完整 skill 文本作为 tool result 注入后续上下文

这版为了教学直观，直接把两个 skill 定义在源码里：

- `fortune_teller`：用户找你算命、看运势、占卜时加载
- `fishing_guide`：用户问钓鱼知识、装备、技巧时加载

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

不传参数时，程序默认使用一个“算命”请求，方便你观察模型会不会自动调用 `load_skill`：

```bash
bun run start
```

也可以切换成内置的钓鱼示例：

```bash
bun run start -- --demo fishing
```

还可以直接给一个自定义问题：

```bash
bun run start -- "我是新手，想去水库路亚翘嘴，饵和线怎么搭？"
bun run start -- "帮我看一下最近桃花运怎么样"
bun run start -- "请解释一下 tool calling 和普通 prompt 有什么区别"
```

开发模式：

```bash
bun run dev -- --demo fortune
```

运行测试：

```bash
bun test
```

## 你会看到什么

命令行输出会刻意做成教学风格，包含：

- 当前模型、接口地址、演示 prompt
- 这一课的 6 步原理说明
- system prompt 中可见的 skill 摘要索引
- 当前注册的 dispatch map
- 每一轮的 message stack
- 模型是否主动调用 `load_skill`
- `load_skill` 的原始 JSON 参数
- 工具返回的完整 skill 文本
- 为什么说 tool result 是“第二层注入”
- 最终答案以及总共用了几次工具调用

## 代码结构

- `index.ts`：主循环，负责维护 message history 与调用模型
- `src/env.ts`：读取并校验 `.env`
- `src/skills.ts`：直接在源码里声明两个 skill
- `src/load-skill-tool.ts`：技能加载工具
- `src/tool-registry.ts`：把 `load_skill` 组织进 dispatch map
- `src/pretty.ts`：命令行美化输出
- `src/load-skill-tool.test.ts`：技能加载工具测试

## 原理拆解

第五课最重要的一句话是：

- system prompt 里只放“技能目录”
- 真正的技能正文按需加载

### 为什么 skill 不直接全塞到 system prompt

如果你把所有 skill 的完整正文都直接塞到 system prompt，短期看似简单，但会有几个问题：

- prompt 越来越长，浪费上下文
- 很多 skill 在当前对话里其实根本用不上
- 不相关知识也会一直留在上下文里，增加干扰

所以第五课的思路是：

- 先只告诉模型“你都有哪些 skill 可以用”
- 具体要用哪一个，让模型自己决定
- 真正需要时，再把完整 skill 取回来

### 这一课的两层注入

这节课其实有两层注入：

第一层是 system prompt 里的 skill 索引，也就是：

- skill 名称
- skill 的一句话摘要
- 大概会在什么问题上触发

第二层则是模型自己调用 `load_skill` 之后，本地代码返回的 tool result：

- 完整 skill 正文
- 详细的回答风格
- 具体的输出策略

真正影响回答细节的，是第二层。

### `load_skill` 工具到底做了什么

`load_skill` 是一个很简单的本地工具。

当模型调用它时，本地代码会：

1. 解析参数里的 `skill_name`
2. 去源码内置的 skill 表里查找
3. 把对应 skill 的完整正文返回给模型

所以这节课和 `s02` 的共通点非常明显：

- 都是模型先决定调用哪个工具
- 都是本地代码负责执行工具
- 都是把结果作为 `tool` message 追加回消息历史

差别在于，`s02` 追加的是“文件内容”，而 `s05` 追加的是“技能内容”。

### 为什么这节课要用 `tool_choice: "auto"`

这一课和前几课有一个故意的差异：

- 从第一轮开始就使用 `tool_choice: "auto"`

原因很简单，因为我们现在要观察的是：

- 模型会不会自己判断“这个问题值得加载 skill”

如果第一轮强制 `tool_choice: "required"`，那模型一定会先调工具，你就看不出“自动判断”这件事了。

所以第五课里，`auto` 不是偷懒，而是教学目的本身。

### 为什么说 tool result 是“第二层 prompt”

因为模型第一次看到的 system prompt 里，根本没有完整 skill 正文。

只有在工具调用之后，本地代码才把 skill 正文塞回消息历史。

从消息结构上看，它不是 system prompt，但它确实会影响下一轮推理。所以你可以把它理解成：

- 不是直接写在最开始的 prompt 里
- 但它在对话中途，被当作新的上下文注入了

这就是第五课最值得建立的直觉：

- tool calling 不只是“执行动作”
- 也可以是“按需加载知识”

### 为什么这节课适合用内联 skill

真实工程里，skill 可能来自：

- 独立 Markdown 文件
- 数据库
- 远程配置

但教学版故意把 skill 直接写在 `src/skills.ts` 里，是因为这样最直观：

- 你一眼就能看到 skill 索引和 skill 正文的区别
- 你能清楚看到 tool 到底返回了什么
- 不会把注意力分散到文件 IO 或外部存储上

### 这节课和前几课的关系

和 `s02` 相比：

- loop 几乎一样
- dispatch map 也几乎一样
- 只是工具从“读文件”变成了“读 skill”

和 `s03`、`s04` 相比：

- 这节课不强调 todo，也不强调 subagent
- 它强调的是“如何把知识模块化，并在需要时再加载”

所以第五课真正要建立的直觉是：

- 不是所有知识都要一直放在上下文里
- 可以先放摘要
- 需要时再把完整内容取回来

## 这节课学到的核心

1. `tool` 不一定只是执行动作，也可以按需加载知识。
2. system prompt 可以只放 skill 索引，而不是完整 skill 正文。
3. `tool_choice: "auto"` 才能真正观察模型会不会主动加载合适 skill。
4. `s05` 和 `s02` 的底层结构非常接近，只是“工具返回的东西”变了。
