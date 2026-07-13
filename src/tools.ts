/**
 * Mastra `createTool` wrappers around `@infolang/sdk`'s recall / remember /
 * forget calls, with per-agent / per-thread / per-resource namespace
 * scoping (see `NamespaceStrategyConfig` in `./config.js`).
 */

import { createTool } from "@mastra/core/tools";
import type { ToolExecutionContext } from "@mastra/core/tools";
import { z } from "zod";

import {
  type InfolangMastraConfig,
  type NamespaceContext,
  resolveClient,
  resolveNamespace,
  validateConfig,
} from "./config.js";

function contextToNamespaceContext(context: ToolExecutionContext): NamespaceContext {
  return {
    agentId: context.agent?.agentId,
    threadId: context.agent?.threadId,
    resourceId: context.agent?.resourceId,
  };
}

const recallInputSchema = z.object({
  query: z.string().min(1).describe("Natural-language query to search stored memories for."),
  topK: z
    .number()
    .int()
    .positive()
    .max(50)
    .optional()
    .describe("Maximum number of memory chunks to return. Defaults to the tool's configured defaultTopK (5)."),
  namespace: z
    .string()
    .optional()
    .describe("Overrides the namespace resolved from this tool's scoping strategy, for this call only."),
});

const recallOutputSchema = z.object({
  chunks: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      score: z.number().optional(),
      tags: z.string().optional(),
    }),
  ),
  namespace: z.string().optional(),
  /** True when the top match scores below InfoLang's 0.85 confidence floor. */
  weak: z.boolean(),
});

const memorizeInputSchema = z.object({
  text: z.string().min(1).describe("The fact or statement to store in InfoLang memory."),
  source: z.string().optional().describe("Where this memory came from, e.g. a file path or URL."),
  tags: z.string().optional().describe("Comma-separated tags to attach to the memory."),
  namespace: z
    .string()
    .optional()
    .describe("Overrides the namespace resolved from this tool's scoping strategy, for this call only."),
});

const memorizeOutputSchema = z.object({
  memoryId: z.string().optional(),
  namespace: z.string().optional(),
});

const forgetInputSchema = z.object({
  memoryId: z.string().min(1).describe("The id of the memory to delete, as returned by the memorize tool."),
  namespace: z
    .string()
    .optional()
    .describe("Overrides the namespace resolved from this tool's scoping strategy, for this call only."),
});

const forgetOutputSchema = z.object({
  deleted: z.boolean(),
  memoryId: z.string(),
});

/**
 * Creates the InfoLang recall tool: semantic search over stored memories.
 * Exposed to the model as `infolang-recall`.
 */
export function createInfolangRecallTool(config: InfolangMastraConfig = {}) {
  validateConfig(config);
  const client = resolveClient(config);
  const defaultTopK = config.defaultTopK ?? 5;

  return createTool({
    id: "infolang-recall",
    description:
      "Search InfoLang memory for facts relevant to a query. Returns the closest matching chunks " +
      "with similarity scores; set `weak: true` on the result means the best match is a poor fit " +
      "(similarity below 0.85) and should be treated with skepticism.",
    inputSchema: recallInputSchema,
    outputSchema: recallOutputSchema,
    execute: async (inputData, context) => {
      const namespace =
        inputData.namespace ?? resolveNamespace(config, contextToNamespaceContext(context));
      const result = await client.recall(inputData.query, {
        namespace,
        topK: inputData.topK ?? defaultTopK,
      });
      return {
        chunks: result.chunks.map((chunk) => ({
          id: chunk.id,
          text: chunk.text,
          score: chunk.score,
          tags: chunk.tags,
        })),
        namespace: result.namespace,
        weak: result.weak,
      };
    },
  });
}

/**
 * Creates the InfoLang memorize tool: stores a fact for later recall.
 * Exposed to the model as `infolang-memorize`.
 */
export function createInfolangMemorizeTool(config: InfolangMastraConfig = {}) {
  validateConfig(config);
  const client = resolveClient(config);

  return createTool({
    id: "infolang-memorize",
    description:
      "Save a fact or statement to InfoLang memory so it can be found later with the infolang-recall tool.",
    inputSchema: memorizeInputSchema,
    outputSchema: memorizeOutputSchema,
    execute: async (inputData, context) => {
      const namespace =
        inputData.namespace ?? resolveNamespace(config, contextToNamespaceContext(context));
      const result = await client.memorize(inputData.text, {
        namespace,
        source: inputData.source,
        tags: inputData.tags,
      });
      return {
        memoryId: result.memoryId,
        namespace: result.namespace,
      };
    },
  });
}

/**
 * Creates the InfoLang forget tool: deletes a previously stored memory by id.
 * Exposed to the model as `infolang-forget`. Included by default; disable
 * via `includeForgetTool: false` in `createInfolangTools`.
 */
export function createInfolangForgetTool(config: InfolangMastraConfig = {}) {
  validateConfig(config);
  const client = resolveClient(config);

  return createTool({
    id: "infolang-forget",
    description: "Delete a previously stored InfoLang memory by its id.",
    inputSchema: forgetInputSchema,
    outputSchema: forgetOutputSchema,
    execute: async (inputData, context) => {
      const namespace =
        inputData.namespace ?? resolveNamespace(config, contextToNamespaceContext(context));
      await client.forget(inputData.memoryId, { namespace });
      return { deleted: true, memoryId: inputData.memoryId };
    },
  });
}

export interface InfolangTools {
  infolangRecallTool: ReturnType<typeof createInfolangRecallTool>;
  infolangMemorizeTool: ReturnType<typeof createInfolangMemorizeTool>;
  infolangForgetTool?: ReturnType<typeof createInfolangForgetTool>;
}

/**
 * Creates the full set of InfoLang Mastra tools sharing one config (and one
 * underlying `InfoLang` client instance). This is the recommended entry
 * point; use the individual `createInfolang*Tool` functions if you only
 * need one tool or want independently configured clients.
 *
 * @example
 * ```ts
 * import { Agent } from "@mastra/core/agent";
 * import { createInfolangTools } from "@infolang/mastra";
 *
 * const { infolangRecallTool, infolangMemorizeTool } = createInfolangTools({
 *   apiKey: process.env.INFOLANG_API_KEY,
 *   namespaceStrategy: { scope: "thread", prefix: "support-agent" },
 * });
 *
 * const agent = new Agent({
 *   name: "support-agent",
 *   instructions: "Use infolang-recall before answering; save new facts with infolang-memorize.",
 *   model: "openai/gpt-4o-mini",
 *   tools: { infolangRecallTool, infolangMemorizeTool },
 * });
 * ```
 */
export function createInfolangTools(config: InfolangMastraConfig = {}): InfolangTools {
  validateConfig(config);
  // Share one client across tools so they share retry/auth/namespace state.
  const sharedConfig: InfolangMastraConfig = { ...config, client: resolveClient(config) };

  const tools: InfolangTools = {
    infolangRecallTool: createInfolangRecallTool(sharedConfig),
    infolangMemorizeTool: createInfolangMemorizeTool(sharedConfig),
  };
  if (config.includeForgetTool !== false) {
    tools.infolangForgetTool = createInfolangForgetTool(sharedConfig);
  }
  return tools;
}
