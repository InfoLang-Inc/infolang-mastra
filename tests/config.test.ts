import { describe, expect, it } from "vitest";

import { InfolangMastraConfigError } from "../src/errors.js";
import { resolveClient, resolveNamespace, validateConfig } from "../src/config.js";

describe("validateConfig", () => {
  it("accepts an empty config", () => {
    expect(() => validateConfig({})).not.toThrow();
  });

  it("accepts exactly one of client/apiKey/devKey", () => {
    expect(() => validateConfig({ apiKey: "il_live_x" })).not.toThrow();
    expect(() => validateConfig({ devKey: "secret:ns" })).not.toThrow();
  });

  it("rejects apiKey and devKey together", () => {
    expect(() => validateConfig({ apiKey: "il_live_x", devKey: "secret:ns" })).toThrow(
      InfolangMastraConfigError,
    );
  });

  it("rejects client alongside apiKey", () => {
    const client = { namespace: undefined } as never;
    expect(() => validateConfig({ client, apiKey: "il_live_x" })).toThrow(InfolangMastraConfigError);
  });

  it("rejects a non-positive defaultTopK", () => {
    expect(() => validateConfig({ defaultTopK: 0 })).toThrow(InfolangMastraConfigError);
    expect(() => validateConfig({ defaultTopK: -3 })).toThrow(InfolangMastraConfigError);
  });

  it("rejects a non-integer defaultTopK", () => {
    expect(() => validateConfig({ defaultTopK: 2.5 })).toThrow(InfolangMastraConfigError);
  });

  it("accepts a positive integer defaultTopK", () => {
    expect(() => validateConfig({ defaultTopK: 8 })).not.toThrow();
  });

  it("rejects an unknown namespaceStrategy.scope", () => {
    expect(() =>
      validateConfig({ namespaceStrategy: { scope: "workspace" as never } }),
    ).toThrow(InfolangMastraConfigError);
  });

  it("accepts each valid namespaceStrategy.scope", () => {
    for (const scope of ["static", "agent", "thread", "resource"] as const) {
      expect(() => validateConfig({ namespaceStrategy: { scope } })).not.toThrow();
    }
  });

  it("rejects a prefix with no scope and no custom resolver", () => {
    expect(() => validateConfig({ namespaceStrategy: { prefix: "acme" } })).toThrow(
      InfolangMastraConfigError,
    );
  });

  it("rejects a prefix with an explicit static scope and no resolver", () => {
    expect(() =>
      validateConfig({ namespaceStrategy: { scope: "static", prefix: "acme" } }),
    ).toThrow(InfolangMastraConfigError);
  });

  it("accepts a prefix paired with a scoped strategy", () => {
    expect(() =>
      validateConfig({ namespaceStrategy: { scope: "agent", prefix: "acme" } }),
    ).not.toThrow();
  });

  it("accepts a prefix paired with a custom resolver even under static scope", () => {
    expect(() =>
      validateConfig({ namespaceStrategy: { prefix: "acme", resolve: () => "x" } }),
    ).not.toThrow();
  });
});

describe("resolveNamespace", () => {
  it("returns the static namespace by default", () => {
    expect(resolveNamespace({ namespace: "default" }, {})).toBe("default");
  });

  it("returns undefined when nothing is configured", () => {
    expect(resolveNamespace({}, { agentId: "a1" })).toBeUndefined();
  });

  it("scopes by agentId", () => {
    const ns = resolveNamespace(
      { namespaceStrategy: { scope: "agent" } },
      { agentId: "support-agent" },
    );
    expect(ns).toBe("support-agent");
  });

  it("scopes by threadId with a prefix", () => {
    const ns = resolveNamespace(
      { namespaceStrategy: { scope: "thread", prefix: "acme" } },
      { threadId: "thread_123" },
    );
    expect(ns).toBe("acme:thread_123");
  });

  it("scopes by resourceId with a custom separator", () => {
    const ns = resolveNamespace(
      { namespaceStrategy: { scope: "resource", prefix: "acme", separator: "/" } },
      { resourceId: "user_9" },
    );
    expect(ns).toBe("acme/user_9");
  });

  it("falls back to the static namespace when the scoped identifier is missing", () => {
    const ns = resolveNamespace(
      { namespace: "fallback-ns", namespaceStrategy: { scope: "thread" } },
      { agentId: "a1" },
    );
    expect(ns).toBe("fallback-ns");
  });

  it("prefers a custom resolver over the configured scope", () => {
    const ns = resolveNamespace(
      {
        namespace: "fallback-ns",
        namespaceStrategy: {
          scope: "agent",
          resolve: (ctx) => (ctx.threadId ? `thread-${ctx.threadId}` : undefined),
        },
      },
      { agentId: "a1", threadId: "t1" },
    );
    expect(ns).toBe("thread-t1");
  });

  it("falls through to scope when the custom resolver returns undefined", () => {
    const ns = resolveNamespace(
      {
        namespaceStrategy: {
          scope: "agent",
          resolve: () => undefined,
        },
      },
      { agentId: "a1" },
    );
    expect(ns).toBe("a1");
  });
});

describe("resolveClient", () => {
  it("passes an explicit client through unchanged", () => {
    const client = { namespace: "already-built" } as never;
    expect(resolveClient({ client })).toBe(client);
  });

  it("builds a new InfoLang client from apiKey/baseUrl/namespace/workspace", () => {
    const client = resolveClient({
      apiKey: "il_live_test",
      baseUrl: "https://example.test",
      namespace: "acme",
      workspace: "ws_1",
    });
    expect(client.baseUrl).toBe("https://example.test");
    expect(client.namespace).toBe("acme");
    expect(client.workspace).toBe("ws_1");
  });
});
