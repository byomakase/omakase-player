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

import {Audio, type AudioArgs, type AudioState, AudioType, type TrackUpdateableAttrs, Video, type VideoArgs, type VideoState, VideoType} from '../media';

export interface Mp4VideoState extends VideoState {}

export class Mp4Video extends Video {
  protected _videoType: VideoType = VideoType.MP4_VIDEO;

  constructor(args: VideoArgs) {
    super(args);
  }

  updateAttrs(attrs: TrackUpdateableAttrs) {
    super.updateAttrs(attrs);
  }
}

export interface Mp4AudioState extends AudioState {}

export interface Mp4AudioArgs extends AudioArgs {}

export class Mp4Audio extends Audio {
  protected _audioType: AudioType = AudioType.MP4_AUDIO;

  constructor(args: Mp4AudioArgs) {
    super(args);
  }
}
