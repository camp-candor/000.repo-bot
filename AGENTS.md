# 🤖 AGENTS.md — Workspace Guidelines & Architecture

> Operational manual, monorepo architecture, testing specifications, and coding
> standards for the `000.repo-bot` project.

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
- **IMMUTABLE RUNNER BOUNDARY (`apps/995.library`):**
  - `apps/995.library` is the **canonical upstream terminal harness**.
  - **IT MUST NEVER BE MODIFIED UNDER ANY CIRCUMSTANCES.**
  - No new domain actions, reducers, models, buzzers, or menu screens may be
    added inside `apps/995.library/`.
  - All domain features, ChatOps, terminal toggles, and agent state live in
    `packages/000.agent` or `apps/worker`.

---

## 2. Monorepo Architecture & Workspace Roles

```text
.
├── apps/
│   ├── worker/              # Cloudflare Worker Edge Isolate (@camp_candor/agent)
│   │   ├── src/             # Hono router + pi-agent-cf orchestration + Durable Objects
│   │   └── test/            # Vitest worker pool unit tests & audit suites
│   └── 995.library/         # [IMMUTABLE] Terminal Runner Harness (@camp_candor/995.library)
│       ├── run.ts           # Bootstraps Blessed Curses UI & loads packages/000.agent
│       └── test/            # AVA 6 unit tests for base library
└── packages/
    └── 000.agent/           # Core Agent Domain & State Unit (@camp_candor/000.agent)
        ├── BEE.ts           # Agent unit registration & central wiring
        ├── 00.agent.unit/   # Agent core actions, reducers, WS connections
        ├── 98.menu.unit/    # Agent Menu Screen, Sub-routes, Local/Live Switchboard
        └── act/             # Action barrel re-exports
```

### 2.1 Workspace Roles & Modification Permissions

| Workspace            | Package Name               | Modifiable? | Primary Role & Tech Stack                                              |
| -------------------- | -------------------------- | ----------- | ---------------------------------------------------------------------- |
| `apps/worker`        | `@camp_candor/agent`       | **YES**     | Cloudflare Worker AI Control Plane (Hono, Durable Objects, Workers AI) |
| `packages/000.agent` | `@camp_candor/000.agent`   | **YES**     | Agent Redux/Buzzer Units, Menu Screens, Process Spawning, State Store  |
| `apps/995.library`   | `@camp_candor/995.library` | **NEVER**   | Static Blessed UI layout primitives, Grid, and Base Runner             |

---

## 3. Terminal Extension Protocol (Injecting via `packages/000.agent`)

The base runner (`apps/995.library/run.ts`) routes the `AGENT MENU` choice to
`packages/000.agent/98.menu.unit`:

1. All Agent-specific menus, toggles, prompts, and actions belong strictly in:
   - `packages/000.agent/98.menu.unit/`
   - `packages/000.agent/00.agent.unit/`

2. Never touch `apps/995.library/98.menu.unit/menu.*.ts` or add domain actions
   to `apps/995.library/`.
