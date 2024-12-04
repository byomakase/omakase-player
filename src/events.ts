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

export type OmakaseEventMap<T> = {
  [K in keyof T]: T[K];
};

export type OmakaseEventKey<T extends OmakaseEventMap<any>> = keyof T;

export type OmakaseEventListener<T> = (event: T) => void;

export interface OmakaseEventEmitter<T extends OmakaseEventMap<any>> {
  on<K extends OmakaseEventKey<T>>(eventKey: K, handler: OmakaseEventListener<T[K]>): void;

  off<K extends OmakaseEventKey<T>>(eventKey: K, handler: OmakaseEventListener<T[K]>): void;

  emit<K extends OmakaseEventKey<T>>(eventKey: K, event: T[K]): void;

  once<K extends OmakaseEventKey<T>>(eventKey: K, handler: OmakaseEventListener<T[K]>): void;

  listeners<K extends OmakaseEventKey<T>>(eventKey: K): OmakaseEventListener<T[K]>[];

  listenerCount<K extends OmakaseEventKey<T>>(eventKey: K): void;

  removeAllListeners<K extends OmakaseEventKey<T>>(eventKey?: K): void;
}
