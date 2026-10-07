import type { D1DatabaseInterface } from '../db/d1Ledger.js'
import { GitCommitClient, type GitTreeEntry } from './gitCommitClient.js'
import { sha256Hex } from '../ledger/cryptoLedger.js'

export interface ColdLedgerDrainConfig {
    owner: string
    repo: string
    branch?: string
    retentionThresholdMs?: number
    maxBatchSize?: number
}

export interface TaskColdArchivePayload {
    taskId: string
    status: string
    currentEpoch: number
    artistId: string
    workflowTemplate: string
    canonicalKey?: string | null
    sha256?: string | null
    attemptCount: number
    createdAtMs: number
    updatedAtMs: number
    archivedAtMs: number
    transitions: Array<{
        id: number
        fromState: string
        toState: string
        epoch: number
        workerId: string | null
        timestampMs: number
        metadataJson: string | null
    }>
    archiveChecksum: string
}

export interface DrainageReceipt {
    batchId: string
    taskCount: number
    commitSha: string
    prunedTransitionsCount: number
    archivedTaskIds: string[]
    drainedAtMs: number
}

export const DEFAULT_RETENTION_THRESHOLD_MS = 86_400_000 // 24 hours
export const MAX_DRAIN_BATCH_SIZE = 100

export class ColdLedgerDrainEngine {
    private branch: string
    private retentionThresholdMs: number
    private maxBatchSize: number

    constructor(
        private db: D1DatabaseInterface,
        private gitClient: GitCommitClient,
        private config: ColdLedgerDrainConfig,
    ) {
        this.branch = config.branch || 'audit/cold-ledger'
        this.retentionThresholdMs =
            config.retentionThresholdMs ?? DEFAULT_RETENTION_THRESHOLD_MS
        this.maxBatchSize = config.maxBatchSize ?? MAX_DRAIN_BATCH_SIZE
    }

    /**
     * Executes two-phase cold ledger drainage from D1 into GitHub Git Database.
     */
    public async drainToGit(
        nowMs: number = Date.now(),
    ): Promise<DrainageReceipt | null> {
        const cutoffTime = nowMs - this.retentionThresholdMs
        const batchId = `drain-${nowMs}`

        // Phase 1: Query eligible finalized tasks
        const candidateTasksQuery = `
            SELECT task_id, status, current_epoch, artist_id, workflow_template,
                   canonical_key, sha256, attempt_count, created_at_ms, updated_at_ms
            FROM task_ledger
            WHERE status IN ('VERIFYING', 'PROMOTED', 'DLQ', 'ABORTED')
              AND updated_at_ms <= ?
            ORDER BY updated_at_ms ASC
            LIMIT ?;
        `

        const taskRows = await this.db
            .prepare(candidateTasksQuery)
            .bind(cutoffTime, this.maxBatchSize)
            .all<any>()

        const tasks = taskRows.results || []
        if (tasks.length === 0) {
            console.log(
                '>> [COLD_LEDGER:DRAIN] Zero eligible finalized tasks for cold drainage [OK]',
            )
            return null
        }

        console.log(
            `>> [COLD_LEDGER:DRAIN] Discovered ${tasks.length} finalized tasks eligible for drainage [DRAIN]`,
        )

        const treeEntries: GitTreeEntry[] = []
        const archivedTaskIds: string[] = []
        let totalTransitionsCount = 0

        for (const task of tasks) {
            const transitionsQuery = `
                SELECT id, from_state, to_state, epoch, worker_id, timestamp_ms, metadata_json
                FROM task_transitions
                WHERE task_id = ?
                ORDER BY timestamp_ms ASC, id ASC;
            `

            const transitionRows = await this.db
                .prepare(transitionsQuery)
                .bind(task.task_id)
                .all<any>()

            const transitions = (transitionRows.results || []).map((t) => ({
                id: Number(t.id),
                fromState: t.from_state,
                toState: t.to_state,
                epoch: Number(t.epoch),
                workerId: t.worker_id ?? null,
                timestampMs: Number(t.timestamp_ms),
                metadataJson: t.metadata_json ?? null,
            }))

            totalTransitionsCount += transitions.length

            const basePayload = {
                taskId: task.task_id,
                status: task.status,
                currentEpoch: Number(task.current_epoch),
                artistId: task.artist_id,
                workflowTemplate: task.workflow_template,
                canonicalKey: task.canonical_key ?? null,
                sha256: task.sha256 ?? null,
                attemptCount: Number(task.attempt_count),
                createdAtMs: Number(task.created_at_ms),
                updatedAtMs: Number(task.updated_at_ms),
                archivedAtMs: nowMs,
                transitions,
            }

            const checksum = await sha256Hex(JSON.stringify(basePayload))
            const fullArchive: TaskColdArchivePayload = {
                ...basePayload,
                archiveChecksum: checksum,
            }

            const serializedContent = JSON.stringify(fullArchive, null, 2)
            const date = new Date(task.updated_at_ms)
            const year = date.getUTCFullYear()
            const month = String(date.getUTCMonth() + 1).padStart(2, '0')
            const archivePath = `ledger/cold/${year}/${month}/${task.task_id}.json`

            // Create Git Blob
            const blobSha = await this.gitClient.createBlob(
                this.config.owner,
                this.config.repo,
                serializedContent,
            )

            treeEntries.push({
                path: archivePath,
                mode: '100644',
                type: 'blob',
                sha: blobSha,
            })

            archivedTaskIds.push(task.task_id)
        }

        // Phase 2: Commit Tree & Update Reference
        const refName = `heads/${this.branch}`
        const parentCommitSha = await this.gitClient.getRef(
            this.config.owner,
            this.config.repo,
            refName,
        )

        const newTreeSha = await this.gitClient.createTree(
            this.config.owner,
            this.config.repo,
            parentCommitSha,
            treeEntries,
        )

        const commitMessage = `>> [COLD_LEDGER:DRAIN] Archived ${archivedTaskIds.length} tasks (Batch ${batchId}) [OK]`
        const newCommitSha = await this.gitClient.createCommit(
            this.config.owner,
            this.config.repo,
            commitMessage,
            newTreeSha,
            [parentCommitSha],
        )

        await this.gitClient.updateRef(
            this.config.owner,
            this.config.repo,
            refName,
            newCommitSha,
        )

        console.log(
            `>> [COLD_LEDGER:COMMIT] Drained ${archivedTaskIds.length} tasks to ${this.branch} (Commit: ${newCommitSha.substring(0, 10)}) [OK]`,
        )

        // Phase 3: Prune Hot Transitions & Mark Tasks as COLD_ARCHIVED
        for (const taskId of archivedTaskIds) {
            await this.db
                .prepare('DELETE FROM task_transitions WHERE task_id = ?')
                .bind(taskId)
                .run()

            const coldKey = `git:${newCommitSha}:ledger/cold/${taskId}.json`
            await this.db
                .prepare(
                    `
                UPDATE task_ledger
                SET status = 'COLD_ARCHIVED',
                    canonical_key = ?,
                    updated_at_ms = ?
                WHERE task_id = ?;
            `,
                )
                .bind(coldKey, nowMs, taskId)
                .run()
        }

        console.log(
            `>> [COLD_LEDGER:PRUNE] Pruned ${totalTransitionsCount} transition records from D1 [OK]`,
        )

        return {
            batchId,
            taskCount: archivedTaskIds.length,
            commitSha: newCommitSha,
            prunedTransitionsCount: totalTransitionsCount,
            archivedTaskIds,
            drainedAtMs: nowMs,
        }
    }
}
