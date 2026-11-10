import type Firewall from './fce/firewall.interface.js'
import type FirewallBit from './fce/firewall.bit.js'

export class FirewallModel implements Firewall {
  idx: string = '02.firewall'
  totalVerifications: number = 0
  failedVerifications: number = 0
  lastVerificationTimestamp: number = 0
  lastRejectReason: string = ''
  firewallBits: Record<string, FirewallBit> = {}
}
