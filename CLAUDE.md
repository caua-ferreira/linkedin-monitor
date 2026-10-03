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

---

## `PROJECT_CONTEXT.md`

```md
# LinkedIn Monitor — Project Context

## Project Name

LinkedIn_Monitor

## Owner

Cauã Ferreira

## Purpose

Automate the owner's personal LinkedIn editorial workflow while keeping the existing Notion workspace as the editorial source of truth.

The system should support:

- editorial planning
- scheduled publishing
- LinkedIn publishing
- analytics collection
- XLSX analytics fallback
- historical analytics snapshots
- UTM generation
- reconciliation
- operational logs

The project must remain low-cost and should not depend on paid SaaS tools.

---

## Editorial Workflow

Main workflow:

```text
Ideia
→ Em produção
→ Em revisão
→ Aprovado
→ Agendado
→ Publicado
```

Post-publication workflow:

```text
1h analytics
→ 24h analytics
→ 72h analytics
→ aprendizado
```

Nothing may be automatically published unless the editorial state makes the post eligible.

---

## Systems of Record

### Editorial source of truth

Notion

### Operational source of truth

SQLite

### Historical analytics source of truth

SQLite table:

```text
analytics_snapshots
```

### Analytics summary

Notion

---

## Notion

Database:

```text
Calendário Editorial LinkedIn
```

Database URL:

```text
https://app.notion.com/p/346a6ba3e9234c3ebf8f536b46969f75
```

Data Source ID:

```text
3b1f73c4-d13e-4f4e-b5d8-d6a038e9ec99
```

Overview:

```text
https://app.notion.com/p/3ecd12d8e1e181eb8c28d2aaf7d03de9
```

Editorial Guide:

```text
https://app.notion.com/p/3ecd12d8e1e181a38bd8c31a5e848403
```

Notion remains the place where:

- posts are written
- posts are reviewed
- publication dates are defined
- media URLs are stored
- post status is managed
- high-level analytics are displayed

---

## LinkedIn

Only official LinkedIn APIs may be used.

Do not use:

- scraping
- headless browser posting
- Selenium posting
- Playwright posting
- simulated clicks
- private undocumented APIs

Publishing permission expected:

```text
w_member_social
```

Identity scopes may include, depending on current LinkedIn documentation:

```text
openid
profile
email
```

Analytics permission when available:

```text
r_member_postAnalytics
```

Analytics access may require LinkedIn approval.

The system must remain functional without analytics API approval.

---

## Analytics Fallback

Until API analytics are available, use LinkedIn XLSX exports.

The XLSX importer must produce the same internal snapshot model as the API provider.

Sources:

```text
linkedin_api
linkedin_xlsx
manual
```

---

## Scheduling Timezone

Canonical timezone:

```text
America/Sao_Paulo
```

Internally, dates must use timezone-aware ISO 8601 timestamps.

Example:

```text
2026-10-05T18:10:00-03:00
```

Never compare publication times using plain strings.

---

## BrainFrost

Official website:

```text
https://www.brainfrost.com.br/
```

Standard UTM parameters:

```text
utm_source=linkedin
utm_medium=organic_social
utm_campaign=brainfrost_beta
utm_content=<post_slug>
```

Example:

```text
https://www.brainfrost.com.br/?utm_source=linkedin&utm_medium=organic_social&utm_campaign=brainfrost_beta&utm_content=contexto_preso
```

If a BrainFrost post has no manually approved UTM URL, the system may generate one.

Never overwrite a manually approved UTM URL.

---

## Analytics Checkpoints

Target checkpoints:

```text
1h
24h
72h
```

Every snapshot must preserve:

```text
captured_at
post_age_minutes
```

Do not pretend an approximate measurement was captured at an exact checkpoint.

Example:

```text
73h43m
```

may be associated with the 72h checkpoint, but the real age must remain stored.

---

## Development Environment

Primary operating system:

```text
Windows
```

Preferred stack:

```text
Node.js
TypeScript
SQLite
Vitest
Zod
Pino
Fastify or Express
```

ORM preference:

```text
Drizzle ORM
```

Prisma is acceptable if there is a clear reason.

---

## Architecture Principles

Prefer:

- modular monolith
- explicit interfaces
- idempotent services
- SQLite
- local-first execution
- simple scheduler
- strong validation
- structured logs

Avoid:

- microservices
- unnecessary queues
- Redis unless later proven necessary
- paid hosting dependency
- paid automation platforms
- overengineering

---

## Security

Never:

- commit `.env`
- log credentials
- expose client secrets to frontend code
- store access tokens unencrypted if avoidable
- assume refresh tokens are always available
- silently retry ambiguous publishing operations

Default:

```env
DRY_RUN=true
```

---

## Publishing Safety

A post may only move to publishing when all conditions are valid.

Before publication, verify:

```text
Status
scheduled_at
content
media if required
local publication state
LinkedIn publication state if known
idempotency key
```

Never publish twice because of retry uncertainty.

Ambiguous states must become:

```text
reconciliation_required
```

---

## Editorial Context

The owner's LinkedIn content should sound like an engineer sharing real work.

Avoid:

- guru tone
- generic creator language
- fake hooks
- excessive emojis
- repeated listicle structures
- overly polished AI-generated tone

Main editorial pillars:

```text
Practical tools
Concepts explained simply
Data Engineering / Architecture
BrainFrost building in public
```

BrainFrost should not dominate the feed.

Reference cadence:

```text
1 BrainFrost post for every 3–4 technical posts
```

---

## Final Product Goal

The final workflow should be:

```text
Write/review post in Notion
→ Approve
→ System queues
→ Publishes on LinkedIn
→ Updates Notion
→ Collects analytics
→ Stores snapshots
→ Updates Notion summary
→ Supports editorial analysis
```
```

