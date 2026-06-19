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
  type OmakaseDropdownListItem,
} from '../chroming-api';
import {ChromingDomClasses, ChromingDomController, type ChromingDomConfig, type ChromingTextTrack} from '../chroming-dom';
import type {
  OmakaseAudioVisualization,
  OmakaseDropdown,
  OmakaseDropdownList,
  OmakaseDropdownToggle,
  OmakaseMarkerBar,
  OmakaseMuteButton,
  OmakasePlayButton,
  OmakasePreviewThumbnail,
  OmakaseTimeDisplay,
  OmakaseTimeRange,
  OmakaseVolumeRange,
} from '../components';
import {PlayerAudioType, PlayerEventType, type PlayerInternalApi, type PlayerTextTrackState} from '../../player';
import {DomUtil} from '../../dom/dom-util';
import type {ThumbnailTrackState} from '../../media/thumbnail-track';
import {PlayerTextType} from '../../player/player-text';
import {MainMediaType, type TextTrackState} from '../../media';
import type {OmakaseRouterVisualization} from '../components/omakase-router-visualization';
import {ChromingUtil} from '../chroming-util';
import {OmakaseDropdownToggleAttributes} from '../components/omakase-dropdown-toggle';

export class AudioDomController extends ChromingDomController<ChromingTheme.AUDIO> {
  protected _themeConfig: AudioThemeConfig;

  protected _playButton?: OmakasePlayButton;
  protected _muteButton?: OmakaseMuteButton;
  protected _timeRange?: OmakaseTimeRange;
  protected _volumeRange?: OmakaseVolumeRange;
  protected _audioVisualization?: OmakaseAudioVisualization;
  protected _routerVisualization?: OmakaseRouterVisualization;
  protected _audioBackground?: HTMLElement;

  protected _speedDropdown?: OmakaseDropdown;
  protected _textDropdown?: OmakaseDropdown;
  protected _routerDropdown?: OmakaseDropdown;

  protected _speedDropdownList?: OmakaseDropdownList;
  protected _textDropdownList?: OmakaseDropdownList;
  protected _textDropdownToggle?: OmakaseDropdownToggle;
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
    this._volumeRange = this.getShadowElement<OmakaseVolumeRange>('omakase-volume-range');
    this._markerBar = this.getShadowElement<OmakaseMarkerBar>('omakase-marker-bars');
    this._previewThumbnail = this.getShadowElement<OmakasePreviewThumbnail>('omakase-preview-thumbnail');
    this._audioVisualization = this.getShadowElement<OmakaseAudioVisualization>('omakase-audio-visualization');

    this._currentTimecode = this.getShadowElementByClass<OmakaseTimeDisplay>(ChromingDomClasses.mediaChromeCurrentTimecode);
    this._previewTimecode = this.getShadowElementByClass<OmakaseTimeDisplay>(ChromingDomClasses.mediaChromePreviewTimecode);
    this._speedDropdown = this.getShadowElementByClass<OmakaseDropdown>(ChromingDomClasses.speedDropdown);
    this._speedDropdownList = this.getShadowElementByClass<OmakaseDropdownList>(ChromingDomClasses.speedDropdownList);
    this._textDropdown = this.getShadowElementByClass<OmakaseDropdown>(ChromingDomClasses.audioTextDropdown);
    this._textDropdownList = this.getShadowElementByClass<OmakaseDropdownList>(ChromingDomClasses.textDropdownList);
    this._routerDropdown = this.getShadowElementByClass<OmakaseDropdown>(ChromingDomClasses.audioRouterDropdown);
    this._audioBackground = this.getShadowElementByClass<HTMLElement>(ChromingDomClasses.audioBackground);

    this._routerDropdownToggle = this.getShadowElementByClass<OmakaseDropdownToggle>(this.getControlBarClass(AudioThemeControl.ROUTER));
    this._textDropdownToggle = this.getShadowElementByClass<OmakaseDropdownToggle>(this.getControlBarClass(AudioThemeControl.TRACK_SELECTOR));

