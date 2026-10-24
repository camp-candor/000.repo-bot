export interface Action<T = unknown> {
    type: string
    bale?: T
}
