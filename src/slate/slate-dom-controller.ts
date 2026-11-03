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

import {MediaTemporalFormat} from '../common';
import {type PlayerController, type PlayerControllerEvent, PlayerControllerEventType, type PlayerDomController} from '../player/player-controller-api';
import {VirtualPlaybackDomController} from '../virtual/virtual-playback-dom-controller';

const RENDER_EVENT_TYPES: PlayerControllerEventType[] = [
  PlayerControllerEventType.PLAYER_CONTROLLER_PLAYBACK_PROGRESS,
  PlayerControllerEventType.PLAYER_CONTROLLER_PLAY,
  PlayerControllerEventType.PLAYER_CONTROLLER_PAUSE,
  PlayerControllerEventType.PLAYER_CONTROLLER_SEEKED,
  PlayerControllerEventType.PLAYER_CONTROLLER_ENDED,
];

/**
 * {@link VirtualPlaybackDomController} that renders black slate with current timecode.
 */
export class SlateDomControllerImpl extends VirtualPlaybackDomController {
  constructor(parentElement: HTMLElement, delegate?: PlayerDomController) {
    super(parentElement, delegate);
    Object.assign(this._element.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#000',
      color: '#fff',
      fontFamily: 'monospace',
      fontSize: '2em',
    });
  }

  protected override onControllerEvent(controller: PlayerController, event: PlayerControllerEvent): void {
    if (RENDER_EVENT_TYPES.includes(event.type)) {
      this.renderTimecode(controller);
    }
  }

  protected override onMediaStateRefreshed(controller: PlayerController): void {
    this.renderTimecode(controller);
  }

  override detachController() {
    super.detachController();
    this.setText('');
  }

  protected renderTimecode(controller: PlayerController) {
    this.setText(controller.getCurrentTime(MediaTemporalFormat.TIMECODE));
  }

  setText(text: string) {
    this._element.textContent = text;
  }
}
