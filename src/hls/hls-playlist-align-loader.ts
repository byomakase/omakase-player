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

import Hls, {type HlsConfig, type LoaderCallbacks, type LoaderConfiguration, type LoaderContext, type LoaderResponse, type LoaderStats, type PlaylistLoaderContext} from 'hls.js';

/** How long a rendition playlist waits for the level playlist before giving up and loading anyway. */
const ALIGN_HOLD_TIMEOUT_MS = 2000;

interface HeldPlaylistLoad {
  start: () => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Playlist loader that hands the media playlist to `onLevelPlaylist` before hls.js processes it, and
 * holds the other renditions until it has.
 *
 * The timing is the point: hls.js reads `config.timelineOffset` while processing a playlist, so this
 * is the last moment a resuming instance can align its timeline to the one it is taking over from.
 * Only the level playlist can answer - the audio rendition carries its own sequence numbering - yet
 * hls.js asks for audio first, so without the hold audio would be parsed against the pre-align offset
 * and land on a different timeline than video until its next reload, one target duration later.
 */
export function createHlsPlaylistAlignLoader(onLevelPlaylist: (playlistText: string) => void): NonNullable<HlsConfig['pLoader']> {
  const DefaultLoader = Hls.DefaultConfig.loader;

  let aligned = false;
  const held = new Set<HeldPlaylistLoad>();

  const releaseHeld = () => {
    aligned = true;
    for (const load of held) {
      clearTimeout(load.timer);
      load.start();
    }
    held.clear();
  };

  return class HlsPlaylistAlignLoader extends DefaultLoader {
    private _held: HeldPlaylistLoad | undefined;

    override load(context: LoaderContext, config: LoaderConfiguration, callbacks: LoaderCallbacks<LoaderContext>): void {
      const playlistContext = context as PlaylistLoaderContext;
      const isLevel = playlistContext.type === 'level';

      const alignedCallbacks: LoaderCallbacks<LoaderContext> = {
        ...callbacks,
        onSuccess: (response: LoaderResponse, stats: LoaderStats, loaderContext: LoaderContext, networkDetails: any) => {
          const text = typeof response.data === 'string' ? response.data : '';

          if (isLevel) {
            if (text) {
              onLevelPlaylist(text);
            }
            releaseHeld();
          }

          callbacks.onSuccess(response, stats, loaderContext, networkDetails);
        },
        // a level playlist that never arrives must not strand the renditions waiting on it
        onError: (error, loaderContext, networkDetails, stats) => {
          if (isLevel) {
            releaseHeld();
          }
          callbacks.onError(error, loaderContext, networkDetails, stats);
        },
        onTimeout: (stats, loaderContext, networkDetails) => {
          if (isLevel) {
            releaseHeld();
          }
          callbacks.onTimeout(stats, loaderContext, networkDetails);
        },
      };

      const startLoad = () => {
        this._held = void 0;
        super.load(context, config, alignedCallbacks);
      };

      // the master manifest names the level playlist, so it can never wait on it
      if (aligned || isLevel || playlistContext.type === 'manifest') {
        startLoad();
        return;
      }

      const load: HeldPlaylistLoad = {
        start: startLoad,
        timer: setTimeout(() => {
          held.delete(load);
          startLoad();
        }, ALIGN_HOLD_TIMEOUT_MS),
      };

      this._held = load;
      held.add(load);
    }

    override abort(): void {
      this._dropHeld();
      super.abort();
    }

    override destroy(): void {
      this._dropHeld();
      super.destroy();
    }

    private _dropHeld(): void {
      if (this._held) {
        clearTimeout(this._held.timer);
        held.delete(this._held);
        this._held = void 0;
      }
    }
  } as unknown as NonNullable<HlsConfig['pLoader']>;
}

/**
 * `EXT-X-MEDIA-SEQUENCE` of a media playlist, ie. the sequence number of its first segment.
 *
 * An absent tag means 0 (RFC 8216 4.3.3.2), which for a sliding window means nothing has been
 * evicted yet - the same answer as a playlist that never renumbers, so it needs no special case.
 */
export function resolvePlaylistMediaSequence(playlistText: string): number {
  const mediaSequence = Number(playlistText.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/)?.[1]);
  return Number.isFinite(mediaSequence) ? mediaSequence : 0;
}
