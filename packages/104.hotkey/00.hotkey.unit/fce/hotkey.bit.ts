export default interface HotkeyBit {
    idx: string
    src?: string
    val?: number
    dat?: {
        script?: string
        speed?: number
        [key: string]: any
    }
    slv?: (val?: any) => void
}
