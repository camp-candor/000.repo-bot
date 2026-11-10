/**
 * apps/worker/src/security/firewallActions.ts
 *
 * Dispatched action definitions for ingress firewall state transitions.
 * Pure 7-bit clean ASCII compliance.
 */

import type { FirewallBit } from './firewallModel.js'

export const INIT_FIREWALL = '[Firewall action] Init Firewall'
export class InitFirewall {
  readonly type = INIT_FIREWALL
  constructor(public readonly bale: FirewallBit) {}
}

export const RECORD_VERIFICATION_PASS = '[Firewall action] Record Verification Pass'
export class RecordVerificationPass {
  readonly type = RECORD_VERIFICATION_PASS
  constructor(public readonly bale: FirewallBit) {}
}

export const RECORD_VERIFICATION_REJECTION = '[Firewall action] Record Verification Rejection'
export class RecordVerificationRejection {
  readonly type = RECORD_VERIFICATION_REJECTION
  constructor(public readonly bale: FirewallBit) {}
}

export const RESET_FIREWALL_METRICS = '[Firewall action] Reset Firewall Metrics'
export class ResetFirewallMetrics {
  readonly type = RESET_FIREWALL_METRICS
  constructor(public readonly bale: FirewallBit) {}
}

export type FirewallActions =
  | InitFirewall
  | RecordVerificationPass
  | RecordVerificationRejection
  | ResetFirewallMetrics
