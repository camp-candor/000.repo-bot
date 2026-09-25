# 🤖 AGENTS.md — Workspace Guidelines & Architecture

> Operational manual, monorepo architecture, testing specifications, target
> switching protocols, and coding standards for the `000.repo-bot` project.

---

## 1. Core Directives & Immutability Boundaries

- **System:** Standard NPM Monorepo (`workspaces: ["packages/*", "apps/*"]`). Do
  NOT introduce Nx, Lerna, Yarn, or PNPM.
- **Privacy:** Private repository (`"private": true`). Do NOT publish to public
  npm registries.
- **Git Commits:** Use standard conventional commit format via git directly:
  `git commit -m "type: description"`. Husky hooks automatically enforce build
  and staged linting.
- **TypeScript Integrity:** Strict mode is enforced. Avoid `any` where possible;
  handle `null` and `undefined` strictly. Maintain pure ESM exports.
- **ASCII Telemetry Enforcement:** Zero multi-byte UTF-8 emojis across all
  source files, logs, terminal strings, or console displays. Strict ASCII tokens
  only (`>>`, `[OK]`, `[FAIL]`, `::`, `[TARGET]`, `[STORAGE]`, `[CHAIN]`).
- **Dependency Purity:** Zero bloated third-party SDKs (`@octokit/*`,
  `@slack/*`, `axios`, `crypto-js`). Rely strictly on native Web Standards
  (`fetch`, `Response`, `Request`), Web Crypto (`crypto.subtle`), and standard
  Node.js built-ins.
- **RUNNER HARNESS BOUNDARY (`apps/995.library`):**
  - `apps/995.library` is the **canonical upstream terminal harness**.
  - **`apps/995.library/run.ts` IS THE ONLY FILE IN THIS DIRECTORY PERMITTED TO
    BE MODIFIED.** Modifications to `run.ts` are strictly quarantined to
    registering new package entrypoints, importing units, or mounting top-level
    root menu switchboard routes.
  - **ALL OTHER FILES IN `apps/995.library/` MUST NEVER BE MODIFIED UNDER ANY
    CIRCUMSTANCES.**
  - No new domain actions, reducers, models, buzzers, or domain-specific
    sub-menus may be defined inside `apps/995.library/`.
  - All domain features, ChatOps, terminal toggles, and state machines live
    strictly in `packages/*` or `apps/worker`.

---

## 2. Monorepo Architecture & Workspace Roles

```text
.
├── apps/
│   ├── worker/              # Cloudflare Worker Edge Isolate (@camp_candor/agent)
│   │   ├── src/             # Hono router + Durable Objects + D1 Audit Engine
│   │   └── test/            # Vitest worker pool unit tests & audit suites
│   └── 995.library/         # Terminal Runner Harness (@camp_candor/995.library)
│       ├── run.ts           # [SOLE ALLOWED EXCEPTION] Bootstraps Blessed Curses UI & mounts domain packages
│       └── ...              # [ALL OTHER FILES IMMUTABLE] Static UI engine, grid layout, base curses primitives
└── packages/
    ├── 000.agent/           # Core Agent Domain & Target Switchboard (@camp_candor/000.agent)
    │   ├── BEE.ts           # Agent unit registration & central wiring
    │   ├── 00.agent.unit/   # Agent core actions, process spawning, state store
    │   └── 98.menu.unit/    # Agent Menu Screen, Sub-routes, Local/Live Switchboard
    ├── 132.github/          # GitHub Operations & Fleet Control Deck (@camp_candor/132.github)
    │   ├── 00.github.unit/  # CAS merge executor, PR inspector, repo surveillance
    │   ├── 02.repo.unit/    # Repository registration & fleet CI health
    │   ├── 03.storage.unit/ # Cold storage telemetry, hash chain inspection, D1 forensic deck
    │   └── 98.menu.unit/    # Flight deck TUI & Cold Storage sub-menu
    ├── 821.repobot/         # Repobot Domain & Task State Machine (@camp_candor/821.repobot)
    └── 924.slack/           # Slack Bridge & Human Approval Gate (@camp_candor/924.slack)

```

### 2.1 Workspace Roles & Modification Permissions

