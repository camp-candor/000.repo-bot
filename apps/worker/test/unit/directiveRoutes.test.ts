import { describe, it, expect, beforeEach } from 'vitest'
import { Hono } from 'hono'
import { directiveRoutes } from '../../src/routes/directiveRoutes.js'
import type { Env } from '../../src/tools.js'

class MockPreparedStatement {
    constructor(
        private sql: string,
        private params: any[] = [],
        private mockDb: MockD1Database,
    ) {}

    bind(...params: any[]) {
        return new MockPreparedStatement(this.sql, params, this.mockDb)
    }

    async first() {
        const rows = await this.mockDb._query(this.sql, this.params)
        return rows[0] || null
    }

    async all() {
        const rows = await this.mockDb._query(this.sql, this.params)
        return { results: rows }
    }

    async run() {
        return this.mockDb._execute(this.sql, this.params)
    }
}

class MockD1Database {
    tasks: Map<string, any> = new Map()
    events: Map<string, any> = new Map()

    async exec(_sql: string) {
        return { success: true }
    }

    prepare(sql: string) {
        return new MockPreparedStatement(sql, [], this)
    }

    async batch(statements: MockPreparedStatement[]) {
        const results = []
        for (const s of statements) {
            results.push(await s.run())
        }
        return results
    }

    async _execute(sql: string, params: any[]) {
        const trimmed = sql.trim()
        if (trimmed.startsWith('UPDATE tasks')) {
            const [now, taskId] = params
            const task = this.tasks.get(taskId)
            if (task) {
                task.current_status = 'ROLLED_BACK'
                task.updated_at_ms = now
            }
            return { meta: { changes: 1 } }
        }
        if (trimmed.startsWith('INSERT INTO task_events')) {
            const [eventId, taskId, fromState, actor, reason, payload, now] =
                params
            this.events.set(eventId, {
                event_id: eventId,
                task_id: taskId,
                from_state: fromState,
                to_state: 'ROLLED_BACK',
                actor,
                reason,
                payload_json: payload,
                timestamp_ms: now,
            })
            return { meta: { changes: 1 } }
        }
        return { meta: { changes: 0 } }
    }

    async _query(sql: string, params: any[]) {
        const trimmed = sql.trim()

        // 1. Summary Query
        if (trimmed.includes('GROUP BY day_folder')) {
            const groups = new Map<string, any>()
            for (const t of this.tasks.values()) {
                const day = t.day_folder
                if (!groups.has(day)) {
                    groups.set(day, {
                        day_folder: day,
                        total_count: 0,
                        merged_count: 0,
                        pending_count: 0,
                        in_flight_count: 0,
                        failed_count: 0,
                    })
                }
                const g = groups.get(day)
                g.total_count++
                if (t.current_status === 'MERGED') g.merged_count++
                else if (t.current_status === 'PENDING') g.pending_count++
                else if (
                    [
                        'CLAIMED',
                        'RUNNING',
                        'VERIFYING',
                        'SCOPE_PASSED',
                        'AWAITING_APPROVAL',
                        'MERGING',
                        'RETRYING',
                        'ROLLING_BACK',
                    ].includes(t.current_status)
                ) {
                    g.in_flight_count++
                } else if (
                    ['ROLLED_BACK', 'DLQ', 'HALTED'].includes(t.current_status)
                ) {
                    g.failed_count++
                }
            }
            return Array.from(groups.values()).sort((a, b) =>
                b.day_folder.localeCompare(a.day_folder),
            )
        }

        // 2. Count tasks for day
        if (
            trimmed.includes(
                'SELECT COUNT(*) as count FROM tasks WHERE day_folder = ?',
            )
        ) {
            const dayFolder = params[0]
            const count = Array.from(this.tasks.values()).filter(
                (t) => t.day_folder === dayFolder,
            ).length
            return [{ count }]
        }

        // 3. Next unmerged task query
        if (
            trimmed.includes(
                "WHERE day_folder = ? AND current_status != 'MERGED'",
            )
        ) {
            const dayFolder = params[0]
            const matches = Array.from(this.tasks.values())
                .filter(
                    (t) =>
                        t.day_folder === dayFolder &&
                        t.current_status !== 'MERGED',
                )
                .sort((a, b) => a.sequence_num - b.sequence_num)
            return matches.slice(0, 1)
        }

        // 4. Select all tasks for rollback inspection
        if (
            trimmed.includes(
                'SELECT task_id, day_folder, current_status FROM tasks',
            )
        ) {
            return Array.from(this.tasks.values())
        }

        return []
    }
}

