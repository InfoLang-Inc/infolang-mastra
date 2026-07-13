/**
 * Configuration errors raised by `@infolang/mastra` itself (before any
 * `@infolang/sdk` request is attempted). SDK-level failures (auth, network,
 * 4xx/5xx) surface as the SDK's own error classes — see the SDK's
 * `InfoLangError` hierarchy — and are not wrapped here.
 */
export class InfolangMastraConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InfolangMastraConfigError";
  }
}
