import clone from 'clone-deep'
import * as Act from './firewall.action.js'
import { FirewallModel } from './firewall.model.js'
import * as Buzz from './firewall.buzzer.js'
import type State from '../99.core/state.js'

export function reducer(model: FirewallModel = new FirewallModel(), act: Act.Actions, state?: State) {
  switch (act.type) {
    case Act.INIT_FIREWALL:
      return Buzz.initFirewall(clone(model), act.bale, state!)
    case Act.VERIFY_WEBHOOK_SIGNATURE:
      return Buzz.verifyWebhookSignature(clone(model), act.bale, state!)
    default:
      return model
  }
}
