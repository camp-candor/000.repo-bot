/**
 * apps/worker/src/security/firewallModel.ts
 *
 * In-memory reactive state model for edge ingress firewall tracking.
 * Pure 7-bit clean ASCII compliance.
 */

export interface FirewallBit {
  readonly idx: string
  readonly signature?: string
  readonly rawPayload?: Uint8Array | string
  readonly secret?: string
  readonly valid?: boolean
  readonly reason?: string
  readonly latencyMs?: number
  readonly timestamp?: number
}

export interface FirewallState {
  readonly idx: string
  readonly verifiedCount: number
  readonly rejectedCount: number
  readonly lastRejectionReason: string
  readonly lastVerificationLatencyMs: number
  readonly firewallBits: Record<string, FirewallBit>
}

export class DefaultFirewallModel implements FirewallState {
  public readonly idx: string = 'firewall00'
  public readonly verifiedCount: number = 0
  public readonly rejectedCount: number = 0
  public readonly lastRejectionReason: string = 'NONE'
  public readonly lastVerificationLatencyMs: number = 0
  public readonly firewallBits: Record<string, FirewallBit> = {}
}
