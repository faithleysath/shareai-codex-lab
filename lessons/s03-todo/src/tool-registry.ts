import type { ChatCompletionTool } from "openai/resources/chat/completions/completions";

import { createDirectoryTool, DIRECTORY_TOOL_NAME } from "./directory-tool";
import { createReadFileTool, READ_FILE_TOOL_NAME } from "./read-file-tool";
import { TodoManager } from "./todo-manager";
import { createTodoWriteTool, TODO_WRITE_TOOL_NAME } from "./todo-tool";

export type ToolHandler = (rawArgs: string) => Promise<unknown>;

export interface ToolRegistry {
  definitions: ChatCompletionTool[];
  handlers: Record<string, ToolHandler>;
  toolNames: string[];
  todoManager: TodoManager;
}

export { TODO_WRITE_TOOL_NAME };

export function createToolRegistry(rootPath: string): ToolRegistry {
  const todoManager = new TodoManager();
  const todoWriteTool = createTodoWriteTool(todoManager);
  const directoryTool = createDirectoryTool(rootPath);
  const readFileTool = createReadFileTool(rootPath);

  return {
    definitions: [todoWriteTool.definition, directoryTool.definition, readFileTool.definition],
    handlers: {
      [TODO_WRITE_TOOL_NAME]: todoWriteTool.execute,
      [DIRECTORY_TOOL_NAME]: directoryTool.execute,
      [READ_FILE_TOOL_NAME]: readFileTool.execute,
    },
    toolNames: [TODO_WRITE_TOOL_NAME, DIRECTORY_TOOL_NAME, READ_FILE_TOOL_NAME],
    todoManager,
  };
}
