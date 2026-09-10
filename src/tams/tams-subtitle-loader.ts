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

import Hls, {type FragmentLoaderContext, type HlsConfig, type LoaderCallbacks, type LoaderConfiguration, type LoaderContext, type LoaderResponse, type LoaderStats} from 'hls.js';
import {TAMS_SUBTITLE} from './constants';

export class TamsSubtitleShiftRegistry {
  private static readonly shifts = new Map<string, number>();

  static restore(shifts: Record<string, number>): void {
    this.shifts.clear();
    Object.entries(shifts).forEach(([playlistUrl, shift]) => this.shifts.set(playlistUrl, shift));
  }

  static get(playlistUrl: string | undefined): number | undefined {
    return playlistUrl ? this.shifts.get(playlistUrl) : void 0;
  }

  static clear(): void {
    this.shifts.clear();
  }
}

/**
 * Fragment loader that moves a TAMS subtitle segment's `X-TIMESTAMP-MAP` onto the media timeline.
 *
 * `LOCAL` is the cue time the map anchors at, so moving it moves every cue in the file by the same
 * amount. The cue times themselves stay as the store wrote them, and hls.js drops whatever ends up
 * before `0`.
 *
 * Fragments other than subtitles, and playlists with no shift registered, pass straight through.
 */
export function createTamsSubtitleLoader(baseLoader?: NonNullable<HlsConfig['fLoader']> | undefined): NonNullable<HlsConfig['fLoader']> {
  const BaseLoader = baseLoader ?? Hls.DefaultConfig.loader;

  return class TamsSubtitleLoader extends BaseLoader {
    override load(context: LoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>): void {
      const fragment = (context as FragmentLoaderContext).frag;
      const shift = fragment?.type === 'subtitle' ? TamsSubtitleShiftRegistry.get(fragment.baseurl) : void 0;

      if (!shift) {
        super.load(context, config, callbacks);
        return;
      }

      const shiftingCallbacks: LoaderCallbacks<LoaderContext> = {
        ...callbacks,
        onSuccess: (response: LoaderResponse, stats: LoaderStats, loaderContext: LoaderContext, networkDetails: any) => {
          callbacks.onSuccess(shiftSubtitleResponse(response, shift), stats, loaderContext, networkDetails);
        },
      };

      super.load(context, config, shiftingCallbacks);
    }
  } as unknown as NonNullable<HlsConfig['fLoader']>;
}

function shiftSubtitleResponse(response: LoaderResponse, shift: number): LoaderResponse {
  if (!(response.data instanceof ArrayBuffer)) {
    return response;
  }

  const text = new TextDecoder('utf-8').decode(response.data);
  const shifted = shiftTimestampMap(text, shift);

  return shifted === text ? response : {...response, data: new TextEncoder().encode(shifted).buffer as ArrayBuffer};
}

function shiftTimestampMap(text: string, shift: number): string {
  const map = text.match(TAMS_SUBTITLE.timestampMapPattern)?.[0];

  if (!map) {
    return insertTimestampMap(text, `X-TIMESTAMP-MAP=LOCAL:${formatVttTimestamp(Math.max(0, -shift))},MPEGTS:0`);
  }

  const local = map.match(TAMS_SUBTITLE.timestampMapLocalPattern);
  if (!local) {
    return text;
  }

  const localSeconds = Number(local[1]) * 3600 + Number(local[2]) * 60 + Number(local[3]!.replace(',', '.'));
  const shiftedMap = map.replace(TAMS_SUBTITLE.timestampMapLocalPattern, `LOCAL:${formatVttTimestamp(Math.max(0, localSeconds - shift))}`);

  return text.replace(TAMS_SUBTITLE.timestampMapPattern, shiftedMap);
}

function insertTimestampMap(text: string, map: string): string {
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.startsWith('WEBVTT'));

  if (headerIndex < 0) {
    return `WEBVTT\n${map}\n\n${text}`;
  }

  lines.splice(headerIndex + 1, 0, map);
  return lines.join('\n');
}

function formatVttTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;

  return `${`${hours}`.padStart(2, '0')}:${`${minutes}`.padStart(2, '0')}:${remainder.toFixed(3).padStart(6, '0')}`;
}
