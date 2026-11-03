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

import {
  AudioObservationDownsampleStrategy,
  AudioObservationType,
  DefaultObservation,
  type Observation,
  type ObservationTrack,
  type ObservationTrackEvent,
  type ObservationTrackState,
  type TimedItem,
  TimedItemTemporalType,
  type TrackTimedItem,
} from '../../media';
import type {TrackGenerationOptions} from '../track-load-options';
import {BaseTimedItemsGenerator, type TrackTimedItems} from './timed-items-generator';
import {Observable} from 'rxjs';
import {AudioSampleExtractor, type AudioTrackSample} from '../../tools/audio-sample-extractor';
import Decimal from 'decimal.js';
import {TEMPORAL} from '../../constants';
import type {AudioSample} from 'mediabunny';
import {OmpError} from '../../types';
import {errorCompleteObserver, nextCompleteObserver} from '../../util/rxjs-util';
import {AudioUtil} from '../../audio/audio-util';

export abstract class DefaultTimedItemsGenerator<TI extends TimedItem, I> extends BaseTimedItemsGenerator<TI> {
  protected constructor(url: string, generationOptions?: TrackGenerationOptions | undefined) {
    super(url, generationOptions);
  }

  protected abstract extractItems(): Observable<I>;

  protected abstract processItems(items$: Observable<I>): Observable<TrackTimedItems<TI>[]>;

  generateTimedItems(): Observable<TrackTimedItems<TI>[]> {
    return this.processItems(this.extractItems());
  }
}

interface InputAudioTrackState {
  pendingChannelBuckets: Map<string, Map<number, number[]>>;
  pendingSoundFieldBuckets: Map<number, number[]>;
  channelObservations: Map<string, Observation[]>;
  soundFieldObservations: Observation[];
  lastSampleEnd: number;
}

interface AudioBucketLevel {
  bucketIndex: number;
  level: {
    min: string;
    max: string;
  };
  temporal: {
    start: number;
    end: number;
  };
}

export abstract class AudioObservationItemsGenerator extends DefaultTimedItemsGenerator<Observation, AudioTrackSample> {
  protected _bucketBoundaryPeriod: number;

  constructor(url: string, generationOptions?: TrackGenerationOptions | undefined) {
    super(url, generationOptions);

    this._bucketBoundaryPeriod = new Decimal(10).pow(-TEMPORAL.timedItemsMillisPrecision).toNumber();
  }

  protected abstract map(bucketLevel: AudioBucketLevel): Observation;

  protected extractItems(): Observable<AudioTrackSample> {
    return AudioSampleExtractor.extractSamples(this._url);
  }