---

## `docs/ARCHITECTURE.md`

```md
# Architecture

## Overview

LinkedIn_Monitor is a local-first TypeScript application responsible for connecting:

```text
Notion
LinkedIn
SQLite
LinkedIn XLSX exports
GA4/UTM context
```

The project should be implemented as a modular monolith.

---

## Core Architecture

```text
Notion
  ↓
Editorial Repository
  ↓
Queue Service
  ↓
SQLite
  ↓
Scheduler
  ↓
Publishing Service
  ↓
LinkedIn API

LinkedIn API / XLSX
  ↓
Analytics Provider
  ↓
Analytics Service
  ↓
SQLite snapshots
  ↓
Notion summary
```

---

## Source of Truth Boundaries

### Notion

Responsible for:

```text
editorial status
post content
scheduled date
scheduled time
media references
campaign information
editorial notes
summary analytics
```

### SQLite

Responsible for:

```text
operational state
publication attempts
idempotency
OAuth token metadata
LinkedIn URNs
analytics snapshots
scheduler state
reconciliation state
```

---

## Suggested Project Structure

```text
LinkedIn_Monitor/
│
├─ AGENTS.md
├─ PROJECT_CONTEXT.md
├─ README.md
├─ .env.example
├─ package.json
│
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ LINKEDIN_SETUP.md
│  ├─ NOTION_SCHEMA.md
│  ├─ ANALYTICS.md
│  ├─ OPERATIONS.md
│  └─ EDITORIAL_WORKFLOW.md
│
├─ src/
│  ├─ config/
│  │  └─ env.ts
│  │
│  ├─ notion/
│  │  ├─ notionClient.ts
│  │  ├─ notionRepository.ts
│  │  ├─ notionContentParser.ts
│  │  └─ notionMapper.ts
│  │
│  ├─ linkedin/
│  │  ├─ linkedinAuth.ts
│  │  ├─ linkedinClient.ts
│  │  ├─ linkedinPosts.ts
│  │  ├─ linkedinMedia.ts
│  │  └─ linkedinAnalytics.ts
│  │
│  ├─ analytics/
│  │  ├─ providers/
│  │  │  ├─ linkedinApiProvider.ts
│  │  │  └─ linkedinXlsxProvider.ts
│  │  ├─ analyticsService.ts
│  │  └─ analyticsModels.ts
│  │
│  ├─ scheduling/
│  │  ├─ queueService.ts
│  │  ├─ postScheduler.ts
│  │  └─ analyticsScheduler.ts
│  │
│  ├─ publishing/
│  │  ├─ publishingService.ts
│  │  ├─ publicationValidator.ts
│  │  └─ idempotencyService.ts
│  │
│  ├─ reconciliation/
│  │  └─ reconciliationService.ts
│  │
│  ├─ storage/
│  │  ├─ database.ts
│  │  ├─ schema.ts
│  │  ├─ publicationRepository.ts
│  │  ├─ analyticsRepository.ts
│  │  └─ tokenRepository.ts
│  │
│  ├─ cli/
│  │  ├─ importLinkedinReport.ts
│  │  ├─ reconcile.ts
│  │  ├─ authStatus.ts
│  │  └─ dryRun.ts
│  │
│  ├─ api/
│  │  ├─ server.ts
│  │  └─ routes/
│  │     ├─ linkedinAuth.ts
│  │     └─ health.ts
│  │
│  └─ utils/
│     ├─ logger.ts
│     ├─ retry.ts
│     ├─ time.ts
│     └─ slug.ts
│
└─ tests/
```

---

## State Model

Editorial state and operational state must not be the same thing.

### Editorial state

Comes from Notion:

```text
Ideia
Em produção
Em revisão
Aprovado
Agendado
Publicado
```

### Operational state

Stored locally:

```text
idle
queued
publishing
published
failed
reconciliation_required
```

---

## Publication Flow

```text
Notion Status=Aprovado
        ↓
