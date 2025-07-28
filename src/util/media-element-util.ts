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

import {BufferedTimespan} from '../video';

export class MediaElementUtil {
  public static getBufferedTimespans(element: HTMLMediaElement): BufferedTimespan[] {
    if (!element) {
      return [];
    }

    let result: BufferedTimespan[] = [];
    let timeRanges: TimeRanges = element.buffered;
    for (let i = 0; i < timeRanges.length; i++) {
      result.push({
        start: timeRanges.start(i),
        end: timeRanges.end(i),
      });
    }
    return result;
  }
}
