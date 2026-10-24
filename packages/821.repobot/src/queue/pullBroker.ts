import { GpuHardwareMutex } from '../hardware/gpuLock.js'

export interface TaskPayload {
    taskId: string
    epoch: number
    workflowTemplate: string
    prompts: Record<string, any>
    seeds: number[]
}

export type TaskExecutor = (
    task: TaskPayload,
) => Promise<{ success: boolean; outputPath?: string }>

export interface BrokerCycleResult {
    status: 'BUSY_LOCAL_LOCK' | 'QUEUE_EMPTY' | 'JOB_COMPLETED' | 'JOB_FAILED'
    taskId?: string
    error?: string
}

export class LocalPullBroker {
    constructor(
        private gpuMutex: GpuHardwareMutex,
        private workerId = 'rig2_gpu_foundry',
    ) {}

    /**
     * Executes a single pull-only execution cycle respecting local lock sovereignty.
     */
    public async pollAndExecuteOnce(
        edgeQueueUrl: string,
        executor: TaskExecutor,
    ): Promise<BrokerCycleResult> {
        // 1. Hardware Sovereignty Gate: Assert local flock ownership before pulling
        const acquired = this.gpuMutex.acquireLock()
        if (!acquired) {
            console.log(
                '>> [MUTEX:OCCUPIED] GPU silicon actively busy with local workload; skipping pull [IDLE]',
            )
            return { status: 'BUSY_LOCAL_LOCK' }
        }

        console.log(
            '>> [MUTEX:ACQUIRED] Local GPU lock acquired; checking remote edge queue [OK]',
        )

        try {
            // 2. Pull Task from Remote Edge DO FIFO Queue
            const claimResponse = await fetch(`${edgeQueueUrl}/leases/claim`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workerId: this.workerId }),
            })

            if (claimResponse.status === 204 || claimResponse.status === 404) {
                console.log(
                    '>> [PULL:EMPTY] No jobs available in edge request queue [IDLE]',
                )
                return { status: 'QUEUE_EMPTY' }
            }

            const data = (await claimResponse.json().catch(() => ({}))) as any
            if (!data.ok || !data.taskId) {
                console.log(
                    '>> [PULL:NO_TASK] Edge response indicated no active job [IDLE]',
                )
                return { status: 'QUEUE_EMPTY' }
            }

            const task: TaskPayload = {
                taskId: data.taskId,
                epoch: data.epoch,
                workflowTemplate:
                    data.workflowTemplate || 'default_template.json',
                prompts: data.prompts || {},
                seeds: data.seeds || [42],
            }

            console.log(
                `>> [PULL:CLAIMED] Leased task '${task.taskId}' under Epoch ${task.epoch} from edge [OK]`,
            )

            // 3. Execute Render Pass with Lock Continuously Held
            const executionResult = await executor(task)

            if (!executionResult.success) {
                return {
                    status: 'JOB_FAILED',
                    taskId: task.taskId,
                    error: 'EXECUTOR_FAILED',
                }
            }

            return {
                status: 'JOB_COMPLETED',
                taskId: task.taskId,
            }
        } catch (err: any) {
            console.error(
                `>> [PULL:ERR] Exception during broker cycle: ${err.message} [FAIL]`,
            )
            return {
                status: 'JOB_FAILED',
                error: err.message,
            }
        } finally {
            // 4. Guarantee Release of Local Hardware Lock
            this.gpuMutex.releaseLock()
        }
    }
}