validate
        ↓
queue local record
        ↓
Notion Status=Agendado
        ↓
wait until scheduled_at
        ↓
publishing
        ↓
LinkedIn API
        ↓
persist LinkedIn URN immediately
        ↓
update Notion
        ↓
published
```

---

## Idempotency

Recommended key:

```text
notion_page_id + scheduled_at
```

Never rely on only one source for idempotency.

Check:

```text
local publication record
LinkedIn URN
Notion Scheduler ID
Notion Post URL
operational state
```

---

## Ambiguous Publication

If the LinkedIn API may have accepted a publication but the client lost the response:

do not blindly retry.

Set:

```text
reconciliation_required
```

and require reconciliation logic.

---

## Retry Policy

Retry only recoverable failures:

```text
429
5xx
timeouts
temporary network failures
```

Use exponential backoff with jitter.

Do not automatically retry:

```text
400
401
403
```

unless the error is explicitly handled.

---

## Dry Run

Default:

```env
DRY_RUN=true
```

Dry run must:

```text
validate post
resolve content
resolve media
resolve UTM
calculate scheduled timestamp
show payload preview
skip LinkedIn POST
skip real media upload
avoid Published status
```

---

## Deployment Philosophy

Initial execution:

```text
local Windows machine
```

Optional:

```text
Windows Task Scheduler
```

Later deployment may use:

```text
Vercel cron
GitHub Actions
free-tier serverless
small VPS
```

but no paid dependency should be mandatory.
```

---

## `docs/LINKEDIN_SETUP.md`

```md
# LinkedIn Integration Setup

## Objective

Configure official LinkedIn API access for publishing and, when approved, analytics.

---

## Rules

Use only official LinkedIn APIs.

Do not use:

```text
scraping
browser automation
private endpoints
session cookies
DOM automation
```

---

## Developer Application

Create a LinkedIn Developer application.

Document:

```text
Client ID
Redirect URI
Enabled products
Approved scopes
API version
```

Never document secrets in Git.

---

## OAuth Flow

Use official Authorization Code Flow.

Expected routes:

```text
GET /auth/linkedin
GET /auth/linkedin/callback
```

---

## Initial Scopes

Depending on current official documentation and app access:

```text
openid
profile
email
w_member_social
```

Future analytics scope:

```text
r_member_postAnalytics
```

The implementation must verify scopes dynamically.

Do not assume a scope is available simply because it exists in documentation.

---

## Token Storage

Store metadata:

```text
access_token
access_token_expires_at
refresh_token if received
refresh_token_expires_at if received
authorized_scopes
created_at
updated_at
```

Tokens should be stored securely.

Do not log token values.

---

## Refresh Tokens

Do not assume LinkedIn always returns refresh tokens.

The system must support:

```text
refresh token mode
or
manual OAuth reauthorization
```

Create:

```text
npm run auth:status
```

Expected output:

```text
LinkedIn authenticated: yes
Access token expires: ...
Refresh supported: yes/no
Scopes:
- ...
```

---

## API Version

Use environment variable:

```env
LINKEDIN_API_VERSION=
```

Never hardcode an obsolete version.

Before implementing or updating endpoints, verify the current official LinkedIn documentation.

Required headers may include:

```text
Linkedin-Version
X-Restli-Protocol-Version: 2.0.0
Authorization: Bearer ...
```

Follow current documentation if requirements change.

---

## Publishing Formats

Support only formats confirmed by the current LinkedIn Posts API.

Planned internal types:

```text
text
single_image
multi_image
video
document
```

Do not assume organic carousel support.

If Notion says:

```text
Formato = Carrossel
```

and current official API documentation does not support that mapping:

return:

```text
UNSUPPORTED_FORMAT
```

Do not silently transform it into another format.

---

## Publishing Functions

Suggested functions:

```ts
getAuthenticatedMember()

