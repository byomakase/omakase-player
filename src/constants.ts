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

import {Dimension, Position} from './common';

export class Constants {
  public static OMP_HANDSHAKE_BROADCAST_CHANNEL_ID = 'OMP_HANDSHAKE_BROADCAST_CHANNEL_ID';

  public static POSITION_TOP_LEFT: Position = {
    x: 0,
    y: 0,
  };

  public static DIMENSION_ZERO: Dimension = {
    width: 0,
    height: 0,
  };

  public static GOLDEN_RATIO = 1.61;

  public static TWO_PI_RADIANS = Math.PI * 2;

  public static FILL_LINEAR_GRADIENT_AUDIO_PEAK = [0, '#F58428', 0.33, '#FCD151', 0.5, '#FFF263', 0.59, '#DEE666', 0.78, '#A2D06C', 0.93, '#7DC370', 1, '#6FBE72'];
}
