import type { ChatCompletionTool } from "openai/resources/chat/completions/completions";

import type { BackgroundTaskManager, BackgroundTaskStartReceipt } from "./background-manager";
import { computeFibonacciValue, parseIntegerArgs } from "./math-utils";

export const FIBONACCI_ASYNC_TOOL_NAME = "calculate_fibonacci_async";

export interface FibonacciTaskResult {
  kind: "fibonacci";
  n: number;
  sequence_definition: string;
  value: string;
}

export interface FibonacciTaskReceipt extends BackgroundTaskStartReceipt {
  requested_n: number;
  artificial_delay_ms: number;
}

interface FibonacciToolOptions {
  delayMs?: number;
}

export function createFibonacciAsyncTool(
  manager: BackgroundTaskManager,
  options: FibonacciToolOptions = {},
): {
  definition: ChatCompletionTool;
  execute: (rawArgs: string) => Promise<FibonacciTaskReceipt>;
} {
  const delayMs = options.delayMs ?? 20_000;

  return {
    definition: {
      type: "function",
      function: {
        name: FIBONACCI_ASYNC_TOOL_NAME,
        description:
          "Start a background job that computes Fibonacci(n) after an artificial delay. The tool returns immediately with a task receipt.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            n: {
              type: "integer",
              description: "The Fibonacci index n. Example: 45.",
              minimum: 0,
            },
          },
          required: ["n"],
          additionalProperties: false,
        },
      },
    },
    async execute(rawArgs: string): Promise<FibonacciTaskReceipt> {
      const n = parseIntegerArgs(rawArgs, "n");

      const receipt = manager.startTask({
        toolName: FIBONACCI_ASYNC_TOOL_NAME,
        async execute() {
          await Bun.sleep(delayMs);

          return {
            kind: "fibonacci",
            n,
            sequence_definition: "F(0)=0, F(1)=1",
            value: computeFibonacciValue(n).toString(),
          } satisfies FibonacciTaskResult;
        },
      });

      return {
        ...receipt,
        requested_n: n,
        artificial_delay_ms: delayMs,
      };
    },
  };
}
