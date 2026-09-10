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

import Hls, {type HlsConfig} from 'hls.js';
import type {HlsPlayerControllerConfig} from './hls-player-controller';

/**
 * Keeps a live subtitle playlist lined up with main while `config.timelineOffset` is in play, which is
 * what hls.js intends to do and gets wrong. Possible upstream bug, maybe worth reporting so that we can remove this
 * in the future
 */
function createSubtitleStreamController() {
  const base = Hls.DefaultConfig.subtitleStreamController;

  if (!base) {
    return void 0;
  }

  class OmpSubtitleStreamController extends base {}
  const superOnSubtitleTrackLoaded = (base.prototype as any).onSubtitleTrackLoaded;

  (OmpSubtitleStreamController.prototype as any).onSubtitleTrackLoaded = function (this: any, event: any, data: any) {
    const details = data.details;
    const timelineOffset = details?.appliedTimelineOffset ?? 0;
    const alignsByProgramDateTime = !!details?.hasProgramDateTime && !!this.mainDetails?.hasProgramDateTime;

    const result = superOnSubtitleTrackLoaded.call(this, event, data);

    const firstFragment = details?.fragments?.[0];
    const surplus = !!firstFragment && firstFragment.start !== firstFragment.playlistOffset + timelineOffset;

    // modify only on LIVE - VoD HLS untouched
    if (surplus && timelineOffset && details.live && !alignsByProgramDateTime) {
      // add timelineOffset that hls.js does not
      details.fragments.forEach((fragment: any) => fragment.setStart(fragment.start - timelineOffset));
    }

    return result;
  };

  return OmpSubtitleStreamController;
}

const SUBTITLE_STREAM_CONTROLLER = createSubtitleStreamController();

export class HlsJsFactory {
  static createHls(hlsPlayerControllerConfig: HlsPlayerControllerConfig) {
    let hls = new Hls(this.resolveHlsConfig(hlsPlayerControllerConfig.hlsConfig));
    this.overrideMethods(hls, hlsPlayerControllerConfig);
    return hls;
  }

  /**
   * Live subtitle alignment depends on {@link createSubtitleStreamController}, so it is forced over
   * whatever was configured.
   */
  private static resolveHlsConfig(hlsConfig: Partial<HlsConfig>): Partial<HlsConfig> {
    if (!SUBTITLE_STREAM_CONTROLLER) {
      return hlsConfig;
    }

    const configured = hlsConfig.subtitleStreamController;
    const isConfiguredDeliberately = !!configured && configured !== Hls.DefaultConfig.subtitleStreamController && configured !== SUBTITLE_STREAM_CONTROLLER;

    if (isConfiguredDeliberately) {
      console.warn(`hlsConfig.subtitleStreamController is ignored, OmakasePlayer provides its own`);
    }

    return {
      ...hlsConfig,
      subtitleStreamController: SUBTITLE_STREAM_CONTROLLER,
    };
  }

  private static overrideMethods(hls: Hls, hlsPlayerControllerConfig: HlsPlayerControllerConfig) {
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
    }
  }
}
