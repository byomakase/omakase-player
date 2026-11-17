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

import {ObserverBreaker} from '../common/observer-breaker';
import {AudioLevelEventType, AudioLevelSource} from './audio-level-source';
import type {Observation, ObservationTrack, TimedItem} from '../media';
import {AudioObservationType, TimedItemTemporalUtil} from '../media';
import type {OmakasePlayerApi} from '../omakase-player-api';
import {concat, filter, map, of, switchMap, throttleTime, timer, takeUntil, Subject, tap} from 'rxjs';
import {PlayerEventType} from '../player';
import {TimedItemsTrackEventEmitter, TimedItemsTrackItemEventType} from '../track';
import {AudioUtil} from '../audio/audio-util';

export interface ObservationTrackAudioLevelSourceOptions {
  /**
   * Type of the values held by the observation track(s), see {@link AudioObservationType}:
   * - `WAVEFORM` - linear sample values in the -1 to 1 range, converted to dBFS
   * - `LEVELS` - values already in dBFS (e.g. tracks generated with `observationType: AudioObservationType.LEVELS`), used as they are
   *
   * Defaults to `WAVEFORM`.
   */
  observationType?: AudioObservationType | undefined;
}

export class ObservationTrackAudioLevelSource extends AudioLevelSource {
  protected _track?: ObservationTrack | undefined;
  protected _playerBreaker = new ObserverBreaker();
  protected _trackBreaker = new ObserverBreaker();

  protected _eventEmitter?: TimedItemsTrackEventEmitter;
  protected _timeProvider$ = new Subject<number>();
  private _exactObservations: Set<Observation> = new Set<Observation>();
  private _nearObservations: Observation[] = [];

  // Multi-channel state (used when track array is provided)
  private _channelTracks: ObservationTrack[] = [];
  private _channelEventEmitters: TimedItemsTrackEventEmitter[] = [];
  private _channelExactObservations: Set<Observation>[] = [];
  private _channelNearObservations: Observation[][] = [];

  private _sampleTime = 50;
  private _eventEmitterTreshold = 25;

  private readonly _observationType: AudioObservationType;
  private _levelsChannelCount: number | undefined;

  constructor(player: OmakasePlayerApi, track: ObservationTrack | ObservationTrack[], options?: ObservationTrackAudioLevelSourceOptions) {
    super();
    this._observationType = options?.observationType ?? AudioObservationType.WAVEFORM;
    this.setTrack(track);
    this.wirePlayer(player);
  }

  get observationType(): AudioObservationType {
    return this._observationType;
  }

  get channelCount() {
    if (this._channelTracks.length) {
      return this._channelTracks.length;
    } else if (this._observationType === AudioObservationType.LEVELS) {
      return this._levelsChannelCount ?? 1;
    } else {
      return 6;
    }
  }

  wirePlayer(player: OmakasePlayerApi): void {
    this._playerBreaker.break();

    player.player.onEvent$
      .pipe(
        filter(() => !!this._track || this._channelTracks.length > 0),
        filter((event) => event.type === PlayerEventType.PLAYER_PLAYBACK_PROGRESS),
        tap((event) => {
          this._timeProvider$.next(event.data.currentTime);
        }),
        throttleTime(this._sampleTime),
        switchMap((event) => {
          const dbValues = player.player.playerSession.playback.paused ? [] : this.getDbValuesAtTime(event.data.currentTime);
          return concat(of(dbValues), timer(this._sampleTime, this._sampleTime).pipe(map(() => [] as number[])));
        }),
        takeUntil(this._playerBreaker.observer),
        takeUntil(this._destroyBreaker.observer)
      )
      .subscribe((dbValues) => {
        this.updateLevelsChannelCount(dbValues);
        this._onEvent$.next({
          type: AudioLevelEventType.AUDIO_LEVEL_CHANGE,
          data: {dbValues},
        });
      });
  }

  setTrack(track: ObservationTrack | ObservationTrack[]) {
    this._trackBreaker.break();
    this._eventEmitter?.destroy();
    for (const emitter of this._channelEventEmitters) {
      emitter.destroy();
    }
    this._channelEventEmitters = [];
    this._channelExactObservations = [];
    this._channelNearObservations = [];

    this._levelsChannelCount = Array.isArray(track) ? undefined : this.resolveLevelsChannelCount(track.timedItems[0]);

    if (Array.isArray(track)) {
      this._track = undefined;
      this._channelTracks = track;
      for (let i = 0; i < track.length; i++) {
        this._channelExactObservations.push(new Set<Observation>());
        this._channelNearObservations.push([]);
        const emitter = new TimedItemsTrackEventEmitter(track[i]!, this._timeProvider$, this._eventEmitterTreshold);
        this._channelEventEmitters.push(emitter);
        this._subscribeChannelEmitter(emitter, i);
      }
    } else {
      this._track = track;
      this._channelTracks = [];
      this._exactObservations = new Set<Observation>();
      this._nearObservations = [];
      this._eventEmitter = new TimedItemsTrackEventEmitter(this._track, this._timeProvider$, this._eventEmitterTreshold);
      this._eventEmitter.onEvent$
        .pipe(
          filter((event) => event.type === TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY || event.type === TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT),
          takeUntil(this._destroyBreaker.observer),
          takeUntil(this._trackBreaker.observer)
        )
        .subscribe((event) => {
          switch (event.type) {
            case TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY:
              for (const observation of event.data.exactItems) {
                this._exactObservations.add(observation as Observation);
              }
              this._nearObservations = event.data.nearItems as Observation[];
              break;
            case TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT:
              for (const observation of event.data.items) {
                this._exactObservations.delete(observation as Observation);
              }
              break;
          }
        });
    }
  }

