# FEATURE & TASK REGISTRY: REPO-BOT DUAL-TRACK EDGE TELEMETRY

## FOCUS: Cloudflare Worker WebSocket Hibernation (`apps/worker`) & `connectRepobot` / `disconnectRepobot` Client Engine (`packages/821.repobot`)

**Repository:** `camp-candor/000.repo-bot`

**Primary Architecture Reference:**
[Overview _ Repo-Bot.03.md](https://gemini.google.com/notebook/25fcd56e-a95d-46f8-9b11-c9bace81da4b)

**Epic Identifier:** `EPIC-23-REPO-BOT-EDGE-TELEMETRY-WEBSOCKET-TRANSPORT`

---

### Executive Architectural Envelope

The implementation establishes a **Dual-Track Transport Architecture**:

1. **Track 1 (HTTP REST):** Retains transactional mutations, CAS merges, GitHub
   webhooks, and D1 writes over deterministic request-response routes with
   status codes (`201`, `409`, `412`, `504`) and idempotency deduplication.

2. **Track 2 (Persistent WebSocket):** Uses Cloudflare's **WebSocket Hibernation
   API** to maintain persistent telemetry connections at
   **$0.00 compute cost while idle**. The V8 isolate evicts from RAM when quiescent and awakens in $<2\text{
   ms}$ to push monotonic, 7-bit ASCII status frames (`seq: N+1`) into the
   Blessed curses console widget (`cns00`).

---

```
┌────────────────────────────────────────────────────────────────────────┐
│                   DUAL-TRACK EDGE TELEMETRY ARCHITECTURE               │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   LOCAL WORKSTATION (apps/995.library & packages/821.repobot)          │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ • 80.terminal.unit / 81.grid.unit (Blessed 12x12 Grid Layout)  │   │
│   │ • 83.console.unit  / cns00 (Real-Time Telemetry Viewport)      │   │
│   │ • 00.repobot.unit  / repobot.buzz.ts                           │   │
│   │   ├── connectRepobot()    ──► Manages Persistent WSS Link      │   │
│   │   └── disconnectRepobot() ──► Clean Teardown & Timer Clear     │   │
│   └───────────────▲────────────────────────────────┬───────────────┘   │
│                   │                                │                   │
│      Track 2: WSS │ (Inbound Telemetry Frames)     │ Track 1: HTTP     │
│       wss://.../ws/telemetry                       │ POST /repos       │
│                   │                                │ POST /fsm/...     │
│                   │                                ▼                   │
│   CLOUDFLARE EDGE ISOLATE (apps/worker)                                │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ Hono Edge Router (src/index.ts)                                │   │
│   │ • Upgrades WebSocket & delegates directly to RepoBotDO stub    │   │
│   └───────────────────────────────┬────────────────────────────────┘   │
│                                   │                                    │
│                                   ▼                                    │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │ RepoBotDO Singleton Actor (src/RepoBotDO.ts)                   │   │
│   │ • Cloudflare WebSocket Hibernation API (ctx.acceptWebSocket)   │   │
│   │ • Isolate sleeps at $0.00 compute cost while idle              │   │
│   │ • Wakes in <2ms on FSM transition / Webhook / D1 audit         │   │
│   │ • broadcastTelemetry() ──► Distributes Monotonic Sequenced     │   │
│   │                            7-Bit ASCII frames to clients       │   │
│   └────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘

```

---

## The Closed Ledger (Task Matrix)

| Task ID         | Task Scope                                                                    | Primary Target File(s)                                                                                                         | Criticality Tier |
| --------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| **`TASK-23.1`** | Edge WebSocket Ingress & Upgrade Gateway                                      | `apps/worker/src/index.ts`                                                                                                     | **Urgent**<br>   |
| **`TASK-23.2`** | Durable Object WebSocket Hibernation Engine                                   | `apps/worker/src/RepoBotDO.ts`                                                                                                 | **Urgent**<br>   |
| **`TASK-23.3`** | Broadcaster Hook Instrumentation Across Edge Subsystems                       | `apps/worker/src/prAuditEngine.ts`, `apps/worker/src/audit/auditLedger.ts`, `apps/worker/src/jules.ts`                         | **High**<br>     |
| **`TASK-23.4`** | Action, Model & Contract Definitions                                          | `packages/821.repobot/00.repobot.unit/repobot.action.ts`, `repobot.model.ts`, `fce/repobot.bit.ts`, `fce/repobot.interface.ts` | **High**<br>     |
| **`TASK-23.5`** | Self-Healing WebSocket Client Engine (`connectRepobot` & `disconnectRepobot`) | `packages/821.repobot/00.repobot.unit/buz/repobot.buzz.ts`                                                                     | **Urgent**<br>   |
| **`TASK-23.6`** | Flight Deck HUD Menu & Console Router Integration                             | `packages/821.repobot/98.menu.unit/buz/00.menu.buzz.ts`                                                                        | **Normal**<br>   |
| **`TASK-23.7`** | Negative-Control Test Harness & Resiliency Gauntlet                           | `apps/worker/test/unit/telemetryWebSocket.test.ts`, `packages/821.repobot/test/repobot.buzz.test.ts`                           | **High**<br>     |

---

### Task 23.1: Edge WebSocket Ingress & Upgrade Gateway

- **Target File:** `apps/worker/src/index.ts`

- **Criticality:** Tier 1 (Urgent)

- **User Story:** As an edge operator, I need `apps/worker` to accept
  `Upgrade: websocket` requests on `/ws/telemetry` and forward the raw socket
  handle directly to the global `RepoBotDO` instance, so that clients can
  establish persistent telemetry sessions without interfering with standard HTTP
  REST routes.

#### Technical Subtasks

- [ ] Intercept `GET /ws/telemetry` within the root Hono application router.

- [ ] Validate that the inbound request contains
      `header('Upgrade') === 'websocket'`; return `HTTP 426 Upgrade Required` if
      standard HTTP clients access the endpoint without upgrade semantics.

- [ ] Resolve the singleton Durable Object namespace using
      `c.env.REPO_BOT_DO.idFromName('global')`.

- [ ] Forward `c.req.raw` directly into `stub.fetch(c.req.raw)` to preserve the
      standard WebSocket handshake.

#### Acceptance Criteria

- Running
  `curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" [http://127.0.0.1:8787/ws/telemetry](http://127.0.0.1:8787/ws/telemetry)`
  initiates an `HTTP 101 Switching Protocols` handshake.

- Regular `GET` requests without the `Upgrade` header return `HTTP 426` with
  body `"Expected Upgrade: websocket"`.

---

### Task 23.2: Durable Object WebSocket Hibernation Engine

- **Target File:** `apps/worker/src/RepoBotDO.ts`

- **Criticality:** Tier 1 (Urgent)

- **User Story:** As an infrastructure architect, I need `RepoBotDO` to use
  Cloudflare's WebSocket Hibernation API (`ctx.acceptWebSocket`) so that
  telemetry links incur
  $0.00 in idle serverless execution costs and wake in $<2\text{ ms}$ upon
  broadcast events.

#### Technical Subtasks

- [ ] Instantiate `WebSocketPair()` upon handling `/ws/telemetry` inside
      `RepoBotDO.fetch`.

- [ ] Call `this.ctx.acceptWebSocket(server, ['operator'])` to register the
      server socket under the `'operator'` tag.

- [ ] Attach connection metadata via
      `server.serializeAttachment({ connectedAt: Date.now(), role: 'operator' })`.

- [ ] Implement `broadcastTelemetry(type, source, payload, asciiMsg)`:
- Iterate over all active/hibernating sockets returned by
  `this.ctx.getWebSockets('operator')`.

- Package a monotonically incremented sequence counter
  (`seq: ++this.telemetrySeq`) to support client-side drop detection.

- Send JSON envelopes containing timestamps, event types, raw payloads, and
  pre-formatted 7-bit clean ASCII log messages.

- [ ] Implement Cloudflare WebSocket Hibernation lifecycle hooks:
- `webSocketMessage(ws, message)`: Ingest client keep-alive pings (`"PING"`) and
  return `{ type: 'PONG', ts: Date.now() }`.

- `webSocketClose(ws, code, reason, wasClean)`: Gracefully close and clean up
  disconnected socket attachments.

- `webSocketError(ws, error)`: Trap transmission faults and close problematic
  handles with code `1011`.

#### Acceptance Criteria

- Connected sockets receive an immediate `HEARTBEAT` frame with `seq: 1` and
  `type: 'HEARTBEAT'` upon handshake completion.

- Calling `broadcastTelemetry` delivers frames to multiple concurrent client
  sockets and prunes broken connections without isolate crashes.

---

### Task 23.3: Broadcaster Hook Instrumentation Across Edge Subsystems

- **Target Files:**
- `apps/worker/src/RepoBotDO.ts` (`/fsm/transition` handler)

- `apps/worker/src/audit/auditLedger.ts` (`appendAuditEvent`)

- `apps/worker/src/prAuditEngine.ts` (`auditPullRequest`)

- `apps/worker/src/jules.ts` (`pollActiveJulesSessions`)

- **Criticality:** Tier 2 (High)

- **User Story:** As an operator, I need core state changes and audit events to
  dispatch live telemetry frames automatically, so that my terminal console
  reflects real-time edge activity without polling.

#### Technical Subtasks

- [ ] **FSM Transitions:** Instrument `POST /fsm/transition` in `RepoBotDO` to
      emit `type: 'TASK_TRANSITION'` with the previous state, next state, task
      ID, and lease epoch.

- [ ] **Hot D1 Ledger Appends:** Hook `appendAuditEvent()` to broadcast
      `type: 'AUDIT_LOG'` containing the sequence ID, event type, repository
      slug, and truncated SHA-256 hash.

- [ ] **PR Scope Check Invariants:** Hook `auditPullRequest()` to broadcast
      `type: 'PR_EVENT'` detailing pass/fail status, modified file count, and
      any policy violations.

- [ ] **Autonomous Agent Poller:** Hook `pollActiveJulesSessions()` to broadcast
      `type: 'JULES_EVENT'` when tasks require operator input in `#ask-jules`.

- [ ] Format all messages with pure 7-bit ASCII tokens (`>>`, `[FSM]`,
      `[AUDIT]`, `[SCOPE CHECK]`, `[JULES]`), avoiding UTF-8 emojis that corrupt
      Windows `cmd.exe`.

#### Acceptance Criteria

- Triggering a task transition on `RepoBotDO` immediately produces a formatted
  ASCII log line across active WebSocket listeners.

- Committing an audit row emits an `[AUDIT #seq]` frame containing the
  corresponding SHA-256 hash digest.

---

### Task 23.4: Action, Model & Contract Definitions

- **Target Files:**
- `packages/821.repobot/00.repobot.unit/fce/repobot.bit.ts`
- `packages/821.repobot/00.repobot.unit/fce/repobot.interface.ts`
- `packages/821.repobot/00.repobot.unit/repobot.action.ts`
- `packages/821.repobot/00.repobot.unit/repobot.model.ts`
- `packages/821.repobot/00.repobot.unit/repobot.reduce.ts`

- **Criticality:** Tier 2 (High)

- **User Story:** As a domain developer, I need explicit Redux-style action
  constants, interfaces, and state properties for Repobot telemetry, so that
  connection states are managed consistently within the unit store.

#### Technical Subtasks

- [ ] **Bit Contract (`repobot.bit.ts`):** Extend `RepobotBit` to include
      optional connection options (`url`, `timeoutMs`, `filterRepo`).

- [ ] **Model Interface (`repobot.interface.ts`):** Declare `ws: any`,
      `connectionState`, `reconnectTimer`, `reconnectAttempts`,
      `lastSeqReceived`, and `activeBaseUrl`.

- [ ] **State Model (`repobot.model.ts`):** Initialize
      `connectionState = 'DISCONNECTED'`, `maxReconnectDelayMs = 15000`,
      `reconnectAttempts = 0`, and `lastSeqReceived = 0`.

- [ ] **Action Constants (`repobot.action.ts`):**
- `CONNECT_REPOBOT = '[Repobot action] Connect Repobot'`

- `DISCONNECT_REPOBOT = '[Repobot action] Disconnect Repobot'`

- [ ] **Reducer Wiring (`repobot.reduce.ts`):** Map `CONNECT_REPOBOT` to
      `Buzz.connectRepobot` and `DISCONNECT_REPOBOT` to `Buzz.disconnectRepobot`
      using immutable `clone(model)` copies.

#### Acceptance Criteria

- `npx tsc -b packages/821.repobot` passes with zero type errors and pure ESM
  exports.

- State transitions to `CONNECTING`, `CONNECTED`, and `DISCONNECTED` are
  recorded in the Repobot unit model.

---

### Task 23.5: Self-Healing WebSocket Client Engine (`connectRepobot` & `disconnectRepobot`)

- **Target File:** `packages/821.repobot/00.repobot.unit/buz/repobot.buzz.ts`

- **Criticality:** Tier 1 (Urgent)

- **User Story:** As an operator running the terminal flight deck, I need
  `connectRepobot` to maintain a resilient, self-healing connection to the edge
  worker that logs telemetry into `cns00`, and `disconnectRepobot` to shut down
  connections cleanly without orphaned timers or memory leaks.

#### Technical Subtasks

- [ ] **Target Switchboard Cascade:** Implement `getBaseUrl()` prioritizing
      `(global as any).agentBaseUrl` (Local port 8787) over package URLs and the
      live Cloudflare production worker.

- [ ] **Idempotent Guard:** Prevent duplicate sockets if `cpy.connectionState`
      is already `'CONNECTED'` or `'CONNECTING'`; return `noop` safely.

- [ ] **URL Construction:** Convert HTTP protocol to WebSocket syntax (`http://`
      $\rightarrow$ `ws://`, `https://` $\rightarrow$ `wss://`) targeting
      `/ws/telemetry?role=operator`.

- [ ] **Socket Event Bindings:**
- `onopen`: Mark `connectionState = 'CONNECTED'`, reset `reconnectAttempts = 0`,
  clear any pending `reconnectTimer`, and output an ASCII connection banner to
  `cns00`.

- `onmessage`: Parse JSON frames, check for sequence gaps
  (`data.seq > cpy.lastSeqReceived + 1`) and log warnings if packets dropped,
  then route `data.ascii` directly to `cns00` via
  `ste.hunt(UPDATE_CONSOLE, ...)`.

- `onclose`: If closed intentionally (`connectionState === 'DISCONNECTED'`),
  exit cleanly; otherwise, trigger exponential backoff reconnection up to
  `15000` ms and schedule the next attempt.

- `onerror`: Log socket errors using ASCII markers without crashing the parent
  process.

- [ ] **`disconnectRepobot` Teardown:**
- Clear any active `reconnectTimer`.

- Set `connectionState = 'DISCONNECTED'`.

- Close the active WebSocket handle using standard code `1000` (Normal Closure)
  and set `cpy.ws = null`.

- Emit an ASCII confirmation message to `cns00`.

#### Acceptance Criteria

- Invoking `connectRepobot` connects to the active target worker and streams
  live messages into `cns00`.

- Severing the connection initiates exponential backoff reconnect attempts
  without duplicating socket instances.

- Invoking `disconnectRepobot` halts all timers, closes the socket with code
  1000, and stops further reconnect attempts.

---

### Task 23.6: Flight Deck HUD Menu & Console Router Integration

- **Target File:** `packages/821.repobot/98.menu.unit/buz/00.menu.buzz.ts`

- **Criticality:** Tier 3 (Normal)

- **User Story:** As an operator, I need interactive entries in the Repobot
  Blessed menu to connect, disconnect, and inspect the real-time telemetry
  stream directly from the terminal UI.

#### Technical Subtasks

- [ ] Add `'CONNECT REPOBOT TELEMETRY'` and `'DISCONNECT REPOBOT TELEMETRY'` to
      the Repobot Blessed choice list array (`lst`).

- [ ] In the action `switch (src)` block:
- When `'CONNECT REPOBOT TELEMETRY'` is selected, dispatch
  `ste.hunt(ActRbt.CONNECT_REPOBOT, {})` and update `cns00` with the connection
  status.

- When `'DISCONNECT REPOBOT TELEMETRY'` is selected, dispatch
  `ste.hunt(ActRbt.DISCONNECT_REPOBOT, {})` and update `cns00`.

- [ ] Display real-time telemetry connection status (`CONNECTED`, `CONNECTING`,
      `DISCONNECTED`) directly within the Blessed HUD menu description box.

#### Acceptance Criteria

- Selecting `'CONNECT REPOBOT TELEMETRY'` establishes the live connection and
  streams edge events directly into the right-hand `cns00` panel.

- Selecting `'DISCONNECT REPOBOT TELEMETRY'` shuts down the connection and
  confirms disconnection in `cns00`.

---

### Task 23.7: Negative-Control Test Harness & Resiliency Gauntlet

- **Target Files:**
- `apps/worker/test/unit/telemetryWebSocket.test.ts`

- `packages/821.repobot/test/repobot.buzz.test.ts`

- **Criticality:** Tier 2 (High)

- **User Story:** As a QA test engineer, I need isolated unit tests to verify
  WebSocket upgrades, hibernation event handling, sequence verification, and
  disconnection mechanics.

#### Technical Subtasks

- [ ] **Worker Upgrade Test (`telemetryWebSocket.test.ts`):** Verify
      `apps/worker` rejects non-WebSocket requests with `HTTP 426` and accepts
      valid WebSocket upgrades with `HTTP 101`.

- [ ] **Broadcaster Test:** Assert that calling `broadcastTelemetry` on
      `RepoBotDO` formats JSON payloads containing monotonic `seq` identifiers
      and ASCII text representations.

- [ ] **Client Connection Test (`repobot.buzz.test.ts`):** Mock WebSocket
      interfaces using native Node.js event targets, verify `connectRepobot`
      sets `CONNECTED`, handles messages, and parses sequence counters.

- [ ] **Sequence Gap Test:** Verify `connectRepobot` detects and logs dropped
      sequence frames when receiving out-of-order packets (`seq: 1`
      $\rightarrow$ `seq: 5`).

- [ ] **Teardown Test:** Assert `disconnectRepobot` clears timers, closes active
      sockets, and sets `connectionState = 'DISCONNECTED'`.

#### Acceptance Criteria

- `npm run test:worker` passes all WebSocket unit tests.

- `npm run test:repobot` (or Ava test runner) passes all client connection and
  teardown tests with exit code 0.

- `git status -s apps/995.library/` returns 0 lines (Runner Boundary Invariance
  preserved).

---

### Universal Falsifiable Acceptance Commands

Execute these verification commands to validate implementation completeness:

```bash
# 1. Compile worker and repobot packages
npx tsc -b apps/worker packages/821.repobot

# 2. Verify immutable boundary in apps/995.library/ (Must return 0 lines)
git status -s apps/995.library/

# 3. Verify zero UTF-8 emojis across repobot and worker telemetry code
git grep -P "[\x{1F300}-\x{1FAD6}]" apps/worker/src/ packages/821.repobot/

# 4. Run Edge Worker test suite (including WebSocket unit tests)
npm run test:worker

# 5. Run Repobot unit test suite
npm run test:repobot

# 6. Run full root monorepo test gauntlet
npm test

```
