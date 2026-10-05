export default interface RepobotBit {
    idx?: string
    src?: string
    val?: number
    dat?: {
        url?: string
        timeoutMs?: number
        filterRepo?: string
        mode?: string
        [key: string]: any
    }
    slv?: (val?: any) => void
}