createTextPost()

createImagePost()

createMultiImagePost()

createVideoPost()

createDocumentPost()
```

---

## Media Flow

Typical media flow:

```text
register upload
→ upload bytes
→ wait for processing if required
→ create post referencing media asset
→ receive LinkedIn post URN
```

Exact implementation must follow current LinkedIn documentation.

---

## Publication Result

Persist immediately after LinkedIn confirms creation:

```text
linkedin_post_urn
linkedin_post_id
published_at
response metadata
```

Only after local persistence should Notion be updated.

---

## Error Handling

Recoverable:

```text
429
5xx
timeouts
temporary network failure
```

Non-recoverable without intervention:

```text
400
401
403
unsupported format
missing permissions
invalid media
```

---

## Reauthorization

If token expires and refresh is unavailable:

mark authentication state as:

```text
reauthorization_required
```

Do not repeatedly call LinkedIn with an expired token.
```

---

## `docs/NOTION_SCHEMA.md`

```md
# Notion Schema

## Database

Name:

```text
Calendário Editorial LinkedIn
```

Data Source ID:

```text
3b1f73c4-d13e-4f4e-b5d8-d6a038e9ec99
```

---

## Editorial Fields

```text
Post
Status
Data
Horário
Pilar
Formato
Arte
BrainFrost?
Objetivo
Mídia URL
Post URL
UTM URL
Observações
```

---

## Automation Fields

```text
Pronto para publicar
Scheduler ID
Publicado em

Coleta 1h
Coleta 24h
Coleta 72h

Última coleta
Erro automação
```

---

## Analytics Fields

```text
Impressões 1h
Alcance 1h

Impressões 24h
Alcance 24h

Impressões 72h
Alcance 72h

Reações
Comentários
Compartilhamentos
Salvamentos
Visitas ao perfil
Novos seguidores
Cliques

Taxa de engajamento
Impressões por pessoa
CTR de clique
```

---

## Status Flow

```text
Ideia
→ Em produção
→ Em revisão
→ Aprovado
→ Agendado
→ Publicado
```

---

## Content Source

Post text lives inside the Notion page body.

The application should look for:

```md
## Texto final
```

or:

```md
## Texto publicado
```

Publishing priority:

```text
Texto final
then Texto publicado
```

If neither exists:

```text
BLOCK_PUBLICATION
```

---

## Queue Eligibility

A post may be queued only if:

```text
Status = Aprovado

Data exists

Horário exists

Arte = Pronta
or
Arte = Não precisa

Pronto para publicar = true

Scheduler ID empty

Post URL empty
```

Additional validation happens locally.

---

## Canonical Schedule

Notion currently stores:

```text
Data
Horário
```

Application must convert these into:

```text
scheduled_at
```

with timezone:

```text
America/Sao_Paulo
```

Example:

```text
2026-10-05T18:10:00-03:00
```

---

## UTM Logic

For BrainFrost posts:

If:

```text
BrainFrost? = true
```

and:

```text
UTM URL is empty
```

the application may generate a URL.

Base:

```text
https://www.brainfrost.com.br/
```

Standard:

```text
utm_source=linkedin
utm_medium=organic_social
utm_campaign=brainfrost_beta
utm_content=<slug>
```

Never overwrite a manually filled UTM URL.

---

## Notion Summary vs History

Notion should show summary values.

SQLite should preserve full analytics history.

Do not rely on Notion summary fields as the only analytics history.

---

## Future Snapshot Database

Optional future Notion database:

```text
LinkedIn Analytics Snapshots
```

Potential relation:

```text
Post → Calendário Editorial LinkedIn
```

This is optional because SQLite remains the canonical historical store.
```

