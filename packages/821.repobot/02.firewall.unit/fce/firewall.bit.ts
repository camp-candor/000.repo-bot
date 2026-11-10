export default interface FirewallBit {
  idx: string
  src?: string
  val?: number
  dat?: any
  rawPayload?: Uint8Array | string
  signatureHeader?: string
  secret?: string
  slv?: Function
}
