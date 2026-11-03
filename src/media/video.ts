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

import {BaseTrack, type BaseTrackArgs, type BaseTrackLoadOptions, type TrackEvent, type TrackState, TrackType} from './track';

/**
 * Discriminator for the origin of a video track.
 */
export enum VideoType {
  /** Video rendition extracted from an HLS manifest. */
  HLS_VIDEO = 'HLS_VIDEO',
  /** Video track from an MP4 container. */
  MP4_VIDEO = 'MP4_VIDEO',
}

/**
 * Discriminator for the format of a captured video frame.
 */
export enum VideoKeyframeType {
  /** Video frame captured in .png format. */
  PNG = 'PNG',
  /** Video frame captured in .jpeg format. */
  JPEG = 'JPEG',
}

/**
 * Serializable snapshot of a video {@link Track}.
 */
export interface VideoState extends TrackState {
  videoType: VideoType;
  /** Video duration in seconds. */
  duration: number | undefined;
}

/**
 * Construction arguments for video track instances.
 */
export interface VideoArgs extends BaseTrackArgs {
  /** Duration of the video track in seconds. */
  duration?: number | undefined;
}

/** Load options for video tracks. */
export interface VideoTrackLoadOptions extends BaseTrackLoadOptions {
  args?: VideoArgs;
}

/** Options for capturing a video frame. */
export interface VideoKeyframeOptions {
  /** Image format that a video frame will be captured in. Defaults to JPEG. */
  type?: VideoKeyframeType;
}

/** Captured video frame. */
export interface VideoKeyframe {
  /** Source url of the captured video frame. */
  src: string;
}

export abstract class Video extends BaseTrack<VideoState, TrackEvent> {
  protected _trackType = TrackType.VIDEO;

  protected abstract _videoType: VideoType;

  protected _duration: number | undefined;

  protected constructor(args: VideoArgs) {
    super(args);

    this._duration = args.duration;
  }

  get videoType(): VideoType {
    return this._videoType;
  }

  protected getState(): VideoState {
    return {
      ...super._getState(),
      videoType: this._videoType,
      duration: this._duration,
    };
  }
}