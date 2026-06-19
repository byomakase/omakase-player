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

import type {Serializable} from '../common/capabilities';
import type {
  AudioThemeConfig,
  ChromelessThemeConfig,
  ChromingTheme,
  ChromingThemeConfigTypes,
  DefaultThemeConfig,
  HelpMenuGroup,
  OmakaseThemeConfig,
  StampThemeConfig,
  VideoSafeZone,
} from './chroming-api';
import type {ChromingState} from './chroming-state';
import type {ChromingSession} from '../session';
import type {ChromingMarkerBarState} from './chroming-marker-bar';
import type {Track} from '../media';

export enum ChromingEventType {
  CHROMING_SESSION_RESTORED = 'CHROMING_SESSION_RESTORED',

  CHROMING_CHANGE = 'CHROMING_CHANGE',

  CHROMING_WATERMARK_UPDATE = 'CHROMING_WATERMARK_UPDATE',
  CHROMING_SAFE_ZONES_CHANGE = 'CHROMING_SAFE_ZONES_CHANGE',
  CHROMING_HELP_MENU_CHANGE = 'CHROMING_HELP_MENU_CHANGE',
  CHROMING_MARKER_BAR_CHANGE = 'CHROMING_MARKER_BAR_CHANGE',
  CHROMING_THUMBNAIL_TRACK_CHANGE = 'CHROMING_THUMBNAIL_TRACK_CHANGE',
  CHROMING_THEME_CONFIG_CHANGE = 'CHROMING_THEME_CONFIG_CHANGE',
}

export interface ChromingChangeEventData extends Serializable {
  chroming: ChromingState;
}

export interface ChromingSessionRestoredEventData extends Serializable {
  chromingSession: ChromingSession;
}

export interface ChromingWatermarkUpdateEventData extends Serializable {
  watermark: string | undefined;
}

export interface ChromingSafeZoneChangeEventData extends Serializable {
  safeZones: VideoSafeZone[];
}

export interface ChromingHelpMenuChangeEventData extends Serializable {
  helpMenuGroups: HelpMenuGroup[];
}

export interface ChromingMarkerBarChangeEventData extends Serializable {
  progressBarMarkerBar: ChromingMarkerBarState | undefined;
  markerBars: ChromingMarkerBarState[];
}

export interface ChromingThumbnailTrackChangeEventData extends Serializable {
  thumbnailTrackId: Track['id'] | undefined;
}

export interface ChromingThemeConfigChangeEventData extends Serializable {
  theme: ChromingTheme;
  themeConfig: Partial<ChromingThemeConfigTypes> | undefined;
}

export type ChromingEventTypeDataMap = {
  [ChromingEventType.CHROMING_CHANGE]: ChromingChangeEventData;
  [ChromingEventType.CHROMING_SESSION_RESTORED]: ChromingSessionRestoredEventData;
  [ChromingEventType.CHROMING_WATERMARK_UPDATE]: ChromingWatermarkUpdateEventData;
  [ChromingEventType.CHROMING_SAFE_ZONES_CHANGE]: ChromingSafeZoneChangeEventData;
  [ChromingEventType.CHROMING_HELP_MENU_CHANGE]: ChromingHelpMenuChangeEventData;
  [ChromingEventType.CHROMING_MARKER_BAR_CHANGE]: ChromingMarkerBarChangeEventData;
  [ChromingEventType.CHROMING_THUMBNAIL_TRACK_CHANGE]: ChromingThumbnailTrackChangeEventData;
  [ChromingEventType.CHROMING_THEME_CONFIG_CHANGE]: ChromingThemeConfigChangeEventData;
};

export type ChromingEvent = {
  [K in ChromingEventType]: {
    type: K;
    data: ChromingEventTypeDataMap[K];
  };
}[keyof ChromingEventTypeDataMap];
