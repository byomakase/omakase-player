/**
 *       Copyright 2023 ByOmakase, LLC (https://byomakase.org)
 *
 *       Licensed under the Apache License, Version 2.0 (the "License");
 *       you may not use this file except in compliance with the License.
 *       You may obtain a copy of the License at
 *
 *           http://www.apache.org/licenses/LICENSE-2.0
 *
 *       Unless required by applicable law or agreed to in writing, software
 *       distributed under the License is distributed on an "AS IS" BASIS,
 *       WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *       See the License for the specific language governing permissions and
 *       limitations under the License.
 */

import {BehaviorSubject, Subject} from "rxjs";

export interface PlaybackState {
    playing: boolean;
    paused: boolean;
    waiting: boolean;
    seeking: boolean;
    buffering: boolean;
    ended: boolean;
}

export class PlaybackStateMachine {
    public readonly onChange$: Subject<PlaybackState>;

    private _state: PlaybackState = {
        playing: false,
        paused: true,
        waiting: false,
        seeking: false,
        buffering: false,
        ended: false
    };

    constructor() {
        // Memory leak
        this.onChange$ = new BehaviorSubject(this._state)
    }

    private updateState(partialState: Partial<PlaybackState>) {
        let newState = {
            ...this._state,
            ...partialState
        }
        let isEqual = this.compare(this._state, newState) === 0;
        this._state = newState;
        if (!isEqual) {
            this.onChange$.next(this._state);
        }
    }

    private compare(o1: PlaybackState, o2: PlaybackState): number {
        return (o1.playing === o2.playing
            && o1.paused === o2.paused
            && o1.waiting === o2.waiting
            && o1.seeking === o2.seeking
            && o1.buffering === o2.buffering
            && o1.ended === o2.ended
        ) ? 0 : -1;
    }

    get state(): PlaybackState {
        return this._state;
    }

    setPlaying() {
        this.updateState({
            playing: true,
            paused: false,
            waiting: false,
            seeking: false,
            buffering: false,
            ended: false
        })
    }

    setPaused() {
        this.updateState({
            playing: false,
            paused: true,
            waiting: false,
            seeking: false,
            buffering: false,
            ended: false
        })
    }

    setEnded() {
        this.updateState({
            playing: false,
            paused: true,
            waiting: false,
            seeking: false,
            buffering: false,
            ended: true
        })
    }

    set waiting(value: boolean) {
        this.updateState({
            waiting: value
        })
    }

    set seeking(value: boolean) {
        this.updateState({
            seeking: value,
            ended: false
        })
    }

    set buffering(value: boolean) {
        this.updateState({
            buffering: value
        })
    }
}
