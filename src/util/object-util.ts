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

export function omitKeys<T extends object, K extends keyof T>(obj: T | undefined, ...keys: K[]): Omit<T, K> {
  if (obj === undefined) {
    return {} as Omit<T, K>;
  }
  const result = {...obj} as Record<string, unknown>;
  for (const key of keys as string[]) {
    delete result[key];
  }
  return result as Omit<T, K>;
}

export function omitKeysOf<T extends object, U extends object>(obj: T | undefined, shape: U): Omit<T, keyof U> {
  return omitKeys(obj, ...(Object.keys(shape) as Array<keyof T & keyof U>)) as unknown as Omit<T, keyof U>;
}

export function isEmptyObject(obj: object): boolean {
  return Object.keys(obj).length === 0;
}

export function hasNonUndefinedValues(obj: object): boolean {
  return Object.values(obj).some((v) => v !== undefined);
}

export function hasProperty(obj: any, prop: string): boolean {
  return prop in obj;
}

export function callFunctionByName<T extends object>(obj: T, fnName: keyof T, ...args: any[]): any {
  const fn = obj[fnName];
  if (typeof fn === 'function') {
    return fn.apply(obj, args);
  }
  throw new Error(`Function '${String(fnName)}' does not exist or is not callable.`);
}

export function removeEmptyValues<T extends Record<string, any>>(obj: T): T {
  Object.keys(obj).forEach((key) => {
    if (obj[key] === void 0) {
      delete obj[key];
    }
  });
  return obj;
}

export function fastHashObject(obj: unknown): number {
  let h = 0x811c9dc5 | 0; // FNV-1a offset basis

  function hashStr(s: string) {
    for (let i = 0, len = s.length; i < len; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193); // FNV-1a prime
    }
  }

  function walk(val: unknown) {
    if (val === null) {
      h = Math.imul(h ^ 0x6e, 0x01000193); // 'n'
      return;
    }
    switch (typeof val) {
      case 'string':
        h = Math.imul(h ^ 0x73, 0x01000193); // type tag 's'
        hashStr(val);
        break;
      case 'number':
        h = Math.imul(h ^ 0x64, 0x01000193); // type tag 'd'
        hashStr('' + val);
        break;
      case 'boolean':
        h = Math.imul(h ^ (val ? 0x74 : 0x66), 0x01000193); // 't' or 'f'
        break;
      case 'object':
        if (Array.isArray(val)) {
          h = Math.imul(h ^ 0x5b, 0x01000193); // '['
          for (let i = 0, len = val.length; i < len; i++) {
            walk(val[i]);
          }
        } else {
          h = Math.imul(h ^ 0x7b, 0x01000193); // '{'
          const keys = Object.keys(val as object);
          for (let i = 0, len = keys.length; i < len; i++) {
            const k = keys[i]!;
            hashStr(k);
            walk((val as Record<string, unknown>)[k]);
          }
        }
        break;
      default:
        break;
    }
  }

  walk(obj);
  return h >>> 0;
}
