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

import {FileFormatType} from '../../common';
import {type InputFormat, parse as ttconvParse, type ParsedCue, type ParsedFile} from '@byomakase/omakase-ttconv-ts';
import {type OmakaseVttCueData, OmakaseVttCueProcessorFactory, OmakaseVttVersion, VttUtil} from '../../vtt';

/**
 * mapping interface for ttconv parsing result
 */
export interface TimedItemsParseResult {
  note: string | undefined;
  timedItems: ParsedTimedItem[];
  errors: any[];

  omakaseVttVersion?: OmakaseVttVersion | undefined;
}

/**
 * mapping interface for ttconv parsed cues -> extends parsed cues with omakase vtt cue mapping
 */
export interface ParsedTimedItem {
  temporal: {
    start: number | undefined;
    end: number | undefined;
  };
  text: string;

  data?: OmakaseVttCueData | undefined;
}

export class TimedItemsParser {
  static parse(content: string | ArrayBuffer, type: FileFormatType): TimedItemsParseResult {
    let parseResult = this.mapParsedFile(
      ttconvParse(content, type.toLowerCase() as InputFormat, {
        preserveTags: true,
      })
    );

    if (parseResult.errors.length) {
      throw new Error(`Errors found while parsing file: ${parseResult.errors}`);
    }

    if (type === FileFormatType.VTT) {
      const noteMatch = (content as string).match(/WEBVTT\s*([\s\S]*?)NOTE\s*([\s\S]*?)(?=\n\s*\n)/);
      parseResult.note = noteMatch ? noteMatch[2] : void 0;

      parseResult.omakaseVttVersion = VttUtil.resolveOmakaseVttVersion(parseResult);

      if (parseResult.omakaseVttVersion) {
        OmakaseVttCueProcessorFactory.create(parseResult.omakaseVttVersion).process(parseResult);
      }
    }

    return parseResult;
  }

  private static mapParsedFile(parsedFile: ParsedFile): TimedItemsParseResult {
    return {
      note: void 0,
      timedItems: parsedFile.cues.map((cue) => this.mapParsedCue(cue)),
      errors: parsedFile.errors,
    };
  }

  private static mapParsedCue(parsedCue: ParsedCue): ParsedTimedItem {
    return {
      temporal: {
        start: parsedCue.start,
        end: parsedCue.end,
      },
      text: parsedCue.text,
    };
  }
}
