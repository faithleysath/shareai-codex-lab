import type { ChatCompletionTool } from "openai/resources/chat/completions/completions";

import { createDirectoryTool, DIRECTORY_TOOL_NAME } from "./directory-tool";
import { createReadFileTool, READ_FILE_TOOL_NAME } from "./read-file-tool";

export type ToolHandler = (rawArgs: string) => Promise<unknown>;

export interface ToolRegistry {
  definitions: ChatCompletionTool[];
  handlers: Record<string, ToolHandler>;
  toolNames: string[];
}

export function createToolRegistry(rootPath: string): ToolRegistry {
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
