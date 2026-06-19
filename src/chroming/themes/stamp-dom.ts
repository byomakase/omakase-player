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

import {filter, takeUntil} from 'rxjs';
import {DomUtil} from '../../dom/dom-util';
import {
  ChromingTheme,
  DEFAULT_STAMP_PLAYER_CHROMING_CONFIG,
  StampThemeActionIcon,
  StampThemeFloatingControl,
  StampThemeScale,
  ChromingTimeFormat,
  type StampThemeConfig,
  type StampThemeConfigUpdateableAttrs,
} from '../chroming-api';
import {ChromingDomClasses, ChromingDomController, type ChromingDomConfig} from '../chroming-dom';
import type {OmakaseFullscreenButton, OmakaseMuteButton, OmakaseTimeDisplay, OmakaseTimeRange} from '../components';
import type {ThumbnailTrackState} from '../../media/thumbnail-track';
import {PlayerEventType} from '../../player';

export class StampDomController extends ChromingDomController<ChromingTheme.STAMP> {
  protected _themeConfig: StampThemeConfig;

  protected _currentTimecode?: OmakaseTimeDisplay;
  protected _timecodeWrapper?: HTMLElement;
  protected _muteButton?: OmakaseMuteButton;
  protected _fullscreenButton?: OmakaseFullscreenButton;

  protected _autoHidePlaybackButtons = false;

  constructor(config: ChromingDomConfig<ChromingTheme.STAMP>) {
    super(config);
    this._themeConfig = {
      ...DEFAULT_STAMP_PLAYER_CHROMING_CONFIG,
      ...this._config.themeConfig,
    };

    this._mediaControllerElement.classList.add('media-controller-stamp');
    this._mediaControllerElement.insertAdjacentHTML('beforeend', this.addControlBar());

    this._divActionIcons.insertAdjacentHTML(
      'afterbegin',
      `${
        this._themeConfig.floatingControls?.includes(StampThemeFloatingControl.ACTION_ICONS) && this._themeConfig.actionIcons?.includes(StampThemeActionIcon.AUDIO_TOGGLE)
          ? `<omakase-mute-button class="shadow">
                    <div slot="off" class="stamp-audio-toggle stamp-audio-off"></div>
                    <div slot="low" class="stamp-audio-toggle stamp-audio-on"></div>
                    <div slot="medium" class="stamp-audio-toggle stamp-audio-on"></div>
                    <div slot="high" class="stamp-audio-toggle stamp-audio-on"></div>
                  </omakase-mute-button>`
          : ''
      }
            ${
              this._themeConfig.floatingControls?.includes(StampThemeFloatingControl.ACTION_ICONS) && this._themeConfig.actionIcons?.includes(StampThemeActionIcon.FULLSCREEN)
                ? `<omakase-fullscreen-button class="${ChromingDomClasses.mediaChromeButton} omakase-player-fullscreen shadow">
                      <span slot="enter" class="${ChromingDomClasses.mediaChromeFullscreenEnter}"></span>
                      <span slot="exit" class="${ChromingDomClasses.mediaChromeFullscreenExit}"></span>
                  </omakase-fullscreen-button>`
                : ''
            }`
    );

    this._textMediaCaptionsElement.insertAdjacentHTML(
      'beforebegin',
      `<div slot="centered-chrome" ${
        this._themeConfig.alwaysOnFloatingControls?.includes(StampThemeFloatingControl.TIME) ? 'noautohide' : ''
      } class="${ChromingDomClasses.timecodeWrapper} omakase-timecode-format-${this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard'} omakase-timecode-${
        this._themeConfig.floatingControls?.includes(StampThemeFloatingControl.PROGRESS_BAR) ? 'with' : 'without'
      }-progress-bar">
            <omakase-time-display class="${ChromingDomClasses.mediaChromeCurrentTimecode}" showduration format="${this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard'}" ${this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME ? 'countdown ' : ''}></omakase-time-display>
        </div>`
    );

    if (this._themeConfig.floatingControls?.includes(StampThemeFloatingControl.PROGRESS_BAR)) {
      this._textMediaCaptionsElement.classList.add('with-progress-bar');
    } else {
      this._textMediaCaptionsElement.classList.add('without-progress-bar');
    }

    this._themeElement.insertAdjacentHTML('beforeend', this.createSlotsDom());
    this._themeElement.classList.add('omakase-media-theme-stamp');

    if (!this._themeConfig.floatingControls?.includes(StampThemeFloatingControl.PLAYBACK_CONTROLS)) {
      DomUtil.hideElements(this._divPlaybackButtons);
    }
    if (!this._themeConfig.alwaysOnFloatingControls?.includes(StampThemeFloatingControl.PLAYBACK_CONTROLS)) {
      this._divPlaybackButtons?.removeAttribute('noautohide');
    }
    if (this._themeConfig.alwaysOnFloatingControls?.includes(StampThemeFloatingControl.ACTION_ICONS)) {
      this._divActionIcons?.setAttribute('noautohide', '');
    }

    this._timeRange = this.getShadowElement<OmakaseTimeRange>('omakase-time-range');
    this._muteButton = this.getShadowElement<OmakaseMuteButton>('omakase-mute-button');
    this._fullscreenButton = this.getShadowElement<OmakaseFullscreenButton>('omakase-fullscreen-button');
    this._currentTimecode = this.getShadowElementByClass<OmakaseTimeDisplay>(ChromingDomClasses.mediaChromeCurrentTimecode);
    this._timecodeWrapper = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.timecodeWrapper);

