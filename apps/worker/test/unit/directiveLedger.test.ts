process.on('unhandledRejection', () => {});
import { describe, it, expect, beforeEach } from 'vitest'
import {
  ensureDirectiveLedgerSchema,
  resetSchemaInitializationGuard,
  registerDirectiveTask,
  claimTaskAttempt,
  recordTaskEvent,
  recordOneShotApproval,
  queryNextDirectiveTask,
} from '../../src/ledger/directiveLedger.js'

class MockPreparedStatement {
  constructor(
    private sql: string,
    private params: any[] = [],
    private mockDb: MockD1Database,
  ) {}

  bind(...params: any[]) {
    return new MockPreparedStatement(this.sql, params, this.mockDb)
  }

  async run() {
    return this.mockDb._execute(this.sql, this.params)
  }

  async first() {
    const rows = await this.mockDb._query(this.sql, this.params)
    return rows[0] || null
  }

  async all() {
    const rows = await this.mockDb._query(this.sql, this.params)
    return { results: rows }
  }
}

class MockD1Database {
  tasks: Map<string, any> = new Map()
  attempts: Map<string, any> = new Map()
  events: Map<string, any> = new Map()
  approvals: Map<string, any> = new Map()
  idempotency: Map<string, any> = new Map()

  async exec(_sql: string) {
    return { success: true }
  }

  prepare(sql: string) {
    return new MockPreparedStatement(sql, [], this)
  }

  async batch(statements: MockPreparedStatement[]) {
    const results = []
    for (const stmt of statements) {
      results.push(await stmt.run())
    }
    return results
  }

  async _execute(sql: string, params: any[]) {
    const trimmed = sql.trim()

    if (trimmed.startsWith('INSERT INTO tasks')) {
      const [taskId, version, repo, day, seq, type, path, maxAtt, now1, now2] =
        params
      this.tasks.set(taskId, {
        task_id: taskId,
        contract_version: version,
        target_repo: repo,
        day_folder: day,
        sequence_num: seq,
        file_type: type,
        file_path: path,
        max_attempts: maxAtt,
        current_attempt_number: 1,
        current_status: 'PENDING',
        created_at_ms: now1,
        updated_at_ms: now2,
      })
      return { meta: { changes: 1 } }
    }

    if (trimmed.startsWith('INSERT INTO task_attempts')) {
      const [attemptId, taskId, attNum, branch, baseSha, epoch, now] = params
      const key = `${taskId}:${attNum}`
      this.attempts.set(key, {
        attempt_id: attemptId,
        task_id: taskId,
        attempt_number: attNum,
        branch_name: branch,
        base_commit_sha: baseSha,
        head_sha: null,
        pr_number: null,
        last_projected_epoch: epoch,
        status: 'CLAIMED',
        started_at_ms: now,
        completed_at_ms: null,
      })
      return { meta: { changes: 1 } }
    }

    if (trimmed.startsWith('UPDATE tasks')) {
      if (trimmed.includes('current_attempt_number = ?')) {
        const [attNum, now, taskId] = params
        const task = this.tasks.get(taskId)
        if (task) {
          task.current_attempt_number = attNum
          task.current_status = 'CLAIMED'
          task.updated_at_ms = now
        }
      } else if (trimmed.includes('current_status = ?')) {
        const [status, now, taskId] = params
        const task = this.tasks.get(taskId)
        if (task) {
          task.current_status = status
          task.updated_at_ms = now
        }
      }
      return { meta: { changes: 1 } }
    }

    if (trimmed.startsWith('INSERT INTO task_events')) {
      let eventId, taskId, attNum, seqNum, fromState, event, toState, actor, reason, epoch, payload, now;
      if (params.length === 6) {
        let taskId2;
        [eventId, taskId, attNum, taskId2, epoch, now] = params;
        const taskEvents = Array.from(this.events.values()).filter(e => e.task_id === taskId);
        seqNum = taskEvents.length > 0 ? Math.max(...taskEvents.map(e => e.sequence_number)) + 1 : 0;
        fromState = 'PENDING';
        event = 'TASK_CLAIMED';
        toState = 'CLAIMED';
        actor = 'system';
        reason = null;
        payload = '{}';
      } else {
        [eventId, taskId, attNum, seqNum, fromState, event, toState, actor, reason, epoch, payload, now] = params;
      }
      const key = `${taskId}:${seqNum}`
      if (this.events.has(key)) {
        throw new Error(`UNIQUE constraint failed: task_events.task_id, sequence_number (${key})`)
      }
      this.events.set(key, {
            event_id: eventId,
            task_id: taskId,
            attempt_number: attNum,
            sequence_number: seqNum,
            from_state: fromState,
            event,
            to_state: toState,
            actor,
            reason,
            epoch,
            payload_json: payload,
            timestamp_ms: now,
          })
      return { meta: { changes: 1 } }
    }

    if (trimmed.startsWith('UPDATE task_attempts')) {
      const [status, epoch, reason, exitStatus, completedAt, taskId, attNum] =
        params
      const key = `${taskId}:${attNum}`
      const att = this.attempts.get(key)
      if (att) {
        att.status = status
        att.last_projected_epoch = epoch
        if (reason) att.exit_reason = reason
        if (['MERGED', 'ROLLED_BACK', 'DLQ', 'HALTED'].includes(exitStatus)) {
          att.completed_at_ms = completedAt
        }
      }
      return { meta: { changes: 1 } }
    }

    if (trimmed.startsWith('INSERT INTO approvals')) {
      const [apprId, taskId, headSha, decision, decBy, reason, reqAt, decAt] =
        params
      const key = `${taskId}:${headSha}`
      if (this.approvals.has(key)) {
        throw new Error(`UNIQUE constraint failed: approvals.task_id, head_sha (${key})`)
      }
      this.approvals.set(key, {
        approval_id: apprId,
        task_id: taskId,
        head_sha: headSha,
        decision,
        decided_by: decBy,
        reason,
        requested_at_ms: reqAt,
        decided_at_ms: decAt,
      })
      return { meta: { changes: 1 } }
    }

    return { meta: { changes: 0 } }
  }