describe('Directive REST API Mounts Suite (Phase 5)', () => {
    let mockDb: MockD1Database
    let app: Hono<{ Bindings: Env }>

    beforeEach(() => {
        mockDb = new MockD1Database()
        app = new Hono<{ Bindings: Env }>()
        app.route('/api/directives', directiveRoutes)
    })

    it('TASK-5.3: GET /api/directives/summary computes accurate [COMPLETE], [IN-FLIGHT], [QUEUED] badges', async () => {
        // day-001: all merged -> [COMPLETE]
        mockDb.tasks.set('T-1', {
            task_id: 'T-1',
            day_folder: 'day-001',
            sequence_num: 1,
            current_status: 'MERGED',
        })
        mockDb.tasks.set('T-2', {
            task_id: 'T-2',
            day_folder: 'day-001',
            sequence_num: 2,
            current_status: 'MERGED',
        })

        // day-002: partially merged / in-flight -> [IN-FLIGHT]
        mockDb.tasks.set('T-3', {
            task_id: 'T-3',
            day_folder: 'day-002',
            sequence_num: 1,
            current_status: 'MERGED',
        })
        mockDb.tasks.set('T-4', {
            task_id: 'T-4',
            day_folder: 'day-002',
            sequence_num: 2,
            current_status: 'RUNNING',
        })

        // day-003: all pending -> [QUEUED]
        mockDb.tasks.set('T-5', {
            task_id: 'T-5',
            day_folder: 'day-003',
            sequence_num: 1,
            current_status: 'PENDING',
        })

        const res = await app.request('/api/directives/summary', {}, {
            DB: mockDb,
        } as any)
        expect(res.status).toBe(200)

        const data: any = await res.json()
        expect(data.ok).toBe(true)
        expect(data.days).toHaveLength(3)

        const day3 = data.days.find((d: any) => d.dayFolder === 'day-003')
        const day2 = data.days.find((d: any) => d.dayFolder === 'day-002')
        const day1 = data.days.find((d: any) => d.dayFolder === 'day-001')

        expect(day3.badge).toBe('[QUEUED]')
        expect(day2.badge).toBe('[IN-FLIGHT]')
        expect(day1.badge).toBe('[COMPLETE]')
    })

    it('TASK-5.1: GET /api/directives/:day_folder/next-task returns sequential unmerged task and handles ALL_MERGED', async () => {
        mockDb.tasks.set('T-10', {
            task_id: 'TASK-10',
            day_folder: 'day-007',
            sequence_num: 10,
            current_status: 'MERGED',
            file_path: 'path-10',
        })
        mockDb.tasks.set('T-20', {
            task_id: 'TASK-20',
            day_folder: 'day-007',
            sequence_num: 20,
            current_status: 'PENDING',
            file_path: 'path-20',
        })
        mockDb.tasks.set('T-30', {
            task_id: 'TASK-30',
            day_folder: 'day-007',
            sequence_num: 30,
            current_status: 'PENDING',
            file_path: 'path-30',
        })

        // Query next task -> should skip T-10 and return T-20
        const res1 = await app.request(
            '/api/directives/day-007/next-task',
            {},
            {
                DB: mockDb,
            } as any,
        )
        expect(res1.status).toBe(200)
        const data1: any = await res1.json()
        expect(data1.ok).toBe(true)
        expect(data1.task.task_id).toBe('TASK-20')

        // Mark remaining tasks as MERGED
        mockDb.tasks.get('T-20').current_status = 'MERGED'
        mockDb.tasks.get('T-30').current_status = 'MERGED'

        const res2 = await app.request(
            '/api/directives/day-007/next-task',
            {},
            {
                DB: mockDb,
            } as any,
        )
        expect(res2.status).toBe(200)
        const data2: any = await res2.json()
        expect(data2.ok).toBe(true)
        expect(data2.task).toBeNull()
        expect(data2.status).toBe('ALL_MERGED')

        // Non-existent day folder -> 404
        const res404 = await app.request(
            '/api/directives/day-999/next-task',
            {},
            {
                DB: mockDb,
            } as any,
        )
        expect(res404.status).toBe(404)
        const data404: any = await res404.json()
        expect(data404.error).toBe('NO_TASKS_FOR_DAY')
    })

    it('TASK-5.2: POST /api/directives/revert-to-seal rejects malformed commit SHA and rolls back subsequent tasks', async () => {
        // Setup history across days
        mockDb.tasks.set('T-D3', {
            task_id: 'T-D3',
            day_folder: 'day-003',
            current_status: 'MERGED',
        })
        mockDb.tasks.set('T-D4', {
            task_id: 'T-D4',
            day_folder: 'day-004',
            current_status: 'MERGED',
        })
        mockDb.tasks.set('T-D5', {
            task_id: 'T-D5',
            day_folder: 'day-005',
            current_status: 'RUNNING',
        })

        // Malformed commit SHA -> 400
        const badShaRes = await app.request(
            '/api/directives/revert-to-seal',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetDay: 'day-003',
                    targetCommitSha: 'not-a-valid-40-hex-sha',
                }),
            },
            { DB: mockDb } as any,
        )
        expect(badShaRes.status).toBe(400)

        // Valid rollback to day-003 seal
        const validSha = 'abcdef1234567890abcdef1234567890abcdef12'
        const goodRes = await app.request(
            '/api/directives/revert-to-seal',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetDay: 'day-003',
                    targetCommitSha: validSha,
                    reason: 'Regression in day-004 migration',
                    actor: 'lead-architect',
                }),
            },
            { DB: mockDb } as any,
        )
        expect(goodRes.status).toBe(200)
        const goodData: any = await goodRes.json()
        expect(goodData.ok).toBe(true)
        expect(goodData.rolledBackCount).toBe(2)
        expect(goodData.affectedTaskIds).toEqual(['T-D4', 'T-D5'])

        // Verify task statuses in database
        expect(mockDb.tasks.get('T-D3').current_status).toBe('MERGED') // Untouched
        expect(mockDb.tasks.get('T-D4').current_status).toBe('ROLLED_BACK') // Rolled back
        expect(mockDb.tasks.get('T-D5').current_status).toBe('ROLLED_BACK') // Rolled back
    })
})
