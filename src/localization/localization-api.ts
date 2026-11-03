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

import type {Observable} from 'rxjs';
import type {Destroyable} from '../common/capabilities';

/**
 * Default localization values, keyed by localization key. Also determines the set of valid localization keys.
 */
export const DEFAULT_LOCALIZATION = {
  live: 'LIVE',
  markIn: 'MARK IN',
  markOut: 'MARK OUT',
} as const;

/**
 * Valid localization keys, derived from {@link DEFAULT_LOCALIZATION}.
 */
export type LocalizationKey = keyof typeof DEFAULT_LOCALIZATION;

/**
 * Localization overrides, keyed by localization key. Only keys present in {@link DEFAULT_LOCALIZATION} are valid.
 */
export type Localizations = Partial<Record<LocalizationKey, string>>;

/**
 * Configuration for the localization subsystem.
 */
export interface LocalizationConfig {
  /**
   * Localization overrides for strings displayed in the player and its chroming. Only keys present in {@link DEFAULT_LOCALIZATION} are valid. Read-only: can only be set at construction, not changed afterwards.
   */
  localizations?: Localizations | undefined;
}

/**
 * Public API for player localization.
 */
export interface LocalizationApi {
  /**
   * Fetches the localized string for the given localization key. Falls back to the default localization value for that key if no override was configured.
   * @param key Localization key
   */
  get(key: LocalizationKey): string;
}

export interface LocalizationInternalApi extends LocalizationApi, Destroyable {
  /**
   * Internal method. Restores the localization from the session.
   * @param overrides Localization overrides to restore
   */
  restoreLocalization(overrides: Localizations | undefined): Observable<void>;
}

export interface LocalizationLocalApi extends LocalizationInternalApi {}

export interface LocalizationDetachedApi extends LocalizationInternalApi {}
