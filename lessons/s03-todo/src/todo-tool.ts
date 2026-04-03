import type { ChatCompletionTool } from "openai/resources/chat/completions/completions";

import { ensurePlainObject } from "./path-safety";
import type { TodoItem, TodoStatus } from "./todo-manager";
import { TodoManager } from "./todo-manager";

export const TODO_WRITE_TOOL_NAME = "todo_write";

interface TodoWriteArgs {
  items: TodoItem[];
}

function assertStatus(value: unknown): TodoStatus {
  if (value === "pending" || value === "in_progress" || value === "completed") {
    return value;
  }

  throw new Error("Todo status must be one of: pending, in_progress, completed.");
}

function parseToolArguments(rawArgs: string): TodoWriteArgs {
  const parsed = JSON.parse(rawArgs) as unknown;
  const value = ensurePlainObject(parsed);

  if (!Array.isArray(value.items)) {
    throw new Error("`items` must be an array.");
  }

  return {
    items: value.items.map((item, index) => {
      const objectValue = ensurePlainObject(item);

      if (typeof objectValue.id !== "string") {
        throw new Error(`items[${index}].id must be a string.`);
      }

      if (typeof objectValue.text !== "string") {
        throw new Error(`items[${index}].text must be a string.`);
      }

      return {
        id: objectValue.id,
        text: objectValue.text,
        status: assertStatus(objectValue.status),
      } satisfies TodoItem;
    }),
  };
}

export function createTodoWriteTool(todoManager: TodoManager): {
  definition: ChatCompletionTool;
  execute: (rawArgs: string) => Promise<ReturnType<TodoManager["snapshot"]>>;
} {
  return {
    definition: {
      type: "function",
      function: {
        name: TODO_WRITE_TOOL_NAME,
        description:
          "Create or update the full todo list for a multi-step task. Replace the whole plan each time, and keep at most one item in_progress.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            items: {
              type: "array",
              description: "The complete current todo list.",
              items: {
                type: "object",
                properties: {
                  id: {
                    type: "string",
                    description: "Short stable identifier such as step1 or inspect-tree.",
                  },
                  text: {
                    type: "string",
                    description: "A concise description of the task step.",
                  },
                  status: {
                    type: "string",
                    enum: ["pending", "in_progress", "completed"],
                    description: "Current status for this step.",
                  },
                },
                required: ["id", "text", "status"],
                additionalProperties: false,
              },
            },
          },
          required: ["items"],
          additionalProperties: false,
        },
      },
    },
    async execute(rawArgs: string) {
      const args = parseToolArguments(rawArgs);
      return todoManager.update(args.items);
    },
  };
}
