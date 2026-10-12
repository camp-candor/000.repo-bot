export default interface ServerBit {
    idx: string
    src?: string
    val?: number
    dat?: any
    slv?: (result: { svrBit: Partial<ServerBit> }) => void
}