| Workspace              | Package Name               | Modifiable?    | Primary Role & Tech Stack                                                                                  |
| ---------------------- | -------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------- |
| `apps/worker`          | `@camp_candor/agent`       | **YES**        | Cloudflare Worker Edge Control Plane (Hono, Durable Objects, D1 SQLite)                                    |
| `packages/000.agent`   | `@camp_candor/000.agent`   | **YES**        | Local Worker Lifecycle, Target Switchboard, Agent Telemetry                                                |
| `packages/132.github`  | `@camp_candor/132.github`  | **YES**        | Fleet Git Controller, CAS Merges, Cold Storage & Audit Sub-Menu                                            |
| `packages/821.repobot` | `@camp_candor/821.repobot` | **YES**        | In-flight Task FSM, Distributed Locks, Saga Recovery                                                       |
| `packages/924.slack`   | `@camp_candor/924.slack`   | **YES**        | Human-in-the-loop Slack Review Bridge, Block Kit UI                                                        |
| `apps/995.library`     | `@camp_candor/995.library` | **RESTRICTED** | Static Blessed UI layout primitives and Base Runner. **`run.ts` is the ONLY file permitted to be edited.** |

---

## 3. Terminal Extension Protocol

The base runner (`apps/995.library/run.ts`) acts as an orchestration switchboard
that dynamically mounts packages into the root menu:

1. `apps/995.library/run.ts` may be modified exclusively to import domain
   packages (`packages/*`) and link their top-level actions to the root menu
   choice array.
2. Domain units register their internal actions, reducers, and state machines
   inside their respective `packages/<unit>/BEE.ts`.
3. Navigation between domain units is executed by dispatching `ste.hunt(...)` or
   returning to `ROOT MENU`.
4. Console telemetry is soft-wrapped and directed to `cns00` using the
   standardized `logConsole(src, maxLen = 56)` utility.
5. **Never touch any file in `apps/995.library/` other than `run.ts`.** All grid
   configurations, console primitives, choice windows, and base models in that
   directory are frozen.

---

## 4. The Dynamic Target Switchboard (Local vs. Live / Staging Toggle)

To allow developers to test against local worker instances
(`http://127.0.0.1:8787`) or against the live Cloudflare edge isolate
(`https://repo-bot-00.berad4000.workers.dev`) without stopping the terminal
runner, the repository uses a **Global Dynamic Target Switchboard**.

### 4.1 Switchboard Mechanism & Flow

```text
               +-------------------------------------------+
               |        Blessed Runner: AGENT MENU         |
               +-------------------------------------------+
                                     |
               [Select: TARGET: [LOCAL] -> Switch to LIVE]
                                     |
                +--------------------+--------------------+
                |                                         |
         (Switched to LOCAL)                       (Switched to LIVE)
                |                                         |
     1. Spawns Child Process:                  1. Kills local child process (if any).
        "npx wrangler dev --port 8787"         2. Clears (global as any).agentBaseUrl
     2. Sets Global Pointer:                   3. Downstream units automatically fall
        (global as any).agentBaseUrl =            back to LIVE Cloudflare Edge:
        "[http://127.0.0.1:8787](http://127.0.0.1:8787)"                   "[https://repo-bot-00...workers.dev](https://repo-bot-00...workers.dev)"
                |                                         |
                +--------------------+--------------------+
                                     |
                                     v
         +-------------------------------------------------------+
         | Downstream Units (132.github, 03.storage.unit, etc.)  |
         | Invoke getBaseUrl() on EVERY Network Dispatch:        |
         | -> Routes immediately to active target with 0 latency |
         +-------------------------------------------------------+

```

### 4.2 The `agentBaseUrl` Global Contract

`packages/000.agent/98.menu.unit` acts as the single source of truth for the
local worker process lifecycle:

- **When targeting LOCAL:** `(global as any).agentBaseUrl` is set to
  `'http://127.0.0.1:8787'`.
- **When targeting LIVE:** `(global as any).agentBaseUrl` is deleted or set to
  `null` / `undefined`.

### 4.3 Standard `getBaseUrl()` Implementation Pattern

**Every domain package and buzzer unit communicating with the worker MUST
implement `getBaseUrl()` following this strict 4-tier precedence order.**

Copy and paste this exact standard into every buzzer unit requiring HTTP
ingress:

```typescript
/**
 * Resolves the active worker endpoint following the monorepo target cascade.
 * 1. (global as any).agentBaseUrl - Dynamic override toggled via AGENT MENU
 * 2. (global as any).<package>BaseUrl - Package-specific runtime override
 * 3. process.env.LOCAL_WORKER_URL / LIVE_WORKER_URL / WORKER_URL - Env variables
 * 4. Hardcoded Cloudflare Edge Staging URL fallback
 */
export const getBaseUrl = (): string => {
  return (
    (global as any).agentBaseUrl ||
    (global as any).githubBaseUrl ||
    process.env.LIVE_WORKER_URL ||
    process.env.WORKER_URL ||
    '[https://repo-bot-00.berad4000.workers.dev](https://repo-bot-00.berad4000.workers.dev)'
  ).replace(/\/$/, '')
}
```

