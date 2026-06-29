---
name: Slopshop template relationship
description: This project is the proving ground for Railway deployment patterns that will inform the slopshop-template api-container variant
type: project
originSessionId: bb54d657-333c-4ba1-93eb-f7fb712fa0df
---

This project figures out Railway deployment first, then informs the slopshop-template.

The slopshop-template has an api-container variant (at ~/repos/slopshop-template) that has seen massive recent updates. This manga-lookup project will eventually be integrated into that template's structure. But the template hasn't solved Railway deployment yet — this project is the one that needs to figure it out.

**Order of operations:**

1. Get Railway deployment working in this project
2. Document the patterns (Dockerfile, Postgres adapter, CI/CD, env vars)
3. Feed those patterns back into the slopshop-template api-container variant
4. Restructure this project to follow the template's conventions

**Why:** Austin wants a single template system (slopshop) that handles both Workers (frontend) and containers (API), so new projects get deployment for free.

**How to apply:** When making deployment decisions, think about what would generalize to a template. Avoid project-specific hacks that wouldn't transfer.
