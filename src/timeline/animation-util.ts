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

import Konva from 'konva';
import type {IFrame} from 'konva/lib/types';

export interface AnimateConfig {
  layer?: Konva.Layer;
  duration: number;
  startValue: number;
  endValue: number;
  onUpdateHandler: (frame: IFrame, value: number) => void;
  onCompleteHandler?: (frame: IFrame, value: number) => void;
}

export interface PulseAnimationConfig {
  node: Konva.Node;
  minOpacity?: number;
  maxOpacity?: number;
  period?: number;
}

export function pulseAnimation(config: PulseAnimationConfig): Konva.Animation {
  const min = config.minOpacity ?? 0.3;
  const max = config.maxOpacity ?? 0.7;
  const period = config.period ?? 1600;
  const mid = (min + max) / 2;
  const amplitude = (max - min) / 2;

  const anim = new Konva.Animation((frame) => {
    const opacity = mid + amplitude * Math.sin((frame!.time * 2 * Math.PI) / period);
    config.node.opacity(opacity);
  }, config.node.getLayer());

  anim.start();
  return anim;
}

export interface GradientAnimationConfig {
  group: Konva.Group;
  width: number;
  height: number;
  y?: number;
  fill: string;
  period?: number;
}

export function gradientAnimation(config: GradientAnimationConfig): Konva.Animation {
  const period = config.period ? config.period / 2 : 2000;
  const bandWidth = config.width * 2;
  const y = config.y ?? 0;

  const clipGroup = new Konva.Group({x: 0, y, clipX: 0, clipY: 0, clipWidth: config.width, clipHeight: config.height, listening: false});

  const rect = new Konva.Rect({
    x: -bandWidth,
    y: 0,
    width: bandWidth,
    height: config.height,
    fillLinearGradientStartPoint: {x: 0, y: 0},
    fillLinearGradientEndPoint: {x: bandWidth, y: 0},
    fillLinearGradientColorStops: [0, 'transparent', 0.5, config.fill, 1, 'transparent'],
    listening: false,
  });

  clipGroup.add(rect);
  config.group.add(clipGroup);

  const anim = new Konva.Animation((frame) => {
    const progress = (frame!.time % period) / period;
    rect.x(-bandWidth + progress * (config.width + bandWidth));
  });

  anim.start();
  return anim;
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
