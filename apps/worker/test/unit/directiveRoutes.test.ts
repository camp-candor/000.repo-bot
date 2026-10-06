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
                event: 'SEAL_HARD_RESET',
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

    it('INV-1: Badging Logic Boundary & Partition Matrix (Scenarios A, B, C, D)', async () => {
        // Scenario A: 5 tasks in day-001, all 5 MERGED -> [COMPLETE]
        for (let i = 1; i <= 5; i++) {
            mockDb.tasks.set(`A-${i}`, {
                task_id: `A-${i}`,
                day_folder: 'day-001',
                sequence_num: i,
                current_status: 'MERGED',
            })
        }

        // Scenario B: 4 tasks in day-002, 3 MERGED, 1 RUNNING -> [IN-FLIGHT]
        for (let i = 1; i <= 3; i++) {
            mockDb.tasks.set(`B-${i}`, {
                task_id: `B-${i}`,
                day_folder: 'day-002',
                sequence_num: i,
                current_status: 'MERGED',
            })
        }
        mockDb.tasks.set('B-4', {
            task_id: 'B-4',
            day_folder: 'day-002',
            sequence_num: 4,
            current_status: 'RUNNING',
        })

        // Scenario C: 3 tasks in day-003, all 3 PENDING -> [QUEUED]
        for (let i = 1; i <= 3; i++) {
            mockDb.tasks.set(`C-${i}`, {
                task_id: `C-${i}`,
                day_folder: 'day-003',
                sequence_num: i,
                current_status: 'PENDING',
            })
        }

        // Scenario D: 2 tasks in day-004, 1 PENDING, 1 DLQ -> [IN-FLIGHT]
        mockDb.tasks.set('D-1', {
            task_id: 'D-1',
            day_folder: 'day-004',
            sequence_num: 1,
            current_status: 'PENDING',
        })
        mockDb.tasks.set('D-2', {
            task_id: 'D-2',
            day_folder: 'day-004',
            sequence_num: 2,
            current_status: 'DLQ',
        })

        const res = await app.request('/api/directives/summary', {}, {
            DB: mockDb,
        } as any)
        expect(res.status).toBe(200)
        const data: any = await res.json()
        expect(data.ok).toBe(true)

        const day1 = data.days.find((d: any) => d.dayFolder === 'day-001')
        const day2 = data.days.find((d: any) => d.dayFolder === 'day-002')
        const day3 = data.days.find((d: any) => d.dayFolder === 'day-003')
        const day4 = data.days.find((d: any) => d.dayFolder === 'day-004')

        expect(day1.badge).toBe('[COMPLETE]')
        expect(day2.badge).toBe('[IN-FLIGHT]')
        expect(day3.badge).toBe('[QUEUED]')
        expect(day4.badge).toBe('[IN-FLIGHT]')
    })

    it('TASK-5.1 & INV-2: Sequential Monotonic Dispatch & Gap Tolerance', async () => {
        // Seed day-010 with sequences [5, 12, 19, 45]
        // Mark sequence 5 and 12 as MERGED, sequences 19 and 45 as PENDING
        mockDb.tasks.set('T-5', {
            task_id: 'TASK-5',
            day_folder: 'day-010',
            sequence_num: 5,
            current_status: 'MERGED',
            file_path: 'path-5',
        })
        mockDb.tasks.set('T-12', {
            task_id: 'TASK-12',
            day_folder: 'day-010',
            sequence_num: 12,
            current_status: 'MERGED',
            file_path: 'path-12',
        })
        mockDb.tasks.set('T-19', {
            task_id: 'TASK-19',
            day_folder: 'day-010',
            sequence_num: 19,
            current_status: 'PENDING',
            file_path: 'path-19',
        })
        mockDb.tasks.set('T-45', {
            task_id: 'TASK-45',
            day_folder: 'day-010',
            sequence_num: 45,
            current_status: 'PENDING',
            file_path: 'path-45',
        })

        // Query next task -> skips merged tasks and returns sequence 19
        const res1 = await app.request(
            '/api/directives/day-010/next-task',
            {},
            { DB: mockDb } as any,
        )
        expect(res1.status).toBe(200)
        const data1: any = await res1.json()
        expect(data1.ok).toBe(true)
        expect(data1.task.task_id).toBe('TASK-19')
        expect(data1.task.sequence_num).toBe(19)

        // Mark remaining tasks as MERGED
        mockDb.tasks.get('T-19').current_status = 'MERGED'
        mockDb.tasks.get('T-45').current_status = 'MERGED'

        const res2 = await app.request(
            '/api/directives/day-010/next-task',
            {},
            { DB: mockDb } as any,
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
            { DB: mockDb } as any,
        )
        expect(res404.status).toBe(404)
        const data404: any = await res404.json()
        expect(data404.ok).toBe(false)
        expect(data404.error).toBe('NO_TASKS_FOR_DAY')
    })

    it('INV-3: Malformed Input Rejection (Strict 400 Gates)', async () => {
        // 1. Invalid commit SHA format
        const badShaRes = await app.request(
            '/api/directives/revert-to-seal',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetDay: 'day-003',
                    targetCommitSha: 'invalid-sha',
                }),
            },
            { DB: mockDb } as any,
        )
        expect(badShaRes.status).toBe(400)
        const badShaData: any = await badShaRes.json()
        expect(badShaData.ok).toBe(false)
        expect(badShaData.error).toBe('INVALID_COMMIT_SHA_FORMAT')

        // 2. Unparseable day format
        const badDayRes = await app.request(
            '/api/directives/revert-to-seal',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetDay: 'unparseable-day',
                    targetCommitSha: 'abcdef1234567890abcdef1234567890abcdef12',
                }),
            },
            { DB: mockDb } as any,
        )
        expect(badDayRes.status).toBe(400)
        const badDayData: any = await badDayRes.json()
        expect(badDayData.ok).toBe(false)
        expect(badDayData.error).toBe('INVALID_TARGET_DAY_FORMAT')

        // 3. Missing targetCommitSha
        const missingShaRes = await app.request(
            '/api/directives/revert-to-seal',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetDay: 'day-003',
                }),
            },
            { DB: mockDb } as any,
        )
        expect(missingShaRes.status).toBe(400)
        const missingShaData: any = await missingShaRes.json()
        expect(missingShaData.ok).toBe(false)
        expect(missingShaData.error).toBe('MISSING_TARGET_DAY_OR_COMMIT_SHA')
    })

    it('TASK-5.2 & INV-4: Rollback Blast-Radius Scoping (Strict Day Boundary)', async () => {
        // Seed tasks across days:
        // day-002: 2 tasks (MERGED)
        mockDb.tasks.set('T-D2-1', {
            task_id: 'T-D2-1',
            day_folder: 'day-002',
            sequence_num: 1,
            current_status: 'MERGED',
        })
        mockDb.tasks.set('T-D2-2', {
            task_id: 'T-D2-2',
            day_folder: 'day-002',
            sequence_num: 2,
            current_status: 'MERGED',
        })

        // day-003: 2 tasks (MERGED)
        mockDb.tasks.set('T-D3-1', {
            task_id: 'T-D3-1',
            day_folder: 'day-003',
            sequence_num: 1,
            current_status: 'MERGED',
        })
        mockDb.tasks.set('T-D3-2', {
            task_id: 'T-D3-2',
            day_folder: 'day-003',
            sequence_num: 2,
            current_status: 'MERGED',
        })

        // day-004: 2 tasks (MERGED)
        mockDb.tasks.set('T-D4-1', {
            task_id: 'T-D4-1',
            day_folder: 'day-004',
            sequence_num: 1,
            current_status: 'MERGED',
        })
        mockDb.tasks.set('T-D4-2', {
            task_id: 'T-D4-2',
            day_folder: 'day-004',
            sequence_num: 2,
            current_status: 'MERGED',
        })

        // day-005: 1 task (RUNNING)
        mockDb.tasks.set('T-D5-1', {
            task_id: 'T-D5-1',
            day_folder: 'day-005',
            sequence_num: 1,
            current_status: 'RUNNING',
        })

        // Revert to seal day-003
        const validSha = '1234567890abcdef1234567890abcdef12345678'
        const res = await app.request(
            '/api/directives/revert-to-seal',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    targetDay: 'day-003',
                    targetCommitSha: validSha,
                    reason: 'Hard reset verification',
                    actor: 'antigravity-auditor',
                }),
            },
            { DB: mockDb } as any,
        )

        expect(res.status).toBe(200)
        const data: any = await res.json()
        expect(data.ok).toBe(true)

        // ASSERTION: Exactly 3 tasks (day-004 and day-005) are transitioned to ROLLED_BACK
        expect(data.rolledBackCount).toBe(3)
        expect(data.affectedTaskIds).toEqual(['T-D4-1', 'T-D4-2', 'T-D5-1'])
        expect(mockDb.tasks.get('T-D4-1').current_status).toBe('ROLLED_BACK')
        expect(mockDb.tasks.get('T-D4-2').current_status).toBe('ROLLED_BACK')
        expect(mockDb.tasks.get('T-D5-1').current_status).toBe('ROLLED_BACK')

        // ASSERTION: day-002 and day-003 tasks remain MERGED and untouched
        expect(mockDb.tasks.get('T-D2-1').current_status).toBe('MERGED')
        expect(mockDb.tasks.get('T-D2-2').current_status).toBe('MERGED')
        expect(mockDb.tasks.get('T-D3-1').current_status).toBe('MERGED')
        expect(mockDb.tasks.get('T-D3-2').current_status).toBe('MERGED')

        // ASSERTION: task_events records exactly 3 new events tagged with SEAL_HARD_RESET
        expect(mockDb.events.size).toBe(3)
        for (const evt of mockDb.events.values()) {
            expect(evt.event).toBe('SEAL_HARD_RESET')
            expect(evt.to_state).toBe('ROLLED_BACK')
            expect(evt.actor).toBe('antigravity-auditor')
        }
    })

    it('INV-5: SQL Injection & Parameterization Defense', async () => {
        // Attempt SQL injection via day_folder route param
        const res = await app.request(
            "/api/directives/day-001'%20OR%20'1'='1/next-task",
            {},
            { DB: mockDb } as any,
        )

        expect(res.status).toBe(404)
        const data: any = await res.json()
        expect(data.ok).toBe(false)
        expect(data.error).toBe('NO_TASKS_FOR_DAY')
    })
})
