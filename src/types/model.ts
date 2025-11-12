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

export interface TimeObservation {}

export interface MomentObservation extends TimeObservation {
  time: number;
}

export interface PeriodObservation extends TimeObservation {
  start?: number | null;
  end?: number | null;
}

export interface HelpMenuGroup {
  name: string;
  items: HelpMenuItem[];
}

export interface HelpMenuItem {
  name: string;
  description: string;
}

export interface ComponentVisibility {
  onHide$: Observable<void>;
  onShow$: Observable<void>;

  /**
   * Is component visible
   */
  isVisible(): boolean;

  /**
   * Toggles component visibility
   */
  toggleVisibility(): void;

  /**
   * Hides component
   */
  hide(): void;

  /**
   * Shows component
   */
  show(): void;
}
