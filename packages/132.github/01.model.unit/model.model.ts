import Model from './fce/model.interface.js'
import ModelBit from './fce/model.bit.js'

export class ModelModel implements Model {
    idx: string = ''
    modelBits: Record<string, ModelBit> = {}
}
