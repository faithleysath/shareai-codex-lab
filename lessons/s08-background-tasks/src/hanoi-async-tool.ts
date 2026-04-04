import type { ChatCompletionTool } from "openai/resources/chat/completions/completions";

import type { BackgroundTaskManager, BackgroundTaskStartReceipt } from "./background-manager";
import { computeHanoiMovesValue, parseIntegerArgs } from "./math-utils";

export const HANOI_ASYNC_TOOL_NAME = "calculate_hanoi_moves_async";

export interface HanoiTaskResult {
  kind: "hanoi";
  n: number;
  formula: string;
  value: string;
}

export interface HanoiTaskReceipt extends BackgroundTaskStartReceipt {
  requested_n: number;
  artificial_delay_ms: number;
}

interface HanoiToolOptions {
  delayMs?: number;
}

export function createHanoiAsyncTool(
  manager: BackgroundTaskManager,
  options: HanoiToolOptions = {},
): {
  definition: ChatCompletionTool;
  execute: (rawArgs: string) => Promise<HanoiTaskReceipt>;
} {
  const delayMs = options.delayMs ?? 20_000;

  return {
    definition: {
      type: "function",
      function: {
        name: HANOI_ASYNC_TOOL_NAME,
        description:
          "Start a background job that computes the minimal move count for an n-layer Tower of Hanoi after an artificial delay. The tool returns immediately with a task receipt.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            n: {
              type: "integer",
              description: "The number of layers in the Tower of Hanoi. Example: 18.",
              minimum: 0,
            },
          },
          required: ["n"],
          additionalProperties: false,
        },
      },
    },
    async execute(rawArgs: string): Promise<HanoiTaskReceipt> {
      const n = parseIntegerArgs(rawArgs, "n");

      const receipt = manager.startTask({
        toolName: HANOI_ASYNC_TOOL_NAME,
        async execute() {
          await Bun.sleep(delayMs);

          return {
            kind: "hanoi",
            n,
            formula: "2^n - 1",
            value: computeHanoiMovesValue(n).toString(),
          } satisfies HanoiTaskResult;
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
