/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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

import {Observable} from 'rxjs';
import {Destroyable, OmakaseTextTrack, VideoFullscreenChangeEvent, VideoSafeZoneChangeEvent} from '../types';
import {VideoSafeZone} from './model';
import {VideoControllerApi} from './video-controller-api';

export interface VideoDomControllerApi extends Destroyable {
  attachVideoController(videoController: VideoControllerApi): void;

  onFullscreenChange$: Observable<VideoFullscreenChangeEvent>;

  onVideoSafeZoneChange$: Observable<VideoSafeZoneChangeEvent>;

  getVideoElement(): HTMLVideoElement;

  isFullscreen(): boolean;

  toggleFullscreen(): Observable<void>;

  addSafeZone(videoSafeZone: VideoSafeZone): Observable<VideoSafeZone>;

  removeSafeZone(id: string): Observable<void>;

  clearSafeZones(): Observable<void>;

  getSafeZones(): VideoSafeZone[];

  appendHTMLTrackElement(omakaseTextTrack: OmakaseTextTrack): Observable<HTMLTrackElement | undefined>;

  getTextTrackList(): TextTrackList | undefined;

  getTextTrackById(id: string): TextTrack | undefined;

  removeTextTrackById(id: string): boolean;

  loadThumbnailVtt(thumbnailVttUrl: string): void;
}
