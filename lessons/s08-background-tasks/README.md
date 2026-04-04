# s08-background-tasks

这是 ShareAI 教程第八节 `s08` 的 Bun + TypeScript 实践版本。

这一课的重点不是再加一个“新知识工具”，而是让慢任务不要阻塞 agent loop：

- 工具调用时只负责“启动后台任务”
- 工具立刻返回一个 task receipt
- 真正的慢计算在 `BackgroundTaskManager` 里跑
- 后台完成后，把结果推进通知队列
- agent loop 在下一轮调用模型前，先把通知队列注入消息历史

这版为了教学直观，提供两个都带 `async` 后缀的数学工具：

- `calculate_fibonacci_async`
- `calculate_hanoi_moves_async`

这两个工具都会人为加上 20 秒延时，用来模拟慢工具。

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

开发模式：

```bash
bun run dev
```

运行测试：

```bash
bun test
```

## 你会看到什么

命令行输出会刻意做成教学风格，包含：

- 当前模型、接口地址、用户任务、每个后台任务的人工延时
- 这一课的 6 步原理说明
- 当前注册的 dispatch map
- 每一轮的 message stack
- 模型一次性启动几个 async 工具
- 每个工具立刻返回的 task receipt
- 后台任务等待中的提示
- 通知队列里被 drain 出来的后台结果
- 这些结果如何作为“新消息”追加到消息历史末尾
- 最终答案，以及总共用了几次工具调用

## 代码结构

- `index.ts`：主循环，负责维护 message history、工具调用和通知注入
- `src/env.ts`：读取并校验 `.env`
- `src/background-manager.ts`：后台任务管理器与通知队列
- `src/math-utils.ts`：斐波那契与汉诺塔步数计算
- `src/fibonacci-async-tool.ts`：异步斐波那契工具
- `src/hanoi-async-tool.ts`：异步汉诺塔工具
- `src/tool-registry.ts`：把两个 async 工具组织成 dispatch map
- `src/pretty.ts`：命令行美化输出
- `src/background-manager.test.ts`：后台管理器测试
- `src/fibonacci-async-tool.test.ts`：斐波那契工具测试
- `src/hanoi-async-tool.test.ts`：汉诺塔工具测试

## 原理拆解

第八课最重要的一句话是：

- 工具不一定要“算完再返回”
- 工具也可以“先启动，再回执，结果稍后补回来”

### 为什么不能让慢工具直接卡住主循环

如果一个工具内部要跑很久，比如：

- 大量测试
- 复杂构建
- 外部网络调用
- 很慢的计算

那如果你在 tool handler 里直接 `await` 到它结束，整个 agent loop 都会被卡住。

所以 `s08` 的思路是：

- tool handler 只负责启动后台任务
- 然后立刻把“任务已经开始”的信息返回给模型

这就是“前台秒回，后台慢跑”。

### 这节课的三层结构

这一课可以拆成三层：

第一层：模型  
模型决定什么时候调用 `calculate_fibonacci_async` 或 `calculate_hanoi_moves_async`。

第二层：工具层  
工具不做完整慢计算，只把内部执行函数交给 `BackgroundTaskManager`。

第三层：后台层  
`BackgroundTaskManager` 真正去执行那段慢逻辑，等完成后再产出通知。

所以这节课最核心的结构不是“工具直接出结果”，而是：

- tool -> manager.startTask(executeFn) -> 立即回执

### 工具内部到底做了什么

以斐波那契工具为例，工具内部会做这几件事：

1. 解析参数里的 `n`
2. 定义一个内部执行函数
3. 这个函数里先 `Bun.sleep(20_000)`
4. 然后真正计算 Fibonacci(n)
5. 把这个函数交给后台管理器
6. 拿到管理器返回的 task receipt
7. 把 receipt 作为当前 tool result 返回

所以当前轮里，模型看到的不是最终数值，而是：

- 任务 ID
- 哪个工具启动了
- 当前状态是 `started`

### 通知队列是怎么回到消息历史里的

后台任务完成后，不会去修改旧消息，也不会覆盖以前那条 tool result。

它会先进入 `BackgroundTaskManager` 的 notification queue。

然后在主循环每一轮开始前：

1. 先调用 `drainNotifications()`
2. 如果拿到了后台结果
3. 就把这些结果包成一个新的 `<background-results>` 消息
4. 追加到 `messages` 数组末尾

这点非常关键：

- 不是修改旧消息
- 不是回填以前那条 tool message
- 而是追加一条新的消息

这也是为什么你能清楚看到时间顺序：

- 先有“任务启动”
- 后有“后台结果到达”

### 为什么这一课适合同时启动两个工具

因为两个工具都有一样的 20 秒人工延时。

如果串行做：

- 一个 20 秒
- 再一个 20 秒
- 总体要接近 40 秒

如果同一轮都启动：

- 两个任务同时在后台跑
- 总体更接近 20 秒多一点

这正好能把后台任务的价值体现出来：

- 主循环不必等第一个任务完成后才能开始第二个

### 这节课和 `s02` 的关系

它很适合从 `s02` 改出来，因为：

- loop 骨架几乎一样
- dispatch map 结构几乎一样
- 仍然是模型决定用哪个工具，本地代码按名字分发

真正新增的能力只有两块：

- `BackgroundTaskManager`
- 每轮模型调用前先注入后台通知

所以如果你已经理解了 `s02`，那这节课最值得看的就是：

- tool handler 不再直接产出最终结果
- loop 里多了“通知队列 -> 消息注入”这一步

## 这节课学到的核心

1. 慢工具可以先返回 task receipt，再让后台任务继续跑。
2. 后台结果不会回填旧消息，而是作为新消息追加到 history 末尾。
3. `BackgroundTaskManager` 把“执行慢任务”和“通知主循环”这两件事分开了。
4. `s08` 的关键不是多线程推理，而是“后台执行 + 下一轮前注入结果”。
