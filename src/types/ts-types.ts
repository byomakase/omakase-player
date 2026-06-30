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

import {Observable} from 'rxjs';

export type CamelToSnakeCase<S extends string> = S extends `${infer T}${infer U}` ? `${T extends Capitalize<T> ? '_' : ''}${Lowercase<T>}${CamelToSnakeCase<U>}` : S;

export type PartialRecord<K extends keyof any, T> = Partial<Record<K, T>>;

export type AtLeastOne<T, U = {[K in keyof T]: Pick<T, K>}> = Partial<T> & U[keyof U];

export type WithOptionalPartial<T, K extends keyof T> = Omit<T, K> & {
  [P in K]?: Partial<T[P]>;
};

export type WithRequired<T, K extends keyof T> = T & {
  [P in K]-?: T[P];
};

export type SelectRequired<T> = {
  [K in keyof T as T[K] extends Required<T>[K] ? K : never]: T[K];
};

export type SelectNonRequired<T> = {
  [K in keyof T as undefined extends T[K] ? K : never]: T[K];
};

export type UnwrapObservable<T> = T extends Observable<infer U> ? U : T;

// export type ExtractType<T, K extends keyof T> = T[K];

export type ExtractReturnType<T, K extends keyof T> = T[K] extends (...args: any[]) => infer R ? R : never;

export type ExtractParameterTypes<T, K extends keyof T> = T[K] extends (...args: infer A) => any ? A : never;

export type ObjectEntries<T> = {
  [K in keyof T]-?: [K, T[K]];
}[keyof T][];

export type PrefixKeys<T, P extends string> = {
  [K in keyof T as `${P}${Capitalize<string & K>}`]: T[K];
};

export function prefixKeys<T extends object, P extends string>(obj: T, prefix: P): PrefixKeys<T, P> {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [`${prefix}${key.charAt(0).toUpperCase()}${key.slice(1)}`, value])
  ) as PrefixKeys<T, P>;
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// type OptionalKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T];

export type PartialWithUndefined<T> = { [K in keyof T]?: T[K] | undefined };