Fechado. Vou te entregar tudo pronto para copiar e colar no repo, com o nome exato de cada arquivo.

## `AGENTS.md`

```md
# AGENTS.md

## Purpose

This file contains mandatory instructions for any AI coding agent working on this repository.

Read `PROJECT_CONTEXT.md` before making any code changes.

## Core Rules

1. Do not publish real LinkedIn content unless:
   - `DRY_RUN=false`
   - all validations pass
   - the post is explicitly eligible for publishing

2. Never use scraping or browser automation to publish or collect LinkedIn data.

3. Use official APIs only.

4. Before changing LinkedIn API code:
   - verify the current official LinkedIn documentation
   - verify supported scopes
   - verify supported post formats
   - verify current API version requirements

5. Do not invent endpoints, permissions, response fields, or API behaviors.

6. Do not introduce paid dependencies unless explicitly approved.

7. Do not replace the Notion editorial workflow with another system.

8. Notion is the editorial source of truth.

9. SQLite is the operational source of truth.

10. Never remove analytics history.

11. Never overwrite an analytics snapshot without preserving the previous snapshot.

12. Never store secrets in Git.

13. Never log:
   - access tokens
   - refresh tokens
   - client secrets
   - Notion tokens
   - authorization codes

14. Run tests after material changes.

15. Prefer incremental changes over rewrites.

16. Prefer simple and maintainable architecture over unnecessary complexity.

17. This project is a personal automation system, not a SaaS platform.

18. Avoid:
   - microservices
   - Kubernetes
   - unnecessary message brokers
   - paid schedulers
   - unnecessary cloud infrastructure

## Required Reading Order

Before implementing a feature, read:

1. `PROJECT_CONTEXT.md`
2. `docs/ARCHITECTURE.md`
3. the relevant domain document under `docs/`

Relevant documents:

- LinkedIn integration:
  `docs/LINKEDIN_SETUP.md`

- Notion:
  `docs/NOTION_SCHEMA.md`

- Analytics:
  `docs/ANALYTICS.md`

- Operations:
  `docs/OPERATIONS.md`

- Editorial workflow:
  `docs/EDITORIAL_WORKFLOW.md`

## Development Safety

Default:

```env
DRY_RUN=true
```

Tests must never publish to LinkedIn.

Mocks must be used for API integration tests unless explicitly running a controlled manual integration test.

## Documentation

When changing architecture, API behavior, Notion schema, scheduling behavior, or analytics logic:

update the relevant documentation in the same change.

## API Drift

LinkedIn APIs are versioned and may change.

If the implementation differs from this repository's documentation because LinkedIn changed its API:

1. follow the current official LinkedIn documentation;
2. update this repository's documentation;
3. record the decision in the relevant file;
4. do not silently implement a workaround.
```