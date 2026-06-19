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

import {
  type ChromelessThemeConfig,
  ChromelessThemeFloatingControl,
  DEFAULT_CHROMELESS_PLAYER_CHROMING_CONFIG,
  ChromingTheme,
  ChromingTimeFormat,
  type ChromelessThemeConfigUpdateableAttrs,
} from '../chroming-api';
import {ChromingDomClasses, type ChromingDomConfig, ChromingDomController} from '../chroming-dom';
import '../components';
import {DomUtil} from '../../dom/dom-util';
import type {OmakaseTimeDisplay} from '../components';
import type {ThumbnailTrackState} from '../../media/thumbnail-track';
import {PlayerEventType} from '../../player';
import {filter, takeUntil} from 'rxjs';

export class ChromelessDomController extends ChromingDomController<ChromingTheme.CHROMELESS> {
  protected _themeConfig: ChromelessThemeConfig;

  protected _timecodeContainer: HTMLDivElement;
  protected _currentTimecode: OmakaseTimeDisplay;

  constructor(config: ChromingDomConfig<ChromingTheme.CHROMELESS>) {
    super(config);
    this._themeConfig = {
      ...DEFAULT_CHROMELESS_PLAYER_CHROMING_CONFIG,
      ...this._config.themeConfig,
    };
    this._mediaControllerElement.classList.add('media-controller-chromeless');
    this._mediaControllerElement.insertAdjacentHTML('beforeend', this.addControlBar());

    this._timecodeContainer = this.getShadowElementByClass<HTMLDivElement>(ChromingDomClasses.timecodeContainer);
    this._currentTimecode = this.getShadowElementByClass<OmakaseTimeDisplay>(ChromingDomClasses.mediaChromeCurrentTimecode);

    if (this._themeConfig.alwaysOnFloatingControls?.includes(ChromelessThemeFloatingControl.TIME)) {
      this._timecodeContainer.setAttribute('noautohide', '');
    }

    this.setThemeConfig(this._themeConfig);
  }

  addControlBar() {
    return `<div class="${ChromingDomClasses.timecodeContainer} d-none" slot="middle-chrome">
            <omakase-time-display format="${this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard'}" ${this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME ? 'countdown ' : ''} class="${ChromingDomClasses.mediaChromeCurrentTimecode}"></omakase-time-display>
        </div>`;
  }

  setThemeConfig(themeConfig: Partial<ChromelessThemeConfigUpdateableAttrs>) {
    this._themeConfig = {
      ...this._themeConfig,
      timeFormat: themeConfig.timeFormat ?? this._themeConfig.timeFormat,
      floatingControls: (themeConfig as ChromelessThemeConfig).floatingControls ?? this._themeConfig.floatingControls,
    };
    this.updateFloatingTime();
    this.updateTimeFormat();
  }

  setFloatingTimeVisible(visible: boolean): void {
    const floatingControls = this._themeConfig.floatingControls;
    if (visible && floatingControls && !floatingControls.includes(ChromelessThemeFloatingControl.TIME)) {
      floatingControls.push(ChromelessThemeFloatingControl.TIME);
      this.updateFloatingTime();
    } else if (!visible && floatingControls && floatingControls.includes(ChromelessThemeFloatingControl.TIME)) {
      floatingControls.splice(floatingControls.indexOf(ChromelessThemeFloatingControl.TIME), 1);
      this.updateFloatingTime();
    }
  }

  isFloatingTimeVisible(): boolean {
    return !!this._themeConfig.floatingControls?.includes(ChromelessThemeFloatingControl.TIME);
  }

  setThumbnailTrack(track: ThumbnailTrackState | undefined): void {
    return;
  }

  updateFloatingTime() {
    const bitcEnabled = this.isFloatingTimeVisible();
    if (bitcEnabled) {
      DomUtil.showElements(this._timecodeContainer!);
    } else {
      DomUtil.hideElements(this._timecodeContainer!);
    }
  }

  setTimeFormat(timeFormat: ChromingTimeFormat) {
    this._themeConfig = {
      ...this._themeConfig,
      timeFormat,
    };
    this.updateTimeFormat();
  }

  updateTimeFormat() {
    if (this._currentTimecode) {
      this._currentTimecode.format = this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard';
      this._currentTimecode.isCountdown = this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME;
      this._currentTimecode.updateTime();
    }
  }

  wirePlayer() {
    this.checkPlayerInternal();

    this._playerInternal!.onEvent$.pipe(
      filter((event) => event.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED),
      takeUntil(this._playerBreaker.observer),
      takeUntil(this._destroyBreaker.observer)
    ).subscribe({
      next: () => {
        this.showLoaded();
      },
    });

    if (this._currentTimecode) {
      this._currentTimecode.player = this._playerInternal!;
    }
  }

  get theme(): ChromingTheme.CHROMELESS {
    return ChromingTheme.CHROMELESS;
  }

  get themeConfig() {
    return this._themeConfig;
  }
}
