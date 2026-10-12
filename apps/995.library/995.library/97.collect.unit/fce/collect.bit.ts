export default interface CollectBit {
    idx?: string
    src?: string
    val?: number
    dex?: number
    dat?: any
    bit?: any
    slv?: (result: { colBit: Partial<CollectBit> }) => void
}
