import type { ToolExecutionContext } from "@mastra/core/tools";
import { noopObserve } from "@mastra/core/tools";
import { InfoLang } from "@infolang/sdk";
import { describe, expect, it } from "vitest";

import { InfolangMastraConfigError } from "../src/errors.js";
import {
  createInfolangForgetTool,
  createInfolangMemorizeTool,
  createInfolangRecallTool,
  createInfolangTools,
} from "../src/tools.js";

const BASE_URL = "https://api.test.infolang.ai";

/** Build a fetch stub that records requests and returns canned responses. */
function stubFetch(handler: (url: string, init: RequestInit) => Response): {
  fetch: typeof fetch;
  calls: { url: string; init: RequestInit }[];
} {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push({ url, init });
    return handler(url, init);
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Minimal ToolExecutionContext satisfying the required `observe` field. */
function toolContext(agent?: Partial<NonNullable<ToolExecutionContext["agent"]>>): ToolExecutionContext {
  return {
    observe: noopObserve,
    agent: agent
      ? {
          agentId: "agent-1",
          toolCallId: "call-1",
          messages: [],
          suspend: async () => {},
          ...agent,
        }
      : undefined,
  };
}

function testClient(fetch: typeof globalThis.fetch, namespace?: string): InfoLang {
  return InfoLang.fromApiKey("il_live_test", { baseUrl: BASE_URL, namespace, fetch });
}

describe("infolang-recall tool", () => {
  it("has the expected id and description", () => {
    const tool = createInfolangRecallTool({ client: testClient(async () => jsonResponse(200, {})) });
    expect(tool.id).toBe("infolang-recall");
    expect(tool.description).toContain("InfoLang memory");
  });

  it("recalls and normalizes chunks", async () => {
    const { fetch, calls } = stubFetch(() =>
      jsonResponse(200, {
        namespace: "default",
        chunks: [{ i: "abc", s: 0.91, t: "auth uses bearer tokens", g: "auth,docs" }],
      }),
    );
    const tool = createInfolangRecallTool({ client: testClient(fetch) });

    const result = await tool.execute!({ query: "how does auth work?" }, toolContext());

    expect(calls[0]?.url).toBe(`${BASE_URL}/v1/recall`);
    const body = JSON.parse((calls[0]?.init.body as string) ?? "{}");
    expect(body.query).toBe("how does auth work?");
    expect(body.top_k).toBe(5); // default topK
    expect(result).toEqual({
      chunks: [{ id: "abc", text: "auth uses bearer tokens", score: 0.91, tags: "auth,docs" }],
      namespace: "default",
      weak: false,
    });
  });

  it("passes through a custom topK", async () => {
    const { fetch, calls } = stubFetch(() => jsonResponse(200, { chunks: [] }));
    const tool = createInfolangRecallTool({ client: testClient(fetch) });

    await tool.execute!({ query: "q", topK: 2 }, toolContext());

    const body = JSON.parse((calls[0]?.init.body as string) ?? "{}");
    expect(body.top_k).toBe(2);
  });

  it("uses defaultTopK from config when the call omits it", async () => {
    const { fetch, calls } = stubFetch(() => jsonResponse(200, { chunks: [] }));
    const tool = createInfolangRecallTool({ client: testClient(fetch), defaultTopK: 12 });

    await tool.execute!({ query: "q" }, toolContext());

    const body = JSON.parse((calls[0]?.init.body as string) ?? "{}");
    expect(body.top_k).toBe(12);
  });

  it("flags weak matches", async () => {
    const { fetch } = stubFetch(() => jsonResponse(200, { chunks: [{ i: "x", s: 0.4, t: "low" }] }));
    const tool = createInfolangRecallTool({ client: testClient(fetch) });

    const result = await tool.execute!({ query: "q" }, toolContext());

    expect(result).toMatchObject({ weak: true });
  });

  it("an explicit call-time namespace wins over everything", async () => {
    const { fetch, calls } = stubFetch(() => jsonResponse(200, { chunks: [] }));
    const tool = createInfolangRecallTool({
      client: testClient(fetch),
      namespace: "static-ns",
      namespaceStrategy: { scope: "agent" },
    });

    await tool.execute!({ query: "q", namespace: "call-ns" }, toolContext({ agentId: "a1" }));

    const body = JSON.parse((calls[0]?.init.body as string) ?? "{}");
    expect(body.namespace).toBe("call-ns");
  });

  it("scopes the namespace by agentId when configured", async () => {
    const { fetch, calls } = stubFetch(() => jsonResponse(200, { chunks: [] }));
    const tool = createInfolangRecallTool({
      client: testClient(fetch),
      namespaceStrategy: { scope: "agent", prefix: "acme" },
    });

    await tool.execute!({ query: "q" }, toolContext({ agentId: "support-agent" }));

    const body = JSON.parse((calls[0]?.init.body as string) ?? "{}");
    expect(body.namespace).toBe("acme:support-agent");
  });

  it("scopes the namespace by threadId when configured", async () => {
    const { fetch, calls } = stubFetch(() => jsonResponse(200, { chunks: [] }));
    const tool = createInfolangRecallTool({
      client: testClient(fetch),
      namespaceStrategy: { scope: "thread" },
    });

    await tool.execute!({ query: "q" }, toolContext({ threadId: "thread-7" }));

    const body = JSON.parse((calls[0]?.init.body as string) ?? "{}");
    expect(body.namespace).toBe("thread-7");
  });

  it("falls back to the client default namespace when nothing resolves", async () => {
    const { fetch, calls } = stubFetch(() => jsonResponse(200, { chunks: [] }));
    const tool = createInfolangRecallTool({ client: testClient(fetch, "client-default") });

    await tool.execute!({ query: "q" }, toolContext());

    const body = JSON.parse((calls[0]?.init.body as string) ?? "{}");
    expect(body.namespace).toBe("client-default");
  });
});

describe("infolang-memorize tool", () => {
  it("has the expected id", () => {
    const tool = createInfolangMemorizeTool({ client: testClient(async () => jsonResponse(200, {})) });
    expect(tool.id).toBe("infolang-memorize");
  });

  it("stores text and returns the memory id", async () => {
    const { fetch, calls } = stubFetch(() => jsonResponse(200, { id: "mem_1", namespace: "default" }));
    const tool = createInfolangMemorizeTool({ client: testClient(fetch) });

    const result = await tool.execute!(
      { text: "Auth uses bearer tokens.", source: "docs/auth.md", tags: "auth" },
      toolContext(),
    );

    expect(calls[0]?.url).toBe(`${BASE_URL}/v1/remember`);
    const body = JSON.parse((calls[0]?.init.body as string) ?? "{}");
    expect(body).toMatchObject({ text: "Auth uses bearer tokens.", source: "docs/auth.md", tags: "auth" });
    expect(result).toEqual({ memoryId: "mem_1", namespace: "default" });
  });

  it("scopes the namespace by resourceId when configured", async () => {
    const { fetch, calls } = stubFetch(() => jsonResponse(200, { id: "mem_2" }));
    const tool = createInfolangMemorizeTool({
      client: testClient(fetch),
      namespaceStrategy: { scope: "resource", prefix: "user" },
    });

    await tool.execute!({ text: "fact" }, toolContext({ resourceId: "u_42" }));

    const body = JSON.parse((calls[0]?.init.body as string) ?? "{}");
    expect(body.namespace).toBe("user:u_42");
  });
});

describe("infolang-forget tool", () => {
  it("has the expected id", () => {
    const tool = createInfolangForgetTool({ client: testClient(async () => jsonResponse(200, {})) });
    expect(tool.id).toBe("infolang-forget");
  });

  it("deletes a memory by id", async () => {
    const { fetch, calls } = stubFetch(() => jsonResponse(200, {}));
    const tool = createInfolangForgetTool({ client: testClient(fetch) });

    const result = await tool.execute!({ memoryId: "mem_1" }, toolContext());

    expect(calls[0]?.url).toBe(`${BASE_URL}/v1/memories/mem_1`);
    expect(calls[0]?.init.method).toBe("DELETE");
    expect(result).toEqual({ deleted: true, memoryId: "mem_1" });
  });
});

describe("createInfolangTools", () => {
  it("returns recall, memorize, and forget tools by default", () => {
    const tools = createInfolangTools({ client: testClient(async () => jsonResponse(200, {})) });
    expect(tools.infolangRecallTool.id).toBe("infolang-recall");
    expect(tools.infolangMemorizeTool.id).toBe("infolang-memorize");
    expect(tools.infolangForgetTool?.id).toBe("infolang-forget");
  });

  it("omits the forget tool when includeForgetTool is false", () => {
    const tools = createInfolangTools({
      client: testClient(async () => jsonResponse(200, {})),
      includeForgetTool: false,
    });
    expect(tools.infolangForgetTool).toBeUndefined();
  });

  it("shares one client/config across all returned tools", async () => {
    const { fetch, calls } = stubFetch(() => jsonResponse(200, { chunks: [], id: "mem_9" }));
    const tools = createInfolangTools({
      client: testClient(fetch),
      namespaceStrategy: { scope: "agent", prefix: "acme" },
    });

    await tools.infolangRecallTool.execute!({ query: "q" }, toolContext({ agentId: "shared-agent" }));
    await tools.infolangMemorizeTool.execute!({ text: "fact" }, toolContext({ agentId: "shared-agent" }));

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      const body = JSON.parse((call.init.body as string) ?? "{}");
      expect(body.namespace).toBe("acme:shared-agent");
    }
  });

  it("propagates config validation errors", () => {
    expect(() => createInfolangTools({ apiKey: "a", devKey: "b:ns" })).toThrow(
      InfolangMastraConfigError,
    );
  });
});
