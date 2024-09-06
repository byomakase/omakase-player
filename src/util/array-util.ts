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

export class ArrayUtil {
  static groupConsecutiveNumbers(arr: number[]): number[][] {
    if (arr.length === 0) {
      return [];
    }

    const result: number[][] = [];
    let currentGroup: number[] = [arr[0]];

    for (let i = 1; i < arr.length; i++) {
      if (arr[i] === arr[i - 1] + 1) {
        // Values are consecutive, add to the current group
        currentGroup.push(arr[i]);
      } else {
        // Values are not consecutive, start a new group
        result.push(currentGroup);
        currentGroup = [arr[i]];
      }
    }

    // Add the last group
    result.push(currentGroup);

    return result;
  }
}
