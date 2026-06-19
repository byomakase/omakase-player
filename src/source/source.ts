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

import type {Serializable} from '../common/capabilities';
import type {Track} from '../media';

export class SourceUtil {
  static resolveUrlFromSource(source: Source): string {
    return this.resolveUrlFromSourceState(source);
  }

  static resolveUrlFromSourceState(sourceState: SourceState): string {
    switch (sourceState.type) {
      case SourceType.URL:
        return (sourceState as UrlSourceState).url;
      default:
        throw new Error(`Cannot resolve url from source: ${JSON.stringify(sourceState)}`);
    }
  }
}

export enum SourceType {
  URL = 'URL',
  TRACK = 'TRACK',
}

export interface SourceState extends Serializable {
  type: SourceType;
}

export interface Source {
  type: SourceType;
  state: SourceState;
}

export abstract class BaseSource<S extends SourceState> implements Source {
  protected abstract _type: SourceType;

  protected abstract getState(): S;

  get state(): S {
    return this.getState();
  }

  get type(): SourceType {
    return this._type;
  }
}

export interface UrlSourceState extends SourceState {
  url: string;
}

export abstract class BaseUrlSource<T extends UrlSourceState> extends BaseSource<T> {
  protected _type: SourceType = SourceType.URL;

  protected _url: string;

  constructor(url: string) {
    super();
    this._url = url;
  }

  protected abstract getState(): T;

  get url(): string {
    return this._url;
  }
}

export class UrlSource extends BaseUrlSource<UrlSourceState> {
  protected _type: SourceType = SourceType.URL;

  constructor(url: string) {
    super(url);
  }

  protected getState(): UrlSourceState {
    return {
      type: this._type,
      url: this._url,
    };
  }

  static of(url: string): UrlSource {
    return new UrlSource(url);
  }

  static fromState(state: UrlSourceState) {
    return new UrlSource(state.url);
  }
}

export interface TrackSourceState extends SourceState {
  trackId: Track['id'];
}

export class TrackSource extends BaseSource<TrackSourceState> {
  protected _type: SourceType = SourceType.TRACK;

  private _trackId: Track['id'];

  constructor(trackId: Track['id']) {
    super();

    this._trackId = trackId;
  }

  static of(trackId: Track['id']): TrackSource {
    return new TrackSource(trackId);
  }

  static fromTrack(track: Track) {
    return new TrackSource(track.id);
  }

  static fromState(state: TrackSourceState) {
    return new TrackSource(state.trackId);
  }

  get trackId(): Track['id'] {
    return this._trackId;
  }

  protected getState(): TrackSourceState {
    return {
      type: this._type,
      trackId: this._trackId,
    };
  }
}
