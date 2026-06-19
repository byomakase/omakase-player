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

import {z} from 'zod';
import {MediaTemporalFormat} from './media-temporal';
import {MainMediaType, TrackType} from '../media';
import {AUDIO_DEFAULTS} from '../constants';
import {PlayerTextHandlerType} from '../player';
import {VideoKeyframeType} from '../tools/keyframe-extractor';

export class Validators {
  public static id(): (value: string) => string {
    return (value: string) => {
      return z.coerce.string().min(1).max(100).parse(value);
    };
  }

  public static mediaTime(): (value: number) => number {
    return (value: number) => {
      return z.coerce.number().min(0).parse(value);
    };
  }

  public static mediaFrame(): (value: number) => number {
    return (value: number) => {
      return z.coerce.number().min(0).parse(value);
    };
  }

  public static volume(): (value: number) => number {
    return (value: number) => {
      return z.coerce.number().min(0).max(AUDIO_DEFAULTS.volume).default(AUDIO_DEFAULTS.volume).parse(value);
    };
  }

  public static mediaTemporalFormat(): (value: MediaTemporalFormat) => MediaTemporalFormat {
    return (value: MediaTemporalFormat) => {
      return z.enum(MediaTemporalFormat).parse(value);
    };
  }

  public static mainMediaType(): (value: MainMediaType) => MainMediaType {
    return (value: MainMediaType) => {
      return z.enum(MainMediaType).parse(value);
    };
  }

  public static trackType(): (value: TrackType) => TrackType {
    return (value: TrackType) => {
      return z.enum(TrackType).parse(value);
    };
  }

  public static playerTextHandlerType(): (value: PlayerTextHandlerType) => PlayerTextHandlerType {
    return (value: PlayerTextHandlerType) => {
      return z.enum(PlayerTextHandlerType).parse(value);
    };
  }

  public static audioChannelsNumber(): (value: number) => number {
    return (value: number) => {
      return z.coerce.number().min(1).max(32).parse(value);
    };
  }

  public static videoKeyframeType(): (value: VideoKeyframeType) => VideoKeyframeType {
    return (value: VideoKeyframeType) => {
      return z.enum(VideoKeyframeType).parse(value);
    };
  }
}
