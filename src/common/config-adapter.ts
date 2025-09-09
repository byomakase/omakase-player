/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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

import {Subject} from 'rxjs';
import {OmakasePlayerConfig} from '../omakase-player';
import {DefaultChroming, PlayerChroming, PlayerChromingTheme, StampChroming, AudioChroming} from '../player-chroming';

export class ConfigAdapter {
  public readonly onThumbnailUrlChange$: Subject<string | undefined> = new Subject();
  public readonly onWatermarkChange$: Subject<string | undefined> = new Subject();
  public readonly onThemeConfigChange$: Subject<OmakasePlayerConfig> = new Subject();

  private _config!: OmakasePlayerConfig;

  constructor(config: OmakasePlayerConfig) {
    this.config = {
      ...config,
    };
  }

  get config(): OmakasePlayerConfig {
    return this._config;
  }

  set config(value: Partial<OmakasePlayerConfig>) {
    let oldThumbnailUrl = this._config?.playerChroming?.thumbnailUrl;
    let oldWatermark = this._config?.playerChroming?.watermark;
    let oldThemeConfig = JSON.stringify((this._config?.playerChroming as DefaultChroming | AudioChroming | StampChroming)?.themeConfig);
    this._config = {
      ...this._config,
      ...value,
      playerChroming: {
        ...this._config?.playerChroming,
        ...value.playerChroming,
        themeConfig:
          this._config?.playerChroming?.theme === PlayerChromingTheme.Chromeless
            ? undefined
            : {
                ...this._config?.playerChroming?.themeConfig,
                ...(value.playerChroming as DefaultChroming | StampChroming | AudioChroming).themeConfig,
              },
      } as PlayerChroming,
    };
    if (oldThumbnailUrl !== this._config.playerChroming?.thumbnailUrl) {
      this.onThumbnailUrlChange$.next(this._config.playerChroming?.thumbnailUrl);
    }
    if (oldWatermark !== this._config.playerChroming?.watermark) {
      this.onWatermarkChange$.next(this._config.playerChroming?.watermark);
    }
    if (JSON.stringify((this._config?.playerChroming as DefaultChroming | AudioChroming | StampChroming)?.themeConfig) !== oldThemeConfig) {
      this.onThemeConfigChange$.next(this._config);
    }
  }
}
