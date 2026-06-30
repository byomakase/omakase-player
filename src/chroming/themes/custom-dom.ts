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

import {takeUntil} from 'rxjs';
import {DomUtil} from '../../dom/dom-util';
import type {ThumbnailTrackState} from '../../media/thumbnail-track';
import {ChromingTheme, type ChromingThemeConfigTypes, type CustomThemeConfig, type CustomThemeConfigUpdateableAttrs} from '../chroming-api';
import {ChromingDomController, type ChromingDomConfig} from '../chroming-dom';
import type {OmakaseFullscreenButton, OmakaseMarkerBar, OmakaseMuteButton, OmakasePlayButton, OmakasePreviewThumbnail, OmakaseTimeDisplay, OmakaseTimeRange, OmakaseVolumeRange} from '../components';

export class CustomDomController extends ChromingDomController<ChromingTheme.CUSTOM> {
  protected _themeConfig: CustomThemeConfig;

  protected _playButtons: OmakasePlayButton[] | undefined;
  protected _muteButtons?: OmakaseMuteButton[] | undefined;
  protected _fullscreenButtons?: OmakaseFullscreenButton[] | undefined;
  protected _volumeRanges?: OmakaseVolumeRange[] | undefined;
  protected _timeDisplays?: OmakaseTimeDisplay[] | undefined;
  protected _previewThumbnails?: OmakasePreviewThumbnail[] | undefined;

  constructor(config: ChromingDomConfig<ChromingTheme.CUSTOM>) {
    super(config);

    if (!config.themeConfig?.htmlTemplateId) {
      throw new Error('HTML template id must be provided for custom theme');
    }

    this._themeConfig = {
      ...this._config.themeConfig,
      htmlTemplateId: config.themeConfig.htmlTemplateId!,
    };

    this._mediaControllerElement.insertAdjacentHTML('beforeend', this.createCustomDom());

    this._playButtons = this.getShadowElements<OmakasePlayButton>('omakase-play-button');
    this._muteButtons = this.getShadowElements<OmakaseMuteButton>('omakase-mute-button');
    this._fullscreenButtons = this.getShadowElements<OmakaseFullscreenButton>('omakase-fullscreen-button');
    this._volumeRanges = this.getShadowElements<OmakaseVolumeRange>('omakase-volume-range');
    this._timeDisplays = this.getShadowElements<OmakaseTimeDisplay>('omakase-time-display');
    this._previewThumbnails = this.getShadowElements<OmakasePreviewThumbnail>('omakase-preview-thumbnail');
    this._timeRange = this.getShadowElement<OmakaseTimeRange>('omakase-time-range');
    this._markerBar = this.getShadowElement<OmakaseMarkerBar>('omakase-marker-bars');
  }

  protected createCustomDom() {
    if (this._themeConfig.htmlTemplateId) {
      return DomUtil.getElementById<HTMLElement>(this._themeConfig.htmlTemplateId)?.innerHTML ?? '';
    } else {
      return '';
    }
  }

  setThemeConfig(themeConfig: Partial<CustomThemeConfigUpdateableAttrs>): void {
    this._themeConfig = {
      ...this._themeConfig,
      ...themeConfig,
    };
  }

  setThumbnailTrack(track: ThumbnailTrackState | undefined): void {
    if (this._previewThumbnails) {
      for (const previewThumbnail of this._previewThumbnails) {
        previewThumbnail.thumbnailTrack = track;
        previewThumbnail.thumbnailFn = this._config.findThumbnailFn;
      }
    }
  }

  wirePlayer() {
    super.wirePlayer();
    this.checkPlayerInternal();
    let playerInternal = this._playerInternal!;

    if (this._playButtons) {
      this._playButtons.forEach((playButton) => {
        playButton.player = playerInternal;
      });
    }
    if (this._muteButtons) {
      this._muteButtons.forEach((muteButton) => {
        muteButton.player = playerInternal;
      });
    }
    if (this._fullscreenButtons) {
      this._fullscreenButtons.forEach((fullscreenButton) => {
        fullscreenButton.player = playerInternal;
      });
    }
    if (this._volumeRanges) {
      this._volumeRanges.forEach((volumeRange) => {
        volumeRange.player = playerInternal;
      });
    }
    if (this._timeDisplays) {
      this._timeDisplays.forEach((timeDisplay) => {
        timeDisplay.player = playerInternal;
      });
    }
    if (this._timeRange) {
      this._timeRange.player = playerInternal;
      this._timeRange.onSeek$.pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer)).subscribe({
        next: (time) => {
          playerInternal.seekTo(time);
        },
      });
    }
  }

  get theme(): ChromingTheme.CUSTOM {
    return ChromingTheme.CUSTOM;
  }

  get themeConfig() {
    return this._themeConfig;
  }
}
