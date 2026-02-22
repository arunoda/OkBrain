import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, tool, stepCountIs } from 'ai';
import { AIProvider, AIMessage, AIStreamChunk, AIGenerateOptions } from "../types";
import { StreamSanitizer, generateChatTitle } from "../utils";
import { allTools, executeTool, getToolStatusMessage } from "../tools";
import { buildZodSchema } from "../tools/formatters";
import { runWithToolContext } from "../tools/context";
import {
  buildResponseModeInstruction,
  buildTimeContext,
  buildCitationRuleReminder,
  buildPrefixReminder
} from "../system-prompts";

// Pricing per 1M tokens (USD)
const ANTHROPIC_PRICING: Record<string, { input: number; cachedInput: number; output: number }> = {
  'haiku': { input: 0.80, cachedInput: 0.08, output: 4.00 },
  'sonnet': { input: 3.00, cachedInput: 0.30, output: 15.00 },
};

function getAnthropicPricing(modelName: string) {
  if (modelName.includes('haiku')) return ANTHROPIC_PRICING['haiku'];
  if (modelName.includes('sonnet')) return ANTHROPIC_PRICING['sonnet'];
  return ANTHROPIC_PRICING['sonnet']; // Default to sonnet
}

export function logAnthropicUsage(label: string, usage: any, modelName: string) {
  const pricing = getAnthropicPricing(modelName);
  const input = usage.inputTokens || 0;
  const cached = usage.cachedInputTokens || 0;
  const output = usage.outputTokens || 0;
  // Note: Anthropic includes thinking tokens in outputTokens (no separate field)

  const effectiveCached = Math.min(cached, input);
  const uncached = input - effectiveCached;

  const inputCost = (uncached * pricing.input + effectiveCached * pricing.cachedInput) / 1_000_000;
  const outputCost = (output * pricing.output) / 1_000_000;
  const totalCost = inputCost + outputCost;

  console.log(`[${label} Cost] model=${modelName} prompt=${input} cached=${effectiveCached} output=${output} cost=$${totalCost.toFixed(6)} (in=$${inputCost.toFixed(6)} out=$${outputCost.toFixed(6)})`);
}

export class AnthropicProvider implements AIProvider {
  name: string;
  private apiKey: string;
  private modelName: string;

  constructor(apiKey: string, modelName: string = "claude-haiku-4-5-20251001", displayName?: string) {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.name = displayName || "Claude Haiku 4.5";
  }

  getModelName(): string {
    return this.name;
  }

  /**
   * Build custom tools for Vercel AI SDK using shared Zod schema builder
   */
  private buildCustomTools(options?: AIGenerateOptions): Record<string, any> {
    const customTools: Record<string, any> = {};

    for (const t of allTools) {
      const def = t.definition;
      const toolName = def.name;

      customTools[toolName] = tool({
        description: def.description,
        inputSchema: buildZodSchema(def),
        execute: async (args) => {
          return await runWithToolContext(
            { userId: options?.userId },
            () => executeTool(toolName, args)
          );
        }
      });
    }

    return customTools;
  }

