import { isAbsolute, relative, resolve } from "node:path";

export function ensurePlainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Tool arguments must be a JSON object.");
  }

  return value as Record<string, unknown>;
}

export function parseRawArgs(rawArgs: string): Record<string, unknown> {
  const parsed = JSON.parse(rawArgs) as unknown;
  return ensurePlainObject(parsed);
}

export function readOptionalRelativePath(rawArgs: string): string | undefined {
  const value = parseRawArgs(rawArgs);

  if (value.relative_path !== undefined && typeof value.relative_path !== "string") {
    throw new Error("`relative_path` must be a string when provided.");
  }

  return value.relative_path;
}

export function normalizeRelativePath(input?: string): string {
  if (!input || input.trim() === "") {
    return ".";
  }

  return input.trim();
}

export function resolveInsideRoot(rootPath: string, requestedRelativePath: string): string {
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
