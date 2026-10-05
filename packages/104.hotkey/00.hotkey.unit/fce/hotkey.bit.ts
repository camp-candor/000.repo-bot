export default interface HotkeyBit {
    idx: string
    src?: string
    val?: number
    dat?: {
        scriptName?: string
        path?: string
        [key: string]: any
    }
    slv?: (val?: any) => void
}
