# AGENTS.md -- Workspace Architecture & Operational Guidelines

> Operational manual, monorepo architecture, invariant specifications, coding
> standards, and historical-record index for the `repo-bot` ecosystem.
>
> `repo-bot` is the **upstream boilerplate**: a Deterministic Edge DevOps
> Control Plane (Cloudflare Worker + Durable Objects + LLM tool calling) paired
> with a Blessed terminal cockpit. Downstream repos (e.g. `npm-agent-02`,
> `001.goblin-lore`) are cloned from it, so every change here must stay
> **generic, identity-agnostic, and template-safe**.

---

## 0. Agent Onboarding -- Read This First

Before writing code, orient yourself in this order:

1. **This file** -- laws, boundaries, and the verification gauntlet.
2. **`data/overview/`** -- the _why_: architectural intent and design rationale.
3. **`data/building/`** -- the _how_: day-by-day build log of what was done.
4. **`data/directive/`** -- the _what_: the exact task specs and audit results
   that produced the current codebase, in execution order.
5. **The code** -- verify any historical claim against the live source before
   relying on it. History is context, not ground truth.

> If a historical document conflicts with the current code or with this file,
> **the current code and this file win**. Note the drift in your report.

---

## 1. Core Directives & Immutability Boundaries

- **System:** Standard NPM Monorepo (`workspaces: ["packages/*", "apps/*"]`). Do
  NOT introduce Nx, Lerna, Yarn, or PNPM.
- **Privacy:** Private repository (`"private": true`). Do NOT publish packages
  to public npm registries.
- **Git Commits:** Use standard conventional commit format via git directly:
  `git commit -m "type: description"` (`feat`, `fix`, `chore`, `refactor`,
  `test`, `docs`, `ci`).
- **TypeScript Integrity:** Strict mode is enforced (`strict: true`, pure ESM
  exports). Never emit compiled `.js` or `.d.ts` files side-by-side into `src/`
  directories.
- **Cross-Platform Scripts:** `package.json` scripts must run identically on
  Windows (cmd.exe / PowerShell) and POSIX. Prefer `node -e` one-liners over raw
  shell built-ins (`test -z`, `export`, `rm -rf`).
- **Template Generalization Law:** Never hardcode repository identity (e.g.
  `"REPO-BOT"`). Derive names/versions dynamically -- see
  `packages/100.agent/src/identity.ts` (`getRepoIdentity`).
- **HARNESS IMMUTABILITY BOUNDARY (`apps/995.library`):**
  `apps/995.library/995.library/**` is the canonical upstream terminal harness
  and is **STRICTLY IMMUTABLE**. Never add, modify, or delete models, reducers,
  actions, buzzers, or UI components inside `apps/995.library/995.library/`.
  `apps/995.library/run.ts` is the **only permitted modification path**.
- **Fail-Safe Exit:** If compilation, types, lint, tests, or the boundary check
  fail and cannot be remediated within scope, halt and emit `CONFLICT_BLOCKED`
  with diagnostic traces.

---

## 2. Monorepo Architecture & Workspace Roles

```text
.
├── apps/
│   ├── worker/                 # Cloudflare Worker Edge Control Plane (@camp_candor/agent)
│   │   ├── src/index.ts        # Hono router + AgentSessionDO + edge endpoints
│   │   ├── src/tools.core.ts   # Deterministic Git & DevOps tools (S_clean anchor)
│   │   ├── src/tools.custom.ts # Pluggable domain tool extension boundary
│   │   ├── src/redaction.ts    # In-flight secret redaction firewall
│   │   ├── src/rollbackEngine.ts # 4-Stage compensating saga rollback engine
│   │   └── test/               # unit/ (vitest-pool-workers), audit/ (live HTTP), infrastructure/, utils/
│   └── 995.library/            # Blessed Terminal UI Harness (@camp_candor/995.library)
│       ├── run.ts              # Dynamic package loader & CLI entrypoint (ONLY mutable file)
│       └── 995.library/        # [IMMUTABLE] Core Blessed Curses engine
│
├── packages/
│   └── 100.agent/              # Core Agent Domain & Terminal Cockpit (@camp_candor/100.agent)
│       ├── BEE.ts              # Unit registration & state manifest
│       ├── src/cascade.ts      # 4-tier endpoint resolution cascade & WS derivation
│       ├── src/identity.ts     # Dynamic repo identity (name/version from root package.json)
│       ├── 00.agent.unit/      # Agent core actions, reducers, WS connections + vitest suites
│       └── 98.menu.unit/       # Blessed Menu Screen, Local/Live Switchboard
│
└── data/                       # Historical record & generated artifacts (see Section 3)
    ├── overview/               # Architectural intent & design rationale
    ├── building/               # Chronological build logs
    ├── directive/              # Executed task specs & audit dossiers, by day
    ├── flat/                   # [GENERATED, gitignored] flattened library snapshots
    ├── unit/                   # [GENERATED, gitignored] scaffolded unit templates
    └── scratch-pad.md          # Working notes, phase lists, prompt shortcuts
```

