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

import {catchError, from, map, mergeMap, Observable, of, toArray} from 'rxjs';
import {AudioInputOutputNode} from '../video/model';
import {httpGet} from '../http';
import {AuthenticationData} from '../authentication/model';
import {AuthConfig} from '../auth/auth-config';

export class AudioUtil {
  static resolveDefaultAudioRouting(inputsNumber: number, outputsNumber: number): AudioInputOutputNode[] {
    if (inputsNumber && outputsNumber) {
      if ((inputsNumber === 2 && outputsNumber === 2) || (inputsNumber === 2 && outputsNumber === 6) || (inputsNumber === 6 && outputsNumber === 6)) {
        return [...Array(inputsNumber).keys()].map((p) => ({
          inputNumber: p,
          outputNumber: p,
          connected: true,
        }));
      } else if (inputsNumber === 6 && outputsNumber === 8) {
        return [...Array(inputsNumber).keys()]
          .map((p) => {
            return {
              inputNumber: p,
              outputNumber: p,
            };
          })
          .concat([
            {
              inputNumber: 4,
              outputNumber: 6,
            },
            {
              inputNumber: 5,
              outputNumber: 7,
            },
          ])
          .map((p) => ({
            ...p,
            connected: true,
          }));
      } else if (inputsNumber === 6 && outputsNumber === 2) {
        return [
          {
            inputNumber: 0,
            outputNumber: 0,
          },
          {
            inputNumber: 1,
            outputNumber: 1,
          },
          {
            inputNumber: 2,
            outputNumber: 0,
          },
          {
            inputNumber: 2,
            outputNumber: 1,
          },
          {
            inputNumber: 4,
            outputNumber: 0,
          },
          {
            inputNumber: 5,
            outputNumber: 1,
          },
        ].map((p) => ({
          ...p,
          connected: true,
        }));
      } else if (outputsNumber === 1) {
        return [...Array(inputsNumber).keys()].map((p) => ({
          inputNumber: p,
          outputNumber: 0,
          connected: true,
        }));
      } else if (inputsNumber === 1 && outputsNumber <= 2) {
        return [...Array(outputsNumber).keys()].map((p) => ({
          inputNumber: 0,
          outputNumber: p,
          connected: true,
        }));
      } else if (inputsNumber === 1 && outputsNumber >= 6) {
        return [0, 1, 2, 4, 5].map((p) => ({
          inputNumber: 0,
          outputNumber: p,
          connected: true,
        }));
      }
    }
    return [];
  }

  static fetchAndMergeAudioFiles(urls: string[], authentication?: AuthenticationData): Observable<ArrayBuffer> {
    const maxConcurrent = 20;
    return from(urls).pipe(
      mergeMap((url, index) => this.fetchAudioFile(url, authentication).pipe(map((data) => ({index, data}))), maxConcurrent),
      toArray(),
      map((results) => {
        results.sort((a, b) => a.index - b.index);
        return this.mergeBuffers(results.map((r) => r.data));
      })
    );
  }

  private static fetchAudioFile(url: string, authentication?: AuthenticationData): Observable<ArrayBuffer> {
    return from(
      httpGet<ArrayBuffer>(url, {
        ...AuthConfig.createAxiosRequestConfig(url, authentication),
        responseType: 'arraybuffer',
      })
    ).pipe(
      map((response) => response.data as ArrayBuffer),
      catchError((error) => {
        console.error(`Failed to fetch ${url}:`, error);
        return of(new ArrayBuffer(0)); // Return an empty buffer on error
      })
    );
  }

  private static mergeBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
    const totalLength = buffers.reduce((acc, buf) => acc + buf.byteLength, 0);
    const mergedBuffer = new Uint8Array(totalLength);
    let offset = 0;

    for (const buffer of buffers) {
      mergedBuffer.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }

    return mergedBuffer.buffer;
  }
}
