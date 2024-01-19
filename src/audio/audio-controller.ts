/**
 *       Copyright 2023 ByOmakase, LLC (https://byomakase.org)
 *
 *       Licensed under the Apache License, Version 2.0 (the "License");
 *       you may not use this file except in compliance with the License.
 *       You may obtain a copy of the License at
 *
 *           http://www.apache.org/licenses/LICENSE-2.0
 *
 *       Unless required by applicable law or agreed to in writing, software
 *       distributed under the License is distributed on an "AS IS" BASIS,
 *       WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *       See the License for the specific language governing permissions and
 *       limitations under the License.
 *
 */

import {AudioApi} from '../api/audio-api';
import {Subject} from 'rxjs';
import {AudioEvent, Destroyable} from '../types';
import {VideoControllerApi} from '../video/video-controller-api';

export class AudioController implements AudioApi, Destroyable {
  protected videoController: VideoControllerApi;

  public readonly onAudioSwitched$: Subject<AudioEvent> = new Subject<AudioEvent>();

  constructor(videoController: VideoControllerApi) {
    this.videoController = videoController;
  }

  getAudioTracks(): any[] {
    return this.videoController.getAudioTracks();
  }

  getCurrentAudioTrack(): any {
    return this.videoController.getCurrentAudioTrack();
  }

  setAudioTrack(audioTrackId: number) {
    let previous = this.getCurrentAudioTrack();
    this.videoController.setAudioTrack(audioTrackId);
    let current = this.getCurrentAudioTrack();
    if (previous !== current) {
      this.onAudioSwitched$.next({
        audioTrack: current
      });
    }
  }

  destroy() {
  }


}