---

## `docs/ANALYTICS.md`

```md
# Analytics

## Objective

Collect comparable LinkedIn post performance data while preserving the real capture time of each measurement.

---

## Analytics Providers

Define interface:

```ts
interface AnalyticsProvider {
  collect(post: PublishedPost): Promise<AnalyticsSnapshot>;
}
```

Providers:

```text
LinkedInApiAnalyticsProvider
LinkedInXlsxAnalyticsProvider
```

Possible future provider:

```text
ManualAnalyticsProvider
```

The rest of the system should not depend on where the metrics came from.

---

## Snapshot Model

Suggested fields:

```text
id

notion_page_id

linkedin_post_urn

checkpoint

captured_at

post_age_minutes

impressions

reach

reactions

comments

shares

saves

sends

profile_views

followers_gained

link_clicks

premium_cta_clicks

source

raw_payload

created_at
```

---

## Sources

```text
linkedin_api
linkedin_xlsx
manual
```

---

## Checkpoints

Target:

```text
1h
24h
72h
```

Recommended windows:

```text
1h:
60–90 minutes

24h:
1440–1500 minutes

72h:
>= 4320 minutes
```

Always store actual age.

Example:

```text
checkpoint = 72h
post_age_minutes = 4423
```

This represents approximately:

```text
73h43m
```

---

## Never Fake Precision

If a report was collected at:

```text
26h
```

do not store it as if it were exactly:

```text
24h
```

Store real age.

The checkpoint may still be categorized as the nearest operational bucket when appropriate.

---

## API Analytics

When LinkedIn analytics access becomes available:

expected scope may include:

```text
r_member_postAnalytics
```

Potential metrics may include:

```text
impressions
members reached
reactions
comments
reshares
post saves
post sends
link clicks
followers gained
profile views
```

Exact metric names must be verified against current official LinkedIn documentation.

---

## XLSX Fallback

CLI:

```bash
npm run analytics:import -- report.xlsx
```

The importer should:

```text
read XLSX
detect report format
detect LinkedIn post identity
match Notion page
extract metrics
detect generated timestamp if possible
calculate post age
suggest checkpoint
show preview
persist snapshot
update Notion summary
```

Default behavior:

require confirmation before persistence.

Optional:

```bash
--yes
```

for trusted automation.

---

## Ambiguous Fields

LinkedIn XLSX exports may contain:

```text
duplicate labels
ambiguous metric names
layout changes
```

The parser must never guess silently.

When ambiguous:

```text
flag ambiguity
store raw value
show warning
require explicit parser rule
```

---

## Notion Summary

When a new snapshot is saved:

update relevant Notion summary fields.

For checkpoint-specific fields:

```text
Impressões 1h
Alcance 1h

Impressões 24h
Alcance 24h

Impressões 72h
Alcance 72h
```

Latest cumulative fields:

```text
Reações
Comentários
Compartilhamentos
Salvamentos
Visitas ao perfil
Novos seguidores
Cliques
```

These should represent the latest known snapshot.

History stays in SQLite.

---

## Derived Metrics

Examples:

```text
engagement_per_reach

impressions_per_reached_member

profile_view_rate

click_rate

follower_conversion
```

Do not compare posts across different ages without labeling the difference.

---

## GA4 / BrainFrost

Future correlation fields:

```text
site_sessions
signups
activations
```

Suggested funnel:

```text
LinkedIn impression
→ LinkedIn click
→ site session
→ signup
→ activation
```

Activation can later be defined as something meaningful in BrainFrost, for example:

```text
first project created
first README imported
first context generated
```

Do not implement GA4 correlation until the website tracking model is confirmed.
```

---

## `docs/OPERATIONS.md`

```md
# Operations

## Local Execution

Primary environment:

```text
Windows
```

---

## Required Commands

Expected:

```bash
npm install

npm run dev

npm run scheduler

npm run collect

npm run analytics:import -- report.xlsx

npm run reconcile

npm run auth:status

npm run test

npm run lint
```

---

## Environment

Example:

```env
NODE_ENV=development

DRY_RUN=true

TIMEZONE=America/Sao_Paulo

NOTION_TOKEN=
NOTION_DATA_SOURCE_ID=3b1f73c4-d13e-4f4e-b5d8-d6a038e9ec99

LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=

LINKEDIN_API_VERSION=

LINKEDIN_ANALYTICS_ENABLED=false

BRAINFROST_BASE_URL=https://www.brainfrost.com.br/
BRAINFROST_UTM_CAMPAIGN=brainfrost_beta

DATABASE_PATH=./data/linkedin-monitor.sqlite
```

---

## Safe Defaults

Default:

```env
DRY_RUN=true
LINKEDIN_ANALYTICS_ENABLED=false
```

---

## Scheduler

The scheduler should run periodically.

Recommended local interval:

```text
every 1–5 minutes
```

It should:

```text
queue eligible posts
publish due posts
check pending analytics
run reconciliation checks
```

---

## Windows Scripts

Suggested files:

```text
scripts/start-server.ps1
scripts/start-scheduler.ps1
scripts/run-analytics.ps1
scripts/reconcile.ps1
```

---

## Windows Task Scheduler

Possible tasks:

```text
LinkedIn Monitor Server
LinkedIn Monitor Scheduler
LinkedIn Monitor Reconcile
```

The system must document:

```text
working directory
Node path
environment loading
log path
restart behavior
```

---

## Logs

Use structured logs.

Recommended fields:

```text
timestamp
level
action
notion_page_id
post_title
scheduled_at
linkedin_post_urn
checkpoint
result
error_code
```

Never log credentials.

---

## Retry

Retry only:

```text
429
5xx
timeouts
temporary DNS/network errors
```

Use:

```text
exponential backoff
jitter
retry cap
```

Do not automatically retry ambiguous publication results.

---

## Reconciliation

Command:

```bash
npm run reconcile
```

Checks:

```text
queued post past scheduled time

publishing state older than expected

LinkedIn URN stored locally but Notion not Published

Notion Published but local publication missing

Post URL empty

checkpoint overdue

Scheduler ID duplicated

two local publications for same Notion page

BrainFrost post without UTM

media inaccessible

expired LinkedIn authentication
```

Classify each finding:

```text
SAFE_FIX
MANUAL_REVIEW
```

Do not automatically republish under reconciliation.

---

## Backup

SQLite database should be backed up periodically.

Simple approach:

```text
copy SQLite file before migrations
```

Never run destructive schema migrations without backup.

---

## Database Migrations

Use explicit migrations.

Never:

```text
drop analytics history
truncate publication table
reset production database automatically
```

---

## Deployment

Local execution is the initial supported mode.

Potential future low-cost options:

```text
GitHub Actions
free-tier serverless
small VM
Vercel functions where appropriate
```

Do not make the project depend on paid hosting.
```

---

## `docs/EDITORIAL_WORKFLOW.md`

```md
# Editorial Workflow

## Purpose

Preserve the editorial strategy and tone used for Cauã Ferreira's LinkedIn content.

The automation must not change the content strategy.

---

## Editorial Positioning

Main professional positioning:

```text
Data Engineering
Technical Leadership
Data Architecture
Practical engineering
```

BrainFrost is part of the content strategy, but the LinkedIn profile must not become a product advertising channel.

---

## Main Pillars

### Practical daily tools

Examples:

```text
Git
GitLens
AWS CLI
VS Code
.env
.gitignore
.gitkeep
```

### Concepts explained simply

Examples:

```text
CSV vs Parquet
CDC vs carga incremental
Data Mesh
Lakehouse
schema evolution
```

### Data Engineering / Architecture

Examples:

```text
Data Lake
AWS
S3
Glue
Lambda
Airflow
Step Functions
Iceberg
orchestration
governance
```

### BrainFrost building in public

Examples:

```text
why the product exists
context loss between AI tools
README → reusable context
product decisions
user validation
lessons learned
```

---

## Tone

The voice should feel like:

```text
an engineer sharing real work with other professionals
```

Prefer:

```text
concrete examples
real situations
simple explanations
technical nuance
natural questions
```

Avoid:

```text
guru tone
generic motivational language
fake urgency
clickbait
excessive emojis
repetitive listicles
AI-sounding phrasing
generic creator language
```

---

## Examples of Natural Openings

```text
Uma coisa simples que uso nos meus projetos...
```

```text
Quem mexeu nessa linha?
```

```text
O problema não era a IA...
```

```text
Tem coisa que eu ainda prefiro fazer pelo Console da AWS...
```

---

## Post Structure

A useful default structure:

```text
real problem or observation