  destroy(): void {
    super.destroy();
    this._playerBreaker.destroy();
    this._trackBreaker.destroy();
    for (const emitter of this._channelEventEmitters) {
      emitter.destroy();
    }
  }

  private _subscribeChannelEmitter(emitter: TimedItemsTrackEventEmitter, channelIndex: number): void {
    emitter.onEvent$
      .pipe(
        filter((event) => event.type === TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY || event.type === TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT),
        takeUntil(this._destroyBreaker.observer),
        takeUntil(this._trackBreaker.observer)
      )
      .subscribe((event) => {
        switch (event.type) {
          case TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY:
            for (const observation of event.data.exactItems) {
              this._channelExactObservations[channelIndex]!.add(observation as Observation);
            }
            this._channelNearObservations[channelIndex] = event.data.nearItems as Observation[];
            break;
          case TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT:
            for (const observation of event.data.items) {
              this._channelExactObservations[channelIndex]!.delete(observation as Observation);
            }
            break;
        }
      });
  }

  private getDbValuesAtTime(time: number): number[] {
    if (this._channelTracks.length > 0) {
      return this._channelTracks.map((_, i) => this.getChannelMaxValueAtTime(time, i)).filter((v): v is number => v !== undefined);
    }

    const validExactObservations = this._exactObservations
      .values()
      .toArray()
      .filter((observation) => this.isObservationValid(observation, time));

    if (validExactObservations.length > 0) {
      return this.extractDbValues(validExactObservations[0]!);
    } else if (this._nearObservations.length > 0) {
      const nearest = this._nearObservations.sort(
        (a, b) => Math.abs((TimedItemTemporalUtil.extractStartTime(a.temporal) ?? 0) - time) - Math.abs((TimedItemTemporalUtil.extractStartTime(b.temporal) ?? 0) - time)
      )[0];
      return nearest ? this.extractDbValues(nearest) : [];
    } else {
      return [];
    }
  }

  private getChannelMaxValueAtTime(time: number, channelIndex: number): number | undefined {
    const exactObs = this._channelExactObservations[channelIndex];
    const nearObs = this._channelNearObservations[channelIndex];

    if (!exactObs || !nearObs) {
      return undefined;
    }

    const validExact = exactObs
      .values()
      .toArray()
      .filter((obs) => this.isObservationValid(obs, time));

    let observation: Observation | undefined;
    if (validExact.length > 0) {
      observation = validExact[0];
    } else if (nearObs.length > 0) {
      observation = nearObs.sort((a, b) => Math.abs((TimedItemTemporalUtil.extractStartTime(a.temporal) ?? 0) - time) - Math.abs((TimedItemTemporalUtil.extractStartTime(b.temporal) ?? 0) - time))[0];
    }

    if (!observation) {
      return undefined;
    }

    const values = this.extractDbValues(observation);
    return values.length > 0 ? Math.max(...values) : undefined;
  }

  private extractDbValues(observation: Observation): number[] {
    const values = observation.items.filter((item) => item.value !== undefined).map((item) => parseFloat(item.value!));
    if (this._observationType === AudioObservationType.LEVELS) {
      // values are already in dBFS
      const dbValues = values.filter((value) => !isNaN(value));
      if (this._channelTracks.length) {
        return dbValues.length > 0 ? [Math.max(...dbValues)] : [];
      }
      return dbValues;
    }
    if (this._channelTracks.length) {
      return [AudioUtil.dbFromFloat(Math.max(...values.map((value) => Math.abs(value))))];
    } else {
      return values.map((value) => AudioUtil.dbFromFloat(Math.abs(value)));
    }
  }

  private resolveLevelsChannelCount(observation: Observation | undefined): number | undefined {
    if (this._observationType !== AudioObservationType.LEVELS || !observation) {
      return undefined;
    }
    const count = observation.items.filter((item) => item.value !== undefined).length;
    return count > 0 ? count : undefined;
  }

  private updateLevelsChannelCount(dbValues: number[]): void {
    if (this._observationType !== AudioObservationType.LEVELS || this._channelTracks.length || dbValues.length === 0 || dbValues.length === this._levelsChannelCount) {
      return;
    }
    this._levelsChannelCount = dbValues.length;
    this._onEvent$.next({
      type: AudioLevelEventType.CHANNEL_COUNT_CHANGE,
      data: {channelCount: dbValues.length},
    });
  }

  private isObservationValid(observation: Observation, time: number): boolean {
    const start = TimedItemTemporalUtil.extractStartTime(observation.temporal);
    const end = TimedItemTemporalUtil.extractEndTime(observation.temporal);
    return start !== undefined && end !== undefined && time >= start && time <= end;
  }
}
