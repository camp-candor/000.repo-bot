import ModelBit from './model.bit.js'

export default interface Model {
    idx: string
    modelBits: Record<string, ModelBit>
}
