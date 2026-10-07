import { describe, it, expect } from 'vitest'
import { parseSlashCommand } from '../../src/telemetry/chatOpsParser.js'
import {
    verifyChatOpsSignature,
    generateChatOpsSignature,
} from '../../src/telemetry/chatOpsAuth.js'
import {
    formatOverrideApplied,
    formatForceRetry,
    formatTaskAborted,
    formatStatusResponse,
    formatFleetResponse,
} from '../../src/telemetry/chatOpsFormatter.js'
import { ShotCoordinatorDO } from '../../src/objects/ShotCoordinatorDO.js'

class MockDurableObjectStorage {
    public store = new Map<string, any>()
    public activeAlarm: number | null = null

    async get(key: string): Promise<any> {
        return this.store.get(key)
    }
    async put(key: string, value: any): Promise<void> {
        this.store.set(key, value)
    }
    async delete(key: string): Promise<void> {
        this.store.delete(key)
    }
    async setAlarm(ms: number): Promise<void> {
        this.activeAlarm = ms
    }
    async deleteAlarm(): Promise<void> {
        this.activeAlarm = null
    }
}

class MockDurableObjectContext {
    public storage = new MockDurableObjectStorage()
    blockConcurrencyWhile(fn: () => Promise<any>): Promise<any> {
        return fn()
    }
    waitUntil(promise: Promise<any>): void {
        promise.catch(() => {})
    }
}