  protected processItems(items$: Observable<AudioTrackSample>): Observable<TrackTimedItems<Observation>[]> {
    return new Observable<TrackTimedItems<Observation>[]>((observer) => {
      const {
        observationType = AudioObservationType.WAVEFORM,
        samplesPerSecond = 1,
        downsampleStrategy = observationType === AudioObservationType.WAVEFORM ? AudioObservationDownsampleStrategy.AVG : AudioObservationDownsampleStrategy.MAX_ABS,
        channels = 'all',
        fullSoundField = true,
      } = this._generationOptions ?? {};
      const allChannelsRequired = channels === 'all';

      if (!(samplesPerSecond > 0)) {
        throw new Error('TrackGenerationOptions.samplesPerSecond should be bigger than 0');
      } else if (!fullSoundField && !allChannelsRequired) {
        if (!(channels instanceof Array) || channels.length === 0) {
          throw new Error('Invalid audio observation track generation options configuration');
        }
        if (channels.some((c) => c < 1 || c > 6)) {
          throw new Error('Channels parameter must contain values between 1 and 6');
        }
      }

      const stateByTrack = new Map<number, InputAudioTrackState>();

      const getOrCreateState = (trackIndex: number): InputAudioTrackState => {
        let state = stateByTrack.get(trackIndex);
        if (!state) {
          state = {
            pendingChannelBuckets: new Map<string, Map<number, number[]>>(),
            pendingSoundFieldBuckets: new Map<number, number[]>(),
            channelObservations: new Map<string, Observation[]>(),
            soundFieldObservations: [],
            lastSampleEnd: 0,
          };
          stateByTrack.set(trackIndex, state);
        }
        return state;
      };

      const flushBuckets = (
        state: InputAudioTrackState,
        pending: Map<number, number[]>,
        output: TrackTimedItem<ObservationTrack<ObservationTrackState, ObservationTrackEvent>>[],
        beforeBucketIndex: number
      ) => {
        const isFinalFlush = beforeBucketIndex === Infinity;

        for (const [bucketIndex, levels] of pending) {
          if (bucketIndex >= beforeBucketIndex) {
            break;
          }

          const start = new Decimal(bucketIndex).div(samplesPerSecond).toDecimalPlaces(TEMPORAL.timedItemsMillisPrecision).toNumber();
          const end = isFinalFlush
            ? Math.min(new Decimal(bucketIndex).plus(1).div(samplesPerSecond).toDecimalPlaces(TEMPORAL.timedItemsMillisPrecision).toNumber(), state.lastSampleEnd)
            : new Decimal(bucketIndex).plus(1).div(samplesPerSecond).minus(this._bucketBoundaryPeriod).toDecimalPlaces(TEMPORAL.timedItemsMillisPrecision).toNumber();

          output.push(
            this.map({
              bucketIndex,
              level: {
                min: this.downsampleLevels(levels, downsampleStrategy, -1),
                max: this.downsampleLevels(levels, downsampleStrategy, 1),
              },
              temporal: {
                start,
                end,
              },
            })
          );

          pending.delete(bucketIndex);
        }
      };

      const flushCompletedBuckets = (state: InputAudioTrackState, beforeBucketIndex: number) => {
        state.pendingChannelBuckets.forEach((buckets, key) => flushBuckets(state, buckets, state.channelObservations.get(key)!, beforeBucketIndex));
        flushBuckets(state, state.pendingSoundFieldBuckets, state.soundFieldObservations, beforeBucketIndex);
      };

      const extractChannels = (state: InputAudioTrackState, channels: number[], sample: AudioSample) => {
        const soundFieldLevels = fullSoundField
          ? new Float32Array(sample.allocationSize({planeIndex: 0, format: sample.format}) / AudioSampleExtractor.resolveDivisor(sample.format, sample.numberOfChannels))
          : void 0;

        channels.forEach((c) => {
          if (c > sample.numberOfChannels) {
            throw new OmpError(`Channel ${c} requested, but audio track has only ${sample.numberOfChannels} channels`);
          }

          const levels = AudioSampleExtractor.extractChannelLevels(sample, c - 1);

          const key = `c${c}`;
          let buckets = state.pendingChannelBuckets.get(key);
          if (!buckets) {
            buckets = new Map<number, number[]>();
            state.pendingChannelBuckets.set(key, buckets);
            state.channelObservations.set(key, []);
          }
          this.appendLevelsToBuckets(levels, sample, samplesPerSecond, buckets);

          if (soundFieldLevels) {
            for (let i = 0; i < soundFieldLevels.length; i++) {
              soundFieldLevels[i] = (soundFieldLevels[i] ?? 0) + (levels[i] ?? 0);
            }
          }
        });

        if (soundFieldLevels) {
          this.appendLevelsToBuckets(soundFieldLevels, sample, samplesPerSecond, state.pendingSoundFieldBuckets);
        }
      };

      return items$.subscribe({
        next: ({trackIndex, sample}) => {
          try {
            const state = getOrCreateState(trackIndex);
            state.lastSampleEnd = new Decimal(sample.timestamp).plus(sample.duration).toDecimalPlaces(TEMPORAL.timedItemsMillisPrecision).toNumber();

            const frame = Math.round(sample.timestamp * sample.sampleRate);
            flushCompletedBuckets(state, this.resolveBucketIndex(frame, sample.sampleRate, samplesPerSecond));

            if (fullSoundField || allChannelsRequired) {
              extractChannels(
                state,
                [...Array(sample.numberOfChannels).keys()].map((p) => p + 1),
                sample
              );
            } else {
              extractChannels(state, channels as number[], sample);
            }
          } catch (err) {
            errorCompleteObserver(observer, err);
          }
        },
        complete: () => {
          const channelKeys = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];

          const trackTimedItems = [...stateByTrack.keys()]
            .sort((a, b) => a - b)
            .flatMap((trackIndex) => {
              const state = stateByTrack.get(trackIndex)!;
              flushCompletedBuckets(state, Infinity);

              const channelObservations = channelKeys
                .filter((key, index) => (allChannelsRequired || (channels instanceof Array && channels.includes(index + 1))) && state.channelObservations.has(key))
                .map<TrackTimedItems<Observation>>((key) => ({
                  trackLabel: `${key} ${observationType.toLowerCase()}`,
                  timedItems: state.channelObservations.get(key)!,
                }));

              return fullSoundField
                ? [
                    ...channelObservations,
                    {
                      trackLabel: `Sound field ${observationType.toLowerCase()}`,
                      timedItems: state.soundFieldObservations,
                    },
                  ]
                : channelObservations;
            });

          nextCompleteObserver(observer, trackTimedItems);
        },
        error: (err) => {
          errorCompleteObserver(observer, err);
        },
      });
    });
  }

  private appendLevelsToBuckets(levels: Float32Array, sample: AudioSample, samplesPerSecond: number, buckets: Map<number, number[]>): void {
    const {numberOfFrames, timestamp, sampleRate} = sample;

    const firstFrame = Math.round(timestamp * sampleRate);
    for (let i = 0; i < numberOfFrames; i++) {
      const bucketIndex = this.resolveBucketIndex(firstFrame + i, sampleRate, samplesPerSecond);
      let bucket = buckets.get(bucketIndex);
      if (!bucket) {
        bucket = [];
        buckets.set(bucketIndex, bucket);
      }
      bucket.push(Math.max(-1, Math.min(1, levels[i] ?? 0)));
    }
  }

  private resolveBucketIndex(frame: number, sampleRate: number, samplesPerSecond: number): number {
    return Math.floor((frame * samplesPerSecond) / sampleRate);
  }

  private downsampleLevels(levels: number[], downsampleStrategy: AudioObservationDownsampleStrategy, numberSign: number): string {
    return new Decimal(
      AudioUtil.downsample(
        levels.filter((p) => (numberSign < 0 ? p < 0 : p >= 0)),
        downsampleStrategy
      )
    )
      .toDecimalPlaces(TEMPORAL.audioWaveformPrecision)
      .toString();
  }
}

