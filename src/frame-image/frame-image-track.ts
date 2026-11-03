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

import {MediaContainerTrack, type MediaContainerTrackArgs, type MediaContainerTrackState, TrackType} from '../media';

/** Frame image held by frame image track itself, image url is absolute. */
export interface FrameImageTrackItem {
  start: number;
  end: number;
  url: string;
}

export interface FrameImageTrackState extends MediaContainerTrackState {
  /** Frame images held by track, loaded instead of manifest at url. */
  frameImages: FrameImageTrackItem[] | undefined;
}

export interface FrameImageTrackArgs extends MediaContainerTrackArgs {
  /**
   * Frame images, ie. derived from thumbnail track created in code, track is loaded from them instead of manifest at url.
   * Duration defaults to end of last frame image.
   */
  frameImages?: FrameImageTrackItem[] | undefined;
}

/**
 * Frame image manifest (VTT file listing frame images) loaded as sidecar container track, see {@link FrameImageManifest}.
 * Instead of manifest, track can hold frame images itself, see {@link FrameImageTrackArgs.frameImages}.
 */
export class FrameImageTrack extends MediaContainerTrack {
  protected _trackType = TrackType.FRAME_IMAGE_TRACK;
  protected readonly _frameImages: FrameImageTrackItem[] | undefined;

  constructor(args: FrameImageTrackArgs) {
    let frameImages = args.frameImages?.map((p) => ({start: p.start, end: p.end, url: p.url})).sort((a, b) => a.start - b.start);
    super({
      ...args,
      duration: args.duration ?? frameImages?.at(-1)?.end,
    });
    this._frameImages = frameImages;
  }

  protected override getState(): FrameImageTrackState {
    return {
      ...super.getState(),
      frameImages: this._frameImages,
    };
  }

  get frameImages(): FrameImageTrackItem[] | undefined {
    return this._frameImages;
  }
}
