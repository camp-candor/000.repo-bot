import { describe, it, expect, vi } from 'vitest'
import { EventHub } from '../../src/events/eventHub.js'
import {
  applyEpistemicScrimming,
  sanitizeToAscii,
} from '../../src/events/eventEnvelope.js'
import { EventUpcasterRegistry } from '../../src/events/upcasters.js'
import { CURRENT_SCHEMA_VERSIONS } from '../../src/events/eventEnvelope.js'

describe('Centralized Event-Sourced Backbone & EventHub Invariants', () => {
  it('sanitizes strings to pure 7-bit ASCII, stripping multi-byte UTF-8 emojis', () => {
    const dirty = '>> [TEST] Operation completed! \uD83D\uDE80 All green \u2705'
    const clean = sanitizeToAscii(dirty)
    expect(clean).toBe('>> [TEST] Operation completed!  All green')
    expect(/^[\x00-\x7F]*$/.test(clean)).toBe(true)
  })

  it('enforces epistemic scrimming for public connections', () => {
    const envelope: any = {
      id: 'evt-001',
      seq: 1,
      type: 'PR_EVENT',
      payload: { secretToken: 'super-sensitive-token', diff: 'secret logic' },
      ascii: '>> [PR] PR verified',
    }

    const operatorView = applyEpistemicScrimming(envelope, 'operator')
    expect(operatorView.payload.secretToken).toBe('super-sensitive-token')

    const publicView = applyEpistemicScrimming(envelope, 'public')
    expect(publicView.payload.secretToken).toBeUndefined()
    expect(publicView.payload.status).toBe('SCRIMMED_FOR_PUBLIC_VIEW')
    expect(publicView.payload.summary).toBe('>> [PR] PR verified')
  })

  it('upcaster migrates legacy schemas to current schema versions', () => {
    const registry = new EventUpcasterRegistry()
    registry.register('JULES_EVENT', 1, (oldPayload) => {
      return {
        ...oldPayload,
        schemaMigrated: true,
      }
    })

    const envelope: any = {
      id: 'evt-jules-v1',
      seq: 5,
      version: 1,
      type: 'JULES_EVENT',
      payload: { taskId: 'TASK-1' },
      ascii: '>> [JULES] Dispatched',
    }

    // Simulate target version bumped to 2
    const CURRENT_TEST_VERSIONS = { JULES_EVENT: 2 };
    (CURRENT_SCHEMA_VERSIONS as any)['JULES_EVENT'] = 2
    let currentVer = envelope.version
    let currentPayload = envelope.payload

    while (currentVer < CURRENT_TEST_VERSIONS.JULES_EVENT) {
      currentPayload = registry.upcast({
        ...envelope,
        version: currentVer,
        payload: currentPayload,
      }).payload
      currentVer++
    }

    expect(currentPayload.schemaMigrated).toBe(true)
    expect(currentPayload.taskId).toBe('TASK-1')
  })

  it('publishes events with monotonic sequencing, redaction, and hash chaining', async () => {
    const storageRows: any[] = []
    const mockDb = {
      prepare: vi.fn((sql: string) => ({
        first: vi.fn(async () => {
          if (sql.includes('ORDER BY sequence_id DESC')) {
            return storageRows.length > 0
              ? storageRows[storageRows.length - 1]
              : null
          }
          return null
        }),
        bind: vi.fn((...args: any[]) => ({
          run: vi.fn(async () => {
            storageRows.push({
              sequence_id: args[0],
              record_hash: args[8],
            })
          }),
        })),
      })),
    }

    const mockEnv: any = {
      DB: mockDb,
      REPO_BOT_DO: {
        idFromName: vi.fn(() => ({ toString: () => 'global-do' })),
        get: vi.fn(() => ({
          fetch: vi.fn(async () => new Response('{"ok":true}')),
        })),
      },
    }

    const hub = new EventHub(mockEnv)

    const event1 = await hub.publish({
      domain: 'AUDIT',
      type: 'AUDIT_LOG',
      source: 'testRunner',
      payload: {
        token: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
        test: 'event1',
      },
      ascii: '>> [AUDIT] Event 1 registered',
    })

    expect(event1.seq).toBe(1)
    expect(event1.payload.token).toBe('[REDACTED_GH_TOKEN]')
    expect(event1.recordHash.length).toBe(64)

    const event2 = await hub.publish({
      domain: 'GOVERNANCE',
      type: 'PR_EVENT',
      source: 'testRunner',
      payload: { test: 'event2' },
      ascii: '>> [PR] Scope check passed',
    })

    expect(event2.seq).toBe(2)
    expect(event2.prevHash).toBe(event1.recordHash)
  })
})