---

## 3. The Historical Record (`data/`)

The `data/` directory is the repository's **institutional memory**. It records
how the codebase was designed, built, and verified so any agent can reconstruct
the reasoning behind the current state instead of re-deriving it.

### 3.1 `data/overview/` -- Architectural Intent (the WHY)

- **Contents:** Long-form design conversations, e.g.
  `Overview_ NPM-Agent.00.md`.
- **Purpose:** Captures the founding vision -- the dual-plane architecture (edge
  Worker + terminal cockpit), why RPG/lore baggage was replaced with the
  Deterministic Git/DevOps tool suite, and the rationale behind each invariant
  (TypeBox strictness, deterministic execution boundaries, Durable Object
  hibernation, zero-drift CI).
- **Use it when:** Making architectural decisions, adding new tools or
  invariants, or evaluating whether a change fits the template's intent.

### 3.2 `data/building/` -- Build Logs (the HOW)

- **Contents:** Chronological session transcripts, one per build day, e.g.
  `Building _ repo-bot.DAY-000..md`.
- **Purpose:** Records the prompts issued, the task specifications generated in
  response, and the epics worked (e.g. `EPIC-06-REMEDIATION-PHASE-1`). Shows the
  sequence of remediation phases and why particular fixes were chosen.
- **Use it when:** Debugging a regression, understanding why a file looks the
  way it does, or continuing an in-progress epic.

### 3.3 `data/directive/` -- Executed Directives (the WHAT)

- **Contents:** One sub-folder per working day (`day-000/`, `day-001/`, ...),
  each holding numbered, executable task specifications and their audits.
- **Purpose:** The precise, replayable instructions that mutated this repo,
  paired with the adversarial verification that certified each change. This is
  the closest thing to a ledger of _outcomes_.
- **Naming convention:** `NNN.<topic>.<agent>.md`

  | Segment   | Meaning                                                          |
  | --------- | ---------------------------------------------------------------- |
  | `NNN`     | Zero-padded execution order within the day (`000`-`999`)         |
  | `<topic>` | Short kebab-case subject (`clean-up`, `phase-two`, `name-issue`) |
  | `<agent>` | Intended executor / role (see table below)                       |

  | Agent suffix | Role                                                                                                              |
  | ------------ | ----------------------------------------------------------------------------------------------------------------- |
  | `jules`      | **Implementer** -- sandboxed coding worker; writes the change                                                     |
  | `gravity`    | **Architect / auditor** (Antigravity) -- check-ups, clean-outs, release work                                      |
  | `ag-test`    | **Adversarial verifier** (Antigravity) -- runs the falsifiable acceptance gauntlet for the preceding `jules` task |
  | `ag-check`   | Lightweight Antigravity review checkpoint                                                                         |

- **Typical cadence:** a `jules` implementation spec is followed by a `gravity`
  check-up or `ag-test` audit, e.g. `026.name-issue.jules.md` ->
  `027.name-issue.ag-test.md`.
- **Zero-byte files** are reserved slots / placeholders that were planned but
  not executed. Do not treat them as completed work.
- **Use it when:** Executing a new directive (follow the same structure: System
  Laws -> Mission -> File Manifest -> Falsifiable Acceptance Criteria), or
  tracing which directive introduced a given behavior.

