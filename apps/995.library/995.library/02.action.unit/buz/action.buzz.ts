import * as ActCns from '../../83.console.unit/console.action'

import type { ActionModel } from '../action.model'
import type ActionBit from '../fce/action.bit'
import type State from '../../99.core/state'

import * as ActLib from '../../00.library.unit/library.action'

let lst, bit

export const initAction = (cpy: ActionModel, bal: ActionBit, ste: State) => {
    return cpy
}

export const updateAction = async (
    cpy: ActionModel,
    bal: ActionBit,
    ste: State,
) => {
    const dom = bal.idx.split('.')[1]
    const file = './' + bal.src + '/' + bal.idx + '/' + dom + '.action.ts'

    const FS = require('fs-extra')

    const list = FS.readFileSync(file).toString().split('\n')

    const lines = list.filter((line) => {
        const trimmedLine = line.trim()
        const startsWithExportConst = trimmedLine.startsWith('export const ')
        const containsImplements = trimmedLine.includes('implements')
        return startsWithExportConst && !containsImplements
    })

    const output = lines.join('\n')
    const out = './995.library/act/' + dom + '.action.ts'

    FS.writeFileSync(out, output)

    ste.hunt(ActCns.UPDATE_CONSOLE, { idx: 'cns00', src: 'writing ' + out })

    bit = await ste.hunt(ActLib.LIST_LIBRARY, {})

    lst = bit.libBit.lst

    lst.forEach((a) => {
        if (a == '995.library') return

        const dir = FS.readdirSync('./' + a + '/act')

        const exist = false

        dir.forEach((b) => {
            const now = b.split('.')[0]

            if (dom == now) {
                const element = a
                const out = './' + element + '/act/' + dom + '.action.ts'
                FS.writeFileSync(out, output)
                ste.hunt(ActCns.UPDATE_CONSOLE, {
                    idx: 'cns00',
                    src: 'writing ' + out,
                })
            }
        })
    })

    bal.slv({ actBit: { idx: 'update-action' } })

    return cpy
}
