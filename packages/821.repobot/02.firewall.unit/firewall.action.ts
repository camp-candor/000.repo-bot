import type { Action } from '../99.core/interface/action.interface.js'
import type FirewallBit from './fce/firewall.bit.js'

export const INIT_FIREWALL = '[Firewall action] Init Firewall'
export class InitFirewall implements Action {
  readonly type = INIT_FIREWALL
  constructor(public bale: FirewallBit) {}
}

export const VERIFY_WEBHOOK_SIGNATURE = '[Firewall action] Verify Webhook Signature'
export class VerifyWebhookSignature implements Action {
  readonly type = VERIFY_WEBHOOK_SIGNATURE
  constructor(public bale: FirewallBit) {}
}

export const SIGNATURE_VERIFIED = '[Firewall action] Signature Verified'
export class SignatureVerified implements Action {
  readonly type = SIGNATURE_VERIFIED
  constructor(public bale: FirewallBit) {}
}

export const SIGNATURE_REJECTED = '[Firewall action] Signature Rejected'
export class SignatureRejected implements Action {
  readonly type = SIGNATURE_REJECTED
  constructor(public bale: FirewallBit) {}
}

export type Actions =
  | InitFirewall
  | VerifyWebhookSignature
  | SignatureVerified
  | SignatureRejected
