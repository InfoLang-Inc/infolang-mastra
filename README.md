# @infolang/mastra

InfoLang memory tools for [Mastra](https://mastra.ai) agents. Wraps
[`@infolang/sdk`](https://github.com/InfoLang-Inc/infolang-sdk-typescript) as
three `createTool`-based tools — `infolang-recall`, `infolang-memorize`,
`infolang-forget` — with configurable per-agent / per-thread / per-resource
namespace scoping.

> Repository: `infolang-mastra`. Package: `@infolang/mastra` (npm).

## Install

```bash
npm install @infolang/mastra @mastra/core zod
```

`@mastra/core` and `zod` are peer dependencies — install whatever versions
your Mastra project already uses. `@infolang/sdk` is a regular dependency
and installs automatically.

## Quickstart

```ts
import { Agent } from "@mastra/core/agent";
import { createInfolangTools } from "@infolang/mastra";

const { infolangRecallTool, infolangMemorizeTool } = createInfolangTools({
  apiKey: process.env.INFOLANG_API_KEY, // or omit — read from INFOLANG_API_KEY automatically
});

const agent = new Agent({
  id: "support-agent",
  name: "Support Agent",
  instructions:
    "Call infolang-recall before answering questions about this user. " +
    "Call infolang-memorize when they tell you something worth remembering.",
  model: "openai/gpt-4o-mini",
  tools: { infolangRecallTool, infolangMemorizeTool },
});
```

See `examples/agent-memory` for a complete, runnable project (`npm install
&& npm start`).

## Tools

| Tool id | Factory | Input | Output |
|---|---|---|---|
| `infolang-recall` | `createInfolangRecallTool(config)` | `{ query, topK?, namespace? }` | `{ chunks: { id, text, score?, tags? }[], namespace?, weak }` |
| `infolang-memorize` | `createInfolangMemorizeTool(config)` | `{ text, source?, tags?, namespace? }` | `{ memoryId?, namespace? }` |
| `infolang-forget` | `createInfolangForgetTool(config)` | `{ memoryId, namespace? }` | `{ deleted, memoryId }` |

`createInfolangTools(config)` builds all three (sharing one `InfoLang`
client) and returns `{ infolangRecallTool, infolangMemorizeTool,
infolangForgetTool }`. Set `includeForgetTool: false` to omit the forget
tool — useful if you don't want the model deleting memories.

Each tool's `namespace` input field overrides the resolved namespace for
that single call; leave it out and the tool falls back to the configured
`namespaceStrategy` (below), then to `config.namespace`, then to the
underlying SDK client's own default.

## Config reference

`InfolangMastraConfig` (passed to `createInfolangTools` and each
`createInfolang*Tool` factory):

| Field | Type | Default | Notes |
|---|---|---|---|
| `client` | `InfoLang` | — | A pre-built SDK client. Mutually exclusive with `apiKey` / `devKey`. |
| `apiKey` | `string` | `INFOLANG_API_KEY` env var | Managed-cloud key (`il_live_...`). |
| `devKey` | `string` | `INFOLANG_DEV_KEY` env var | Self-hosted dev key (`key:namespace`). |
| `baseUrl` | `string` | SDK default | Ignored when `client` is set. |
| `workspace` | `string` | — | Account workspace id. Ignored when `client` is set. |
| `namespace` | `string` | — | Static fallback namespace. |
| `namespaceStrategy` | `NamespaceStrategyConfig` | `{ scope: "static" }` | See below. |
| `defaultTopK` | `number` | `5` | Used by `infolang-recall` when the model omits `topK`. Must be a positive integer. |
| `includeForgetTool` | `boolean` | `true` | Only read by `createInfolangTools`. |

`createInfolangTools` / each factory calls `validateConfig` synchronously and
throws `InfolangMastraConfigError` for: more than one of `client` / `apiKey`
/ `devKey`; a non-positive or non-integer `defaultTopK`; an unknown
`namespaceStrategy.scope`; or a `namespaceStrategy.prefix` set without a
`scope` (other than `"static"`) or a custom `resolve`. Missing/invalid
credentials are **not** validated here — the underlying `InfoLang` client
throws `InfoLangConfigError` for that when it's constructed (i.e. on the
first `createInfolang*Tool` call, not on import).

### Namespace scoping

`namespaceStrategy: NamespaceStrategyConfig`:

| Field | Type | Notes |
|---|---|---|
| `scope` | `"static" \| "agent" \| "thread" \| "resource"` | Which Mastra-provided id to scope by. Default `"static"` (never scopes; always uses `config.namespace`). |
| `prefix` | `string` | Prepended to the scoped id, joined by `separator`. Requires a non-`"static"` `scope` or a `resolve` function. |
| `separator` | `string` | Joins `prefix` and the id. Default `":"`. |
| `resolve` | `(context) => string \| undefined` | Custom resolver, evaluated per call. Wins when it returns a non-empty string; falls through to `scope` (then `config.namespace`) when it returns `undefined`. |

`"agent"` / `"thread"` / `"resource"` read `context.agent.agentId` /
`.threadId` / `.resourceId` from the Mastra tool execution context.
`agentId` is always available when a tool runs inside an agent. `threadId`
and `resourceId` are only populated when the agent has its own
conversation memory configured (`memory: new Memory({...})` from
`@mastra/memory`) and the caller passes `memory: { thread, resource }` to
`generate()` / `stream()` — see [Mastra's memory
docs](https://mastra.ai/docs/memory/overview). Without that, scoping by
`"thread"` or `"resource"` silently falls back to `config.namespace` (or
the client default) for every call, per the resolution order above.

Resolution order for a single tool call, most to least specific:
1. The call's own `namespace` input field (the model can pass this
   explicitly).
2. `namespaceStrategy.resolve(context)`, if set and it returns a value.
3. `namespaceStrategy.scope`, if set to something other than `"static"` and
   the corresponding id is present on the call.
4. `config.namespace`.
5. The `InfoLang` client's own default namespace (from `client.namespace`,
   a dev key's embedded namespace, or `INFOLANG_NAMESPACE`).

## Honest semantics notes

- **`weak` is not an error.** `infolang-recall` always returns its best
  matches; `weak: true` just means the top score is below InfoLang's 0.85
  confidence floor. The tool does not filter these out or retry — the
  agent's instructions need to tell the model what to do with a weak match
  (the example does this).
- **No caching, no dedup.** Every tool call is one HTTP request to
  InfoLang. Calling `infolang-memorize` twice with the same text stores it
  twice; there's no dedup at this layer.
- **Errors propagate, they aren't swallowed.** A failed recall/memorize/
  forget call throws one of the SDK's typed errors (`AuthenticationError`,
  `RateLimitError`, `NotFoundError`, `ValidationError`, `ServerError`,
  `InfoLangConnectionError` — see the SDK's README) out of `execute()`.
  This package does not catch and convert them into a `{ error: "..." }`
  tool result. How your Mastra agent surfaces a thrown tool error to the
  model depends on your Mastra version's tool-call error handling.
- **`createInfolangTools` shares one client, not one cache.** All three
  tools it returns talk to the same `InfoLang` instance (same auth, same
  retry config), but each call still hits the network — there's no
  in-process memoization between, say, two `infolang-recall` calls with the
  same query.
- **Namespace scoping is best-effort.** As noted above, `"thread"` /
  `"resource"` scoping depends on your agent actually populating those ids.
  This package does not verify that your agent is configured to do so; it
  just reads what's on the tool context and falls back silently when it's
  absent.

## Development

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

Tests mock HTTP at the `fetch` layer (via `InfoLang`'s `fetch` option),
mirroring the TypeScript SDK's own test style — no network calls, no
`@mastra/core` mocking.