### 3.4 Generated Artifacts (`data/flat/`, `data/unit/`)

- `data/flat/` -- output of the library `flatLibrary` buzzer (flattened code
  snapshots). Gitignored; safe to delete.
- `data/unit/` -- output of the library `createUnit` / `flattenUnit` buzzers.
  Gitignored; safe to delete.

### 3.5 Rules for the Historical Record

- **Append-only:** Never rewrite or delete past `overview/`, `building/`, or
  `directive/` documents. Add new numbered files instead.
- **Record new work:** When executing a multi-step epic, add the next numbered
  directive under the current `day-XXX/` folder rather than overwriting.
- **Verify, don't trust:** Historical specs may reference since-renamed paths
  (e.g. `camp-candor/000.repo-bot`). Always confirm against live code.

---

## 4. The Deterministic DevOps Protocol & S_clean Firewall

All automated operations executed by agents must obey the deterministic state
machine:

1. **Rollback Anchor Capture (S_clean):** Before provisioning changes, the agent
   must query `get_commit_sha` on trunk (`main`). The returned SHA
   ($S_{\text{clean}}$) acts as the immutable rollback point.
2. **Ephemeral Branch Isolation:** Direct mutations to `main` are structurally
   prohibited. All changes must be written to an ephemeral branch matching
   `spec/TASK-XX-<short-sha>` via `create_ephemeral_branch`.
3. **Bounded File Commits:** Files are committed strictly to the ephemeral
   branch via `write_repo_file` using safe Base64 encoding:
   `btoa(unescape(encodeURIComponent(content)))`.
4. **Trunk Promotion via Pull Request:** Changes are merged to trunk exclusively
   via `create_pull_request`, requiring automated CI validation and human
   sign-off.
5. **Watchdog Circuit Breaker & Saga Rollback:** If CI runs fail or checks
   divergence, `executeSagaRollback` invalidates task execution, closes open PRs
   with tombstones, and obliterates the ephemeral tracking branch.

---

## 5. Schema Integrity & Terminal Standards

- **Strict TypeBox Schemas:** All tool parameters must be declared using
  `@sinclair/typebox` with `{ additionalProperties: false }` explicitly
  configured.
- **Pluggable Tools:** Core DevOps tools live in `tools.core.ts`; domain tools
  for downstream repos belong in `tools.custom.ts`. Do not edit Hono route
  handlers to register tools.
- **Secret Hygiene:** Never log raw credentials. All outbound text passes
  through `redaction.ts`.
- **7-Bit Pure ASCII Compliance:** All terminal labels, console messages, and
  log tokens must use ASCII characters (`>>`, `[OK]`, `[FAIL]`, `[ONLINE]`,
  `::`). Unicode emojis are prohibited to prevent character corruption in
  terminal emulators. Verify with:
  `git grep -P "[\x{1F300}-\x{1FAD6}]" packages/ apps/worker/src apps/995.library/run.ts`
  (must return 0 matches).

---

## 6. Verification Gauntlet & Quality Gates

Execute the local verification gauntlet before pushing code or opening PRs:

```bash
# 1. Typecheck all project references
npm run check:types

# 2. Run full monorepo sequential test battery (worker -> agent -> library)
npm test

# 3. Assert Immutable Boundary Integrity (Must return 0 lines)
npm run check:boundary

# 4. Verify Unified Code Quality (types + prettier + eslint)
npm run check:all
```

### Quick Reference -- Common Scripts

| Script                 | Purpose                                         |
| ---------------------- | ----------------------------------------------- |
| `npm run tui`          | Launch the Blessed terminal cockpit             |
| `npm run worker:dev`   | Run the Worker locally via Wrangler (port 8787) |
| `npm run test:worker`  | Worker unit suites (vitest-pool-workers)        |
| `npm run test:agent`   | `100.agent` vitest suites                       |
| `npm run test:library` | `995.library` AVA suites                        |
| `npm run verify:local` | Boot local worker and run the live HTTP audit   |
| `npm run fix`          | Auto-fix prettier + eslint                      |
| `npm run ship:staging` | Build, deploy to staging, and run staging audit |
