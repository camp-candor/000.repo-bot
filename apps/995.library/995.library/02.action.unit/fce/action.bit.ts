export default interface ActionBit {
    idx: string
    src?: string
    val?: number
    dat?: any
    slv?: (result: { actBit: Partial<ActionBit> }) => void
}
