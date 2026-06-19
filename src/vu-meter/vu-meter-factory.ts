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

import {TrackType, type ObservationTrack, type Track} from '../media';
import {PlayerAudioType} from '../player';
import type {AudioLevelSourceApi} from './audio-level-source';
import {ObservationTrackAudioLevelSource} from './observation-track-audio-level-source';
import {PeakProcessorAudioLevelSource} from './peak-processor-audio-level-source';
import type {VuMeterArgs} from './vu-meter';

export class VuMeterFactory {
  static createAudioLevelSource(args: VuMeterArgs): AudioLevelSourceApi {
    const {player, source, audioType} = args;
    if (source) {
      return source;
    } else if (player && (audioType === PlayerAudioType.MAIN || audioType === PlayerAudioType.OUTPUT)) {
      return new PeakProcessorAudioLevelSource(player, audioType);
    } else if (player && Array.isArray(args.tracks)) {
      const tracks = (args.tracks as Array<Track['id'] | Track>).map((t) => (typeof t === 'string' ? player.track.get(t) : t)).filter((t) => !!t);
      if (tracks.find((t) => t.trackType !== TrackType.OBSERVATION_TRACK)) {
        throw new Error('Unsupported track type for audio level source');
      }
      return new ObservationTrackAudioLevelSource(player, tracks as ObservationTrack[]);
    } else if (player && args.tracks) {
      const track: Track | undefined = typeof args.tracks === 'string' ? player.track.get(args.tracks) : (args.tracks as Track);
      if (track?.trackType === TrackType.AUDIO) {
        return new PeakProcessorAudioLevelSource(player, PlayerAudioType.SIDECAR, track.id);
      } else if (track?.trackType === TrackType.OBSERVATION_TRACK) {
        return new ObservationTrackAudioLevelSource(player, track as ObservationTrack);
      } else {
        throw new Error('Unsupported track type for audio level source');
      }
    } else {
      throw new Error('Unable to create audio level source with provided arguments');
    }
  }
}
