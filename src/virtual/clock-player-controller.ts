/*
 * Copyright 2026 ByOmakase, LLC (https://byomakase.org)
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

import {type Observable, throwError} from 'rxjs';
import type {LoadMainMediaArgsType, PlayerDomController} from '../player/player-controller-api';
import {OmakaseAudioContextProvider} from '../omakase-audio-context-provider';
import {BaseVirtualPlayerController, VIRTUAL_PLAYER_CONTROLLER_CONFIG_DEFAULT, type VirtualPlayerControllerConfig} from './base-virtual-player-controller';

export interface ClockPlayerControllerConfig extends VirtualPlayerControllerConfig {}

export const CLOCK_PLAYER_CONTROLLER_CONFIG_DEFAULT: ClockPlayerControllerConfig = {
  ...VIRTUAL_PLAYER_CONTROLLER_CONFIG_DEFAULT,
};

/**
 * Headless virtual player controller, only virtual clock without visuals. Plays at every playback rate, also backwards.
 *
 * It doesn't load main media, it is wired with main media loaded by other controller, see {@link CompositePlayerController},
 * which drives main media time with it at playback rates its media element can't play at.
 */
export class ClockPlayerController extends BaseVirtualPlayerController<ClockPlayerControllerConfig> {
  constructor(playerDomController: PlayerDomController, config?: Partial<ClockPlayerControllerConfig>) {
    super(playerDomController, {
      ...CLOCK_PLAYER_CONTROLLER_CONFIG_DEFAULT,
      ...config,
    });
  }

  loadMainMedia(args: LoadMainMediaArgsType): Observable<boolean> {
    return throwError(() => new Error(`Clock player controller doesn't load main media, it is wired with main media loaded by other controller`));
  }

  protected override isPlaybackRateSupported(playbackRate: number): boolean {
    return Number.isFinite(playbackRate) && playbackRate !== 0;
  }

  /**
   * Sets clock time, playback rate and playing state at once, synchronously, ie. to continue from main media time of other controller.
   * Only playback state change is emitted, no play, pause, seek or playback rate update events.
   */
  syncClock(time: number, playbackRate: number, playing: boolean) {
    this.checkMainMediaEssentials();
    this._playbackRate = playbackRate;
    let duration = this._mainMediaState!.duration!;
    time = Math.min(Math.max(time, 0), duration);
    if (playing) {
      this.anchorClock(time);
      this._clockRunning = true;
      this._mediaElementPlayback!.setPlaying();
      // sync ticks flow only while AudioContext is running, it is running already when other controller was playing
      OmakaseAudioContextProvider.instance.tryResumeAudioContext().subscribe();
    } else {
      this.stopClock(time);
      this._mediaElementPlayback!.setPaused();
    }
  }
}
