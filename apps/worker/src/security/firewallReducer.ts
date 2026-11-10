/**
 * apps/worker/src/security/firewallReducer.ts
 *
 * Pure reducer function for reactive firewall state transitions.
 * Enforces deep immutability across state revisions.
 * Pure 7-bit clean ASCII compliance.
 */

import type { FirewallState, FirewallBit } from './firewallModel.js'
import { DefaultFirewallModel } from './firewallModel.js'
import type { FirewallActions } from './firewallActions.js'
import {
  INIT_FIREWALL,
  RECORD_VERIFICATION_PASS,
  RECORD_VERIFICATION_REJECTION,
  RESET_FIREWALL_METRICS,
} from './firewallActions.js'

export function firewallReducer(
  model: FirewallState = new DefaultFirewallModel(),
  action: FirewallActions
): FirewallState {
  switch (action.type) {
    case INIT_FIREWALL: {
      const bit: FirewallBit = action.bale
      return {
        ...model,
        idx: bit.idx || model.idx,
      }
    }

    case RECORD_VERIFICATION_PASS: {
      const bit: FirewallBit = action.bale
      const nextBits = { ...model.firewallBits }
      if (bit.idx) {
        nextBits[bit.idx] = {
          ...bit,
          valid: true,
          timestamp: bit.timestamp || Date.now(),
        }
      }

      return {
        ...model,
        verifiedCount: model.verifiedCount + 1,
        lastVerificationLatencyMs: bit.latencyMs ?? model.lastVerificationLatencyMs,
        firewallBits: nextBits,
      }
    }

    case RECORD_VERIFICATION_REJECTION: {
      const bit: FirewallBit = action.bale
      const nextBits = { ...model.firewallBits }
      if (bit.idx) {
        nextBits[bit.idx] = {
          ...bit,
          valid: false,
          timestamp: bit.timestamp || Date.now(),
        }
      }

      return {
        ...model,
        rejectedCount: model.rejectedCount + 1,
        lastRejectionReason: bit.reason || 'SIGNATURE_MISMATCH',
        lastVerificationLatencyMs: bit.latencyMs ?? model.lastVerificationLatencyMs,
        firewallBits: nextBits,
      }
    }

    case RESET_FIREWALL_METRICS: {
      return {
        ...model,
        verifiedCount: 0,
        rejectedCount: 0,
        lastRejectionReason: 'RESET',
        lastVerificationLatencyMs: 0,
        firewallBits: {},
      }
    }

    default:
      return model
  }
}
