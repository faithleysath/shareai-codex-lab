import type { ChatCompletionTool } from "openai/resources/chat/completions/completions";
import { readdir } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";

type DirectoryEntryKind = "directory" | "file" | "symlink" | "other";
export const DIRECTORY_TOOL_NAME = "list_directory";

export interface DirectoryEntry {
  name: string;
  kind: DirectoryEntryKind;
  relative_path: string;
  display_name: string;
}

export interface ListDirectoryResult {
  root_path: string;
  requested_relative_path: string;
  requested_absolute_path: string;
  entries: DirectoryEntry[];
  immediate_tree: string;
  note: string;
}

interface ListDirectoryArgs {
  relative_path?: string;
}

function normalizeRelativePath(input?: string): string {
  if (!input || input.trim() === "") {
    return ".";
  }

  return input.trim();
}

function ensurePlainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Tool arguments must be a JSON object.");
  }

  return value as Record<string, unknown>;
}

function parseToolArguments(rawArgs: string): ListDirectoryArgs {
  const parsed = JSON.parse(rawArgs) as unknown;
  const value = ensurePlainObject(parsed);

  if (value.relative_path !== undefined && typeof value.relative_path !== "string") {
    throw new Error("`relative_path` must be a string when provided.");
  }

  return {
    relative_path: value.relative_path,
  };
}

function resolveInsideRoot(rootPath: string, requestedRelativePath: string): string {
  const absolutePath = resolve(rootPath, requestedRelativePath);
  const relativeFromRoot = relative(rootPath, absolutePath);

  if (
    relativeFromRoot.startsWith("..") ||
    relativeFromRoot.includes(`${"/"}..${"/"}`) ||
    isAbsolute(relativeFromRoot)
  ) {
    throw new Error(
      `Path escape blocked. The requested path must stay inside the fixed root: ${requestedRelativePath}`,
    );
  }

  return absolutePath;
}

function entryKindFromDirent(dirent: { isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean }): DirectoryEntryKind {
  if (dirent.isDirectory()) {
    return "directory";
  }

  if (dirent.isFile()) {
    return "file";
  }

  if (dirent.isSymbolicLink()) {
    return "symlink";
  }

  return "other";
}

function displayNameForEntry(name: string, kind: DirectoryEntryKind): string {
  if (kind === "directory") {
    return `${name}/`;
  }

  if (kind === "symlink") {
    return `${name}@`;
  }

  return name;
}

function compareEntries(a: DirectoryEntry, b: DirectoryEntry): number {
  const rank = (kind: DirectoryEntryKind): number => {
    if (kind === "directory") {
      return 0;
    }

    if (kind === "file") {
      return 1;
    }

    if (kind === "symlink") {
      return 2;
    }

    return 3;
  };

  const rankDiff = rank(a.kind) - rank(b.kind);
  if (rankDiff !== 0) {
    return rankDiff;
  }

  return a.name.localeCompare(b.name);
}

function buildImmediateTree(label: string, entries: DirectoryEntry[]): string {
  if (entries.length === 0) {
    return `${label}\n└── (empty)`;
  }

  const lines = [label];

  for (const [index, entry] of entries.entries()) {
    const branch = index === entries.length - 1 ? "└──" : "├──";
    lines.push(`${branch} ${entry.display_name}`);
  }

  return lines.join("\n");
}

export function formatToolResultPreview(result: unknown): string {
  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    typeof (result as { immediate_tree?: unknown }).immediate_tree !== "string"
  ) {
    return JSON.stringify(result, null, 2);
  }

  const typed = result as ListDirectoryResult;
  return [
    `requested_relative_path: ${typed.requested_relative_path}`,
    `entries: ${typed.entries.length}`,
    typed.immediate_tree,
  ].join("\n");
}

export function createDirectoryTool(rootPath: string): {
  definition: ChatCompletionTool;
  execute: (rawArgs: string) => Promise<ListDirectoryResult>;
} {
  const fixedRootPath = resolve(rootPath);

  return {
    definition: {
      type: "function",
      function: {
        name: DIRECTORY_TOOL_NAME,
        description:
          "List the immediate children of a directory inside the fixed root path. Use repeated calls on subdirectories to build a full tree.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            relative_path: {
              type: "string",
              description:
                'Path relative to the fixed root. Use "." for the root itself. Example values: ".", "src", "src/lib".',
            },
          },
          additionalProperties: false,
        },
      },
    },
    async execute(rawArgs: string): Promise<ListDirectoryResult> {
      const args = parseToolArguments(rawArgs);
      const requestedRelativePath = normalizeRelativePath(args.relative_path);
      const requestedAbsolutePath = resolveInsideRoot(fixedRootPath, requestedRelativePath);
      const dirents = await readdir(requestedAbsolutePath, { withFileTypes: true });

      const entries = dirents
        .map((dirent) => {
          const kind = entryKindFromDirent(dirent);
          const normalizedRelativePath =
            requestedRelativePath === "."
              ? dirent.name
              : `${requestedRelativePath}/${dirent.name}`;

          return {
            name: dirent.name,
            kind,
            relative_path: normalizedRelativePath,
            display_name: displayNameForEntry(dirent.name, kind),
          } satisfies DirectoryEntry;
        })
        .sort(compareEntries);

      const treeLabel =
        requestedRelativePath === "." ? basename(fixedRootPath) || fixedRootPath : requestedRelativePath;

      return {
        root_path: fixedRootPath,
        requested_relative_path: requestedRelativePath,
        requested_absolute_path: requestedAbsolutePath,
        entries,
        immediate_tree: buildImmediateTree(treeLabel, entries),
        note:
          "This result only contains one directory level. Call list_directory again on directory entries if you need deeper contents.",
      };
    },
  };
}