    if (this._textDropdownList) {
      this._textDropdownLists.push(this._textDropdownList);
    }

    if (this._timeRange) {
      ChromingUtil.connectResizeObserver(this._timeRange);
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
            ${
              this._themeConfig.playbackRates
                ? `<omakase-dropdown id="speed-dropdown-${this._config.playerHtmlElementId}" class="omakase-speed-dropdown" alignment="center">
                    <omakase-dropdown-list id="speed-dropdown-list-${this._config.playerHtmlElementId}" class="omakase-speed-dropdown-list" title="SPEED" width="76">
                    ${this._themeConfig.playbackRates
                      .map((rate) => {
                        if (rate === 1) return `<omakase-dropdown-option selected value="${rate}">${rate}x</omakase-dropdown-option>`;
                        else return `<omakase-dropdown-option value="${rate}">${rate}x</omakase-dropdown-option>`;
                      })
                      .join('\n')}
                    </omakase-dropdown-list>
                </omakase-dropdown>`
                : ''
            }
            <slot name="dropdown-container"></slot>
            ${this.createAudioTextDropdownDom()}
            ${this.createAudioRouterDropdownDom()}
        </media-control-bar>
        <media-control-bar class="lower-control-bar" noautohide>
            <div class="start-container">
                <div class="volume-container ${this.getControlBarClass(AudioThemeControl.VOLUME)}">
                    <omakase-mute-button class="${ChromingDomClasses.mediaChromeButton} omakase-player-mute">
                    <span slot="high" class="${ChromingDomClasses.mediaChromeAudioHigh}"></span>
                    <span slot="medium" class="${ChromingDomClasses.mediaChromeAudioMedium}"></span>
                    <span slot="low" class="${ChromingDomClasses.mediaChromeAudioLow}"></span>
                    <span slot="off" class="${ChromingDomClasses.mediaChromeAudioMute}"></span>
                    </omakase-mute-button>
                    <omakase-volume-range class="omakase-volume-range"></omakase-volume-range>
                </div>
                <omakase-dropdown-toggle class="${this.getControlBarClass(AudioThemeControl.PLAYBACK_RATE)}" dropdown="speed-dropdown-${this._config.playerHtmlElementId}"></omakase-dropdown-toggle>
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
                  <omakase-time-display format="${this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard'}" ${this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME ? 'countdown ' : ''} class="${ChromingDomClasses.mediaChromeCurrentTimecode}"></omakase-time-display>
                </div>
                <div>
                    <omakase-dropdown-toggle class="${this.getControlBarClass(AudioThemeControl.ROUTER)}" id="audio-router-toggle-${this._config.playerHtmlElementId}" dropdown="audio-router-${this._config.playerHtmlElementId}">
                        <media-chrome-button class="${ChromingDomClasses.mediaChromeButton}">
                            <span class="${ChromingDomClasses.audioRouter} ${ChromingDomClasses.audioRouterDefault}"></span>
                        </media-chrome-button>
                    </omakase-dropdown-toggle>
                    <omakase-dropdown-toggle class="${this.getControlBarClass(AudioThemeControl.TRACK_SELECTOR)}" id="audio-dropdown-toggle-${this._config.playerHtmlElementId}" dropdown="audio-dropdown-${this._config.playerHtmlElementId}">
                        <media-chrome-button class="${ChromingDomClasses.mediaChromeButton} omakase-player-audio-text">
                            <span class="${ChromingDomClasses.mediaChromeAudio}"></span>
                        </media-chrome-button>
                    </omakase-dropdown-toggle>
                </div>
            </div>
        </media-control-bar>`;
  }

  protected createAudioTextDropdownDom() {
    return `
          <omakase-dropdown class="${ChromingDomClasses.audioTextDropdown}" id="audio-dropdown-${this._config.playerHtmlElementId}" style="display:none;right:20px">
              <omakase-dropdown-list class="omakase-text-dropdown-list align-left" id="text-dropdown-list-${this._config.playerHtmlElementId}" title="TEXT" width="150" max-width="250" type="radio"></omakase-dropdown-list>
          </omakase-dropdown>`;
  }

  protected createAudioRouterDropdownDom() {
    return `<omakase-dropdown class="${ChromingDomClasses.audioRouterDropdown}" id="audio-router-${this._config.playerHtmlElementId}" style="display:none;right:20px"></omakase-dropdown>`;
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
  }

  setThumbnailTrack(track: ThumbnailTrackState | undefined) {
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
    this.setTrackSelectorEnabled(!!this._playerInternal && !!this._textDropdownList && this._textDropdownList.options.length > 1);
    if (!this._themeConfig.controlBar?.includes(AudioThemeControl.TRACK_SELECTOR) && this._textDropdown) {
      this._textDropdown.style.display = 'none';
    }
    if (!this._themeConfig.controlBar?.includes(AudioThemeControl.PLAYBACK_RATE) && this._speedDropdown) {
      this._speedDropdown.style.display = 'none';
    }
  }

  protected setTrackSelectorEnabled(enabled: boolean) {
    if (this._textDropdownToggle) {
      if (enabled) {
        this._textDropdownToggle.removeAttribute(OmakaseDropdownToggleAttributes.DISABLED);
        this._textDropdownToggle.querySelector('media-chrome-button')?.removeAttribute(OmakaseDropdownToggleAttributes.DISABLED);
      } else {
        this._textDropdownToggle.setAttribute(OmakaseDropdownToggleAttributes.DISABLED, '');
        this._textDropdownToggle.querySelector('media-chrome-button')?.setAttribute(OmakaseDropdownToggleAttributes.DISABLED, '');
      }
    }
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
    if (this._volumeRange) {
      this._volumeRange.player = playerInternal;
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
            this._audioVisualization!.wirePlayer(playerInternal);
          },
        });
    }
    if (this._timeRange) {
      this._timeRange.onSeek$.pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer)).subscribe({
        next: (time) => {
          playerInternal.seekTo(time);
        },
      });
      if (this._previewThumbnail) {
        this._previewThumbnail.timeRange = this._timeRange;
      }
    }
    if (this._speedDropdownList) {
      this._speedDropdownList.selectedOption$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
        next: (speedOption) => {
          if (speedOption && parseFloat(speedOption.value) !== playerInternal.playerSession.playback.playbackRate) {
            playerInternal.setPlaybackRate(parseFloat(speedOption.value));
          }
        },
      });
      playerInternal.onEvent$
        .pipe(
          filter((event) => event.type === PlayerEventType.PLAYER_PLAYBACK_RATE_UPDATE),
          takeUntil(this._playerBreaker.observer),
          takeUntil(this._destroyBreaker.observer)
        )
        .subscribe({
          next: (event) => {
            if (event.data.playbackRate.toString() !== this._speedDropdownList?.selectedOption$.getValue()?.value) {
              this._speedDropdownList!.selectedOption$.next({
                value: event.data.playbackRate.toString(),
                label: `${event.data.playbackRate}x`,
              });
            }
          },
        });
    }
    if (this._textDropdown) {
      this.wireTextDropdown(playerInternal);
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
              const isRouterChanged = this.isAudioRouterUpdated(playerInternal.audioInternal.getHandler(PlayerAudioType.MAIN)!);
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

  wireTextDropdown(playerInternal: PlayerInternalApi) {
    if (this._textDropdownList) {
      this._textDropdownList.selectedOption$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe({
        next: (textOption) => {
          if (textOption) {
            if (!textOption.value) {
              playerInternal.textInternal.hide();
            } else if (!textOption.active) {
              if (textOption.value === this.getActiveTextTrack()?.trackId) {
                playerInternal.textInternal.show();
              } else {
                playerInternal.textInternal.switchTrack(textOption.value, true).subscribe();
              }
            }
          }
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
    if (this._previewTimecode) {
      this._previewTimecode.format = this._themeConfig.timeFormat === ChromingTimeFormat.TIMECODE ? 'timecode' : 'standard';
      this._previewTimecode.isCountdown = this._themeConfig.timeFormat === ChromingTimeFormat.COUNTDOWN_MEDIA_TIME;
    }
  }

  setTextTracks(tracks: ChromingTextTrack[]): void {
    super.setTextTracks(tracks);
    this.updateCaptionClasses();
  }

  updateTextTracks(tracks: PlayerTextTrackState[]) {
    for (const dropdownList of this._textDropdownLists) {
      this.updateDropdownOptions(
        dropdownList,
        tracks.map((track) => ({value: track.trackId, active: track.active && track.shown}))
      );
    }
  }

  addTextTrack(track: ChromingTextTrack): void {
    super.addTextTrack(track);
    this.updateCaptionClasses();
  }

  removeTextTrack(trackId: TextTrackState['id']): void {
    super.removeTextTrack(trackId);
    this.updateCaptionClasses();
  }

  protected getTextDropdownOption(track: ChromingTextTrack, defaultLabel: string): OmakaseDropdownListItem {
    return {
      value: track.playerTrack.trackId,
      label: track.textTrack.label ?? defaultLabel,
      active: track.playerTrack.active && track.playerTrack.shown,
    };
  }

  protected setDropdownOptions(dropdownList: OmakaseDropdownList, options: OmakaseDropdownListItem[]) {
    dropdownList.setOptions([{label: 'Off', value: '', active: !options.find((o) => o.active)}, ...options]);
  }

  protected updateDropdownOptions(dropdownList: OmakaseDropdownList, options: Partial<OmakaseDropdownListItem>[]) {
    dropdownList.updateOptions([{value: '', active: !options.find((o) => o.active)}, ...options]);
  }

  private updateCaptionClasses() {
    const textOptions = this._textDropdownList!.options;
    this.setTrackSelectorEnabled(textOptions.length > 1);
    if (textOptions.find((textOption) => textOption.active && textOption.value)) {
      this._mediaControllerElement.classList.add(ChromingDomClasses.mediaControllerWithCaptions);
    } else {
      this._mediaControllerElement.classList.remove(ChromingDomClasses.mediaControllerWithCaptions);
    }
  }

  private getActiveTextTrack(): PlayerTextTrackState | undefined {
    return (
      this._playerInternal?.textInternal.state.tracks[PlayerTextType.MAIN].find((track) => track.active) ??
      this._playerInternal?.textInternal.state.tracks[PlayerTextType.SIDECAR].find((track) => track.active)
    );
  }

  private initializeAudioRouter(playerInternal: PlayerInternalApi) {
    this._routerVisualization = document.createElement('omakase-router-visualization') as OmakaseRouterVisualization;
    this._routerDropdown?.appendChild(this._routerVisualization);
    this._routerVisualization.player = playerInternal;
    const activeTrackId = playerInternal.audioInternal.state.tracks[PlayerAudioType.MAIN].find((track) => track.active)?.trackId;
    const mainTrack = playerInternal.audioInternal.getTracks(PlayerAudioType.MAIN).find((track) => track.id === activeTrackId);
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
    if (this._speedDropdownList) {
      this._speedDropdownList.selectedOption$.next({
        value: 1,
        label: '1x',
      });
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
      this._routerDropdown?.removeChild(this._routerVisualization);
    }
  }

  get theme(): ChromingTheme.AUDIO {
    return ChromingTheme.AUDIO;
  }

  get themeConfig() {
    return this._themeConfig;
  }
}
