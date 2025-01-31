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

export class StringUtil {
  public static isNullUndefinedOrWhitespace(value: string | undefined | null): boolean {
    if (typeof value === void 0 || value == null) {
      return true;
    }
    return `${value}`.replace(/\s/g, '').length < 1;
  }

  public static isNonEmpty(value: string | undefined | null): boolean {
    return !this.isNullUndefinedOrWhitespace(value);
  }

  public static isEmpty(value: string | undefined | null): boolean {
    return !this.isNonEmpty(value);
  }

  public static toArrayBuffer(str: string): ArrayBuffer {
    const encoder = new TextEncoder();
    return encoder.encode(str).buffer;
  }
}
