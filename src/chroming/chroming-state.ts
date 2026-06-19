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

import type {Track} from '../media';
import {ChromingTheme, type ChromingThemeConfigTypes, type HelpMenuGroup, type VideoSafeZone} from './chroming-api';
import type {ChromingMarkerBarState} from './chroming-marker-bar';

export interface ChromingState {
  theme: ChromingTheme;
  themeConfig: Partial<ChromingThemeConfigTypes> | undefined;
  watermark: string | undefined;
  safeZones: VideoSafeZone[];
  helpMenuGroups: HelpMenuGroup[];
  progressBarMarkerBar: ChromingMarkerBarState | undefined;
  markerBars: ChromingMarkerBarState[];
  thumbnailTrackId: Track['id'] | undefined;
}
