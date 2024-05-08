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

import {AudioApi} from '../api';
import {Observable, Subject} from 'rxjs';
import {AudioEvent, Destroyable} from '../types';
import {VideoControllerApi} from '../video/video-controller-api';

export class AudioController implements AudioApi, Destroyable {
  public onAudioSwitched$: Observable<AudioEvent> = new Subject<AudioEvent>();

  protected _videoController: VideoControllerApi;

  constructor(videoController: VideoControllerApi) {
    this._videoController = videoController;
    this.onAudioSwitched$ = videoController.onAudioSwitched$;
  }

  getAudioTracks(): any[] {
    return this._videoController.getAudioTracks();
  }

  getCurrentAudioTrack(): any {
    return this._videoController.getCurrentAudioTrack();
  }

  setAudioTrack(audioTrackId: number) {
    this._videoController.setAudioTrack(audioTrackId);
  }

  destroy() {

  }


}