simple explanation

example

technical nuance or limitation

genuine question
```

Do not force this exact structure into every post.

---

## BrainFrost Message

Core message:

```text
Seu jeito de trabalhar tem valor.
Ele pode acompanhar você de um projeto para outro
e de uma IA para outra.
```

BrainFrost content should focus on:

```text
real problem
demonstration
learning
context
memory
validation
building in public
```

Avoid feature-dump posts.

---

## Cadence

General target:

```text
2–3 posts per week
```

Reference mix:

```text
1 BrainFrost post
for every
3–4 technical posts
```

This is a guideline, not an inflexible rule.

---

## Format Strategy

### Text only

Use for:

```text
experience
opinion
story
problem
conversation
```

### Vertical image

Preferred size:

```text
1080 × 1440
```

Use for:

```text
single visual concept
comparison
diagram
```

### Carousel

Use for:

```text
multi-step explanation
dense concept
sequence
```

### Video / GIF

Use for:

```text
BrainFrost demo
workflow demo
screen recording
```

---

## Analytics Interpretation

Compare similar age windows.

Primary checkpoints:

```text
1h
24h
72h
```

Separate:

### Volume

```text
impressions
reach
```

### Depth

```text
reactions
comments
shares
saves
```

### Conversion

```text
profile views
followers
link clicks
site visits
signups
activations
```

Do not infer causation from only one or two posts.

Do not claim:

```text
LinkedIn suppressed the post
```

without evidence.

Treat hypotheses as hypotheses.

---

## Editorial Decision Rule

When analyzing results:

prefer:

```text
pattern across multiple posts
```

over:

```text
reaction to one post
```

Do not change posting strategy after one weak post unless there is a clear technical or editorial issue.

---

## Notion Workflow

Editorial states:

```text
Ideia
→ Em produção
→ Em revisão
→ Aprovado
→ Agendado
→ Publicado
```

The approved text should live in:

```md
## Texto final
```

After publication it may optionally be preserved under:

```md
## Texto publicado
```

---

## Automation Boundaries

The automation may:

```text
queue
publish
collect analytics
update statuses
generate UTM
store metrics
```

The automation must not:

```text
rewrite approved editorial copy
change tone
modify CTA
change media
replace UTM manually approved by the user
```
```

---

## `README.md` — opcional, mas eu criaria também

```md
# LinkedIn_Monitor

Personal LinkedIn publishing and analytics automation.

## Purpose

Use Notion as the editorial source of truth while automating:

```text
scheduling
publishing
analytics
XLSX imports
UTM generation
reconciliation
```

## Documentation

Read in this order:

```text
PROJECT_CONTEXT.md
AGENTS.md
docs/ARCHITECTURE.md
docs/NOTION_SCHEMA.md
docs/LINKEDIN_SETUP.md
docs/ANALYTICS.md
docs/OPERATIONS.md
docs/EDITORIAL_WORKFLOW.md
```

## Safety

Default:

```env
DRY_RUN=true
```

No real LinkedIn post should be published during development or tests.

## Status

Implementation should follow the phased plan described in the project context and agent instructions.
```

---

# Prompt final para dar ao Codex

Depois de criar esses arquivos no repo, eu usaria exatamente este prompt:

