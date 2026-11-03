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

import {DEFAULT_LOCALIZATION, type LocalizationKey, type Localizations} from './localization-api';

export class LocalizationInternalUtil {
  /**
   * Filters localization overrides down to only the keys present in {@link DEFAULT_LOCALIZATION}.
   */
  static sanitizeLocalization(overrides: Localizations | undefined): Localizations | undefined {
    if (!overrides) {
      return undefined;
    }
    const sanitized: Localizations = {};
    for (const key of Object.keys(DEFAULT_LOCALIZATION) as LocalizationKey[]) {
      if (overrides[key] !== undefined) {
        sanitized[key] = overrides[key];
      }
    }
    return sanitized;
  }
}
