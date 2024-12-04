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

import Konva from 'konva';
import {IFrame} from 'konva/lib/types';

export interface AnimateConfig {
  layer?: Konva.Layer;
  duration: number;
  startValue: number;
  endValue: number;
  onUpdateHandler: (frame: IFrame, value: number) => void;
  onCompleteHandler?: (frame: IFrame, value: number) => void;
}

export function animate(config: AnimateConfig) {
  if (config.startValue === config.endValue) {
    return;
  }

  let isRising = config.startValue < config.endValue;

  // we will always animate from 0 to maxValue
  let maxValue = isRising ? config.endValue - config.startValue : config.startValue - config.endValue;

  let animation = new Konva.Animation((frame) => {
    if (frame) {
      let interpolatedValue = Konva.Easings.StrongEaseInOut(frame.time, 0, maxValue, config.duration);
      if (interpolatedValue >= maxValue) {
        config.onUpdateHandler(frame, config.endValue); // trigger update on last possible value, which is conf.to
        animation.stop();
        if (config.onCompleteHandler) {
          config.onCompleteHandler(frame, config.endValue);
        }
      } else {
        let updatedValue = config.startValue + interpolatedValue * (isRising ? 1 : -1);
        config.onUpdateHandler(frame, updatedValue);
      }
    } else {
      animation.stop();
    }
  }, config.layer);

  animation.start();
}
