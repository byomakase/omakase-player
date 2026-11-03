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

import {BaseTrack, type BaseTrackArgs, type BaseTrackLoadOptions, type TrackEvent, TrackEventType, type TrackState, TrackType, type TrackUpdateableAttrs} from './track';
import {UrlSource} from '../source';
import {isNullOrUndefined, objectHasOwnProperty} from '../util/util-functions';

/** Track types of {@link MediaContainerTrack}s, media containers played as sidecar video. */
export const MEDIA_CONTAINER_TRACK_TYPES: readonly TrackType[] = [TrackType.MP4_TRACK, TrackType.HLS_TRACK, TrackType.FRAME_IMAGE_TRACK, TrackType.TRICK_TRACK];

/** Whether track type is a {@link MediaContainerTrack} type, see {@link MEDIA_CONTAINER_TRACK_TYPES}. */
export function isMediaContainerTrackType(trackType: TrackType): boolean {
  return MEDIA_CONTAINER_TRACK_TYPES.includes(trackType);
}

/** Temporarily disabled sidecar video track types, remove from list to enable again. */
export const DISABLED_SIDECAR_VIDEO_TRACK_TYPES: readonly TrackType[] = [TrackType.MP4_TRACK, TrackType.HLS_TRACK];

/** Throws if track type is in {@link DISABLED_SIDECAR_VIDEO_TRACK_TYPES}. */
export function checkSidecarVideoTrackTypeEnabled(trackType: TrackType) {
  if (DISABLED_SIDECAR_VIDEO_TRACK_TYPES.includes(trackType)) {
    throw new Error(`Sidecar video track type ${trackType} not supported yet`);
  }
}

/**
 * Time window of a container track played as sidecar.
 *
 * Sidecar is played from {@link cutStartTime} to {@link cutEndTime}, starting when main media reaches {@link playerStartTime}.
 * For example, with `cutStartTime: 3, cutEndTime: 10, playerStartTime: 20` main media time 21 maps to sidecar time 4.
 */
export interface MediaContainerTrackTimeWindow {
  /** First sidecar timestamp to be played, in seconds. */
  cutStartTime: number;
  /** Sidecar timestamp where playback ends, in seconds. When not set, sidecar duration is used. */
  cutEndTime: number | undefined;
  /** Main media timestamp when sidecar starts playing, in seconds. When not set, sidecar starts playing at main media start (0). */
  playerStartTime?: number | undefined;
}

/**
 * Serializable snapshot of a container {@link Track} (HLS stream or MP4 file loaded as sidecar).
 */
export interface MediaContainerTrackState extends TrackState, MediaContainerTrackTimeWindow {
  /** Main media timestamp when sidecar starts playing, in seconds. Resolved to 0 when not set. */
  playerStartTime: number;
  url: string | undefined;
  /** Container duration in seconds. */
  duration: number | undefined;
}

/**
 * Construction arguments for container track instances.
 */
export interface MediaContainerTrackArgs extends BaseTrackArgs, Partial<MediaContainerTrackTimeWindow> {
  /** URL of the container source. Overridden by `source` when a {@link UrlSource} is provided. */
  url?: string | undefined;
  /** Duration of the container in seconds. */
  duration?: number | undefined;
}

/** Load options for container tracks. */
export interface MediaContainerTrackLoadOptions extends BaseTrackLoadOptions {
  args?: MediaContainerTrackArgs;
}

/**
 * Subset of {@link MediaContainerTrackState} fields that can be updated at runtime.
 */
export type MediaContainerTrackUpdateableAttrs = TrackUpdateableAttrs &
  Partial<Pick<MediaContainerTrackState, 'duration' | 'cutStartTime' | 'cutEndTime'>> &
  Pick<MediaContainerTrackTimeWindow, 'playerStartTime'>;

export abstract class MediaContainerTrack extends BaseTrack<MediaContainerTrackState, TrackEvent> {
  protected _url: string | undefined;
  protected _duration: number | undefined;

  protected _cutStartTime: number;
  protected _cutEndTime: number | undefined;
  protected _playerStartTime: number;

  protected constructor(args: MediaContainerTrackArgs) {
    super(args);

    if (args.source instanceof UrlSource) {
      this._url = args.source.url;
    } else {
      this._url = args.url;
    }

    this._duration = args.duration;

    this._cutStartTime = isNullOrUndefined(args.cutStartTime) ? 0 : args.cutStartTime!;
    this._cutEndTime = args.cutEndTime;
    this._playerStartTime = isNullOrUndefined(args.playerStartTime) ? 0 : args.playerStartTime!;

    MediaContainerTrack.validateTimeWindow(this.timeWindow);
  }

  static validateTimeWindow(timeWindow: MediaContainerTrackTimeWindow) {
    if (timeWindow.cutStartTime < 0) {
      throw new Error(`cutStartTime must be >= 0, cutStartTime=${timeWindow.cutStartTime}`);
    }
    if (!isNullOrUndefined(timeWindow.playerStartTime) && timeWindow.playerStartTime! < 0) {
      throw new Error(`playerStartTime must be >= 0, playerStartTime=${timeWindow.playerStartTime}`);
    }
    if (!isNullOrUndefined(timeWindow.cutEndTime) && timeWindow.cutEndTime! <= timeWindow.cutStartTime) {
      throw new Error(`cutEndTime must be > cutStartTime, cutStartTime=${timeWindow.cutStartTime}, cutEndTime=${timeWindow.cutEndTime}`);
    }
  }

  protected getState(): MediaContainerTrackState {
    return {
      ...this._getState(),
      url: this._url,
      duration: this._duration,
      ...this.timeWindow,
    };
  }

  get url(): string | undefined {
    return this._url;
  }

  get duration(): number | undefined {
    return this._duration;
  }

  /** Time window with {@link MediaContainerTrackTimeWindow.playerStartTime} resolved. */
  get timeWindow(): Pick<MediaContainerTrackState, 'cutStartTime' | 'cutEndTime' | 'playerStartTime'> {
    return {
      cutStartTime: this._cutStartTime,
      cutEndTime: this._cutEndTime,
      playerStartTime: this._playerStartTime,
    };
  }

  updateAttrs(attrs: MediaContainerTrackUpdateableAttrs) {
    let timeWindow: Pick<MediaContainerTrackState, 'cutStartTime' | 'cutEndTime' | 'playerStartTime'> = {
      cutStartTime: objectHasOwnProperty(attrs, 'cutStartTime') ? attrs.cutStartTime! : this._cutStartTime,
      cutEndTime: objectHasOwnProperty(attrs, 'cutEndTime') ? attrs.cutEndTime : this._cutEndTime,
      playerStartTime: objectHasOwnProperty(attrs, 'playerStartTime') ? (isNullOrUndefined(attrs.playerStartTime) ? 0 : attrs.playerStartTime!) : this._playerStartTime,
    };
    MediaContainerTrack.validateTimeWindow(timeWindow);

    this._onEvent$.next({
      type: TrackEventType.TRACK_UPDATING,
      data: {
        trackState: this.state,
      },
    });

    this._updateAttrs(attrs, false);

    if (objectHasOwnProperty(attrs, 'duration')) {
      this._duration = attrs.duration;
    }

    this._cutStartTime = timeWindow.cutStartTime;
    this._cutEndTime = timeWindow.cutEndTime;
    this._playerStartTime = timeWindow.playerStartTime;

    this._onEvent$.next({
      type: TrackEventType.TRACK_UPDATED,
      data: {
        trackState: this.state,
      },
    });
  }
}