export class AudioWaveformItemsGenerator extends AudioObservationItemsGenerator {
  protected map(bucketLevel: AudioBucketLevel): TrackTimedItem<ObservationTrack<ObservationTrackState, ObservationTrackEvent>> {
    return new DefaultObservation({
      temporal: {
        type: TimedItemTemporalType.SPAN,
        start: `${bucketLevel.temporal.start}`,
        end: `${bucketLevel.temporal.end}`,
      },
      items: [
        {
          measurement: 'min',
          value: bucketLevel.level.min,
        },
        {
          measurement: 'max',
          value: bucketLevel.level.max,
        },
      ],
      data: {
        index: bucketLevel.bucketIndex,
        duration: bucketLevel.temporal.end - bucketLevel.temporal.start,
      },
    });
  }
}

export class AudioLevelItemsGenerator extends AudioObservationItemsGenerator {
  private readonly _minDb = -96;

  protected map(bucketLevel: AudioBucketLevel): TrackTimedItem<ObservationTrack<ObservationTrackState, ObservationTrackEvent>> {
    let maxAbsValue = Math.max(...Object.values(bucketLevel.level).map((value) => Math.abs(parseFloat(value))));
    let db = new Decimal(AudioUtil.dbFromFloat(maxAbsValue)).toDecimalPlaces(TEMPORAL.audioLevelsPrecision).toNumber();

    return new DefaultObservation({
      temporal: {
        type: TimedItemTemporalType.SPAN,
        start: `${bucketLevel.temporal.start}`,
        end: `${bucketLevel.temporal.end}`,
      },
      items: [
        {
          value: `${Math.max(db, this._minDb)}`,
        },
      ],
      data: {
        index: bucketLevel.bucketIndex,
        duration: bucketLevel.temporal.end - bucketLevel.temporal.start,
      },
    });
  }
}
