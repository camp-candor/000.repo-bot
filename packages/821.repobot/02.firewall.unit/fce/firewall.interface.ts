import type FirewallBit from './firewall.bit.js'

export default interface Firewall {
  idx: string
  totalVerifications: number
  failedVerifications: number
  lastVerificationTimestamp: number
  lastRejectReason: string
  firewallBits: Record<string, FirewallBit>
}
