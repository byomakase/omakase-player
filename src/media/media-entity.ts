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

import {CryptoUtil} from '../util/crypto-util';
import type {Serializable} from '../common/capabilities';
import {FileFormat} from '../common';

/**
 * Discriminator for the two kinds of media entities managed by the player.
 */
export enum MediaEntityType {
  MAIN_MEDIA = 'MAIN_MEDIA',
  TRACK = 'TRACK',
}

/**
 * Serializable snapshot of a {@link MediaEntity}, suitable for transfer across
 * worker boundaries or persistence in session storage.
 */
export interface MediaEntityState extends Serializable {
  id: MediaEntity['id'];
  mediaType: MediaEntity['mediaType'];
}

/**
 * Base contract shared by all media entities ({@link MainMedia}, {@link Track}).
 *
 * Every entity carries a unique identifier, a discriminated {@link MediaEntityType},
 * and can produce a serializable {@link MediaEntityState} snapshot via {@link state}.
 */
export interface MediaEntity {
  /** Unique identifier (UUID). */
  id: string;

  /** Discriminator indicating whether this entity is a main media or a track. */
  mediaType: MediaEntityType;

  /** Serializable state snapshot of this entity. */
  state: MediaEntityState;
}

/**
 * Construction arguments shared by all {@link BaseMediaEntity} subclasses.
 */
export interface BaseMediaEntityArgs extends Serializable {
  /** Optional pre-assigned UUID. When omitted a new UUID is generated automatically. */
  id?: MediaEntity['id'];
}

export abstract class BaseMediaEntity<S extends MediaEntityState> implements MediaEntity {
  protected _id: string;

  protected abstract _mediaType: MediaEntityType;

  protected constructor(args?: BaseMediaEntityArgs) {
    this._id = args?.id ? args.id : CryptoUtil.uuid();
  }

  protected abstract getState(): S;

  protected _getState(): MediaEntityState {
    return {
      id: this._id,
      mediaType: this._mediaType,
    };
  }

  get id(): string {
    return this._id;
  }

  get mediaType(): MediaEntityType {
    return this._mediaType;
  }

  get state(): S {
    return this.getState();
  }
}
