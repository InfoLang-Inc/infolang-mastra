/**
 * Configuration, validation, and namespace-resolution for InfoLang Mastra
 * tools. Kept free of any `@mastra/core` imports so it can be unit tested
 * with plain objects.
 */

import { InfoLang } from "@infolang/sdk";

import { InfolangMastraConfigError } from "./errors.js";

/** Identifying fields a Mastra tool call may carry, used for namespace scoping. */
export interface NamespaceContext {
  agentId?: string;
  threadId?: string;
  resourceId?: string;
}

/** Built-in namespace scoping strategies. `"static"` (the default) never scopes. */
export type NamespaceScope = "static" | "agent" | "thread" | "resource";

export interface NamespaceStrategyConfig {
  /**
   * Which call-time identifier to scope the namespace by.
   * - `"static"` (default): always use `config.namespace`.
   * - `"agent"`: scope by `context.agent.agentId`.
   * - `"thread"`: scope by `context.agent.threadId`.
   * - `"resource"`: scope by `context.agent.resourceId`.
   *
   * Falls back to `config.namespace` when the chosen identifier is not
   * present on a given call (e.g. a tool invoked outside an agent thread).
   */
  scope?: NamespaceScope;
  /** Prepended to the scoped identifier, joined by `separator`. */
  prefix?: string;
  /** Joins `prefix` and the identifier. Defaults to `":"`. */
  separator?: string;
  /**
   * Custom resolver, evaluated per call. Wins over `scope` when it returns a
   * non-empty string. Falls through to `scope`/`config.namespace` when it
   * returns `undefined`.
   */
  resolve?: (context: NamespaceContext) => string | undefined;
}

export interface InfolangMastraConfig {
  /** A pre-built `InfoLang` client. Mutually exclusive with `apiKey`/`devKey`. */
  client?: InfoLang;
  /** Managed-cloud API key (`il_live_...`). Mutually exclusive with `client`/`devKey`. */
  apiKey?: string;
  /** Self-hosted dev key (`key:namespace`). Mutually exclusive with `client`/`apiKey`. */
  devKey?: string;
  /** Overrides the SDK's default base URL. Ignored when `client` is provided. */
  baseUrl?: string;
  /** Account workspace id. Ignored when `client` is provided. */
  workspace?: string;
  /** Fallback / default namespace used when scoping does not resolve one. */
  namespace?: string;
  /** How tool calls pick a namespace. Defaults to `{ scope: "static" }`. */
  namespaceStrategy?: NamespaceStrategyConfig;
  /** Default `topK` for the recall tool when the model omits it. Defaults to 5. */
  defaultTopK?: number;
  /** Whether `createInfolangTools` includes the forget tool. Defaults to `true`. */
  includeForgetTool?: boolean;
}

const SCOPE_KEYS: Record<Exclude<NamespaceScope, "static">, keyof NamespaceContext> = {
  agent: "agentId",
  thread: "threadId",
  resource: "resourceId",
};

const VALID_SCOPES: NamespaceScope[] = ["static", "agent", "thread", "resource"];

/**
 * Validates a config object, throwing `InfolangMastraConfigError` on
 * conflicting or malformed options. Does not attempt any network I/O and
 * does not validate credentials themselves — the underlying `InfoLang`
 * client raises `InfoLangConfigError` for that when constructed.
 */
export function validateConfig(config: InfolangMastraConfig): void {
  const providedAuth = ["client", "apiKey", "devKey"].filter(
    (key) => config[key as keyof InfolangMastraConfig] !== undefined,
  );
  if (providedAuth.length > 1) {
    throw new InfolangMastraConfigError(
      `Provide only one of "client", "apiKey", or "devKey" (got: ${providedAuth.join(", ")}).`,
    );
  }

  if (config.defaultTopK !== undefined) {
    if (!Number.isInteger(config.defaultTopK) || config.defaultTopK <= 0) {
      throw new InfolangMastraConfigError("defaultTopK must be a positive integer.");
    }
  }

  const scope = config.namespaceStrategy?.scope;
  if (scope !== undefined && !VALID_SCOPES.includes(scope)) {
    throw new InfolangMastraConfigError(
      `Invalid namespaceStrategy.scope "${scope}". Expected "static", "agent", "thread", or "resource".`,
    );
  }

  if (
    config.namespaceStrategy?.prefix !== undefined &&
    (!config.namespaceStrategy.scope || config.namespaceStrategy.scope === "static") &&
    !config.namespaceStrategy.resolve
  ) {
    throw new InfolangMastraConfigError(
      'namespaceStrategy.prefix has no effect with scope "static" (or unset) and no custom resolver.',
    );
  }
}

/** Builds (or passes through) the `InfoLang` client for a validated config. */
export function resolveClient(config: InfolangMastraConfig): InfoLang {
  if (config.client) return config.client;
  return new InfoLang({
    apiKey: config.apiKey,
    devKey: config.devKey,
    baseUrl: config.baseUrl,
    namespace: config.namespace,
    workspace: config.workspace,
  });
}

/**
 * Resolves the namespace for a single tool call: custom resolver, then the
 * configured scope, then the static `config.namespace` fallback (which may
 * itself be `undefined`, in which case the SDK client's own default
 * namespace applies).
 */
export function resolveNamespace(
  config: InfolangMastraConfig,
  context: NamespaceContext,
): string | undefined {
  const strategy = config.namespaceStrategy;

  if (strategy?.resolve) {
    const resolved = strategy.resolve(context);
    if (resolved) return resolved;
  }

  const scope = strategy?.scope;
  if (scope && scope !== "static") {
    const identifier = context[SCOPE_KEYS[scope]];
    if (identifier) {
      const separator = strategy?.separator ?? ":";
      return strategy?.prefix ? `${strategy.prefix}${separator}${identifier}` : identifier;
    }
  }

  return config.namespace;
}
