import { Tool as GeminiTool, FunctionDeclaration } from "@google/genai";
import { z } from "zod";
import { ToolDefinition, Tool } from './types';

/**
 * Convert our canonical tool definitions to Gemini format
 */
export function toGeminiTools(tools: Tool[]): GeminiTool[] {
  const functionDeclarations: FunctionDeclaration[] = tools.map(t => ({
    name: t.definition.name,
    description: t.definition.description,
    parameters: t.definition.parameters as any
  }));

  return [{ functionDeclarations }];
}

/**
 * Convert our parameter schema to Zod schema for Vercel AI SDK
 * This is a simplified conversion - extend as needed for complex schemas
 */
function paramToZod(param: any): z.ZodTypeAny {
  const type = param.type?.toUpperCase() || 'STRING';

  switch (type) {
    case 'STRING':
      let schema: z.ZodTypeAny = z.string();
      if (param.enum) {
        schema = z.enum(param.enum as [string, ...string[]]);
      }
      if (param.description) {
        schema = schema.describe(param.description);
      }
      return schema;
    case 'NUMBER':
      return param.description ? z.number().describe(param.description) : z.number();
    case 'INTEGER':
      return param.description ? z.number().int().describe(param.description) : z.number().int();
    case 'BOOLEAN':
      return param.description ? z.boolean().describe(param.description) : z.boolean();
    case 'OBJECT':
      if (param.properties) {
        const shape: Record<string, z.ZodTypeAny> = {};
        for (const [key, value] of Object.entries(param.properties)) {
          const fieldSchema = paramToZod(value);
          // Make optional if not in required array
          shape[key] = param.required?.includes(key) ? fieldSchema : fieldSchema.optional();
        }
        let objSchema: z.ZodTypeAny = z.object(shape);
        if (param.description) {
          objSchema = objSchema.describe(param.description);
        }
        return objSchema;
      }
      return z.record(z.string(), z.any());
    case 'ARRAY':
      if (param.items) {
        return z.array(paramToZod(param.items));
      }
      return z.array(z.any());
    default:
      return z.any();
  }
}

/**
 * Build a Zod schema from our tool definition's parameters
 * This can be used with Vercel AI SDK's tool() function
 */
export function buildZodSchema(def: ToolDefinition): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};

  if (def.parameters.properties) {
    for (const [key, value] of Object.entries(def.parameters.properties)) {
      let fieldSchema = paramToZod(value);
      // Ensure description is attached at the field level
      if ((value as any).description && !fieldSchema.description) {
        fieldSchema = fieldSchema.describe((value as any).description);
      }
      const isRequired = def.parameters.required?.includes(key);
      shape[key] = isRequired ? fieldSchema : fieldSchema.optional();
    }
  }

  return z.object(shape).describe(def.description);
}

/**
 * Convert tool definitions to OpenAI/XAI format (for raw HTTP calls)
 */
export function toOpenAIToolDefinitions(tools: Tool[]): any[] {
  return tools.map(t => ({
    type: "function",
    function: {
      name: t.definition.name,
      description: t.definition.description,
      parameters: {
        type: "object",
        properties: convertPropertiesToJsonSchema(t.definition.parameters.properties),
        required: t.definition.parameters.required || []
      }
    }
  }));
}

/**
 * Convert our parameter format to JSON Schema format (lowercase types)
 */
function convertPropertiesToJsonSchema(properties: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(properties)) {
    result[key] = convertPropertyToJsonSchema(value);
  }

  return result;
}

function convertPropertyToJsonSchema(prop: any): any {
  const type = prop.type?.toLowerCase() || 'string';
  const result: any = { type };

  if (prop.description) result.description = prop.description;
  if (prop.enum) result.enum = prop.enum;

  if (type === 'object' && prop.properties) {
    result.properties = convertPropertiesToJsonSchema(prop.properties);
    if (prop.required) result.required = prop.required;
  }

  if (type === 'array' && prop.items) {
    result.items = convertPropertyToJsonSchema(prop.items);
  }

  return result;
}