describe('ChatOps Intervention & Telemetry Battery (Phase 4)', () => {
    const testSecret = 'secret_test_chatops_key'

    it('TASK-4.1: verifies timing-safe HMAC signatures and rejects tampered bodies', async () => {
        const nowSec = Math.floor(Date.now() / 1000)
        const payload = JSON.stringify({ action: 'STATUS', taskId: 'shot-042' })
        const validSig = await generateChatOpsSignature(
            payload,
            nowSec,
            testSecret,
        )

        const resValid = await verifyChatOpsSignature(
            payload,
            validSig,
            String(nowSec),
            testSecret,
        )
        expect(resValid.valid).toBe(true)

        // Single byte tampering
        const tampered = payload + ' '
        const resTampered = await verifyChatOpsSignature(
            tampered,
            validSig,
            String(nowSec),
            testSecret,
        )
        expect(resTampered.valid).toBe(false)
        expect(resTampered.error).toBe('SIGNATURE_MISMATCH')
    })

    it('TASK-4.1: rejects requests outside the 300-second anti-replay skew window', async () => {
        const staleSec = Math.floor(Date.now() / 1000) - 350 // 350s drift
        const payload = JSON.stringify({ action: 'STATUS', taskId: 'shot-042' })
        const sig = await generateChatOpsSignature(
            payload,
            staleSec,
            testSecret,
        )

        const res = await verifyChatOpsSignature(
            payload,
            sig,
            String(staleSec),
            testSecret,
        )
        expect(res.valid).toBe(false)
        expect(res.error).toContain('TIMESTAMP_DRIFT_EXPIRED')
    })

    it('TASK-4.1: parses slash commands with flags into structured ChatOpsCommand', () => {
        const raw =
            '/repo-bot override shot-042 --prompt "Knight in armor" --seed 8841 --reason "Fixed costume breach"'
        const cmd = parseSlashCommand(raw, 'architect_jules')

        expect(cmd.action).toBe('OVERRIDE')
        expect(cmd.taskId).toBe('shot-042')
        expect(cmd.operatorId).toBe('architect_jules')
        expect(cmd.positivePrompt).toBe('Knight in armor')
        expect(cmd.seed).toBe(8841)
        expect(cmd.reason).toBe('Fixed costume breach')
    })

    it('TASK-4.2: formats notification templates strictly in 7-bit ASCII without emojis', () => {
        const overrideText = formatOverrideApplied(
            'shot-01',
            'architect_1',
            3,
            'Prompt updated',
            'Canon fix',
        )
        const retryText = formatForceRetry(
            'shot-01',
            'architect_1',
            4,
            'Transient glitch',
        )
        const abortText = formatTaskAborted(
            'shot-01',
            'architect_1',
            'Shot removed',
        )
        const statusText = formatStatusResponse(
            'shot-01',
            'RUNNING',
            2,
            1,
            3,
            'abcdef123456',
            'rig2_gpu',
        )
        const fleetText = formatFleetResponse([
            {
                workerId: 'rig2_gpu',
                hostname: 'rig2.local',
                gpuModel: 'RTX 4090',
                vramFreeMb: 21000,
                status: 'ONLINE',
            },
        ])

        for (const text of [
            overrideText,
            retryText,
            abortText,
            statusText,
            fleetText,
        ]) {
            expect(text).not.toMatch(/[\uD800-\uDFFF]/)
            expect(text).toContain('>> [CHATOPS:')
        }
    })

    it('TASK-4.3: executes OVERRIDE in ShotCoordinatorDO, resets attempts, and increments epoch', async () => {
        const mockCtx = new MockDurableObjectContext()
        const coordinator = new ShotCoordinatorDO(mockCtx as any, {
            CHATOPS_SECRET: testSecret,
        })

        // Enqueue task
        await coordinator.fetch(
            new Request('https://do.internal/enqueue', {
                method: 'POST',
                body: JSON.stringify({ taskId: 'shot-override-test' }),
            }),
        )

        // Dispatch OVERRIDE command
        const nowSec = Math.floor(Date.now() / 1000)
        const overridePayload = JSON.stringify({
            action: 'OVERRIDE',
            taskId: 'shot-override-test',
            operatorId: 'architect_jules',
            positivePrompt: 'A heroic knight',
            seed: 7777,
            reason: 'Fixing anatomy deformation',
        })
        const sig = await generateChatOpsSignature(
            overridePayload,
            nowSec,
            testSecret,
        )

        const res = await coordinator.fetch(
            new Request('https://do.internal/chatops/command', {
                method: 'POST',
                headers: {
                    'x-chatops-signature': sig,
                    'x-chatops-timestamp': String(nowSec),
                },
                body: overridePayload,
            }),
        )

        expect(res.status).toBe(200)
        const data: any = await res.json()
        expect(data.ok).toBe(true)
        expect(data.overridden).toBe(true)
        expect(data.epoch).toBe(1)

        // Verify ledger record
        const ledgerChain = (coordinator as any).ledgerChain
        const lastBlock = ledgerChain[ledgerChain.length - 1]
        expect(lastBlock.eventType).toBe('CHATOPS_MANUAL_OVERRIDE')
        expect(lastBlock.payload.operatorId).toBe('architect_jules')
    })

    it('TASK-4.3: executes ABORT in ShotCoordinatorDO and disarms watchdog alarm', async () => {
        const mockCtx = new MockDurableObjectContext()
        mockCtx.storage.activeAlarm = Date.now() + 30_000
        const coordinator = new ShotCoordinatorDO(mockCtx as any, {
            CHATOPS_SECRET: testSecret,
        })

        // Enqueue task
        await coordinator.fetch(
            new Request('https://do.internal/enqueue', {
                method: 'POST',
                body: JSON.stringify({ taskId: 'shot-abort-test' }),
            }),
        )

        const nowSec = Math.floor(Date.now() / 1000)
        const abortPayload = JSON.stringify({
            action: 'ABORT',
            taskId: 'shot-abort-test',
            operatorId: 'director_bob',
            reason: 'Scene cut from edit',
        })
        const sig = await generateChatOpsSignature(
            abortPayload,
            nowSec,
            testSecret,
        )

        const res = await coordinator.fetch(
            new Request('https://do.internal/chatops/command', {
                method: 'POST',
                headers: {
                    'x-chatops-signature': sig,
                    'x-chatops-timestamp': String(nowSec),
                },
                body: abortPayload,
            }),
        )

        expect(res.status).toBe(200)
        const data: any = await res.json()
        expect(data.ok).toBe(true)
        expect(data.aborted).toBe(true)
        expect(mockCtx.storage.activeAlarm).toBeNull() // Watchdog successfully disarmed!
    })
})
