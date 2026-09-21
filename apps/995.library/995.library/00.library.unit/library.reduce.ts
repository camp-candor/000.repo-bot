import clone from 'clone-deep'
import * as Act from './library.action'
import { LibraryModel } from './library.model'
import * as Buzz from './library.buzzer'
import type State from '../99.core/state'

export function reducer(
    model: LibraryModel = new LibraryModel(),
    act: Act.Actions,
    state?: State,
) {
    switch (act.type) {
        case Act.UPDATE_LIBRARY:
            return Buzz.updateLibrary(clone(model), act.bale, state)

        case Act.INIT_LIBRARY:
            return Buzz.initLibrary(clone(model), act.bale, state)

        case Act.LIST_LIBRARY:
            return Buzz.listLibrary(clone(model), act.bale, state)

        case Act.PROGRESS_LIBRARY:
            return Buzz.progressLibrary(clone(model), act.bale, state)

        case Act.SCAN_LIBRARY:
            return Buzz.scanLibrary(clone(model), act.bale, state)

        case Act.LAUNCH_LIBRARY:
            return Buzz.launchLibrary(clone(model), act.bale, state)

        case Act.FLAT_LIBRARY:
            return Buzz.flatLibrary(clone(model), act.bale, state)

        default:
            return model
    }
}
