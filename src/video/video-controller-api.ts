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
import {VideoApi} from '../api';
import {Destroyable, OmakaseTextTrack, OmakaseTextTrackCue} from '../types';
import {BufferedTimespan} from './video-controller';
import {SubtitlesVttTrack} from '../track';
import {PlaybackState, Video, VideoLoadOptions} from './model';

export interface VideoControllerApi extends VideoApi, Destroyable {

  onHelpMenuChange$: Observable<void>;

  onPlaybackState$: Observable<PlaybackState>;

  loadVideo(sourceUrl: string, frameRate: number | string, options?: VideoLoadOptions): Observable<Video>;

  getPlaybackState(): PlaybackState | undefined;

  getBufferedTimespans(): BufferedTimespan[];

  // subtitles VTT tracks
  getSubtitlesVttTracks(): SubtitlesVttTrack[] | undefined

  // DOM specific
  appendHTMLTrackElement(omakaseTextTrack: OmakaseTextTrack<OmakaseTextTrackCue>): Observable<HTMLTrackElement | undefined>;

  getTextTrackList(): TextTrackList | undefined;

  getTextTrackById(id: string): TextTrack | undefined;

  removeTextTrackById(id: string): boolean;

}
