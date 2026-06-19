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

import {type TextTrackState, type TrackState} from '../media';
import {type PlayerController, PlayerTextHandlerType, type PlayerTextTrackLoadOptions} from '../player';
import {FileFormatType} from '../common';
import {NativeTextTrackController, type TextTrackController} from './text-track-controller';
import {MediaCaptionsTextTrackController} from './media-captions-text-track-controller';
import {Validators} from '../common/validators';
import {SourceUtil} from '../source';
import {ImscTextTrackController} from './imsc-text-track-controller';

export class TextTrackControllerFactory {
  static create(trackState: TrackState, playerController: PlayerController, loadOptions?: PlayerTextTrackLoadOptions): TextTrackController {
    let textTrackState = trackState as TextTrackState;

    let handlerType = this.resolvePlayerTextHandlerType(textTrackState, loadOptions);

    switch (handlerType) {
      case PlayerTextHandlerType.NATIVE:
        return new NativeTextTrackController(trackState as TextTrackState, playerController, loadOptions?.fileFormatType);
      case PlayerTextHandlerType.MEDIA_CAPTIONS:
        return new MediaCaptionsTextTrackController(trackState as TextTrackState, playerController, loadOptions?.fileFormatType);
      case PlayerTextHandlerType.IMSC:
        return new ImscTextTrackController(trackState as TextTrackState, playerController, loadOptions?.fileFormatType);
      default:
        throw new Error(`Unknown handler type: ${handlerType}`);
    }
  }

  private static resolvePlayerTextHandlerType(textTrackState: TextTrackState, loadOptions?: PlayerTextTrackLoadOptions): PlayerTextHandlerType {
    let defaultPlayerTextHandlerType = PlayerTextHandlerType.MEDIA_CAPTIONS;

    if (loadOptions?.handlerType) {
      return Validators.playerTextHandlerType()(loadOptions.handlerType);
    } else if (loadOptions?.fileFormatType) {
      return this.resolveFromFileFormatType(loadOptions.fileFormatType);
    } else if (textTrackState.sourceFileFormatType) {
      return this.resolveFromFileFormatType(textTrackState.sourceFileFormatType);
    } else {
      return defaultPlayerTextHandlerType;
    }
  }

  private static resolveFromFileFormatType(fileFormatType: FileFormatType): PlayerTextHandlerType {
    switch (fileFormatType) {
      case FileFormatType.VTT:
      case FileFormatType.SRT:
      case FileFormatType.SSA:
      case FileFormatType.ASS:
        return PlayerTextHandlerType.MEDIA_CAPTIONS;
      case FileFormatType.TTML:
        return PlayerTextHandlerType.IMSC;
      case FileFormatType.STL:
      case FileFormatType.SCC:
        throw new Error(`Unplayable text fileFormatType. Convert to VTT | SRT fileFormatType`);
      default:
        throw new Error(`Unknown text fileFormatType: ${fileFormatType}`);
    }
  }
}
