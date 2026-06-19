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

import type {DeepPartial, PrefixKeys} from '../types/ts-types';

export function isNullOrUndefined(value: unknown): value is null | undefined {
  return value === null || value === void 0;
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function deepMerge<T extends object>(target: T, patch: DeepPartial<T>): T {
  if (patch === undefined || patch === null) return target;

  const result: any = Array.isArray(target) ? [...(target as any)] : {...(target as any)};

  for (const key in patch) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;

    const patchValue = (patch as any)[key];

    if (patchValue !== null && typeof patchValue === 'object' && !Array.isArray(patchValue)) {
      const targetValue = (target as any)[key] ?? {};
      result[key] = deepMerge(targetValue, patchValue);
    } else if (typeof patchValue === 'function') {
      // Should be impossible due to DeepOptionalNoFn, but guard anyway
      throw new Error('Function properties are not allowed in deepMerge patch');
    } else {
      result[key] = patchValue;
    }
  }

  return result as T;
}

export function objectHasOwnProperty<T>(obj: T, key: keyof T) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function mapToRecord<K extends PropertyKey, V>(map: Map<K, V>): Record<K, V> {
  return Object.fromEntries(map) as Record<K, V>;
}

export function isNonNullable<T>(value: T | null | undefined): value is NonNullable<T> {
  return value !== void 0 && value !== null; // Excludes both null and undefined
}

export function nullifier(...nullifiables: any[]) {
  nullifiables.forEach((nullifiable) => {
    if (nullifiable) {
      try {
        // @ts-ignore
        nullifiable = void 0;
      } catch (e) {
        console.error(e);
      }
    }
  });
}
export function prefixKeys<T extends object, P extends string>(obj: T, prefix: P): PrefixKeys<T, P> {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [`${prefix}${key.charAt(0).toUpperCase()}${key.slice(1)}`, value])) as PrefixKeys<T, P>;
}

/**
 *
 * @param a array 1
 * @param b array 2
 * @returns Returns true if arrays are equal, false otherwise
 */
export function compareArrays<T extends Record<string, unknown>>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    const objA = a[i]!;
    const objB = b[i]!;
    const keysA = Object.keys(objA);

    if (keysA.length !== Object.keys(objB).length) return false;

    for (let k = 0; k < keysA.length; k++) {
      const key = keysA[k]!;
      if (objA[key] !== objB[key]) return false;
    }
  }

  return true;
}
