import { describe, it, expect, beforeEach } from 'vitest'
import { ShotCoordinatorDO } from '../../src/objects/ShotCoordinatorDO.js'

class MockDurableObjectStorage {
  private store: Map<string, any> = new Map()
  public scheduledAlarm: number | null = null

  async get<T = any>(key: string): Promise<T | undefined> {
    return this.store.get(key)
  }

  async put(key: string, value: any): Promise<void> {
    this.store.set(key, value)
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key)
  }

  async setAlarm(deadlineMs: number): Promise<void> {
    this.scheduledAlarm = deadlineMs
  }

  async deleteAlarm(): Promise<void> {
    this.scheduledAlarm = null
  }
}

class MockDurableObjectState {
  public storage: MockDurableObjectStorage

  constructor() {
    this.storage = new MockDurableObjectStorage()
  }
}

describe('ShotCoordinatorDO Authority & Hardware Fencing Battery', () => {
  let mockState: MockDurableObjectState
  let coordinator: ShotCoordinatorDO

  beforeEach(async () => {
    mockState = new MockDurableObjectState()
    coordinator = new ShotCoordinatorDO(mockState as any)

    // Initialize task
    const initReq = new Request('https://do/fsm/initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: 'TASK-DO-001',
        isHighRiskPath: false,
        maxAttempts: 3,
        branchName: 'spec/task-do-001',
      }),
    })
    const res = await coordinator.fetch(initReq)
    expect(res.status).toBe(200)
  })

  it('TASK-3.1: increments monotonic epoch upon claim and rejects stale worker heartbeat', async () => {
    // 1. Claim task (advances epoch from 1 to 2, transitions PENDING -> CLAIMED)
    const claimRes = await coordinator.fetch(
      new Request('https://do/fsm/claim', { method: 'POST' }),
    )
    expect(claimRes.status).toBe(200)
    const claimData: any = await claimRes.json()
    expect(claimData.state).toBe('CLAIMED')
    expect(claimData.epoch).toBe(2)

    // 2. Worker acknowledges lease (CLAIMED -> RUNNING)
    const ackRes = await coordinator.fetch(
      new Request('https://do/fsm/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'WORKER_ACK',
          actor: { type: 'REMOTE_WORKER', workerId: 'worker-1', epoch: 2 },
        }),
      }),
    )
    expect(ackRes.status).toBe(200)

    // 3. Stale worker heartbeat using superseded epoch 1 -> Rejected with 409
    const staleHeartbeatRes = await coordinator.fetch(
      new Request('https://do/fsm/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epoch: 1 }),
      }),
    )
    expect(staleHeartbeatRes.status).toBe(409)
    const staleData: any = await staleHeartbeatRes.json()
    expect(staleData.error).toContain('STALE_WORKER_EPOCH')

    // 4. Valid worker heartbeat using active epoch 2 -> Accepted
    const validHeartbeatRes = await coordinator.fetch(
      new Request('https://do/fsm/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epoch: 2 }),
      }),
    )
    expect(validHeartbeatRes.status).toBe(200)
  })

  it('TASK-3.2: arms 30s watchdog upon entering RUNNING and executes universal leaveRunning disarm on exit', async () => {
    // Claim and enter RUNNING
    await coordinator.fetch(
      new Request('https://do/fsm/claim', { method: 'POST' }),
    )
    await coordinator.fetch(
      new Request('https://do/fsm/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'WORKER_ACK',
          actor: { type: 'REMOTE_WORKER', workerId: 'worker-1', epoch: 2 },
        }),
      }),
    )

    // Assert that watchdog alarm is armed
    expect(mockState.storage.scheduledAlarm).not.toBeNull()
    const activeTimer = await mockState.storage.get('active_timer')
    expect(activeTimer).toBeDefined()
    expect(activeTimer.epoch).toBe(2)

    // Universal leaveRunning test: submit verification (RUNNING -> VERIFYING)
    const headSha = '1111111111111111111111111111111111111111'
    const verifyRes = await coordinator.fetch(
      new Request('https://do/fsm/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'SUBMIT_VERIFY',
          actor: { type: 'REMOTE_WORKER', workerId: 'worker-1', epoch: 2 },
          payload: { headSha },
        }),
      }),
    )
    expect(verifyRes.status).toBe(200)

    // Assert that watchdog alarm was explicitly disarmed
    expect(mockState.storage.scheduledAlarm).toBeNull()
    const disarmedTimer = await mockState.storage.get('active_timer')
    expect(disarmedTimer).toBeUndefined()
  })

  it('TASK-3.2: alarm() trigger fires WATCHDOG_EXPIRE and advances epoch to fence out timed-out worker', async () => {
    // Enter RUNNING
    await coordinator.fetch(
      new Request('https://do/fsm/claim', { method: 'POST' }),
    )
    await coordinator.fetch(
      new Request('https://do/fsm/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'WORKER_ACK',
          actor: { type: 'REMOTE_WORKER', workerId: 'worker-1', epoch: 2 },
        }),
      }),
    )

    // Trigger proactive storage alarm directly
    await coordinator.alarm()

    // Verify task transitioned to RETRYING and epoch is bumped
    const ctxRes = await coordinator.fetch(
      new Request('https://do/fsm/context'),
    )
    const data: any = await ctxRes.json()
    expect(data.currentState).toBe('RETRYING')

    // Claim next retry -> Epoch must now be 3
    const nextClaimRes = await coordinator.fetch(
      new Request('https://do/fsm/claim', { method: 'POST' }),
    )
    const nextClaimData: any = await nextClaimRes.json()
    expect(nextClaimData.epoch).toBe(3)
  })

  it('TASK-3.3: enforces Content-Addressed Promotion Gate Fencing against zombie worker uploads', async () => {
    // 1. Enter RUNNING on epoch 2
    await coordinator.fetch(
      new Request('https://do/fsm/claim', { method: 'POST' }),
    )
    await coordinator.fetch(
      new Request('https://do/fsm/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'WORKER_ACK',
          actor: { type: 'REMOTE_WORKER', workerId: 'worker-1', epoch: 2 },
        }),
      }),
    )

    // 2. Zombie worker upload promotion attempt with expired epoch 1 -> HTTP 409
    const stalePromoRes = await coordinator.fetch(
      new Request('https://do/tasks/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          epoch: 1,
          headSha: 'badf00d111111111111111111111111111111111',
        }),
      }),
    )
    expect(stalePromoRes.status).toBe(409)
    const staleData: any = await stalePromoRes.json()
    expect(staleData.error).toContain('PROMOTION_FENCE_REJECTED')

    // 3. Valid worker promotion with epoch 2 -> HTTP 200 (transitions to VERIFYING)
    const validPromoRes = await coordinator.fetch(
      new Request('https://do/tasks/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          epoch: 2,
          headSha: 'goodf00d222222222222222222222222222222222',
        }),
      }),
    )
    expect(validPromoRes.status).toBe(200)
    const validData: any = await validPromoRes.json()
    expect(validData.state).toBe('VERIFYING')
    expect(validData.promotedHeadSha).toBe(
      'goodf00d222222222222222222222222222222222',
    )
  })
})
