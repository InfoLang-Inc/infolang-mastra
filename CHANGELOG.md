# Changelog

All notable changes to `@infolang/mastra` are documented here. This project
adheres to [Semantic Versioning](https://semver.org).

## [0.1.0] - 2026-07-13

### Added
- Initial release: `infolang-recall`, `infolang-memorize`, `infolang-forget`
  tools built on `@mastra/core`'s `createTool`, wrapping `@infolang/sdk`.
- `createInfolangTools` factory sharing one `InfoLang` client across all
  three tools; individual `createInfolang*Tool` factories for one-off use.
- Namespace scoping via `namespaceStrategy`: `"static"`, `"agent"`,
  `"thread"`, `"resource"`, or a custom `resolve` function.
- `examples/agent-memory`: a minimal runnable Mastra agent using the tools.
