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

import {
  BaseTrack,
  type BaseTrackArgs,
  type BaseTrackLoadOptions,
  type TrackEvent,
  TrackEventType,
  type TrackState,
  TrackType,
  type TrackUpdateableAttrs
} from './track';
import {UrlSource} from '../source';
import {objectHasOwnProperty} from '../util/util-functions';

/**
 * Discriminator for the origin of an audio track.
 */
export enum AudioType {
  /** Standalone audio file loaded as a sidecar. */
  AUDIO_FILE = 'AUDIO_FILE',
  /** Audio rendition extracted from an HLS manifest. */
  HLS_AUDIO = 'HLS_AUDIO',
  /** Audio track from an MP4 container. */
  MP4_AUDIO = 'MP4_AUDIO',
}

/**
 * Serializable snapshot of an audio {@link Track}.
 */
export interface AudioState extends TrackState {
  audioType: AudioType;
  url: string | undefined;
  duration: number | undefined;
  audioCodec: string | undefined;
  channels: number | undefined;
}

/**
 * Construction arguments for audio track instances.
 */
export interface AudioArgs extends BaseTrackArgs {
  /** URL of the audio source. Overridden by `source` when a {@link UrlSource} is provided. */
  url?: string | undefined;
  /** Duration of the audio track in seconds. */
  duration?: number | undefined;
  /** Audio codec identifier (e.g. `"mp4a.40.2"`). */
  audioCodec?: string | undefined;
  /** Number of audio channels. */
  channels?: number | undefined;
}

/** Load options for audio tracks. */
export interface AudioTrackLoadOptions extends BaseTrackLoadOptions {
  args?: AudioArgs;
}

/**
 * Subset of {@link AudioState} fields that can be updated at runtime.
 */
export type AudioUpdateableAttrs = TrackUpdateableAttrs & Pick<AudioState, 'channels'>;

export abstract class Audio extends BaseTrack<AudioState, TrackEvent> {
  protected _trackType = TrackType.AUDIO;

  protected abstract _audioType: AudioType;

  protected _url: string | undefined;
  protected _duration: number | undefined;
  protected _audioCodec: string | undefined;
  protected _channels: number | undefined;

  protected constructor(args: AudioArgs) {
    super(args);

    if (args.source instanceof UrlSource) {
      this._url = args.source.url;
    } else {
      this._url = args.url;
    }

    this._duration = args.duration;
    this._audioCodec = args.audioCodec;
    this._channels = args.channels;
  }

  protected getState(): AudioState {
    return {
      ...this._getState(),
      audioType: this._audioType,
      url: this._url,
      duration: this._duration,
      audioCodec: this.audioCodec,
      channels: this.channels,
    };
  }

  get url(): string | undefined {
    return this._url;
  }

  get audioType(): AudioType {
    return this._audioType;
  }

  get audioCodec(): string | undefined {
    return this._audioCodec;
  }

  get channels(): number | undefined {
    return this._channels;
  }

  get duration(): number | undefined {
    return this._duration;
  }

  updateAttrs(attrs: AudioUpdateableAttrs) {
    this._onEvent$.next({
      type: TrackEventType.TRACK_UPDATING,
      data: {},
    });

    this._updateAttrs(attrs, false);

    if (objectHasOwnProperty(attrs, 'channels')) {
      this._channels = attrs.channels;
    }

    this._onEvent$.next({
      type: TrackEventType.TRACK_UPDATED,
      data: {
        trackState: this.state,
      },
    });
  }
}

export class AudioFile extends Audio {
  protected _audioType: AudioType = AudioType.AUDIO_FILE;

  constructor(args: AudioArgs) {
    super(args);
  }
}
