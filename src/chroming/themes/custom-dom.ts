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
import type {PlayerApi, PlayerDetachedApi} from '../../player';
import {ChromingTheme, type ChromingThemeConfigTypes, type CustomThemeConfig, type CustomThemeConfigUpdateableAttrs} from '../chroming-api';
import {ChromingDomController, type ChromingDomConfig} from '../chroming-dom';
import type {OmakaseMarkerBar, OmakasePreviewThumbnail, OmakaseTimeRange} from '../components';

interface PlayerAwareElement extends HTMLElement {
  player?: PlayerApi | PlayerDetachedApi;
}

export class CustomDomController extends ChromingDomController<ChromingTheme.CUSTOM> {
  protected _themeConfig: CustomThemeConfig;

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
    super.setThumbnailTrack(track);
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

    this.wireAllElements(playerInternal);

    if (this._timeRange) {
      this._timeRange.onSeek$.pipe(takeUntil(this._playerBreaker.observer), takeUntil(this._destroyBreaker.observer)).subscribe({
        next: (time) => {
          playerInternal.seekTo(time);
        },
      });
    }
  }

  /**
   * Sets `player` on every recognized chroming component found in the custom template
   */
  private wireAllElements(playerInternal: PlayerApi | PlayerDetachedApi) {
    const elements = this._mediaControllerElement.querySelectorAll<PlayerAwareElement>('*');
    elements.forEach((element) => {
      if ('player' in element) {
        element.player = playerInternal;
      }
    });
  }

  get theme(): ChromingTheme.CUSTOM {
    return ChromingTheme.CUSTOM;
  }

  get themeConfig() {
    return this._themeConfig;
  }
}
