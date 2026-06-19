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

import Hls from 'hls.js';
import type {HlsPlayerControllerConfig} from './hls-player-controller';

export class HlsJsFactory {
  static createHls(hlsPlayerControllerConfig: HlsPlayerControllerConfig) {
    let hls = new Hls(hlsPlayerControllerConfig.hlsConfig);
    this.overrideMethods(hls, hlsPlayerControllerConfig);
    return hls;
  }

  private static overrideMethods(hls: Hls, hlsPlayerControllerConfig: HlsPlayerControllerConfig) {
    // unsafe, working on HLS version 1.5.8
    // see https://github.com/video-dev/hls.js/blob/master/src/controller/subtitle-track-controller.ts
    // @ts-ignore
    let hlsSubtitleTrackController = hls.subtitleTrackController;

    if (hlsSubtitleTrackController) {
      if (hlsSubtitleTrackController.pollTrackChange) {
        hlsSubtitleTrackController.pollTrackChange = (timeout: number) => {
          // overriden to prevent HLS polling & toggling already shown / hidden subtitles
        };
      }

      if (hlsSubtitleTrackController.asyncPollTrackChange) {
        hlsSubtitleTrackController.asyncPollTrackChange = () => {
          // overriden to prevent HLS polling & toggling already shown / hidden subtitles
        };
      }

      // if (!hlsPlayerControllerConfig.subtitleDisplay) {
      //   hlsSubtitleTrackController.toggleTrackModes = () => {
      //     // overriden to prevent HLS reacting to event listeners on tracks
      //   };
      // }
    }
  }
}
