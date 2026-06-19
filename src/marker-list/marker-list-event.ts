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
import type {MarkerState, MarkerTrack} from '../media';

export enum MarkerListEventType {
  MARKER_LIST_ITEM_ACTION = 'MARKER_LIST_ITEM_ACTION',
  MARKER_LIST_ITEM_CLICK = 'MARKER_LIST_ITEM_CLICK',
  MARKER_LIST_ITEM_MOUSE_ENTER = 'MARKER_LIST_ITEM_MOUSE_ENTER',
  MARKER_LIST_ITEM_MOUSE_LEAVE = 'MARKER_LIST_ITEM_MOUSE_LEAVE',
  MARKER_LIST_ITEM_DELETE = 'MARKER_LIST_ITEM_DELETE',
  MARKER_LIST_TRACKS_LOADED = 'MARKER_LIST_TRACKS_LOADED',
}

export interface MarkerListActionEventData extends Serializable {
  action: string;
  item: MarkerState;
}

export interface MarkerListMouseEventData extends Serializable {
  item: MarkerState;
  trackId: MarkerTrack['id'];
}

export interface MarkerListDeleteEventData extends Serializable {
  item: MarkerState;
  source?: MarkerTrack | undefined;
}

export interface MarkerListTracksLoadedEventData extends Serializable {
  tracks: MarkerTrack[];
}

export type MarkerListEventTypeDataMap = {
  [MarkerListEventType.MARKER_LIST_ITEM_ACTION]: MarkerListActionEventData;
  [MarkerListEventType.MARKER_LIST_ITEM_CLICK]: MarkerListMouseEventData;
  [MarkerListEventType.MARKER_LIST_ITEM_MOUSE_ENTER]: MarkerListMouseEventData;
  [MarkerListEventType.MARKER_LIST_ITEM_MOUSE_LEAVE]: MarkerListMouseEventData;
  [MarkerListEventType.MARKER_LIST_ITEM_DELETE]: MarkerListDeleteEventData;
  [MarkerListEventType.MARKER_LIST_TRACKS_LOADED]: MarkerListTracksLoadedEventData;
};

export type MarkerListEvent = {
  [K in MarkerListEventType]: {
    type: K;
    data: MarkerListEventTypeDataMap[K];
  };
}[keyof MarkerListEventTypeDataMap];
