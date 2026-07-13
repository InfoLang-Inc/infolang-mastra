/**
 * Run: OPENAI_API_KEY=... INFOLANG_API_KEY=... npm start
 *
 * Two separate `generate()` calls, simulating two different sessions with
 * the same agent: the first stores a fact via infolang-memorize, the second
 * (a fresh call, no shared conversation state) recalls it via
 * infolang-recall. That's the point — the memory survives independently of
 * any chat history.
 */

import { supportAgent } from "./agent.js";

async function main(): Promise<void> {
  const first = await supportAgent.generate(
    "I'm on the Enterprise plan and my deploy region is eu-west-1. Remember that.",
  );
  console.log("--- session 1 ---");
  console.log(first.text);

  const second = await supportAgent.generate("What deploy region am I on?");
  console.log("--- session 2 (fresh call) ---");
  console.log(second.text);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
