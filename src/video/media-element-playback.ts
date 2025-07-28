/*
 * Copyright 2025 ByOmakase, LLC (https://byomakase.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {BehaviorSubject, Subject} from 'rxjs';
import {MediaElementPlaybackState} from './model';

export class MediaElementPlayback {
  public readonly onChange$: Subject<MediaElementPlaybackState>;

  private _state: MediaElementPlaybackState = {
    playing: false,
    paused: true,
    pausing: false,
    waiting: false,
    seeking: false,
    buffering: false,
    ended: false,
    waitingSyncedMedia: false
  };

  constructor() {
    this.onChange$ = new BehaviorSubject(this._state);
  }

  private updateState(partialState: Partial<MediaElementPlaybackState>) {
    let newState = {
      ...this._state,
      ...partialState,
    };
    let isEqual = this.compare(this._state, newState) === 0;
    this._state = newState;
    if (!isEqual) {
      this.onChange$.next(this._state);
    }
  }

  private compare(o1: MediaElementPlaybackState, o2: MediaElementPlaybackState): number {
    return o1.playing === o2.playing &&
      o1.paused === o2.paused &&
      o1.pausing === o2.pausing &&
      o1.waiting === o2.waiting &&
      o1.seeking === o2.seeking &&
      o1.buffering === o2.buffering &&
      o1.ended === o2.ended &&
      o1.waitingSyncedMedia === o2.waitingSyncedMedia
      ? 0
      : -1;
  }

  get state(): MediaElementPlaybackState {
    return this._state;
  }

  setPlaying() {
    this.updateState({
      playing: true,
      paused: false,
      pausing: false,
      waiting: false,
      seeking: false,
      buffering: false,
      ended: false,
    });
  }

  setPaused() {
    this.updateState({
      playing: false,
      paused: true,
      pausing: false,
      waiting: false,
      seeking: false,
      buffering: false,
      ended: false,
    });
  }

  get pausing(): boolean {
    return this._state.pausing;
  }

  setPausing() {
    this.updateState({
      pausing: true,
    });
  }

  setEnded() {
    this.updateState({
      playing: false,
      paused: true,
      pausing: false,
      waiting: false,
      seeking: false,
      buffering: false,
      ended: true,
    });
  }

  get waiting(): boolean {
    return this._state.waiting;
  }

  set waiting(value: boolean) {
    this.updateState({
      waiting: value,
    });
  }

  get seeking(): boolean {
    return this._state.seeking;
  }

  get playing(): boolean {
    return this.state.playing;
  }

  set seeking(value: boolean) {
    this.updateState({
      seeking: value,
      pausing: false,
      ended: false,
    });
  }

  get buffering(): boolean {
    return this._state.buffering;
  }

  set buffering(value: boolean) {
    this.updateState({
      buffering: value,
    });
  }

  get waitingSyncedMedia(): boolean {
    return this._state.waitingSyncedMedia;
  }

  set waitingSyncedMedia(value: boolean) {
    this.updateState({
      waitingSyncedMedia: value,
    });
  }
}