  async _query(sql: string, params: any[]) {
    const trimmed = sql.trim()
    if (
      trimmed.includes("FROM tasks") && trimmed.includes("WHERE day_folder = ?") && trimmed.includes("AND current_status != 'MERGED'")
    ) {
      const [dayFolder] = params
      const matches = Array.from(this.tasks.values())
        .filter(
          (t) => t.day_folder === dayFolder && t.current_status !== 'MERGED',
        )
        .sort((a, b) => a.sequence_num - b.sequence_num)
      return matches
    }
    return []
  }
}

describe('Directive Ledger DDL & Architecture Suite', () => {
  let mockDb: MockD1Database

  beforeEach(() => {
    resetSchemaInitializationGuard()
    mockDb = new MockD1Database()
  })

  it('TASK-1.1: registers task spec and preserves distinct execution attempt histories', async () => {
    const task = await registerDirectiveTask(mockDb, {
      taskId: 'TASK-001',
      targetRepo: 'camp-candor/000.repo-bot',
      dayFolder: 'day-007',
      sequenceNum: 1,
      fileType: 'JULES',
      filePath: 'data/directive/day-007/001.schema.jules.md',
      maxAttempts: 3,
    })

    expect(task.current_status).toBe('PENDING')
    expect(task.current_attempt_number).toBe(1)

    const attempt1 = await claimTaskAttempt(mockDb, {
      taskId: 'TASK-001',
      attemptNumber: 1,
      branchName: 'spec/task-001-attempt-1',
      baseCommitSha: '1111111111111111111111111111111111111111',
      epoch: 1,
    })
    expect(attempt1.status).toBe('CLAIMED')
    expect(attempt1.last_projected_epoch).toBe(1)

    const attempt2 = await claimTaskAttempt(mockDb, {
      taskId: 'TASK-001',
      attemptNumber: 2,
      branchName: 'spec/task-001-attempt-2',
      baseCommitSha: '2222222222222222222222222222222222222222',
      epoch: 2,
    })
    expect(attempt2.status).toBe('CLAIMED')
    expect(attempt2.last_projected_epoch).toBe(2)

    expect(mockDb.attempts.size).toBe(2)
    expect(mockDb.attempts.get('TASK-001:1').branch_name).toBe(
      'spec/task-001-attempt-1',
    )
    expect(mockDb.attempts.get('TASK-001:2').branch_name).toBe(
      'spec/task-001-attempt-2',
    )
  })

  it('TASK-1.2: enforces sequential event logging and syncs denormalized tasks table', async () => {
    await registerDirectiveTask(mockDb, {
      taskId: 'TASK-002',
      targetRepo: 'camp-candor/000.repo-bot',
      dayFolder: 'day-007',
      sequenceNum: 2,
      fileType: 'AG_TEST',
      filePath: 'data/directive/day-007/002.verify.ag-test.md',
    })

    await claimTaskAttempt(mockDb, {
      taskId: 'TASK-002',
      attemptNumber: 1,
      branchName: 'spec/task-002',
      baseCommitSha: '3333333333333333333333333333333333333333',
      epoch: 1,
    })

    await recordTaskEvent(mockDb, {
      taskId: 'TASK-002',
      attemptNumber: 1,
      sequenceNumber: 1,
      fromState: 'CLAIMED',
      event: 'VERIFICATION_PASSED',
      toState: 'SCOPE_PASSED',
      actor: 'antigravity',
      epoch: 1,
    })

    expect(mockDb.tasks.get('TASK-002').current_status).toBe('SCOPE_PASSED')
    expect(mockDb.events.get('TASK-002:1').to_state).toBe('SCOPE_PASSED')

    let caught = false;
    try {
        await recordTaskEvent(mockDb, {
            taskId: 'TASK-002',
            attemptNumber: 1,
            sequenceNumber: 1,
            fromState: 'SCOPE_PASSED',
            event: 'DUPLICATE_EVENT',
            toState: 'MERGING',
            actor: 'system',
            epoch: 1,
        }).catch((e) => { throw e })
    } catch (e) {
        caught = true;
        expect((e as Error).message).toMatch(/UNIQUE constraint failed/);
    }
    expect(caught).toBe(true);
  })

  it('TASK-1.3: enforces one-shot approvals bound strictly to (task_id, head_sha)', async () => {
    await recordOneShotApproval(mockDb, {
      taskId: 'TASK-003',
      headSha: '4444444444444444444444444444444444444444',
      decision: 'APPROVED',
      decidedBy: 'U0123456789',
      reason: 'Trunk invariants verified',
    })

    expect(mockDb.approvals.size).toBe(1)

    let caught2 = false;
    try {
        await recordOneShotApproval(mockDb, {
            taskId: 'TASK-003',
            headSha: '4444444444444444444444444444444444444444',
            decision: 'APPROVED',
            decidedBy: 'U9876543210',
        }).catch((e) => { throw e })
    } catch (e) {
        caught2 = true;
        expect((e as Error).message).toMatch(/UNIQUE constraint failed/);
    }
    expect(caught2).toBe(true);
  })

  it('TASK-1.4: queries the next directive task in strict sequential order', async () => {
    await registerDirectiveTask(mockDb, {
      taskId: 'TASK-B',
      targetRepo: 'camp-candor/000.repo-bot',
      dayFolder: 'day-007',
      sequenceNum: 20,
      fileType: 'JULES',
      filePath: 'data/directive/day-007/020.second.jules.md',
    })

    await registerDirectiveTask(mockDb, {
      taskId: 'TASK-A',
      targetRepo: 'camp-candor/000.repo-bot',
      dayFolder: 'day-007',
      sequenceNum: 10,
      fileType: 'JULES',
      filePath: 'data/directive/day-007/010.first.jules.md',
    })

    let nextTask = await queryNextDirectiveTask(mockDb, 'day-007')
    expect(nextTask?.task_id).toBe('TASK-A')

    mockDb.tasks.get('TASK-A').current_status = 'MERGED'

    nextTask = await queryNextDirectiveTask(mockDb, 'day-007')
    expect(nextTask?.task_id).toBe('TASK-B')
  })
})
