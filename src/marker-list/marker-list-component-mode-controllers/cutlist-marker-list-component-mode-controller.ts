import {MarkerListItem} from '../marker-list-item';
import {MarkerListComponentModeController} from './marker-list-component-mode-controller';

export class CutlistMarkerListComponentModeController implements MarkerListComponentModeController {
  public isReorderingEnabled(): boolean {
    return true;
  }

  public sortMarkers(markers: MarkerListItem[]): MarkerListItem[] {
    return markers;
  }

  public getNextMarker(markers: MarkerListItem[], marker: MarkerListItem): MarkerListItem | undefined {
    const sortedMarkers = this.sortMarkers(markers);
    const currentIndex = sortedMarkers.findIndex((m) => m === marker);
    if (currentIndex < sortedMarkers.length - 1) {
      return sortedMarkers[currentIndex + 1];
    } else {
      return undefined;
    }
  }
}