  async generateStream(
    messages: AIMessage[],
    onChunk: (chunk: AIStreamChunk) => void,
    options?: AIGenerateOptions
  ): Promise<void> {
    // Build system prompt using centralized function
    let systemPrompt = buildResponseModeInstruction(
      options?.mode,
      this.name,
      {
        introText: "You are Claude, an AI assistant created by Anthropic.",
      }
    );

    // Check if we have internet_search tool available and append citation rules
    const hasInternetSearch = allTools.some(t => t.definition.name === 'internet_search');

    if (hasInternetSearch) {
      systemPrompt += buildCitationRuleReminder();
    }

    // Time context for injection into last user message
    const timeContext = buildTimeContext(options?.location);

    const convertedMessages = this.convertMessages(messages, timeContext);

    const cacheBreakpoint = { providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } } };

    // Build messages array with system message (cached)
    const messagesWithSystem: any[] = [
      { role: 'system' as const, content: systemPrompt, ...cacheBreakpoint },
      ...convertedMessages
    ];

    // Cache up to the last assistant message (everything before the current user turn)
    for (let i = messagesWithSystem.length - 1; i >= 0; i--) {
      if (messagesWithSystem[i].role === 'assistant') {
        messagesWithSystem[i] = { ...messagesWithSystem[i], ...cacheBreakpoint };
        break;
      }
    }

    try {
      // Configure Anthropic provider
      const anthropicProvider = createAnthropic({
        apiKey: this.apiKey,
      });

      // Build custom tools
      const customTools = this.buildCustomTools(options);

      const streamConfig: any = {
        model: anthropicProvider(this.modelName),
        messages: messagesWithSystem,
        stopWhen: stepCountIs(5), // Allow multiple tool calls
        tools: customTools,
        ...(options?.thinking ? {
          providerOptions: {
            anthropic: {
              thinking: { type: 'enabled', budgetTokens: 10000 },
            },
          },
        } : {}),
      };

      const result = streamText(streamConfig);

      const sanitizer = new StreamSanitizer(this.name);
      let allThoughts = '';

      try {
        for await (const chunk of result.fullStream) {
          if (options?.signal?.aborted) {
            console.log("Anthropic stream aborted by signal");
            return;
          }

          if (chunk.type === 'reasoning-delta') {
            allThoughts += chunk.text;
            await onChunk({ text: '', thought: chunk.text, done: false });
          } else if (chunk.type === 'text-delta') {
            const sanitizedText = sanitizer.process(chunk.text);
            if (sanitizedText) {
              await onChunk({ text: sanitizedText, done: false });
            }
          } else if (chunk.type === 'tool-call') {
            await onChunk({ text: '', status: getToolStatusMessage(chunk.toolName), done: false });
          }
        }
      } catch (streamError: any) {
        // Handle Anthropic-specific errors
        if (streamError.message?.toLowerCase().includes("overloaded")) {
          throw new Error("Claude is currently overloaded. Please try again in a few minutes.");
        }
        throw streamError;
      }

      // Flush sanitizer and send any remaining text
      const remainingText = sanitizer.flush();
      if (remainingText) {
        await onChunk({ text: remainingText, done: false });
      }

      // Log usage metadata
      const usage = await result.usage;
      if (usage) {
        logAnthropicUsage('Anthropic', usage, this.modelName);
      }

      await onChunk({
        text: "",
        done: true,
        ...(allThoughts ? { thought: allThoughts } : {}),
      });
    } catch (error: any) {
      // If it's already our friendly error, rethrow it
      if (error.message && error.message.includes("overloaded")) {
        throw error;
      }

      console.error("Anthropic API error details:", error);

      let cleanMessage = error.message || "Unknown error";
      if (error.name === 'AI_TypeValidationError' && error.value?.error) {
        cleanMessage = error.value.error;
      }

      throw new Error(`Anthropic generation failed: ${cleanMessage}`);
    }
  }

  async generateTitle(firstMessage: string): Promise<string> {
    return generateChatTitle(firstMessage);
  }

  private convertMessages(messages: AIMessage[], timeContext?: string): any[] {
    return messages.map((msg, index) => {
      let content = msg.content;
      if (msg.role === "assistant" && msg.model) {
        content = `[${msg.model}]: ${content}`;
      }

      // Inject time context and prefix reminder into the last user message (keeps history cacheable)
      if (index === messages.length - 1 && msg.role === "user") {
        if (timeContext) {
          content = `${content}\n\n[Context: ${timeContext}]`;
        }
        content = `${content}${buildPrefixReminder(this.name)}`;
      }

      // Handle images - OpenAI-compatible format (Vercel AI SDK normalizes across providers)
      if (msg.image) {
        return {
          role: msg.role,
          content: [
            { type: "text", text: content },
            {
              type: "image_url",
              image_url: {
                url: `data:${msg.image.mimeType};base64,${msg.image.base64}`
              }
            }
          ]
        };
      }

      return {
        role: msg.role,
        content: content
      };
    });
  }
}
