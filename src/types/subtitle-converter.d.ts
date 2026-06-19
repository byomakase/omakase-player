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

declare module 'subtitle-converter' {
  export type ConvertOptions = {
    startAtZeroHour?: boolean;
    shiftTimecode?: number;
    sourceFps?: number;
    outputFps?: number;
    removeTextFormatting?: boolean;
    timecodeOverlapLimiter?: boolean | number;
    combineOverlapping?: boolean;
  }

  export type ValidateOptions = {
    startsAtZeroHour?: boolean;
    reversedTimecodes?: boolean;
    overlappingTimecodes?: boolean;
    formattedText?: boolean;
    invalidEntries?: any,
    invalidTimecodes?: any,
    invalidIndices?: any,
  }

  export type Subtitle = any;

  export type Status = {
    success: boolean,
    startsAtZeroHour: boolean,
    reversedTimecodes: any,
    overlappingTimecodes: any,
    formattedText: any,
    invalidEntries: any,
    invalidTimecodes: any,
    invalidIndices: any,
  }

  export function convert(subtitleText: any, outputExtension: string, options?: ConvertOptions): {
    subtitle: Subtitle,
    status: Status
  }

  export function validate(subtitleText: any, inputExtension: string, options?: ValidateOptions): Status;
}