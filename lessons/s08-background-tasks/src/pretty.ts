import type { ChatCompletionMessageParam } from "openai/resources/chat/completions/completions";

import type { BackgroundTaskNotification } from "./background-manager";

const ANSI = {
  reset: "\u001B[0m",
  bold: "\u001B[1m",
  dim: "\u001B[2m",
  cyan: "\u001B[36m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  magenta: "\u001B[35m",
  red: "\u001B[31m",
  blue: "\u001B[34m",
  gray: "\u001B[90m",
} as const;

const colorEnabled = Boolean(process.stdout.isTTY);

function paint(text: string, ...codes: string[]): string {
  if (!colorEnabled) {
    return text;
  }

  return `${codes.join("")}${text}${ANSI.reset}`;
}

function line(char = "=", width = 72): string {
  return char.repeat(width);
}

function printBlock(label: string, body: string, color: string): void {
  console.log(paint(`\n${label}`, ANSI.bold, color));
  console.log(body);
}

function indent(text: string, prefix = "  "): string {
  return text
    .split("\n")
    .map((lineValue) => `${prefix}${lineValue}`)
    .join("\n");
}

export function formatMessageRoleSummary(messages: ChatCompletionMessageParam[]): string {
  const counts = new Map<string, number>();

  for (const message of messages) {
    counts.set(message.role, (counts.get(message.role) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([role, count]) => `${role}:${count}`)
    .join(" | ");
}

export function formatAssistantContent(message: {
  content?: string | null;
  refusal?: string | null;
  tool_calls?: Array<unknown>;
}): string {
  const parts: string[] = [];

  if (message.content && message.content.trim() !== "") {
    parts.push(message.content.trim());
  }

  if (message.refusal && message.refusal.trim() !== "") {
    parts.push(`refusal: ${message.refusal.trim()}`);
  }

  if (message.tool_calls && message.tool_calls.length > 0) {
    parts.push(`tool_calls: ${message.tool_calls.length}`);
  }

  return parts.join("\n") || "(empty assistant message)";
}

export function formatToolResultPreview(result: unknown): string {
  if (
    result &&
    typeof result === "object" &&
    !Array.isArray(result) &&
    typeof (result as { task_id?: unknown }).task_id === "string" &&
    typeof (result as { status?: unknown }).status === "string"
  ) {
    const typed = result as {
      task_id: string;
      tool_name?: string;
      status: string;
      requested_n?: number;
      artificial_delay_ms?: number;
      pending_task_count?: number;
      note?: string;
    };

    return [
      `task_id: ${typed.task_id}`,
      `tool_name: ${typed.tool_name ?? "(unknown)"}`,
      `status: ${typed.status}`,
      `requested_n: ${typed.requested_n ?? "(unknown)"}`,
      `artificial_delay_ms: ${typed.artificial_delay_ms ?? "(unknown)"}`,
      `pending_task_count: ${typed.pending_task_count ?? "(unknown)"}`,
      typed.note ?? "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return JSON.stringify(result, null, 2);
}

export function formatBackgroundNotifications(notifications: BackgroundTaskNotification[]): string {
  return notifications
    .map((notification) =>
      [
        `[task:${notification.task_id}]`,
        `tool=${notification.tool_name}`,
        `status=${notification.status}`,
        `duration_ms=${notification.duration_ms}`,
        `summary=${notification.summary}`,
        "payload:",
        indent(JSON.stringify(notification.payload, null, 2)),
      ].join("\n"),
    )
    .join("\n\n");
}

export function buildBackgroundResultsMessage(notifications: BackgroundTaskNotification[]): string {
  return [
    "<background-results>",
    formatBackgroundNotifications(notifications),
    "</background-results>",
  ].join("\n");
}

export function logBanner(info: {
  title: string;
  model: string;
  baseURL: string;
  userPrompt: string;
  artificialDelayMs: number;
}): void {
  console.log(paint(line(), ANSI.bold, ANSI.blue));
  console.log(paint(info.title, ANSI.bold, ANSI.blue));
  console.log(paint(line(), ANSI.bold, ANSI.blue));
  console.log(`${paint("model", ANSI.bold)}       ${info.model}`);
  console.log(`${paint("baseURL", ANSI.bold)}     ${info.baseURL}`);
  console.log(`${paint("delay", ANSI.bold)}       ${info.artificialDelayMs} ms per background task`);
  console.log(`${paint("userPrompt", ANSI.bold)}  ${info.userPrompt}`);
}

export function logLoopPrimer(): void {
  printBlock(
    "Loop Primer",
    [
      "1. Send the message history plus two async math tool schemas to the model.",
      "2. Each tool starts a background task and immediately returns a task receipt.",
      "3. The real work happens later inside the BackgroundTaskManager, not inside the tool call itself.",
      "4. Before each new model turn, the loop drains the manager's notification queue.",
      "5. Drained notifications are appended to messages as new synthetic context.",
      "6. The model sees those injected background results and can continue with fresh data.",
    ].join("\n"),
    ANSI.cyan,
  );
}

export function logDispatchMap(toolNames: string[]): void {
  printBlock(
    "Dispatch Map",
    toolNames.map((toolName) => `handlers["${toolName}"] -> local TypeScript function`).join("\n"),
    ANSI.cyan,
  );
}

export function logNote(message: string): void {
  console.log(paint(`\n[note] ${message}`, ANSI.dim, ANSI.gray));
}

export function logRoundStart(round: number, messageSummary: string): void {
  printBlock(
    `Round ${round}`,
    [`message stack: ${messageSummary}`, "sending chat.completions.create(...)"].join("\n"),
    ANSI.magenta,
  );
}

export function logResponseMeta(info: {
  requestId: string | null;
  finishReason: string | null;
  usage:
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      }
    | null;
  preview: string;
}): void {
  const usageLines =
    info.usage === null
      ? "usage: (not provided)"
      : `usage: prompt=${info.usage.prompt_tokens ?? "?"}, completion=${info.usage.completion_tokens ?? "?"}, total=${info.usage.total_tokens ?? "?"}`;

  printBlock(
    "Model Response",
    [
      `request id: ${info.requestId ?? "(not provided)"}`,
      `finish reason: ${info.finishReason ?? "(not provided)"}`,
      usageLines,
      "assistant preview:",
      indent(info.preview),
    ].join("\n"),
    ANSI.green,
  );
}

export function logAssistantMessage(message: string): void {
  console.log(paint(`\n[assistant] ${message}`, ANSI.bold, ANSI.green));
}

export function logToolCall(name: string, rawArguments: string, immediateNote?: string): void {
  const body = [`tool: ${name}`, "raw arguments:", indent(rawArguments)];

  if (immediateNote) {
    body.push("note:", indent(immediateNote));
  }

  printBlock("Tool Call", body.join("\n"), ANSI.yellow);
}

export function logDispatchLookup(toolName: string, found: boolean): void {
  const status = found ? "hit" : "miss";
  const message = `dispatch lookup: handlers["${toolName}"] -> ${status}`;
  console.log(paint(`\n[dispatch] ${message}`, ANSI.dim, ANSI.gray));
}

export function logToolResult(preview: string): void {
  printBlock("Tool Result", indent(preview, ""), ANSI.yellow);
}

export function logWaitingForBackground(pendingTaskCount: number): void {
  console.log(
    paint(
      `\n[background] No notifications yet. Waiting for background tasks to finish. pending=${pendingTaskCount}`,
      ANSI.dim,
      ANSI.gray,
    ),
  );
}

export function logNotificationInjection(notifications: BackgroundTaskNotification[]): void {
  printBlock(
    "Background Notifications",
    buildBackgroundResultsMessage(notifications),
    ANSI.yellow,
  );
}

export function logTransition(message: string): void {
  console.log(paint(`\n[transition] ${message}`, ANSI.dim, ANSI.gray));
}

export function logFinalAnswer(answer: string, toolCalls: number): void {
  printBlock(
    "Final Answer",
    [`tool calls used: ${toolCalls}`, answer].join("\n\n"),
    ANSI.bold,
  );
}

export function logError(message: string): void {
  printBlock("Error", message, ANSI.red);
}
