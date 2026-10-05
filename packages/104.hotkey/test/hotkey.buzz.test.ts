import { test, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { HotkeyModel } from '../00.hotkey.unit/hotkey.model'
import {
  executeHotkey,
  resolveRepoRoot,
} from '../00.hotkey.unit/buz/hotkey.buzz'

test('executeHotkey auto-creates data/hotkey and 000..ahk if missing', async () => {
  const repoRoot = resolveRepoRoot()
  const hotkeyDir = path.join(repoRoot, 'data', 'hotkey')
  const defaultAhk = path.join(hotkeyDir, '000..ahk')

  // Backup existing 000..ahk if present in test environment
  let existingContent: string | null = null
  if (fs.existsSync(defaultAhk)) {
    existingContent = fs.readFileSync(defaultAhk, 'utf8')
    fs.unlinkSync(defaultAhk)
  }

  let slvCalledWith: any = null
  const bal = {
    idx: 'test-hotkey',
    slv: (res: any) => {
      slvCalledWith = res
    },
  } as any

  const ste = {
    hunt: async () => ({}),
  } as any

  try {
    await executeHotkey(new HotkeyModel(), bal, ste)

    expect(fs.existsSync(hotkeyDir)).toBe(true)
    expect(fs.existsSync(defaultAhk)).toBe(true)

    const content = fs.readFileSync(defaultAhk, 'utf8')
    expect(content.includes('MouseMove, %CenterX%, %CenterY%, 5')).toBe(true)
    expect(content.includes('CoordMode, Mouse, Screen')).toBe(true)

    expect(slvCalledWith).toBeTruthy()
    expect(slvCalledWith.htkBit).toBeTruthy()
    expect(slvCalledWith.htkBit.val).toBe(1)
  } finally {
    // Teardown or restore original content
    if (existingContent !== null) {
      fs.writeFileSync(defaultAhk, existingContent, 'utf8')
    } else if (fs.existsSync(defaultAhk)) {
      fs.unlinkSync(defaultAhk)
    }
  }
})

test('executeHotkey reports error for non-existent custom script', async () => {
  let slvCalledWith: any = null
  const bal = {
    idx: 'test-custom-missing',
    src: 'non_existent_macro',
    slv: (res: any) => {
      slvCalledWith = res
    },
  } as any

  const ste = {
    hunt: async () => ({}),
  } as any

  await executeHotkey(new HotkeyModel(), bal, ste)

  expect(slvCalledWith).toBeTruthy()
  expect(slvCalledWith.htkBit.idx).toBe('execute-hotkey-error')
  expect(slvCalledWith.htkBit.val).toBe(0)
})
