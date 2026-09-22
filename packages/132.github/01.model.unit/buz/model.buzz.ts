import { ModelModel } from '../model.model.js'
import ModelBit from '../fce/model.bit.js'
import ModBit from '../fce/modBit.js'

import State from '../../99.core/state.js'

import * as ActCol from '../../97.collect.unit/collect.action.js'
import * as ActMod from '../../01.model.unit/model.action.js'

var bit, dat

export const initModel = (cpy: ModelModel, bal: ModelBit, ste: State) => {
    return cpy
}

export const updateModel = (cpy: ModelModel, bal: ModelBit, ste: State) => {
    bal.slv({ modBit: { idx: 'update-model' } })
    return cpy
}

export const readModel = async (cpy: ModelModel, bal: ModelBit, ste: State) => {
    if (bal.idx == null) bal.idx = 'mod00'

    // The READ_COLLECT action is smart: it ensures data exists by attempting a write/create if not found.
    bit = await ste.hunt(ActCol.READ_COLLECT, {
        idx: bal.idx,
        bit: ActMod.CREATE_MODEL,
    })

    bal.slv({ modBit: { idx: 'read-model', dat: bit.clcBit.dat } })
    return cpy
}

export const writeModel = async (
    cpy: ModelModel,
    bal: ModelBit,
    ste: State,
) => {
    if (bal.dat == null) bal.dat = {}

    bit = await ste.hunt(ActCol.WRITE_COLLECT, {
        idx: bal.idx,
        dat: bal.dat,
        bit: ActMod.CREATE_MODEL,
    })
    dat = bit.clcBit.dat
    bal.slv({ modBit: { idx: 'write-model', dat } })
    return cpy
}

export const removeModel = async (
    cpy: ModelModel,
    bal: ModelBit,
    ste: State,
) => {
    bit = await ste.hunt(ActCol.REMOVE_COLLECT, {
        idx: bal.idx,
        bit: ActMod.DELETE_MODEL,
    })

    bal.slv({ modBit: { idx: 'remove-model', dat: bit.clcBit.dat } })
    return cpy
}

export const deleteModel = (cpy: ModelModel, bal: ModelBit, ste: State) => {
    bal.slv({ modBit: { idx: 'delete-model' } })
    return cpy
}

export const createModel = (cpy: ModelModel, bal: ModelBit, ste: State) => {
    if (bal.dat == null) bal.dat = {}
    var modBit: ModBit = { idx: bal.idx, src: bal.dat.src }

    bal.slv({ modBit: { idx: 'create-model', dat: modBit } })
    return cpy
}

export const listModel = async (cpy: ModelModel, bal: ModelBit, ste: State) => {
    bit = await ste.hunt(ActCol.LIST_COLLECT, {
        val: bal.val,
        bit: ActMod.CREATE_MODEL,
    })
    bal.slv({ modBit: { idx: 'list-model', lst: bit.clcBit.lst } })
    return cpy
}
