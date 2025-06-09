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
import {httpGet} from '../http';
import {AuthenticationData} from '../authentication/model';
import {AuthConfig} from '../auth/auth-config';
import {OmpAudioRoutingConnection} from '../video';

export class AudioUtil {
  static resolveDefaultAudioRouting(inputsNumber: number, outputsNumber: number): OmpAudioRoutingConnection[] {
    if (inputsNumber && outputsNumber) {
      if ((inputsNumber === 2 && outputsNumber === 2) || (inputsNumber === 2 && outputsNumber === 6) || (inputsNumber === 6 && outputsNumber === 6)) {
        return [...Array(inputsNumber).keys()].flatMap((input) => {
          return [...Array(outputsNumber).keys()].map((output) => ({
            path: {
              input,
              output,
            },
            connected: input === output,
          }));
        });
      } else if (inputsNumber === 6 && outputsNumber === 8) {
        return [...Array(inputsNumber).keys()].flatMap((input) => {
          return [...Array(outputsNumber).keys()].map((output) => ({
            path: {
              input,
              output,
            },
            connected: input === output || (input === 4 && output === 6) || (input === 5 && output === 7),
          }));
        });
      } else if (inputsNumber === 6 && outputsNumber === 2) {
        return [...Array(inputsNumber).keys()].flatMap((input) => {
          return [...Array(outputsNumber).keys()].map((output) => ({
            path: {
              input,
              output,
            },
            connected: input === 2 || input === output || input - 4 === output,
          }));
        });
      } else if (outputsNumber === 1 || (inputsNumber === 1 && outputsNumber <= 2)) {
        return [...Array(inputsNumber).keys()].flatMap((input) => {
          return [...Array(outputsNumber).keys()].map((output) => ({
            path: {
              input,
              output,
            },
            connected: true,
          }));
        });
      } else if (inputsNumber === 1 && outputsNumber >= 6) {
        return [0, 1, 2, 4, 5].map((output) => ({
          path: {
            input: 0,
            output,
          },
          connected: true,
        }));
      }
    }

    return [];
  }

  /**
   * Used for solo or unmute action if initial connections are disconnected
   * @param inputNumber
   * @param inputsNumber
   * @param outputsNumber
   */
  static resolveDefaultInputAudioRouting(inputNumber: number, inputsNumber: number, outputsNumber: number): OmpAudioRoutingConnection[] {
    let defaultInputAudioRouting = this.resolveDefaultAudioRouting(inputsNumber, outputsNumber).filter((p) => p.path.input === inputNumber);

    if (inputNumber === 3 && inputsNumber === 6 && outputsNumber === 2) {
      return [...Array(outputsNumber).keys()].map((outputNumber) => ({
        path: {
          input: inputNumber,
          output: outputNumber,
        },
        connected: true,
      }));
    } else {
      return defaultInputAudioRouting;
    }
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

  static fetchAudioFile(url: string, authentication?: AuthenticationData): Observable<ArrayBuffer> {
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
