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

// @ts-ignore
import webvtt from 'node-webvtt';
import {BlobUtil} from '../util/blob-util';
import {OmakaseVttCueExtension, OmpError, VttCueExtensionRow} from '../types';
import {StringUtil} from '../util/string-util';
import {OmakaseWebVttExtensionVersion, VttCueParsed, VttFileParsed} from './index';

const webvttParseOptions = {strict: false, meta: true};

export class VttUtil {
  static parseVtt(vttText: string): VttFileParsed {
    let vttFileParsed: VttFileParsed = webvtt.parse(vttText, webvttParseOptions);

    if (vttFileParsed.errors.length) {
      throw new OmpError(`Errors found while parsing vtt file: ${vttFileParsed.errors}`);
    }

    const noteMatch = vttText.match(/WEBVTT\s*([\s\S]*?)NOTE\s*([\s\S]*?)(?=\n\s*\n)/);
    vttFileParsed.note = noteMatch ? noteMatch[2] : void 0;

    return vttFileParsed;
  }

  static createWebvttBlob(webvttText: string): string {
    return BlobUtil.createObjectURL(BlobUtil.createBlob([webvttText], {type: 'text/vtt'}));
  }

  static parseVttCueExtension(cue: VttCueParsed, extensionVersion: OmakaseWebVttExtensionVersion): OmakaseVttCueExtension | undefined {
    if (StringUtil.isNonEmpty(cue.text)) {
      let textRows = cue.text.split(/\r?\n|\r|\n/g);
      let extensionRows: VttCueExtensionRow[] | undefined = textRows.map((row) => {
        let valueRegexArray = row.match(/(?:^|[^:=])([^:=]+)/);
        let measurementRegexArray = row.match(/(?<=:MEASUREMENT=)[^:]+/);
        let commentRegexArray = row.match(/(?<=:COMMENT=)[^:]+/);
        return {
          value: valueRegexArray ? valueRegexArray[0] : void 0,
          measurement: measurementRegexArray ? measurementRegexArray[0] : void 0,
          comment: commentRegexArray ? commentRegexArray[0] : void 0,
        };
      });
      return {
        rows: extensionRows,
      };
    }
    return void 0;
  }
}