```text
Quero que você assuma a implementação do projeto LinkedIn_Monitor.

ANTES DE ESCREVER OU ALTERAR QUALQUER CÓDIGO:

1. Leia integralmente:

AGENTS.md
PROJECT_CONTEXT.md
README.md

2. Depois leia todos os arquivos dentro de:

docs/

especialmente:

docs/ARCHITECTURE.md
docs/LINKEDIN_SETUP.md
docs/NOTION_SCHEMA.md
docs/ANALYTICS.md
docs/OPERATIONS.md
docs/EDITORIAL_WORKFLOW.md

Esses arquivos são a fonte de verdade do projeto.

Não repita o planejamento sem necessidade.
Quero que você inspecione o estado atual do repositório e comece a implementação.

REGRAS IMPORTANTES

- Não invente endpoints, scopes ou comportamentos da API do LinkedIn.
- Sempre consulte a documentação oficial atual antes de implementar integrações LinkedIn.
- Se a documentação atual divergir dos arquivos do projeto, siga a documentação oficial e atualize os arquivos Markdown explicando a mudança.
- Não use scraping.
- Não use automação de browser para publicar.
- Não use serviços pagos.
- Não publique nada real enquanto DRY_RUN=true.
- Não coloque segredos no código.
- Não sobrescreva histórico de analytics.
- SQLite deve ser a fonte operacional.
- Notion deve continuar sendo a fonte editorial.
- Preserve idempotência.
- Nunca faça retry automático quando houver dúvida se um post já foi publicado.

QUERO QUE VOCÊ SIGA ESTAS FASES:

FASE A — FUNDAÇÃO

- inspecionar repo
- inicializar Node + TypeScript se necessário
- instalar dependências essenciais
- configurar lint e testes
- configurar Zod para env
- criar SQLite
- criar migrations
- criar estrutura de pastas
- implementar Notion client
- implementar leitura de posts
- implementar parser de "Texto final"
- implementar validação
- implementar scheduled_at usando America/Sao_Paulo
- implementar DRY_RUN
- implementar logs estruturados
- implementar testes

FASE B — ANALYTICS LOCAL / XLSX

Antes da integração real com LinkedIn analytics:

- implementar modelo analytics_snapshots
- implementar AnalyticsProvider
- implementar LinkedInXlsxAnalyticsProvider
- criar:

npm run analytics:import -- arquivo.xlsx

- preservar raw payload
- calcular post_age_minutes
- sugerir checkpoint
- atualizar resumo do Notion
- criar testes com os formatos reais do XLSX exportado pelo LinkedIn

FASE C — LINKEDIN AUTH + TEXTO

- verificar documentação oficial atual
- implementar OAuth
- implementar auth:status
- armazenar tokens com segurança
- suportar cenário sem refresh token
- implementar publicação apenas de texto primeiro
- testar tudo em DRY_RUN
- criar teste manual controlado

FASE D — SCHEDULER + MÍDIA

- implementar fila local
- implementar estados operacionais
- implementar scheduler
- implementar idempotência
- implementar single image
- multi image
- video
- document, se suportado
- tratar formato não suportado explicitamente

FASE E — RECONCILIAÇÃO

Criar:

npm run reconcile

Detectar:

- posts atrasados
- inconsistências Notion x SQLite
- publicações ambíguas
- checkpoints faltando
- autenticação expirada
- URNs duplicados
- UTMs ausentes
- mídia inacessível

Classificar:

SAFE_FIX
MANUAL_REVIEW

Nunca republicar automaticamente durante reconciliação.

FASE F — LINKEDIN ANALYTICS API

Somente quando houver acesso disponível:

- implementar LinkedInApiAnalyticsProvider
- usar r_member_postAnalytics quando aprovado
- manter XLSX como fallback
- preservar exatamente o mesmo modelo AnalyticsSnapshot

FASE G — UTM / BRAINFROST

Implementar:

generateUtmUrl(post)

Padrão:

https://www.brainfrost.com.br/

utm_source=linkedin
utm_medium=organic_social
utm_campaign=brainfrost_beta
utm_content=<slug>

Nunca sobrescrever UTM URL preenchida manualmente no Notion.

Preparar o modelo para futura correlação com GA4:

site_sessions
signups
activations

Não implementar integração GA4 até que o tracking do BrainFrost esteja confirmado.

MODO DE TRABALHO

Ao terminar cada fase:

1. rode testes;
2. rode lint;
3. informe arquivos criados/alterados;
4. mostre comandos para eu testar;
5. informe qualquer bloqueio;
6. atualize documentação se necessário;
7. não avance silenciosamente se houver erro estrutural.

COMECE AGORA PELA FASE A.

Primeiro:
- leia todos os arquivos Markdown;
- inspecione o repositório;
- diga em poucas linhas o estado encontrado;
- em seguida implemente a FASE A.

Não me peça para criar arquivos que você mesmo pode criar.
Pare apenas se precisar de uma credencial, autorização OAuth ou ação externa que realmente dependa de mim.
```

Com isso, o Codex já entra no projeto com **arquitetura, regras, editorial, analytics, segurança e plano de execução definidos**, em vez de depender daquele prompt gigantesco toda vez.