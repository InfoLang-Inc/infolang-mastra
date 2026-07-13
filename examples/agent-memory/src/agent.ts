/**
 * A support agent that remembers facts across conversations using InfoLang.
 *
 * Namespace scoping here is per-agent (`scope: "agent"`): every call to this
 * agent shares one InfoLang namespace, keyed by the agent's own id. That
 * needs no extra setup, which keeps this example runnable with just an
 * InfoLang and an OpenAI key.
 *
 * To scope per-conversation instead (`scope: "thread"` / `"resource"`), the
 * `threadId` / `resourceId` read by @infolang/mastra come from Mastra's own
 * conversation memory — configure a `memory: new Memory({...})` on this
 * Agent (see https://mastra.ai/docs/memory/overview) and pass
 * `memory: { thread, resource }` to `generate()`/`stream()`. See the main
 * package README's "Namespace scoping" section for the full picture.
 */

import { Agent } from "@mastra/core/agent";
import { createInfolangTools } from "@infolang/mastra";

const { infolangRecallTool, infolangMemorizeTool } = createInfolangTools({
  // Reads INFOLANG_API_KEY from the environment if `apiKey` is omitted.
  namespaceStrategy: { scope: "agent" },
  // Only fetch the top 3 matches by default; the model can ask for more.
  defaultTopK: 3,
  // This example doesn't need memory deletion.
  includeForgetTool: false,
});

export const supportAgent = new Agent({
  id: "support-agent",
  name: "Support Agent",
  instructions: `You are a support agent with long-term memory.

- At the start of a conversation, call infolang-recall with a query
  summarizing what the user is asking about, so you can use any relevant
  facts you've stored previously.
- When the user tells you something worth remembering for next time
  (a preference, a fact about their setup, a decision made), call
  infolang-memorize to save it.
- If infolang-recall returns "weak: true", treat the result as a loose
  guess, not a confirmed fact — say so if you rely on it.`,
  model: "openai/gpt-4o-mini",
  tools: { infolangRecallTool, infolangMemorizeTool },
});
