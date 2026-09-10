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

/**
 * `X-TIMESTAMP-MAP` as written in a segmented WebVTT file, in seconds.
 *
 * `local` is the cue time the map anchors at; `mpegts` is the presentation time it anchors to,
 * converted from the 90kHz clock the header carries it on.
 */
export interface VttTimestampMap {
  local: number;
  mpegts: number;
}

const VTT_TIMESTAMP_MAP_PATTERN = /^X-TIMESTAMP-MAP=.*$/m;
const VTT_TIMESTAMP_MAP_LINE_PATTERN = /^X-TIMESTAMP-MAP=.*$\r?\n?/m;
const VTT_TIMESTAMP_MAP_LOCAL_PATTERN = /LOCAL:(\d{2,}):([0-5]\d):([0-5]\d[.,]\d{1,3})/;
const VTT_TIMESTAMP_MAP_MPEGTS_PATTERN = /MPEGTS:(\d+)/;

const MPEGTS_CLOCK_HZ = 90000;

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

  static parseTimestampMap(vttText: string): VttTimestampMap | undefined {
    let header = vttText.match(VTT_TIMESTAMP_MAP_PATTERN)?.[0];
    if (!header) {
      return void 0;
    }

    let local = header.match(VTT_TIMESTAMP_MAP_LOCAL_PATTERN);
    if (!local) {
      return void 0;
    }

    let mpegts = header.match(VTT_TIMESTAMP_MAP_MPEGTS_PATTERN);

    return {
      local: Number(local[1]) * 3600 + Number(local[2]) * 60 + Number(local[3]!.replace(',', '.')),
      mpegts: mpegts ? Number(mpegts[1]) / MPEGTS_CLOCK_HZ : 0,
    };
  }

  static stripTimestampMap(vttText: string): string {
    return vttText.replace(VTT_TIMESTAMP_MAP_LINE_PATTERN, '');
  }

  /**
   * Seconds to add to a segment's cue times to place them on the media timeline.
   *
   * `LOCAL` names the cue time the map anchors at, so it is subtracted, matching what hls.js does
   * while rendering. `MPEGTS` is not applied: it is meaningful only against the stream's initial PTS,
   * which the playback engine holds and this does not.
   */
  static resolveCueTimeOffset(timestampMap: VttTimestampMap | undefined): number {
    return -(timestampMap?.local ?? 0);
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
