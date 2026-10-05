export default interface GeminiBit {
    idx: string
    src?: string
    val?: number
    dat?: {
        notebookId?: string
        appMode?: boolean
        newWindow?: boolean
        promptText?: string
        [key: string]: any
    }
    slv?: (val?: any) => void
}