> **CRITICAL RULE FOR FUTURE PACKAGES:** Never cache or store the output of
> `getBaseUrl()` in a module-level `const` or model property upon startup.
> Always invoke `getBaseUrl()` inside the action function at the moment of
> `fetch()` dispatch. This guarantees that when an operator toggles targets in
> the `AGENT MENU`, all subsequent queries across all menus immediately route to
> the new target without requiring an application restart.

### 4.4 Local Worker Lifecycle (Process Management)

When switching to `[LOCAL]`, `packages/000.agent` uses `node:child_process` to
spawn Wrangler:

```typescript
// Spawning local worker isolate on port 8787
const child = spawn('npx', ['wrangler', 'dev', '--port', '8787'], {
  cwd: path.resolve(process.cwd(), 'apps/worker'),
  shell: true,
  stdio: 'pipe',
})
```

- **Health Probing:** The agent polls `http://127.0.0.1:8787/` until an HTTP 200
  is returned before confirming `[ONLINE]` status in the terminal.
- **Process Teardown:** When switching back to `LIVE` or exiting the terminal,
  SIGTERM is sent to the child process tree to ensure no orphan Node or Wrangler
  processes linger on port 8787.

### 4.5 Cross-Package Integration Checklist

When building or updating a unit (e.g., `03.storage.unit`, `00.github.unit`,
`821.repobot`):

1. **Import/Check Global Pointer:** Verify `(global as any).agentBaseUrl` has
   top priority in `getBaseUrl()`.
2. **Terminal Telemetry Header:** Display the active target in the header box:

```typescript
const activeUrl =
  (global as any).agentBaseUrl || cpy.activeBaseUrl || getBaseUrl()
await logConsole(`>> ACTIVE TARGET: ${activeUrl}`)
```

3. **Unit Tests:** Add a unit test verifying that setting
   `(global as any).agentBaseUrl` redirects outbound network dispatches to port
   8787 and that deleting it falls back cleanly to the live URL.

---

## 5. Storage & Database Architecture (Hot D1 & Cold Git Drainage)

The system implements a **Dual-Ledger Audit Trail (FEAT-07 / FEAT-07-EXT)**:

### 5.1 Hot Relational Ledger (Cloudflare D1)

- **Binding:** `env.DB` (SQLite at the Edge).
- **Table:** `audit_events` (storing `sequence_id`, `task_id`, `repository`,
  `event_type`, `prev_hash`, `record_hash`, etc.).
- **Strategy A Self-Healing Schema Bootstrap:**
- `ensureAuditSchema(db)` in `apps/worker/src/audit/auditLedger.ts` auto-creates
  tables and indices idempotently on the first query.
- New developers running `npm run dev` or tests incur **zero migration
  friction**—local SQLite files in `.wrangler/state/v3/d1` initialize
  automatically.

### 5.2 Cold Plaintext Ledger (GitHub `audit-log` Branch)

- **Target Sink:** An orphan branch (`refs/heads/audit-log`) in
  `camp-candor/000.repo-bot`.
- **Format:** Deterministic, canonical Newline-Delimited JSON (`.ndjson`).
- **Cryptographic Provenance:** Recursive SHA-256 hash chaining:

$$H_n = \text{SHA-256}\left(H_{n-1} \parallel \text{CanonicalJCS}(E_n \setminus \{\text{hash}\})\right)$$

- **Drainage Cadence:**
- **Daily Cron:** `0 0 * * *` (Midnight UTC) commits daily chunks and prunes hot
  rows older than 7 days.
- **Overflow Valve:** Automatic immediate drainage if undrained hot records hit
  $\ge 1,000$.
- **Manual Trigger:** Invocable on-demand via the Blessed Flight Deck sub-menu.

---

## 6. Code Quality & Verification Matrix

Before committing any modifications across `apps/worker` or `packages/*`:

1. **Verify Boundary Invariance (`apps/995.library`):**

```bash
# Only run.ts is permitted to show modifications in apps/995.library/
git status -s apps/995.library/ | grep -v "run.ts"
# MUST RETURN 0 LINES

```

2. **Verify Zero Emojis:**

```bash
git grep -P "[\x{1F300}-\x{1FAD6}]" apps/ packages/
# MUST RETURN 0 MATCHES (Exit Code 1)

```

3. **Verify Dependency Purity:**

```bash
git grep -E "@octokit|@slack|axios|crypto-js" apps/worker/ packages/
# MUST RETURN 0 MATCHES (Exit Code 1)

```

4. **Compile TypeScript References:**

```bash
npx tsc -b
# MUST COMPLETE WITH 0 ERRORS

```

5. **Run Workspace Test Suites:**

```bash
npm run test:worker
npm run test:github
npm test
# ALL HARNESSES MUST PASS WITH EXIT CODE 0

```

```

```
