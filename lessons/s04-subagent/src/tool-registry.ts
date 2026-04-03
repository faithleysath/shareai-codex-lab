import type { ChatCompletionTool } from "openai/resources/chat/completions/completions";

import { createDirectoryTool, DIRECTORY_TOOL_NAME } from "./directory-tool";
import { createReadFileTool, READ_FILE_TOOL_NAME } from "./read-file-tool";
import { createTaskTool, TASK_TOOL_NAME } from "./task-tool";

export type ToolHandler = (rawArgs: string) => Promise<unknown>;

export interface ToolRegistry {
  definitions: ChatCompletionTool[];
  handlers: Record<string, ToolHandler>;
  toolNames: string[];
}

export { TASK_TOOL_NAME };

export function createBaseToolRegistry(rootPath: string): ToolRegistry {
  const directoryTool = createDirectoryTool(rootPath);
  const readFileTool = createReadFileTool(rootPath);

  return {
    definitions: [directoryTool.definition, readFileTool.definition],
    handlers: {
      [DIRECTORY_TOOL_NAME]: directoryTool.execute,
      [READ_FILE_TOOL_NAME]: readFileTool.execute,
    },
    toolNames: [DIRECTORY_TOOL_NAME, READ_FILE_TOOL_NAME],
  };
}

export function createParentToolRegistry(
  rootPath: string,
  delegateTask: (prompt: string) => Promise<{
    subagent_label: string;
    rounds: number;
    tool_calls: number;
    final_report: string;
  }>,
): ToolRegistry {
  const taskTool = createTaskTool(delegateTask);
  const baseRegistry = createBaseToolRegistry(rootPath);

  return {
    definitions: [taskTool.definition, ...baseRegistry.definitions],
    handlers: {
      [TASK_TOOL_NAME]: taskTool.execute,
      ...baseRegistry.handlers,
    },
    toolNames: [TASK_TOOL_NAME, ...baseRegistry.toolNames],
  };
}
