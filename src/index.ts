/**
 * InfoLang tools for Mastra agents.
 *
 * @example
 * ```ts
 * import { createInfolangTools } from "@infolang/mastra";
 *
 * const { infolangRecallTool, infolangMemorizeTool } = createInfolangTools({
 *   apiKey: process.env.INFOLANG_API_KEY,
 * });
 * ```
 */

export type {
  InfolangMastraConfig,
  NamespaceContext,
  NamespaceScope,
  NamespaceStrategyConfig,
} from "./config.js";
export { resolveNamespace } from "./config.js";
export { InfolangMastraConfigError } from "./errors.js";
export {
  createInfolangForgetTool,
  createInfolangMemorizeTool,
  createInfolangRecallTool,
  createInfolangTools,
  type InfolangTools,
} from "./tools.js";
