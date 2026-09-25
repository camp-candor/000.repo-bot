import clone from 'clone-deep'
import * as Act from './pages.action.js'
import { PagesModel } from './pages.model.js'
import * as Buzz from './pages.buzzer.js'
import State from '../99.core/state.js'

export function reducer(
    model: PagesModel = new PagesModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.REMOVE_PAGES:
            return Buzz.removePages(clone(model), act.bale, state)

        case Act.DELETE_PAGES:
            return Buzz.deletePages(clone(model), act.bale, state)

        case Act.READ_PAGES:
            return Buzz.readPages(clone(model), act.bale, state)

        case Act.WRITE_PAGES:
            return Buzz.writePages(clone(model), act.bale, state)

        case Act.CREATE_PAGES:
            return Buzz.createPages(clone(model), act.bale, state)

        case Act.UPDATE_PAGES:
            return Buzz.updatePages(clone(model), act.bale, state)

        case Act.INIT_PAGES:
            return Buzz.initPages(clone(model), act.bale, state)

        case Act.LIST_PAGES:
            return Buzz.listPages(clone(model), act.bale, state)

        case Act.SELECT_PAGES:
            return Buzz.selectPages(clone(model), act.bale, state)

        default:
            return model
    }
}
