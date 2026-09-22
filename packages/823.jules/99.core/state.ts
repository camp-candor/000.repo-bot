import { BehaviorSubject, Subject } from 'rx-lite'
import type { Action } from './interface/action.interface.js'
import UnitModel, * as Effect from '../BEE.js'

export default class State extends BehaviorSubject<any> {
    public hunt: any
    public value: any
    public pivot: any
    public bus: any

    private dispatcher: Subject<any> = new Subject()

    constructor(init: UnitModel = new UnitModel()) {
        super(init)

        this.dispatcher
            .scan((state, action) => this.reducedApp(state, action), init)
            .subscribe((state) => {
                super.onNext(state)
            })
    }

    reducedApp(nextState: any, key: any) {
        for (const k in Effect.reducer) {
            if (Effect.reducer[k]) {
                Effect.reducer[k](nextState[k], key, this)
            }
        }
        return nextState
    }

    dispatch(value: Action) {
        return this.dispatcher.onNext(value)
    }

    pat(value: Action) {
        this.dispatch(value)
    }

    next(value: any) {
        this.dispatcher.onNext(value)
    }
}
