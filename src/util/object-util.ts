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

export function isNullOrUndefined(value: any) {
  return value === null || value === void 0;
}

export function hasFunction(obj: any, functionName: string): boolean {
  return functionName in obj && typeof obj[functionName] === 'function';
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
