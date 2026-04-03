import OpenAI from "openai";
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions/completions";

import {
  formatAssistantContent,
  formatMessageRoleSummary,
  formatToolResultPreview,
  logAssistantMessage,
  logDispatchLookup,
  logResponseMeta,
  logRoundStart,
  logToolCall,
  logToolResult,
  logTransition,
} from "./pretty";
import type { ToolRegistry } from "./tool-registry";

export interface AgentLoopResult {
  finalAnswer: string;
  totalToolCalls: number;
  rounds: number;
}

interface RunAgentLoopOptions {
  agentLabel: string;
  client: OpenAI;
  model: string;
  messages: ChatCompletionMessageParam[];
  toolRegistry: ToolRegistry;
  maxRounds: number;
  firstRoundTools?: ToolRegistry["definitions"];
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
  agentLabel: string,
  toolRegistry: ToolRegistry,
  toolCall: ChatCompletionMessageToolCall,
): Promise<string> {
  if (toolCall.type !== "function") {
    const unsupported = safeJsonStringify({
      error: `Unsupported tool type: ${toolCall.type}`,
    });
    logToolCall(agentLabel, toolCall.type, "(custom tool arguments are not handled in this lesson)", unsupported);
    return unsupported;
  }

  logToolCall(agentLabel, toolCall.function.name, toolCall.function.arguments);
  logDispatchLookup(agentLabel, toolCall.function.name, toolRegistry.toolNames.includes(toolCall.function.name));

  const handler = toolRegistry.handlers[toolCall.function.name];
  if (!handler) {
    const unknownTool = safeJsonStringify({
      error: `Unknown tool: ${toolCall.function.name}`,
    });
    logToolResult(agentLabel, summarizeToolOutcome(unknownTool));
    return unknownTool;
  }

  try {
    const result = await handler(toolCall.function.arguments);
    const resultText = safeJsonStringify(result);
    logToolResult(agentLabel, formatToolResultPreview(result));
    return resultText;
  } catch (error) {
    const failure = safeJsonStringify({
      error: error instanceof Error ? error.message : String(error),
    });
    logToolResult(agentLabel, summarizeToolOutcome(failure));
    return failure;
  }
}

export async function runAgentLoop({
  agentLabel,
  client,
  model,
  messages,
  toolRegistry,
  maxRounds,
  firstRoundTools,
}: RunAgentLoopOptions): Promise<AgentLoopResult> {
  let totalToolCalls = 0;

  for (let round = 1; round <= maxRounds; round += 1) {
    const toolsForThisRound = round === 1 && firstRoundTools ? firstRoundTools : toolRegistry.definitions;

    logRoundStart(agentLabel, round, formatMessageRoleSummary(messages));

    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      tool_choice: round === 1 ? "required" : "auto",
      parallel_tool_calls: false,
      messages,
      tools: toolsForThisRound,
    });

    const choice = completion.choices[0];
    if (!choice) {
      throw new Error("The model returned no choices.");
    }

    const assistantMessage = choice.message;
    logResponseMeta(agentLabel, {
      requestId: completion._request_id ?? null,
      finishReason: choice.finish_reason ?? null,
      usage: completion.usage ?? null,
      preview: formatAssistantContent(assistantMessage),
    });

    messages.push(completionToAssistantMessage(assistantMessage));

    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      logAssistantMessage(
        agentLabel,
        "Assistant requested local tool execution, so we append the assistant tool_calls message and execute each tool call in-process.",
      );

      for (const toolCall of assistantMessage.tool_calls) {
        totalToolCalls += 1;
        const toolResultText = await executeToolCall(agentLabel, toolRegistry, toolCall);
        messages.push(buildToolMessage(toolCall.id, toolResultText));
        logTransition(
          agentLabel,
          "Tool result appended as a `tool` message. The next round will include both the assistant's tool request and our tool output.",
        );
      }

      continue;
    }

    return {
      finalAnswer: getFinalAnswer(assistantMessage),
      totalToolCalls,
      rounds: round,
    };
  }

  throw new Error(`Reached the round limit (${maxRounds}) before the model finished.`);
}
