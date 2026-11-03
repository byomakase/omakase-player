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

import {Observable, takeUntil} from 'rxjs';
import {type FrameRateModel, FrameRateResolver} from '../common/frame-rate';
import {TimecodeConverter, type TimecodeModel} from '../common/timecode';
import type {LoadMainMediaArgsType, PlayerDomController} from '../player/player-controller-api';
import {errorCompleteObserver, nextCompleteObserver} from '../util/rxjs-util';
import {BaseVirtualPlayerController, VIRTUAL_PLAYER_CONTROLLER_CONFIG_DEFAULT, type VirtualPlayerControllerConfig} from '../virtual/base-virtual-player-controller';
import {SlateDomControllerImpl} from './slate-dom-controller';

export interface SlatePlayerControllerConfig extends VirtualPlayerControllerConfig {
  /**
   * Frame rate used when {@link MainMediaLoadOptions.frameRate} is not provided
   */
  defaultFrameRate: number | string;
}

export const SLATE_PLAYER_CONTROLLER_CONFIG_DEFAULT: SlatePlayerControllerConfig = {
  ...VIRTUAL_PLAYER_CONTROLLER_CONFIG_DEFAULT,
  defaultFrameRate: 30,
};

/**
 * Plays slate, virtual main media of provided duration.
 */
export class SlatePlayerController extends BaseVirtualPlayerController<SlatePlayerControllerConfig> {
  /**
   * Creates controller that renders slate in place of provided dom controller's video element, ie. inside chroming
   */
  static createMounted(playerDomController: PlayerDomController, config?: Partial<SlatePlayerControllerConfig>): SlatePlayerController {
    let slateDomController = SlateDomControllerImpl.mountOver(playerDomController);
    let controller = new SlatePlayerController(slateDomController, config);
    controller._ownedDomController = slateDomController;
    slateDomController.attachController(controller);
    return controller;
  }

  constructor(playerDomController: PlayerDomController, config?: Partial<SlatePlayerControllerConfig>) {
    super(playerDomController, {
      ...SLATE_PLAYER_CONTROLLER_CONFIG_DEFAULT,
      ...config,
    });
  }

  loadMainMedia(args: LoadMainMediaArgsType): Observable<boolean> {
    this._loadBreaker.break();

    return new Observable<boolean>((observer) => {
      let loadOptions = args.loadOptions;
      let duration = loadOptions?.duration;

      if (duration === undefined || !(duration > 0)) {
        errorCompleteObserver(observer, new Error(`Slate duration must be provided and greater than 0`));
        return;
      }

      let frameRateModel: FrameRateModel;
      let ffomTimecodeModel: TimecodeModel | undefined;
      try {
        frameRateModel = FrameRateResolver.resolveFrameRateModel(loadOptions?.frameRate ?? this._config.defaultFrameRate, loadOptions?.dropFrame);
        if (loadOptions?.ffom) {
          let timecodeConverter = TimecodeConverter.create({
            frameRateModel: frameRateModel,
          });
          ffomTimecodeModel = timecodeConverter.parseValueTextToTimecodeModel(loadOptions.ffom);
        }
      } catch (e) {
        errorCompleteObserver(observer, e);
        return;
      }

      this._clockRunning = false;
      this.anchorClock(0);

      args
        .mainMediaEssentialArgsHook({
          duration: duration,
          frameRateModel: frameRateModel,
          ffomTimecodeModel: ffomTimecodeModel,
          hasVideo: false,
          hasAudio: false,
        })
        .pipe(takeUntil(this._loadBreaker.observer))
        .subscribe({
          next: () => {
            args
              .tracksCreatedHook([])
              .pipe(takeUntil(this._loadBreaker.observer))
              .subscribe({
                next: () => nextCompleteObserver(observer, true),
                error: (error) => errorCompleteObserver(observer, error),
              });
          },
          error: (error) => errorCompleteObserver(observer, error),
        });
    });
  }

  protected isPlaybackRateSupported(playbackRate: number): boolean {
    return true;
  }
}
