---
name: Preserve comments during refactors
description: Don't drop existing comments when rewriting or moving code — they contain important context
type: feedback
originSessionId: bb54d657-333c-4ba1-93eb-f7fb712fa0df
---

When refactoring, preserve existing comments. Make small targeted edits rather than rewriting entire blocks from scratch, so comments aren't lost.

**Why:** Comments often explain non-intuitive choices, document how we arrived at a solution, or provide context. Rewriting blocks wholesale drops them silently. This happened repeatedly during the cache migration — behavioral comments about TTL logic, timeout behavior, and placeholder detection were stripped out.

**How to apply:** Change only the lines that need changing. If swapping an implementation (e.g., fs calls → DB calls), edit just those lines and leave surrounding comments intact. Only remove comments that reference something that genuinely no longer exists (e.g., "ensure directory exists" after removing filesystem code).
