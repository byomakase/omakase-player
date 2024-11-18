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

import {Observable} from 'rxjs';

export type CamelToSnakeCase<S extends string> = S extends `${infer T}${infer U}` ? `${T extends Capitalize<T> ? '_' : ''}${Lowercase<T>}${CamelToSnakeCase<U>}` : S

export type PartialRecord<K extends keyof any, T> = Partial<Record<K, T>>

export type AtLeastOne<T, U = { [K in keyof T]: Pick<T, K> }> = Partial<T> & U[keyof U];

export type WithOptionalPartial<T, K extends keyof T> = Omit<T, K> & PartialRecord<K, Partial<T[K]>>;

export type WithRequired<T, K extends keyof T> = T & {
  [P in K]-?: T[P];
};

export type SelectRequired<T> = {
  [K in keyof T as T[K] extends Required<T>[K] ? K : never]: T[K]
};

export type SelectNonRequired<T> = {
  [K in keyof T as undefined extends T[K] ? K : never]: T[K]
};

export type UnwrapObservable<T> = T extends Observable<infer U> ? U : T;
