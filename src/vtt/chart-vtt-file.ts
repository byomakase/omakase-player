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

import {BarChartVttCue, LineChartVttCue, OgChartVttCue, OmakaseVttCueExtension} from '../types';
import {map, Observable} from 'rxjs';
import {z} from 'zod';
import Decimal from 'decimal.js';
import {VttCueParsed} from './model';
import {DownsampleStrategy, VttLoadOptions} from '../api/vtt-aware-api';
import {DownsampledVttFile} from './downsampled-vtt-file';

export abstract class ChartVttFile<T extends LineChartVttCue | BarChartVttCue | OgChartVttCue> extends DownsampledVttFile<T> {

  protected override _supportedDownsampleStrategies: DownsampleStrategy[] = ['none', 'avg', 'max', 'min', 'drop'];

  protected override resolveDownsampledCue(index: number, startTime: number, endTime: number, cues: T[]): T {
    const measurements: { [measurement: string]: number[] } = cues.reduce((measurements, cue) => {
      if (cue.extension?.rows) {
        for (const row of cue.extension.rows) {
          if (!row.measurement || !row.value) {
            continue;
          }
          if (measurements[row.measurement]) {
            measurements[row.measurement].push(parseFloat(row.value));
          } else {
            measurements[row.measurement] = [parseFloat(row.value)];
          }
        }
        return measurements;
      }
    }, {} as any);
    
    return {
      index: index,
      id: `SAMPLED_${index}`,
      startTime: startTime,
      endTime: endTime,
      text: `SAMPLED`,
      value: this.getAggregateValue(cues.map(cue => cue.value)),
      extension: {
        rows: Object.keys(measurements).map(measurement => ({
          measurement,
          value: this.getAggregateValue(measurements[measurement]),
          comment: 'SAMPLE'
        }))
      }
    } as any;
  }

  private getAggregateValue(values: number[]): number {
    switch (this._downsampleConfig?.downsampleStrategy) {
      case 'max':
        return Math.max(...values);
      case 'min':
        return Math.min(...values);
      case 'avg':
        return values.reduce((sum, val) => sum + val, 0) / values.length;
      case 'drop':
        return values[0];
      default:
        throw new Error('Usupported downsampling strategy: ' + this._downsampleConfig?.downsampleStrategy);
    }
  }

}

export class LineChartVttFile extends ChartVttFile<LineChartVttCue> {

  protected constructor(url: string, options: VttLoadOptions) {
    super(url, options);
  }

  static create(url: string, options: VttLoadOptions): Observable<LineChartVttFile> {
    let instance = new LineChartVttFile(url, options);
    return instance.fetch().pipe(map(result => {
      return instance;
    }))
  }

  protected mapCue(vttCueParsed: VttCueParsed, cueExtension: OmakaseVttCueExtension | undefined, index: number): LineChartVttCue {
    return {
      index: index,
      id: vttCueParsed.identifier,
      startTime: new Decimal(vttCueParsed.start).toDecimalPlaces(3).toNumber(),
      endTime: new Decimal(vttCueParsed.end).toDecimalPlaces(3).toNumber(),
      text: vttCueParsed.text,
      value: z.coerce.number()
        .catch(0)
        .parse(cueExtension && cueExtension.rows && cueExtension.rows.length > 0 ? cueExtension.rows[0].value : vttCueParsed.text),
      extension: cueExtension
    }
  }

}

export class BarChartVttFile extends ChartVttFile<BarChartVttCue> {

  protected constructor(url: string, options: VttLoadOptions) {
    super(url, options);
  }

  static create(url: string, options: VttLoadOptions): Observable<BarChartVttFile> {
    let instance = new BarChartVttFile(url, options);
    return instance.fetch().pipe(map(result => {
      return instance;
    }))
  }

  protected mapCue(vttCueParsed: VttCueParsed, cueExtension: OmakaseVttCueExtension | undefined, index: number): BarChartVttCue {
    return {
      index: index,
      id: vttCueParsed.identifier,
      startTime: new Decimal(vttCueParsed.start).toDecimalPlaces(3).toNumber(),
      endTime: new Decimal(vttCueParsed.end).toDecimalPlaces(3).toNumber(),
      text: vttCueParsed.text,
      value: z.coerce.number()
        .catch(0)
        .parse(cueExtension && cueExtension.rows && cueExtension.rows.length > 0 ? cueExtension.rows[0].value : vttCueParsed.text),
      extension: cueExtension
    }
  }

}

export class OgChartVttFile extends ChartVttFile<OgChartVttCue> {

  protected constructor(url: string, options: VttLoadOptions) {
    super(url, options);
  }

  static create(url: string, options: VttLoadOptions): Observable<OgChartVttFile> {
    let instance = new OgChartVttFile(url, options);
    return instance.fetch().pipe(map(result => {
      return instance;
    }))
  }

  protected mapCue(vttCueParsed: VttCueParsed, cueExtension: OmakaseVttCueExtension | undefined, index: number): OgChartVttCue {
    return {
      index: index,
      id: vttCueParsed.identifier,
      startTime: new Decimal(vttCueParsed.start).toDecimalPlaces(3).toNumber(),
      endTime: new Decimal(vttCueParsed.end).toDecimalPlaces(3).toNumber(),
      text: vttCueParsed.text,
      value: z.coerce.number()
        .catch(0)
        .parse(cueExtension && cueExtension.rows && cueExtension.rows.length > 0 ? cueExtension.rows[0].value : vttCueParsed.text),
      extension: cueExtension
    }
  }

}
