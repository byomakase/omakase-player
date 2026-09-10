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

import {BaseMainMedia, type BaseMainMediaArgs, type MainMediaState, type MainMediaUpdateableAttrs, MainMediaType} from '../media';
import {ObserverBreaker} from '../common/observer-breaker';
import {objectHasOwnProperty} from '../util/util-functions';
import type {TamsMediaData} from './hls-bridge/model/tams-media-data-model';
import type {TamsPlaybackMode} from './tams-playback';

/**
 * TAMS specific metadata resolved while loading, describing what the synthetic HLS manifest was
 * built from and how the media timeline relates to the TAMS flow timeline.
 *
 * Serializable, so it travels with {@link TamsMainMediaState} through events, the session store and
 * a detached player.
 */
export interface TamsMediaMetadata {
  /**
   * What the media currently spans, in TAMS timerange notation, read from the segments backing it.
   *
   * Always present, whether or not a range was asked for, and kept current: a start-over window grows
   * at its end as segments are polled, and a continuous one grows at the end while losing its start
   * to eviction. Taken from the flow the stream is played from, so the renditions aligned to it
   * cannot widen it.
   */
  timerange: string;

  /**
   * Timerange that was asked for, in TAMS timerange notation, frozen as the load left it.
   *
   * Set for VOD and start-over playback, where a request names a span of the flow. Continuous live
   * playback is asked for as a duration and slides as it plays, so there is no such request to
   * report. What was actually loaded lives on `TamsMainMedia.tamsMediaData`, and moves with the flow.
   */
  requestedTimeRange?: string | undefined;

  /**
   * Absolute flow time, in seconds, that media time `0` maps to. Media time plus this value is TAMS
   * flow time.
   */
  mediaStartTime: number;

  /**
   * Where the requested timerange sits in the media that was loaded, in seconds of media time.
   *
   * The store resolves a request against what it actually holds, so the two rarely line up exactly.
   * These place the request on the loaded timeline - a client highlights it as
   * `[requestedTimeRangeStartTime, requestedTimeRangeEndTime]` - and go negative when the media
   * begins after the request did, ie. when the store had nothing that early.
   *
   * Absent when nothing was requested, or when the requested bound was open.
   */
  requestedTimeRangeStartTime?: number | undefined;
  requestedTimeRangeEndTime?: number | undefined;

  /** Resolved playback mode, and the sliding window length when there is one. */
  playbackMode: TamsPlaybackMode;
  windowDuration?: number | undefined;
}

export interface TamsMainMediaState extends MainMediaState {
  /** TAMS metadata, populated once the media has loaded. */
  tamsMetadata?: TamsMediaMetadata | undefined;
}

export interface TamsMainMediaArgs extends BaseMainMediaArgs {
  tamsMetadata?: TamsMediaMetadata | undefined;
}

/** {@link MainMediaUpdateableAttrs} widened with the TAMS specific attributes resolved on load. */
export interface TamsMainMediaUpdateableAttrs extends MainMediaUpdateableAttrs {
  tamsMetadata?: TamsMediaMetadata | undefined;
  tamsMediaData?: TamsMediaData | undefined;
}

export class TamsMainMedia extends BaseMainMedia<TamsMainMediaState> {
  protected _mainMediaType: MainMediaType = MainMediaType.TAMS;

  protected readonly _destroyBreaker = new ObserverBreaker();

  protected _tamsMetadata?: TamsMediaMetadata | undefined;
  protected _tamsMediaData?: TamsMediaData | undefined;

  constructor(args: TamsMainMediaArgs) {
    super(args);

    this._tamsMetadata = args.tamsMetadata;
  }

  get tamsMetadata(): TamsMediaMetadata | undefined {
    return this._tamsMetadata;
  }

  get tamsMediaData(): TamsMediaData | undefined {
    return this._tamsMediaData;
  }

  override updateAttrs(attrs: TamsMainMediaUpdateableAttrs) {
    if (objectHasOwnProperty(attrs, 'tamsMetadata')) {
      this._tamsMetadata = attrs.tamsMetadata;
    }

    if (objectHasOwnProperty(attrs, 'tamsMediaData')) {
      this._tamsMediaData = attrs.tamsMediaData;
    }

    super.updateAttrs(attrs);
  }

  protected getState(): TamsMainMediaState {
    return {
      ...super._getState(),
      tamsMetadata: this._tamsMetadata,
    };
  }
}
