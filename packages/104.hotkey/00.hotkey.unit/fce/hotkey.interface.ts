export default interface Hotkey {
  idx: string
  defaultScript: string
  hotkeyDir: string
  lastExecutedScript: string | null
}
