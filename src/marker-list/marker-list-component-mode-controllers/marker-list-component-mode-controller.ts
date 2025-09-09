import {MarkerListItem} from '../marker-list-item';

export interface MarkerListComponentModeController {
  isReorderingEnabled(): boolean;
  sortMarkers(markers: MarkerListItem[]): MarkerListItem[];
  getNextMarker(markers: MarkerListItem[], marker: MarkerListItem): MarkerListItem | undefined;
}
