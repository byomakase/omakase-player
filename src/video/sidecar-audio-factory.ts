/*
 * Copyright 2025 ByOmakase, LLC (https://byomakase.org)
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

import {SidecarAudioApi} from '../api/sidecar-audio-api';
import {VideoControllerApi} from './video-controller-api';
import {OmpAudioTrack} from '../types';
import {BrowserProvider} from '../common/browser-provider';
import {OmpSidecarAudio, OmpSidecarBufferedAudio} from './sidecar-audio';

export class SidecarAudioFactory {
  public static createSidecarAudio(videoController: VideoControllerApi, sidecarAudioTrack: OmpAudioTrack): SidecarAudioApi {
    // return new OmpSidecarBufferedAudio(videoController, sidecarAudioTrack);
    if (BrowserProvider.instance().isSafari) {
      return new OmpSidecarBufferedAudio(videoController, sidecarAudioTrack);
    } else {
      return new OmpSidecarAudio(videoController, sidecarAudioTrack);
    }
  }
}
