# InfoLang + Mastra example: a support agent with long-term memory

A minimal, runnable Mastra agent that uses [`@infolang/mastra`](../../README.md)
for memory instead of (or alongside) Mastra's own conversation memory.

- `src/agent.ts` — builds `infolang-recall` / `infolang-memorize` tools via
  `createInfolangTools` and wires them into a Mastra `Agent`.
- `src/index.ts` — runs two separate `generate()` calls to show that a fact
  stored in the first call is recalled in the second, with no shared chat
  history between them.

## Run it

`@infolang/mastra` isn't on npm yet, so build it locally and link it before
installing this example's other dependencies:

```bash
(cd ../.. && npm install && npm run build && npm link)
npm link @infolang/mastra
npm install
cp .env.example .env   # fill in OPENAI_API_KEY and INFOLANG_API_KEY
npm start
```

Expected output looks like:

```
--- session 1 ---
Got it — Enterprise plan, eu-west-1. I'll remember that.
--- session 2 (fresh call) ---
You're on the eu-west-1 deploy region.
```

The exact wording depends on the model; the point is the second call has no
message history from the first and still answers correctly, because the
fact was persisted to InfoLang, not to in-memory chat state.

## What to change for your own agent

- **Namespace scoping**: this example uses `namespaceStrategy: { scope: "agent" }`
  (see `src/agent.ts`), which needs no extra setup. For per-conversation or
  per-customer isolation, switch to `scope: "thread"` / `"resource"` — that
  requires Mastra's own conversation memory to be configured on the agent
  (`memory: new Memory({...})` from `@mastra/memory`) so `threadId` /
  `resourceId` are populated; see the main package README's "Namespace
  scoping" section.
- **Which tools**: `includeForgetTool: false` is set here for simplicity;
  drop it (or set `true`) to also give the agent an `infolang-forget` tool.
- **Self-hosted InfoLang**: replace `INFOLANG_API_KEY` with `INFOLANG_DEV_KEY`
  (`key:namespace` form) and pass `devKey` instead of relying on the
  environment default, to point at a local `il-runtime` instead of the
  managed cloud.
