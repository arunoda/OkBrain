import { createOpenAI } from '@ai-sdk/openai';
import { streamText, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { AIProvider, AIMessage, AIStreamChunk, AIGenerateOptions } from "../types";
import { StreamSanitizer, generateChatTitle } from "../utils";
import { allTools, executeTool, getToolStatusMessage } from "../tools";
import { runWithToolContext } from "../tools/context";
import {
  buildResponseModeInstruction,
  buildTimeContext,
  buildCitationRuleReminder,
  buildPrefixReminder
} from "../system-prompts";

// Pricing per 1M tokens (USD)
const XAI_PRICING: Record<string, { input: number; cachedInput: number; output: number }> = {
  'fast':    { input: 0.20, cachedInput: 0.05, output: 0.50 },
  'grok-4':  { input: 3.00, cachedInput: 0.75, output: 15.00 },
  'grok-3':  { input: 3.00, cachedInput: 0.75, output: 15.00 },
  'mini':    { input: 0.30, cachedInput: 0.07, output: 0.50 },
};

function getXAIPricing(modelName: string) {
  if (modelName.includes('mini')) return XAI_PRICING['mini'];
  if (modelName.includes('fast')) return XAI_PRICING['fast'];
  if (modelName.includes('grok-4')) return XAI_PRICING['grok-4'];
  return XAI_PRICING['grok-3'];
}

export function logXAIUsage(label: string, usage: any, modelName: string) {
  const pricing = getXAIPricing(modelName);
  const input = usage.inputTokens || 0;
  const cached = usage.cachedInputTokens || 0;
  const output = usage.outputTokens || 0;
  const reasoning = usage.reasoningTokens || 0;

  // cached can exceed input (xAI reports full cache size, not just the overlap)
  const effectiveCached = Math.min(cached, input);
  const uncached = input - effectiveCached;

  const inputCost = (uncached * pricing.input + effectiveCached * pricing.cachedInput) / 1_000_000;
  const outputCost = (output * pricing.output) / 1_000_000;
  const reasoningCost = (reasoning * pricing.output) / 1_000_000;
  const totalCost = inputCost + outputCost + reasoningCost;

  console.log(`[${label} Cost] model=${modelName} prompt=${input} cached=${effectiveCached} output=${output} reasoning=${reasoning} cost=$${totalCost.toFixed(6)} (in=$${inputCost.toFixed(6)} out=$${outputCost.toFixed(6)} reason=$${reasoningCost.toFixed(6)})`);
}

export class XAIProvider implements AIProvider {
  name: string;
  private apiKey: string;
  private modelName: string;

  constructor(apiKey: string, modelName: string = "grok-4-1-fast-non-reasoning", displayName?: string) {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.name = displayName || "Grok 4.1 Fast";
  }

  getModelName(): string {
    return this.name;
  }

  /**
   * Build custom tools for Vercel AI SDK using Zod schemas
   */
  private buildCustomTools(options?: AIGenerateOptions): Record<string, any> {
    const customTools: Record<string, any> = {};

    for (const t of allTools) {
      const def = t.definition;
      const toolName = def.name;

      // Build Zod schema from our definition
      const zodSchema = this.buildZodSchemaFromDef(def.parameters);

      customTools[toolName] = tool({
        description: def.description,
        inputSchema: zodSchema,
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

  /**
   * Build a Zod schema from our parameter definition
   */
  private buildZodSchemaFromDef(params: any): z.ZodObject<any> {
    const shape: Record<string, z.ZodTypeAny> = {};

    if (params.properties) {
      for (const [key, value] of Object.entries(params.properties)) {
        let fieldSchema = this.paramToZod(value as any);
        const isRequired = params.required?.includes(key);
        shape[key] = isRequired ? fieldSchema : fieldSchema.optional();
      }
    }

    return z.object(shape);
  }

  /**
   * Convert a single parameter to Zod type
   */
  private paramToZod(param: any): z.ZodTypeAny {
    const type = param.type?.toUpperCase() || 'STRING';

    switch (type) {
      case 'STRING':
        return param.description ? z.string().describe(param.description) : z.string();
      case 'NUMBER':
        return param.description ? z.number().describe(param.description) : z.number();
      case 'INTEGER':
        return param.description ? z.number().int().describe(param.description) : z.number().int();
      case 'BOOLEAN':
        return param.description ? z.boolean().describe(param.description) : z.boolean();
      case 'OBJECT':
        if (param.properties) {
          const nestedShape: Record<string, z.ZodTypeAny> = {};
          for (const [key, value] of Object.entries(param.properties)) {
            let fieldSchema = this.paramToZod(value as any);
            const isRequired = param.required?.includes(key);
            nestedShape[key] = isRequired ? fieldSchema : fieldSchema.optional();
          }
          const objSchema = z.object(nestedShape);
          return param.description ? objSchema.describe(param.description) : objSchema;
        }
        return z.object({});
      case 'ARRAY':
        if (param.items) {
          return z.array(this.paramToZod(param.items));
        }
        return z.array(z.any());
      default:
        if (param.enum) {
          return z.enum(param.enum as [string, ...string[]]);
        }
        return z.any();
    }
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
        introText: "You are Grok, an AI assistant created by xAI.",
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

    // Build messages array with system message
    const messagesWithSystem = [
      { role: 'system' as const, content: systemPrompt },
      ...convertedMessages
    ];

    try {
      // Configure OpenAI-compatible provider pointing to xAI
      const xaiProvider = createOpenAI({
        baseURL: 'https://api.x.ai/v1',
        apiKey: this.apiKey,
      });

      // Build custom tools
      const customTools = this.buildCustomTools(options);

      const streamConfig: any = {
        model: xaiProvider.chat(this.modelName),  // Explicitly use chat completions endpoint
        messages: messagesWithSystem,
        stopWhen: stepCountIs(5), // Allow multiple tool calls
        tools: customTools,
      };

      const result = streamText(streamConfig);

      const sanitizer = new StreamSanitizer(this.name);

      try {
        for await (const chunk of result.fullStream) {
          if (options?.signal?.aborted) {
            console.log("XAI stream aborted by signal");
            return;
          }

          if (chunk.type === 'text-delta') {
            const sanitizedText = sanitizer.process(chunk.text);
            if (sanitizedText) {
              await onChunk({ text: sanitizedText, done: false });
            }
          } else if (chunk.type === 'tool-call') {
            await onChunk({ text: '', status: getToolStatusMessage(chunk.toolName), done: false });
          }
        }
      } catch (streamError: any) {
        // Specifically handle "at capacity" errors which are common
        if (streamError.message?.toLowerCase().includes("at capacity") ||
          JSON.stringify(streamError).toLowerCase().includes("at capacity")) {
          throw new Error("Grok is currently at capacity. Please try again in a few minutes.");
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
        logXAIUsage('XAI', usage, this.modelName);
      }

      await onChunk({
        text: "",
        done: true,
      });
    } catch (error: any) {
      // If it's already our friendly error, rethrow it
      if (error.message && (error.message.includes("at capacity") || error.message.includes("Grok is currently"))) {
        throw error;
      }

      console.error("XAI API error details:", error);

      // Attempt to extract a cleaner message if it's a validation error
      let cleanMessage = error.message || "Unknown error";
      if (error.name === 'AI_TypeValidationError' && error.value?.error) {
        cleanMessage = error.value.error;
      } else if (JSON.stringify(error).toLowerCase().includes("at capacity")) {
        cleanMessage = "Grok is currently at capacity. Please try again soon.";
      }

      throw new Error(`XAI generation failed: ${cleanMessage}`);
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

      // Handle images - OpenAI format
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
