import { Action } from '../99.core/interface/action.interface.js'
import cloudflareBit from './fce/cloudflare.bit.js'

// cloudflare actions

export const INIT_CLOUDFLARE = '[Cloudflare action] Init Cloudflare'
export class InitCloudflare implements Action {
    readonly type = INIT_CLOUDFLARE
    constructor(public bale: cloudflareBit) {}
}

export const UPDATE_CLOUDFLARE = '[Cloudflare action] Update Cloudflare'
export class UpdateCloudflare implements Action {
    readonly type = UPDATE_CLOUDFLARE
    constructor(public bale: cloudflareBit) {}
}

export const TEST_CLOUDFLARE = '[Test action] Test Cloudflare'
export class TestCloudflare implements Action {
    readonly type = TEST_CLOUDFLARE
    constructor(public bale: cloudflareBit) {}
}

export const INTELLECT_CLOUDFLARE = '[Intellect action] Intellect Cloudflare'
export class IntellectCloudflare implements Action {
    readonly type = INTELLECT_CLOUDFLARE
    constructor(public bale: cloudflareBit) {}
}

export const VISION_CLOUDFLARE = '[Vision action] Vision Cloudflare'
export class VisionCloudflare implements Action {
    readonly type = VISION_CLOUDFLARE
    constructor(public bale: cloudflareBit) {}
}

export const LIST_CLOUDFLARE = '[List action] List Cloudflare'
export class ListCloudflare implements Action {
    readonly type = LIST_CLOUDFLARE
    constructor(public bale: cloudflareBit) {}
}

export const CONNECT_CLOUDFLARE = '[Connect action] Connect Cloudflare'
export class ConnectCloudflare implements Action {
    readonly type = CONNECT_CLOUDFLARE
    constructor(public bale: cloudflareBit) {}
}

export const DISCONNECT_CLOUDFLARE = '[Disconnect action] Disconnect Cloudflare'
export class DisconnectCloudflare implements Action {
    readonly type = DISCONNECT_CLOUDFLARE
    constructor(public bale: cloudflareBit) {}
}

export type Actions =
    | InitCloudflare
    | UpdateCloudflare
    | TestCloudflare
    | IntellectCloudflare
    | VisionCloudflare
    | ListCloudflare
    | ConnectCloudflare
    | DisconnectCloudflare
