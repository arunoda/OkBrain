/**
 * Common tool definition type - provider agnostic
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Tool execution function type - handles its own configuration internally
 */
export type ToolExecutor = (args: any) => Promise<any>;

/**
 * Complete tool with definition and executor
 */
export interface Tool {
  definition: ToolDefinition;
  execute: ToolExecutor;
}
