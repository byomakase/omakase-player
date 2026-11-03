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
import {
  AudioThemeControl,
  AudioVisualization,
  DEFAULT_AUDIO_PLAYER_CHROMING_CONFIG,
  ChromingTheme,
  ChromingTimeFormat,
  type AudioThemeConfig,
  AudioThemeFloatingControl,
  AudioPlayerSize,
  type AudioThemeConfigUpdateableAttrs,
} from '../chroming-api';
import {ChromingDomClasses, ChromingDomController, type ChromingDomConfig} from '../chroming-dom';
import {OmakaseTimeDisplayAttributes} from '../components/omakase-time-display';
import type {
  OmakaseAudioVisualization,
  OmakaseDropdown,
  OmakaseDropdownToggle,
  OmakaseMarkerBar,
  OmakaseMuteButton,
  OmakasePlayButton,
  OmakasePreviewThumbnail,
  OmakaseTimeDisplay,
  OmakaseTimeRange,
  OmakasePlaybackRateSelector,
  OmakaseTextSelector,
} from '../components';
import {PlayerAudioType, PlayerEventType, type PlayerApi, type PlayerDetachedApi} from '../../player';
import {DomUtil} from '../../dom/dom-util';
import type {ThumbnailTrackState} from '../../media/thumbnail-track';
import {MainMediaType} from '../../media';
import type {OmakaseRouterVisualization} from '../components/omakase-router-visualization';
import {ChromingUtil} from '../chroming-util';

export class AudioDomController extends ChromingDomController<ChromingTheme.AUDIO> {
  protected _themeConfig: AudioThemeConfig;

  protected _playButton?: OmakasePlayButton;
  protected _muteButton?: OmakaseMuteButton;
  protected _timeRange?: OmakaseTimeRange;
  protected _audioVisualization?: OmakaseAudioVisualization;
  protected _routerVisualization?: OmakaseRouterVisualization | undefined;
  protected _audioBackground?: HTMLElement;

  protected _routerDropdown?: OmakaseDropdown;

  protected _playbackRateSelector?: OmakasePlaybackRateSelector;
  protected _textSelector?: OmakaseTextSelector;
  protected _routerDropdownToggle?: OmakaseDropdownToggle;

  protected _currentTimecode?: OmakaseTimeDisplay;
  protected _previewTimecode?: OmakaseTimeDisplay;
  protected _previewThumbnail?: OmakasePreviewThumbnail;

  constructor(config: ChromingDomConfig<ChromingTheme.AUDIO>) {
    super(config);
    this._themeConfig = {
      ...DEFAULT_AUDIO_PLAYER_CHROMING_CONFIG,
      ...this._config.themeConfig,
    };
    this._mediaControllerElement.classList.add('media-controller-audio');
    this._mediaControllerElement.insertAdjacentHTML('beforeend', this.addControlBar());
    this._mediaControllerElement.classList.add(`omakase-control-bar-${this._themeConfig.controlBarVisibility?.toLowerCase() ?? 'enabled'}`);

    if (this._themeConfig.visualization === AudioVisualization.DISABLED) {
      this._mediaControllerElement.insertAdjacentHTML('afterbegin', `<div class="omakase-audio-background" noautohide></div>`);
    }

    this._themeElement.insertAdjacentHTML('beforeend', this.createSlotsDom());

    this._autoHidePlaybackButtons = !this._themeConfig.alwaysOnFloatingControls?.includes(AudioThemeFloatingControl.PLAYBACK_CONTROLS);
    if (this._themeConfig.alwaysOnFloatingControls?.includes(AudioThemeFloatingControl.HELP_MENU)) {
      this._divActionIcons?.setAttribute('noautohide', '');
    }

    if (this._themeConfig.visualization === AudioVisualization.ENABLED) {
      this._divPlaybackButtons.insertAdjacentHTML(
        'beforebegin',
        `<omakase-audio-visualization fill="${this._themeConfig.visualizationConfig?.fillColors.join(' ')}" stroke="${this._themeConfig.visualizationConfig?.strokeColor}" noautohide></omakase-audio-visualization>`
      );
    }

    this._playButton = this.getShadowElement<OmakasePlayButton>('omakase-play-button');
    this._muteButton = this.getShadowElement<OmakaseMuteButton>('omakase-mute-button');
    this._timeRange = this.getShadowElement<OmakaseTimeRange>('omakase-time-range');
    this._markerBar = this.getShadowElement<OmakaseMarkerBar>('omakase-marker-bars');
    this._previewThumbnail = this.getShadowElement<OmakasePreviewThumbnail>('omakase-preview-thumbnail');
    this._audioVisualization = this.getShadowElement<OmakaseAudioVisualization>('omakase-audio-visualization');

    this._currentTimecode = this.getShadowElementByClass<OmakaseTimeDisplay>(ChromingDomClasses.mediaChromeCurrentTimecode);
    this._previewTimecode = this.getShadowElementByClass<OmakaseTimeDisplay>(ChromingDomClasses.mediaChromePreviewTimecode);
    this._playbackRateSelector = this.getShadowElement<OmakasePlaybackRateSelector>('omakase-playback-rate-selector');
    this._textSelector = this.getShadowElement<OmakaseTextSelector>('omakase-text-selector');
    this._routerDropdown = this.getShadowElementByClass<OmakaseDropdown>(ChromingDomClasses.audioRouterDropdown);
    this._audioBackground = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.audioBackground);

