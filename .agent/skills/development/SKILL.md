---
name: Project Development Etiquette
description: Guidelines and standards for developing this specific project, ensuring consistency and adherence to architectural patterns.
---

# Project Development Etiquette

This skill provides the AI assistant with the necessary instructions to maintain the project's high standards and specific development patterns. These are mandatory rules for every interaction.

## Core Directives (Mandatory)

1.  **Strict Documentation**:
    *   **File Header**: Every file MUST start with a detailed header comment describing its role, responsibility, and context.
    *   **In-Code Comments**: Use exhaustive comments for functions and complex logic. The code should be self-explanatory such that high-level documentation is not strictly necessary to understand the details.
    *   **Database Operations**: Add exhaustive comments to any code interacting with the database. Specify keys (PK, SK, GSI), the rationale for the query choice, and state transitions.
    *   **The Map vs. The Truth**: Documents represent "The Map" (Architecture/Routing/Examples), while Source Code represents "The Truth" (Exhaustive details).
2.  **Standardization & Simplification**:
    *   **Reuse Existing Patterns**: Do not reinvent solutions. Always search for and reuse existing utility functions, components, and patterns.
    *   **Mechanical Simplification**: Design logic to be simple and "API-like". Aim for implementations that can be maintained or replaced through mechanical, repeatable operations.
3.  **Fool-proof Design through Types**:
    *   **Exhaustive Type Safety**: Mandatory type definitions for all data structures, API interfaces, and function parameters. Avoid `any` at all costs.
    *   **Early Error Detection**: Design types and logic such that incorrect usage results in immediate, descriptive compile-time errors.
4.  **Behavior & State Preservation**:
    *   **No Stealth UI Changes**: Never make large-scale visual or layout changes unless explicitly instructed.
    *   **Internal Consistency**: Ensure that any modification preserves the existing behavior and communication protocols between the Frontend and Backend.
5.  **Lossless Editing & Anti-Deletion**:
    *   **Prohibition of Deletion**: NEVER delete or overwrite existing documentation, comments, or examples without explicit user permission.
    *   **Preservation**: Even when reorganizing information, ensure no data density is lost.
    *   **The Triple Principles of Editing**:
        1. **No Deletion**: Unauthorized removal of text is strictly prohibited.
        2. **Information Increment**: Edits MUST result in an overall increase in information density (explanations, details, examples).
        3. **Complete Transcription**: All previous content, including detailed wording and underlying "intent," must be fully transcribed and inherited into the new structure.
6.  **Writing Constraints**:
    *   **No Vague Versioning**: Do not use terms like "latest version" (最新版) or "revised version" (修正版). Describe specific changes or states instead.

## Reference Materials

*   **AI Etiquette**: [ATFIRST_AI_ETIQUETTE.md](file:///Users/yudai/git/meishigawarini/documents/ATFIRST_AI_ETIQUETTE.md) (Read this first for philosophical and procedural alignment)
*   **Development Guide**: [SPEC_DEV_STANDARDS.md](file:///Users/yudai/git/meishigawarini/documents/SPEC_DEV_STANDARDS.md)
*   **Frontend Data Management**: [SPEC_FE_DATA_STATE.md](file:///Users/yudai/git/meishigawarini/documents/SPEC_FE_DATA_STATE.md)

## Verification Protocol

Before completing a task, verify:
1.  **Metadata Compliance**: Does the file have a header? Are DB operations explained in detail?
2.  **Type Integrity**: Does `tsc` pass? Are there any `any` types left?
3.  **Stability**: Has the core logic flow been tested to ensure no regressions in BE-FE communication?
4.  **UI Consistency**: Does the UI match the previous state unless explicit changes were requested?