    this.setThemeConfig(this._themeConfig);
  }

  protected addControlBar(): string {
    return `
        <media-control-bar class="${ChromingDomClasses.mediaControlBar}" ${this._themeConfig.alwaysOnFloatingControls?.includes(StampThemeFloatingControl.PROGRESS_BAR) ? 'noautohide' : ''}>
        ${
          this._themeConfig.floatingControls?.includes(StampThemeFloatingControl.PROGRESS_BAR)
            ? `<omakase-time-range>
                <div slot="preview"></div>
            </omakase-time-range>`
            : ''
        }
        </media-control-bar>`;
  }

  protected createSlotsDom() {
    if (this._config.themeConfig?.htmlTemplateId) {
      return DomUtil.getElementByIdOrFail<HTMLElement>(this._config.themeConfig?.htmlTemplateId)?.innerHTML ?? '';
    } else {
      return '';
    }
  }

  override createMainMediaVideoElement() {
    super.createMainMediaVideoElement();
    this._themeElement.insertAdjacentHTML('beforeend', this.createSlotsDom());
  }

  setThumbnailTrack(track: ThumbnailTrackState | undefined): void {
    return;
  }

  setThemeConfig(themeConfig: Partial<StampThemeConfigUpdateableAttrs>) {
    this._themeConfig = {
      ...this._themeConfig,
      stampScale: themeConfig.stampScale ?? this._themeConfig.stampScale,
      timeFormat: themeConfig.timeFormat ?? this._themeConfig.timeFormat,
      floatingControls: (themeConfig as StampThemeConfig).floatingControls ?? this._themeConfig.floatingControls,
    };
    this.setStampScale(this._themeConfig.stampScale);
    this.updateFloatingTime();
    this.updateTimeFormat();
  }

  setStampScale(stampScale: StampThemeScale | undefined) {
    if (stampScale === StampThemeScale.FILL) {
      this._mainMediaVideoElement.classList.add(ChromingDomClasses.videoFill);
    } else {
      this._mainMediaVideoElement.classList.remove(ChromingDomClasses.videoFill);
    }
  }

  setFloatingTimeVisible(visible: boolean): void {
    const floatingControls = this._themeConfig.floatingControls;
    if (visible && floatingControls && !floatingControls.includes(StampThemeFloatingControl.TIME)) {
      floatingControls.push(StampThemeFloatingControl.TIME);
      this.updateFloatingTime();
    } else if (!visible && floatingControls && floatingControls.includes(StampThemeFloatingControl.TIME)) {
      floatingControls.splice(floatingControls.indexOf(StampThemeFloatingControl.TIME), 1);
      this.updateFloatingTime();
    }
    this._themeConfigChange$.next();
  }

  isFloatingTimeVisible(): boolean {
    return this._themeConfig.floatingControls?.includes(StampThemeFloatingControl.TIME) ?? false;
  }

  updateFloatingTime() {
    const bitcEnabled = !!this._themeConfig.floatingControls?.includes(StampThemeFloatingControl.TIME);
    if (bitcEnabled) {
      DomUtil.showElements(this._timecodeWrapper!);
    } else {
      DomUtil.hideElements(this._timecodeWrapper!);
    }
  }

  wirePlayer() {
    super.wirePlayer();
    this.checkPlayerInternal();
    let playerInternal = this._playerInternal!;

    playerInternal.onEvent$
      .pipe(
        filter((event) => event.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED),
        takeUntil(this._destroyBreaker.observer)
      )
      .subscribe(() => {
        playerInternal.audioInternal.mute();
      });

    if (this._muteButton) {
      this._muteButton.player = playerInternal;
    }
    if (this._fullscreenButton) {
      this._fullscreenButton.player = playerInternal;
    }
    if (this._currentTimecode) {
      this._currentTimecode.player = playerInternal;
    }
    if (this._timeRange) {
      this._timeRange.onSeek$.pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer)).subscribe({
        next: (time) => {
          playerInternal.seekTo(time);
        },
      });
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
    if (this._timecodeWrapper) {
      this._timecodeWrapper.classList.remove(ChromingDomClasses.timecodeFormatStandard, ChromingDomClasses.timecodeFormatTimecode);
      this._timecodeWrapper.classList.add(this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? ChromingDomClasses.timecodeFormatTimecode : ChromingDomClasses.timecodeFormatStandard);
    }
  }

  resetMainMediaVideoElement(): void {
    super.resetMainMediaVideoElement();
    this.setStampScale(this._themeConfig.stampScale);
  }

  get theme(): ChromingTheme.STAMP {
    return ChromingTheme.STAMP;
  }

  get themeConfig() {
    return this._themeConfig;
  }
}
