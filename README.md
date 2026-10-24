# repo-bot

> Deterministic Edge DevOps Control Plane & Autonomous Agent Boilerplate. Built
> on Cloudflare Workers, Durable Objects, TypeBox, and Blessed TUI.

---

## Architecture Overview

```text
.
├── apps/
│   ├── worker/              # Cloudflare Worker Edge Control Plane (@camp_candor/agent)
│   │   ├── src/index.ts     # Hono router + AgentSessionDO + edge endpoints
│   │   ├── src/tools.core.ts# Deterministic Git & DevOps tools (S_clean anchor)
│   │   ├── src/tools.custom.ts # Sovereign tool extension boundary (merge=ours)
│   │   ├── src/redaction.ts # In-flight secret redaction firewall
│   │   ├── src/rollbackEngine.ts # 4-Stage compensating saga rollback engine
│   │   └── test/            # Vitest worker pool and E2E audit suites
│   └── 995.library/         # Blessed Terminal UI Harness (@camp_candor/995.library)
│       ├── run.ts           # Dynamic package loader & CLI entrypoint
│       └── 995.library/     # [IMMUTABLE] Core Blessed Curses engine
│
└── packages/
    └── 100.agent/           # Core Agent Domain & Terminal Cockpit
        ├── BEE.ts           # Unit registration & state manifest
        ├── src/cascade.ts   # 4-tier endpoint resolution cascade & WS derivation
        ├── 00.agent.unit/   # Agent core actions, reducers, WS connections
        └── 98.menu.unit/    # Blessed Menu Screen, Local/Live Switchboard
```

---

## Prerequisites

- **Node.js:** `>= 20.0.0`
- **npm:** `>= 10.0.0`
- **Cloudflare Account:** With Workers, Durable Objects, and Workers AI enabled
- **GitHub PAT:** With `repo` and `workflow` scopes

---

## Quickstart

### 1. Clone & Install

```bash
git clone https://github.com/your-org/repo-bot.git
cd repo-bot
npm ci
```

### 2. Configure Environment

```bash
# Root environment (used by packages/100.agent and CI scripts)
cp .env.example .env

# Worker environment (used by local wrangler dev)
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
```

Fill in `GITHUB_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_API_TOKEN`.

### 3. Verify Quality Gates

```bash
# Verify static compilation across all project references
npm run check:types

# Run the full monorepo sequential test battery
npm test

# Verify code formatting and linting
npm run check:all
```

### 4. Run the Local Control Plane

```bash
# Terminal 1: Boot the edge worker locally on port 8787
npm run worker:dev

# Terminal 2: Launch the Blessed curses cockpit
npm run tui
```

---

## Adding Custom Tools

Downstream tools must be added to `apps/worker/src/tools.custom.ts`. This file
is protected by `.gitattributes` (`merge=ours`), ensuring upstream template
updates will never overwrite your proprietary tools.

All custom tool parameter schemas must enforce TypeBox
`{ additionalProperties: false }`.
