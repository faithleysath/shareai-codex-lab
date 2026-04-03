import type { ChatCompletionTool } from "openai/resources/chat/completions/completions";

import { ensurePlainObject } from "./path-safety";

export const TASK_TOOL_NAME = "task";

interface TaskArgs {
  prompt: string;
}

interface DelegateTaskResult {
  subagent_label: string;
  rounds: number;
  tool_calls: number;
  final_report: string;
}

export interface TaskToolResult extends DelegateTaskResult {
  delegated_prompt: string;
  note: string;
}

function parseToolArguments(rawArgs: string): TaskArgs {
  const parsed = JSON.parse(rawArgs) as unknown;
  const value = ensurePlainObject(parsed);

  if (typeof value.prompt !== "string" || value.prompt.trim() === "") {
    throw new Error("`prompt` must be a non-empty string.");
  }

  return {
    prompt: value.prompt.trim(),
  };
}

export function createTaskTool(
  delegateTask: (prompt: string) => Promise<DelegateTaskResult>,
): {
  definition: ChatCompletionTool;
  execute: (rawArgs: string) => Promise<TaskToolResult>;
} {
  return {
    definition: {
      type: "function",
      function: {
        name: TASK_TOOL_NAME,
        description:
          "Delegate an exploratory subtask to a fresh-context child agent. Use this when broad codebase inspection would clutter the parent context.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description:
                "A self-contained instruction for the child agent. It should explain what to investigate and what the summary should include.",
            },
          },
          required: ["prompt"],
          additionalProperties: false,
        },
      },
    },
    async execute(rawArgs: string): Promise<TaskToolResult> {
      const args = parseToolArguments(rawArgs);
      const result = await delegateTask(args.prompt);

      return {
        delegated_prompt: args.prompt,
        ...result,
        note:
          "The parent only receives this summary. The child agent's intermediate messages and raw tool outputs stay isolated inside the child run.",
      };
    },
  };
}
