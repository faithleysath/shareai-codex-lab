import OpenAI from "openai";
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions/completions";

import { loadLessonEnv } from "./src/env";
import {
  formatAssistantContent,
  formatMessageRoleSummary,
  formatToolResultPreview,
  logAssistantMessage,
  logBanner,
  logDispatchLookup,
  logDispatchMap,
  logError,
  logFinalAnswer,
  logLoopPrimer,
  logNote,
  logResponseMeta,
  logRoundStart,
  logSkillIndex,
  logToolCall,
  logToolResult,
  logTransition,
} from "./src/pretty";
import { buildSkillIndexText, SKILLS } from "./src/skills";
import { createToolRegistry } from "./src/tool-registry";

const MAX_ROUNDS = 12;
const REQUEST_TIMEOUT_MS = 60_000;

const DEMO_PROMPTS = {
  fortune: "帮我算一下接下来三个月的事业运和感情运，想知道我应该主动一点还是先稳住节奏。",
  fishing: "我是钓鱼新手，最近想去河边钓鲫鱼，竿子、线组和饵料应该怎么配比较稳？",
  neutral: "请用一句话解释一下为什么教学 demo 里要尽量把能力拆成独立工具。",
} as const;

interface PromptSelection {
  label: string;
  prompt: string;
}

function buildSystemPrompt(): string {
  return [
    "You are a careful assistant in a skills-loading lesson.",
    "The full skill texts are NOT in your initial context.",
    "You only have a compact skill index plus one tool:",
    "1. load_skill: load the full content of one named skill.",
    "When the user's request clearly matches one of the listed skills, you must call load_skill before answering.",
    "When the request does not match any listed skill, answer directly without calling the tool.",
    "Do not pretend you already know the full skill content before loading it.",
    "After loading a skill, follow it for the current request.",
    "For teaching clarity, briefly mention whether you loaded a skill and why.",
    "Available skills:",
    buildSkillIndexText(),
  ].join("\n");
}

function parsePromptSelection(): PromptSelection {
  const args = Bun.argv.slice(2);

  if (args[0] === "--demo") {
    const demoName = args[1] as keyof typeof DEMO_PROMPTS | undefined;

    if (demoName && demoName in DEMO_PROMPTS) {
      return {
        label: demoName,
        prompt: DEMO_PROMPTS[demoName],
      };
    }
  }

  if (args.length > 0) {
    return {
      label: "custom",
      prompt: args.join(" ").trim(),
    };
  }

  return {
    label: "fortune",
    prompt: DEMO_PROMPTS.fortune,
  };
}

function completionToAssistantMessage(
  message: OpenAI.Chat.Completions.ChatCompletionMessage,
): ChatCompletionAssistantMessageParam {
  return {
    role: "assistant",
    content: message.content ?? null,
    refusal: message.refusal ?? null,
    tool_calls: message.tool_calls,
  };
}

function buildToolMessage(toolCallId: string, content: string): ChatCompletionToolMessageParam {
  return {
    role: "tool",
    tool_call_id: toolCallId,
    content,
  };
}

function safeJsonStringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function summarizeToolOutcome(resultText: string): string {
  try {
    const parsed = JSON.parse(resultText);
    return formatToolResultPreview(parsed);
  } catch {
    return resultText;
  }
}

function getFinalAnswer(message: OpenAI.Chat.Completions.ChatCompletionMessage): string {
  if (message.content && message.content.trim() !== "") {
    return message.content;
  }

  if (message.refusal && message.refusal.trim() !== "") {
    return message.refusal;
  }

  return "(The model ended without text content.)";
}

async function executeToolCall(
  toolRegistry: ReturnType<typeof createToolRegistry>,
  toolCall: ChatCompletionMessageToolCall,
): Promise<string> {
  if (toolCall.type !== "function") {
    const unsupported = safeJsonStringify({
      error: `Unsupported tool type: ${toolCall.type}`,
    });
    logToolCall(toolCall.type, "(custom tool arguments are not handled in this lesson)", unsupported);
    return unsupported;
  }

  logToolCall(toolCall.function.name, toolCall.function.arguments);
  logDispatchLookup(toolCall.function.name, toolRegistry.toolNames.includes(toolCall.function.name));

  const handler = toolRegistry.handlers[toolCall.function.name];
  if (!handler) {
    const unknownTool = safeJsonStringify({
      error: `Unknown tool: ${toolCall.function.name}`,
    });
    logToolResult(summarizeToolOutcome(unknownTool));
    return unknownTool;
  }

  try {
    const result = await handler(toolCall.function.arguments);
    const resultText = safeJsonStringify(result);
    logToolResult(formatToolResultPreview(result));
    return resultText;
  } catch (error) {
    const failure = safeJsonStringify({
      error: error instanceof Error ? error.message : String(error),
    });
    logToolResult(summarizeToolOutcome(failure));
    return failure;
  }
}

async function run(): Promise<void> {
  const env = loadLessonEnv();
  const promptSelection = parsePromptSelection();
  const toolRegistry = createToolRegistry();

  const client = new OpenAI({
    apiKey: env.apiKey,
    baseURL: env.baseURL,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });

  logBanner({
    title: "S05 Skills: Load the Right Skill on Demand",
    model: env.model,
    baseURL: env.baseURL,
    promptLabel: promptSelection.label,
    userPrompt: promptSelection.prompt,
  });
  logLoopPrimer();
  logSkillIndex(SKILLS);
  logDispatchMap(toolRegistry.toolNames);
  logNote(
    'Unlike s01-s04, this lesson starts with `tool_choice: "auto"`. Otherwise we would not be testing whether the model chooses to load a relevant skill by itself.',
  );

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: buildSystemPrompt(),
    },
    {
      role: "user",
      content: promptSelection.prompt,
    },
  ];

  let totalToolCalls = 0;

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    logRoundStart(round, formatMessageRoleSummary(messages));

    const completion = await client.chat.completions.create({
      model: env.model,
      temperature: 0,
      tool_choice: "auto",
      parallel_tool_calls: false,
      messages,
      tools: toolRegistry.definitions,
    });

    const choice = completion.choices[0];
    if (!choice) {
      throw new Error("The model returned no choices.");
    }

    const assistantMessage = choice.message;
    logResponseMeta({
      requestId: completion._request_id ?? null,
      finishReason: choice.finish_reason ?? null,
      usage: completion.usage ?? null,
      preview: formatAssistantContent(assistantMessage),
    });

    messages.push(completionToAssistantMessage(assistantMessage));

    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      logAssistantMessage(
        "Assistant requested local tool execution, so we append the assistant tool_calls message and execute the named skill loader in-process.",
      );

      for (const toolCall of assistantMessage.tool_calls) {
        totalToolCalls += 1;
        const toolResultText = await executeToolCall(toolRegistry, toolCall);
        const toolMessage = buildToolMessage(toolCall.id, toolResultText);

        messages.push(toolMessage);
        logTransition(
          "The full skill content is now appended as a `tool` message. The next round can answer with knowledge that was not present in the initial system prompt.",
        );
      }

      continue;
    }

    const finalAnswer = getFinalAnswer(assistantMessage);
    logFinalAnswer(finalAnswer, totalToolCalls);
    return;
  }

  throw new Error(`Reached the round limit (${MAX_ROUNDS}) before the model finished.`);
}

await run().catch((error) => {
  logError(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
