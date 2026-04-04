import type { ChatCompletionTool } from "openai/resources/chat/completions/completions";

import type { BackgroundTaskManager } from "./background-manager";
import { createFibonacciAsyncTool, FIBONACCI_ASYNC_TOOL_NAME } from "./fibonacci-async-tool";
import { createHanoiAsyncTool, HANOI_ASYNC_TOOL_NAME } from "./hanoi-async-tool";

export type ToolHandler = (rawArgs: string) => Promise<unknown>;

export interface ToolRegistry {
  definitions: ChatCompletionTool[];
  handlers: Record<string, ToolHandler>;
  toolNames: string[];
}

export function createToolRegistry(manager: BackgroundTaskManager): ToolRegistry {
  const fibonacciTool = createFibonacciAsyncTool(manager);
  const hanoiTool = createHanoiAsyncTool(manager);

  return {
    definitions: [fibonacciTool.definition, hanoiTool.definition],
    handlers: {
      [FIBONACCI_ASYNC_TOOL_NAME]: fibonacciTool.execute,
      [HANOI_ASYNC_TOOL_NAME]: hanoiTool.execute,
    },
    toolNames: [FIBONACCI_ASYNC_TOOL_NAME, HANOI_ASYNC_TOOL_NAME],
  };
}
