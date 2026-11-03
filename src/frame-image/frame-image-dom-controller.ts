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

import {type PlayerDomController} from '../player/player-controller-api';
import {VirtualPlaybackDomController} from '../virtual/virtual-playback-dom-controller';
import {FrameImageRenderer} from './frame-image-renderer';

/**
 * {@link VirtualPlaybackDomController} that renders frame images from thumbnail track, see {@link FrameImageRenderer}.
 */
export class FrameImageDomControllerImpl extends VirtualPlaybackDomController {
  protected _renderer: FrameImageRenderer;

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

    this._renderer = new FrameImageRenderer(this._element, {objectFit: 'contain'});
  }

  get renderer(): FrameImageRenderer {
    return this._renderer;
  }

  override detachController() {
    super.detachController();
    this._renderer.clear();
  }

  override destroy(): void {
    this._renderer.destroy();
    super.destroy();
  }
}