    this._routerDropdownToggle = this.getShadowElementByClass<OmakaseDropdownToggle>(this.getControlBarClass(AudioThemeControl.ROUTER));

    if (this._timeRange) {
      ChromingUtil.observeElementResize(this._timeRange);
      ChromingUtil.onResize$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe(() => {
        if (this._markerBar && this._timeRange) {
          this._markerBar.containerSize = this._timeRange.rangeWidth;
        }
      });
    }

    if (this._themeConfig.floatingControls?.includes(AudioThemeFloatingControl.HELP_MENU)) {
      this.createHelpMenuDom();
    }

    this.setThemeConfig(this._themeConfig);
  }

  protected addControlBar(): string {
    return `
        <media-control-bar class="upper-control-bar" noautohide>
            <omakase-marker-bars></omakase-marker-bars>
            <omakase-time-range class="${this.getControlBarClass(AudioThemeControl.SCRUBBER)} omakase-time-range">
                <div slot="preview" class="${ChromingDomClasses.mediaChromePreviewWrapper}">
                    <omakase-preview-thumbnail class="${ChromingDomClasses.mediaChromePreviewThumbnail}"></omakase-preview-thumbnail>
                    <omakase-time-display format="${this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard'}" ${this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME ? 'countdown ' : ''} class="${ChromingDomClasses.mediaChromePreviewTimecode}"></omakase-time-display>
                </div>
            </omakase-time-range>
            <slot name="dropdown-container"></slot>
            ${this.createAudioRouterDropdownDom()}
        </media-control-bar>
        <media-control-bar class="lower-control-bar" noautohide>
            <div class="start-container">
                <omakase-mute-button class="${this.getControlBarClass(AudioThemeControl.VOLUME)} ${ChromingDomClasses.mediaChromeButton} omakase-player-mute" volume-flyout="right">
                    <span slot="high" class="${ChromingDomClasses.mediaChromeAudioHigh}"></span>
                    <span slot="medium" class="${ChromingDomClasses.mediaChromeAudioMedium}"></span>
                    <span slot="low" class="${ChromingDomClasses.mediaChromeAudioLow}"></span>
                    <span slot="off" class="${ChromingDomClasses.mediaChromeAudioMute}"></span>
                    <omakase-volume-range slot="volume" class="omakase-volume-range"></omakase-volume-range>
                </omakase-mute-button>
                ${
                  this._themeConfig.playbackRates
                    ? `<omakase-playback-rate-selector class="${this.getControlBarClass(AudioThemeControl.PLAYBACK_RATE)}" dropdown="speed-dropdown-${this._config.playerHtmlElementId}" rates="${this._themeConfig.playbackRates.join(',')}"></omakase-playback-rate-selector>`
                    : ''
                }
                <slot name="start-container"></slot>
            </div>
            <div class="center-container">
                <omakase-play-button class="${this.getControlBarClass(AudioThemeControl.PLAY)} ${ChromingDomClasses.mediaChromeButton} omakase-player-play">
                    <span slot="play" class="${ChromingDomClasses.mediaChromePlay}"></span>
                    <span slot="pause" class="${ChromingDomClasses.mediaChromePause}"></span>
                </omakase-play-button>
            </div>
            <div class="end-container">
                <slot name="end-container"></slot>
                <div class="${this.getControlBarClass(AudioThemeControl.TIME)} ${ChromingDomClasses.timecodeWrapper}">
                  <omakase-time-display ${this._themeConfig.timeInteractive ? 'editable' : ''} format="${this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard'}" ${this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME ? 'countdown ' : ''} class="${ChromingDomClasses.mediaChromeCurrentTimecode}"></omakase-time-display>
                </div>
                <div>
                    <omakase-dropdown-toggle class="${this.getControlBarClass(AudioThemeControl.ROUTER)}" id="audio-router-toggle-${this._config.playerHtmlElementId}" dropdown="audio-router-${this._config.playerHtmlElementId}">
                        <media-chrome-button class="${ChromingDomClasses.mediaChromeButton}">
                            <span class="${ChromingDomClasses.audioRouter} ${ChromingDomClasses.audioRouterDefault}"></span>
                        </media-chrome-button>
                    </omakase-dropdown-toggle>
                    <omakase-text-selector class="${this.getControlBarClass(AudioThemeControl.TRACK_SELECTOR)}" dropdown="audio-dropdown-${this._config.playerHtmlElementId}" alignment="right" off-option>
                        <media-chrome-button slot="toggle" class="${ChromingDomClasses.mediaChromeButton} omakase-player-audio-text">
                            <span class="${ChromingDomClasses.mediaChromeAudio}"></span>
                        </media-chrome-button>
                    </omakase-text-selector>
                </div>
            </div>
        </media-control-bar>`;
  }

  protected createAudioRouterDropdownDom() {
    return `<omakase-dropdown class="${ChromingDomClasses.audioRouterDropdown}" id="audio-router-${this._config.playerHtmlElementId}" style="display:none;right:20px"></omakase-dropdown>`;
  }

  protected createSlotsDom() {
    if (this._config.themeConfig?.htmlTemplateId) {
      return DomUtil.getElementById<HTMLElement>(this._config.themeConfig?.htmlTemplateId)?.innerHTML ?? '';
    } else {
      return '';
    }
  }

  override createMainMediaVideoElement() {
    super.createMainMediaVideoElement();
    this._themeElement.insertAdjacentHTML('beforeend', this.createSlotsDom());
  }

  setMainMediaType(type: MainMediaType): void {
    super.setMainMediaType(type);
    if (type === MainMediaType.AUDIO_FILE) {
      DomUtil.showElements(this._audioBackground);
    } else {
      DomUtil.hideElements(this._audioBackground);
    }
  }

  setThemeConfig(themeConfig: Partial<AudioThemeConfigUpdateableAttrs>) {
    this._themeConfig = {
      ...this._themeConfig,
      controlBarVisibility: themeConfig.controlBarVisibility ?? this._themeConfig.controlBarVisibility,
      controlBar: themeConfig.controlBar ?? this._themeConfig.controlBar,
      timeFormat: themeConfig.timeFormat ?? this._themeConfig.timeFormat,
      timeInteractive: themeConfig.timeInteractive ?? this._themeConfig.timeInteractive,
      playerSize: themeConfig.playerSize ?? this._themeConfig.playerSize,
    };
    if (this._themeConfig.playerSize === AudioPlayerSize.COMPACT) {
      this._mediaControllerElement.classList.add(ChromingDomClasses.mediaControllerCompact);
      this._themeElement.classList.add(ChromingDomClasses.mediaThemeCompact);
      DomUtil.hideElements(this._mainMediaVideoElement);
    } else {
      this._mediaControllerElement.classList.remove(ChromingDomClasses.mediaControllerCompact);
      this._themeElement.classList.remove(ChromingDomClasses.mediaThemeCompact);
      DomUtil.showElements(this._mainMediaVideoElement);
    }
    this.updateControlBar();
    this.updateTimeFormat();
    this.updateTimeInteractivity();
  }

  setThumbnailTrack(track: ThumbnailTrackState | undefined) {
    super.setThumbnailTrack(track);
    if (this._previewThumbnail) {
      this._previewThumbnail.thumbnailTrack = track;
      this._previewThumbnail.thumbnailFn = this._config.findThumbnailFn;
    }
  }

  updateControlBar() {
    for (const control of Object.values(AudioThemeControl)) {
      if (this._themeConfig.controlBar?.includes(control)) {
        DomUtil.showElements(this.getShadowElementByClass(this.getControlBarClass(control)));
      } else {
        DomUtil.hideElements(this.getShadowElementByClass(this.getControlBarClass(control)));
      }
    }
    if (!this._themeConfig.controlBar?.includes(AudioThemeControl.TRACK_SELECTOR) && this._textSelector) {
      this._textSelector.style.display = 'none';
    }
    if (!this._themeConfig.controlBar?.includes(AudioThemeControl.PLAYBACK_RATE) && this._playbackRateSelector) {
      this._playbackRateSelector.style.display = 'none';
    }
  }

  protected override _liveButtonContainer(): HTMLElement | undefined {
    return this.getShadowElement<HTMLElement>('.lower-control-bar .start-container');
  }

  wirePlayer() {
    super.wirePlayer();
    this.checkPlayerInternal();
    let playerInternal = this._playerInternal!;

    if (this._playButton) {
      this._playButton.player = playerInternal;
    }
    if (this._muteButton) {
      this._muteButton.player = playerInternal;
    }
    if (this._currentTimecode) {
      this._currentTimecode.player = playerInternal;
    }
    if (this._previewTimecode && this._timeRange) {
      this._previewTimecode.player = playerInternal;
      this._previewTimecode.timeRange = this._timeRange;
    }
    if (this._audioVisualization) {
      playerInternal.onEvent$
        .pipe(
          filter((e) => e.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED),
          takeUntil(this._destroyBreaker.observer),
          takeUntil(this._playerBreaker.observer)
        )
        .subscribe({
          next: () => {
            this._audioVisualization!.player = playerInternal;
          },
        });
    }
    if (this._timeRange) {
      this._timeRange.player = playerInternal;
      this._timeRange.onSeek$.pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer)).subscribe({
        next: (time) => {
          playerInternal.seekTo(time);
        },
      });
      if (this._previewThumbnail) {
        this._previewThumbnail.timeRange = this._timeRange;
      }
    }
    if (this._playbackRateSelector) {
      this._playbackRateSelector.player = playerInternal;
    }
    if (this._textSelector) {
      this._textSelector.player = playerInternal;
    }
    if (this._themeConfig.controlBar.includes(AudioThemeControl.ROUTER) && this._routerDropdown && this._routerDropdownToggle) {
      playerInternal.onEvent$
        .pipe(
          filter((event) => event.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED || event.type === PlayerEventType.PLAYER_AUDIO_CHANGE),
          takeUntil(this._destroyBreaker.observer),
          takeUntil(this._playerBreaker.observer)
        )
        .subscribe((event) => {
          if (event.type === PlayerEventType.PLAYER_MAIN_MEDIA_LOADED) {
            this.initializeAudioRouter(playerInternal);
          } else if (event.type === PlayerEventType.PLAYER_AUDIO_CHANGE) {
            const routerIcon = this._routerDropdownToggle!.querySelector(`.${ChromingDomClasses.audioRouter}`);
            if (routerIcon) {
              const isRouterChanged = this.isAudioRouterUpdated(this._playerAudio!.getHandler(PlayerAudioType.MAIN)!);
              if (isRouterChanged) {
                routerIcon.classList.remove(ChromingDomClasses.audioRouterDefault);
                routerIcon.classList.add(ChromingDomClasses.audioRouterChanged);
              } else {
                routerIcon.classList.remove(ChromingDomClasses.audioRouterChanged);
                routerIcon.classList.add(ChromingDomClasses.audioRouterDefault);
              }
            }
          }
        });
    }
  }

  setTimeFormat(timeFormat: ChromingTimeFormat) {
    this._themeConfig = {
      ...this._themeConfig,
      timeFormat,
    };
    this.updateTimeFormat();
    this.updateSimpleFullscreenTimeFormat();
  }

  updateTimeFormat() {
    if (this._currentTimecode) {
      this._currentTimecode.displayFormat = this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard';
      this._currentTimecode.isCountdown = this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME;
      this._currentTimecode.updateTime();
    }
    if (this._previewTimecode) {
      this._previewTimecode.displayFormat = this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard';
      this._previewTimecode.isCountdown = this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME;
    }
  }

  updateTimeInteractivity() {
    if (this._currentTimecode) {
      if (this._themeConfig.timeInteractive) {
        this._currentTimecode.setAttribute(OmakaseTimeDisplayAttributes.EDITABLE, '');
      } else {
        this._currentTimecode.removeAttribute(OmakaseTimeDisplayAttributes.EDITABLE);
      }
    }
  }

  private initializeAudioRouter(playerInternal: PlayerApi | PlayerDetachedApi) {
    if (this._routerVisualization) {
      this._routerVisualization.destroy();
      this._routerVisualization.remove();
    }
    this._routerVisualization = document.createElement('omakase-router-visualization') as OmakaseRouterVisualization;
    this._routerDropdown?.appendChild(this._routerVisualization);
    this._routerVisualization.player = playerInternal;
    const activeTrackId = this._playerAudio!.state.tracks[PlayerAudioType.MAIN].find((track) => track.active)?.trackId;
    const mainTrack = this.getAudioTracks(PlayerAudioType.MAIN).find((track) => track.id === activeTrackId);
    if (mainTrack) {
      this._routerVisualization.mainTrack = {
        track: {
          name: mainTrack.label,
          maxInputNumber: mainTrack.channels!,
          inputNumber: mainTrack.channels!,
        },
      };
    }
  }

  resetMainMediaVideoElement(): void {
    super.resetMainMediaVideoElement();
    if (this._playbackRateSelector) {
      this._playbackRateSelector.playbackRate = 1;
    }
    if (this._themeConfig.playerSize === AudioPlayerSize.COMPACT) {
      DomUtil.hideElements(this._mainMediaVideoElement);
    } else {
      DomUtil.showElements(this._mainMediaVideoElement);
    }
    if (this._audioVisualization) {
      this._audioVisualization.showInitialSvg();
    }
    if (this._routerVisualization) {
      this._routerVisualization.destroy();
      this._routerVisualization.remove();
      this._routerVisualization = undefined;
    }
  }

  get theme(): ChromingTheme.AUDIO {
    return ChromingTheme.AUDIO;
  }

  get themeConfig() {
    return this._themeConfig;
  }
}
