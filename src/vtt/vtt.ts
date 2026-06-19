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

import {StringUtil} from '../util/string-util';
// @ts-ignore
import webvtt from 'node-webvtt';

const webvttParseOptions = {strict: false, meta: true};

export interface ParsedVttFile {
  valid: any;
  note: string | undefined;
  cues: ParsedVttCue[];
  errors: any[];

  omakaseVttVersion: OmakaseVttVersion | undefined;
}

export enum OmakaseVttVersion {
  OMAKASE_VTT_VERSION_1_0 = 'OMAKASE_VTT_VERSION_1_0',
}

export const OMAKASE_VTT_CUE_DATA_KEY_MAPPING = {
  [OmakaseVttVersion.OMAKASE_VTT_VERSION_1_0]: 'ompVttV1CueRows',
} as const;

export type OmakaseVttCueDataTypeMap = {
  [OmakaseVttVersion.OMAKASE_VTT_VERSION_1_0]: {
    value?: string | undefined;
    measurement?: string | undefined;
    comment?: string | undefined;
  }[];
};

export type OmakaseVttCueData = {
  [V in OmakaseVttVersion as (typeof OMAKASE_VTT_CUE_DATA_KEY_MAPPING)[V]]?: OmakaseVttCueDataTypeMap[V];
};

export interface ParsedVttCue {
  identifier: string;
  start: number;
  end: number;
  text: string;
  styles: string;

  data?: OmakaseVttCueData | undefined;
}

export class VttUtil {
  static parseVtt(vttText: string): ParsedVttFile {
    let parsedVttFile: ParsedVttFile = webvtt.parse(vttText, webvttParseOptions);

    if (parsedVttFile.errors.length) {
      throw new Error(`Errors found while parsing vtt file: ${parsedVttFile.errors}`);
    }

    const noteMatch = vttText.match(/WEBVTT\s*([\s\S]*?)NOTE\s*([\s\S]*?)(?=\n\s*\n)/);
    parsedVttFile.note = noteMatch ? noteMatch[2] : void 0;

    parsedVttFile.omakaseVttVersion = VttUtil.resolveOmakaseVttVersion(parsedVttFile);

    if (parsedVttFile.omakaseVttVersion) {
      OmakaseVttCueProcessorFactory.create(parsedVttFile.omakaseVttVersion).process(parsedVttFile);
    }

    return parsedVttFile;
  }

  static resolveOmakaseVttVersion(parsed: ParsedVttFile): OmakaseVttVersion | undefined {
    if (StringUtil.isNonEmpty(parsed.note)) {
      let noteRowsMatch = parsed.note!.match(/^(.*?)(?:\r?\n|\r)(.*)/);
      if (noteRowsMatch) {
        let firstLine = noteRowsMatch[1];
        let secondLine = noteRowsMatch[2];
        if (firstLine?.trim() === 'Omakase Player Web VTT' && secondLine?.trim() === 'V1.0') {
          return OmakaseVttVersion.OMAKASE_VTT_VERSION_1_0;
        }
      }
    }
    return void 0;
  }
}

abstract class BaseOmakaseVttCueProcessor {
  abstract process(parsedVttFile: ParsedVttFile): void;
}

class OmakaseVttV1CueProcessor extends BaseOmakaseVttCueProcessor {
  process(parsedVttFile: ParsedVttFile) {
    for (let cue of parsedVttFile.cues) {
      if (StringUtil.isNonEmpty(cue.text)) {
        let textRows = cue.text.split(/\r?\n|\r|\n/g);

        cue.data = {
          ...cue.data,
          [OMAKASE_VTT_CUE_DATA_KEY_MAPPING[OmakaseVttVersion.OMAKASE_VTT_VERSION_1_0]]: textRows.map((row) => {
            let valueRegexArray = row.match(/^([^:=]+)/);
            let measurementRegexArray = row.match(/(?<=:MEASUREMENT=)[^:]+/);
            let commentRegexArray = row.match(/(?<=:COMMENT=)[^:]+/);
            return {
              value: valueRegexArray ? valueRegexArray[1] : void 0,
              measurement: measurementRegexArray ? measurementRegexArray[0] : void 0,
              comment: commentRegexArray ? commentRegexArray[0] : void 0,
            };
          }),
        };
      }
    }
  }
}

class OmakaseVttCueProcessorFactory {
  static create(version: OmakaseVttVersion) {
    switch (version) {
      case OmakaseVttVersion.OMAKASE_VTT_VERSION_1_0:
        return new OmakaseVttV1CueProcessor();
      default:
        throw new Error(`Unknown version: ${version}`);
    }
  }
}
