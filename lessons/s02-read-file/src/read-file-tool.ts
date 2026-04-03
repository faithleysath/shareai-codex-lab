import type { ChatCompletionTool } from "openai/resources/chat/completions/completions";
import { lstat } from "node:fs/promises";
import { resolve } from "node:path";

import { normalizeRelativePath, readOptionalRelativePath, resolveInsideRoot } from "./path-safety";

export const READ_FILE_TOOL_NAME = "read_file";

export interface ReadFileResult {
  root_path: string;
  requested_relative_path: string;
  requested_absolute_path: string;
  byte_count: number;
  line_count: number;
  content: string;
  note: string;
}

interface ReadFileArgs {
  relative_path?: string;
}

function parseToolArguments(rawArgs: string): ReadFileArgs {
  return {
    relative_path: readOptionalRelativePath(rawArgs),
  };
}

function countLines(content: string): number {
  if (content === "") {
    return 0;
  }

  return content.split(/\r?\n/).length;
}

export function createReadFileTool(rootPath: string): {
  definition: ChatCompletionTool;
  execute: (rawArgs: string) => Promise<ReadFileResult>;
} {
  const fixedRootPath = resolve(rootPath);

  return {
    definition: {
      type: "function",
      function: {
        name: READ_FILE_TOOL_NAME,
        description:
          "Read the full text content of a file inside the fixed root path. Use this only after you have discovered a concrete file path.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            relative_path: {
              type: "string",
              description:
                'Path relative to the fixed root. Example values: "README.md", "src/index.ts", "src/lib/walk.ts".',
            },
          },
          required: ["relative_path"],
          additionalProperties: false,
        },
      },
    },
    async execute(rawArgs: string): Promise<ReadFileResult> {
      const args = parseToolArguments(rawArgs);
      const requestedRelativePath = normalizeRelativePath(args.relative_path);
      const requestedAbsolutePath = resolveInsideRoot(fixedRootPath, requestedRelativePath);
      const stats = await lstat(requestedAbsolutePath);

      if (!stats.isFile()) {
        throw new Error(`The requested path is not a regular file: ${requestedRelativePath}`);
      }

      const file = Bun.file(requestedAbsolutePath);
      const content = await file.text();

      return {
        root_path: fixedRootPath,
        requested_relative_path: requestedRelativePath,
        requested_absolute_path: requestedAbsolutePath,
        byte_count: file.size,
        line_count: countLines(content),
        content,
        note: "This tool returns the full text of exactly one file inside the fixed root.",
      };
    },
  };
}
