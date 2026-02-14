# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-02-14

### Added
- Initial release of baml-sap-ts
- Schema-Aligned Parsing (SAP) algorithm implementation
- TypeBox integration for schema definition
- JSON extraction from markdown code blocks
- Automatic JSON fixing (trailing commas, missing quotes)
- Chain-of-thought reasoning filtering
- Type coercion and validation
- Union type matching
- Optional field handling with defaults
- Support for partial/streaming responses
- Comprehensive test suite (24 tests)
- Biome linting and formatting
- Full TypeScript support with type declarations

### Features
- `parseResponse()` - Main parsing function
- `createPromptWithSchema()` - Generate prompts with schema instructions
- `extractJson()` - Low-level JSON extraction
- `coerceValue()` - Type coercion against schemas
- `renderSchema()` - Schema to prompt text conversion
- Support for complex nested schemas
- Enum and literal type handling
- Record/map type support
- Tuple type support

[0.1.0]: https://github.com/yourusername/baml-sap-ts/releases/tag/v0.1.0
