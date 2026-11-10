import { describe, it, expect } from 'vitest'
import { DefaultFirewallModel } from '../../src/security/firewallModel.js'
import {
  InitFirewall,
  RecordVerificationPass,
  RecordVerificationRejection,
  ResetFirewallMetrics,
} from '../../src/security/firewallActions.js'
import { firewallReducer } from '../../src/security/firewallReducer.js'

describe('Firewall Unit Reactive State Model (apps/worker)', () => {
  it('instantiates default firewall state model with zero counters', () => {
    const initial = new DefaultFirewallModel()
    expect(initial.idx).toBe('firewall00')
    expect(initial.verifiedCount).toBe(0)
    expect(initial.rejectedCount).toBe(0)
    expect(initial.lastRejectionReason).toBe('NONE')
    expect(initial.lastVerificationLatencyMs).toBe(0)
    expect(Object.keys(initial.firewallBits).length).toBe(0)
  })

  it('handles INIT_FIREWALL and customizes model index', () => {
    const initial = new DefaultFirewallModel()
    const action = new InitFirewall({ idx: 'firewall-primary' })
    const state = firewallReducer(initial, action)

    expect(state.idx).toBe('firewall-primary')
    expect(state.verifiedCount).toBe(0)
  })

  it('increments verified count and records latency on verification pass', () => {
    const initial = new DefaultFirewallModel()
    const action = new RecordVerificationPass({
      idx: 'delivery-001',
      latencyMs: 3,
      timestamp: 1700000000,
    })

    const state = firewallReducer(initial, action)
    expect(state.verifiedCount).toBe(1)
    expect(state.rejectedCount).toBe(0)
    expect(state.lastVerificationLatencyMs).toBe(3)
    expect(state.firewallBits['delivery-001']).toBeDefined()
    expect(state.firewallBits['delivery-001']?.valid).toBe(true)

    // Immutability check
    expect(state).not.toBe(initial)
  })

  it('increments rejected count and captures reason on verification failure', () => {
    const initial = new DefaultFirewallModel()
    const action = new RecordVerificationRejection({
      idx: 'delivery-002',
      reason: 'INVALID_SIGNATURE_HEADER',
      latencyMs: 1,
      timestamp: 1700000005,
    })

    const state = firewallReducer(initial, action)
    expect(state.verifiedCount).toBe(0)
    expect(state.rejectedCount).toBe(1)
    expect(state.lastRejectionReason).toBe('INVALID_SIGNATURE_HEADER')
    expect(state.lastVerificationLatencyMs).toBe(1)
    expect(state.firewallBits['delivery-002']?.valid).toBe(false)
  })

  it('resets metrics and bit map on RESET_FIREWALL_METRICS', () => {
    const initial = new DefaultFirewallModel()
    const passAction = new RecordVerificationPass({ idx: 'delivery-001', latencyMs: 2 })
    const filledState = firewallReducer(initial, passAction)
    expect(filledState.verifiedCount).toBe(1)

    const resetAction = new ResetFirewallMetrics({ idx: 'cmd-reset' })
    const resetState = firewallReducer(filledState, resetAction)

    expect(resetState.verifiedCount).toBe(0)
    expect(resetState.rejectedCount).toBe(0)
    expect(resetState.lastRejectionReason).toBe('RESET')
    expect(Object.keys(resetState.firewallBits).length).toBe(0)
  })

  it('preserves existing model instance upon receiving unhandled actions', () => {
    const initial = new DefaultFirewallModel()
    const unhandledAction = { type: '[Unrecognized action] Noop', bale: { idx: 'noop' } } as any
    const state = firewallReducer(initial, unhandledAction)

    expect(state).toBe(initial)
  })
})
