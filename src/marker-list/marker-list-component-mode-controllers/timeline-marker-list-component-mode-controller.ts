import {MarkerListItem} from '../marker-list-item';
import {MarkerListComponentModeController} from './marker-list-component-mode-controller';

export class TimelineMarkerListComponentModeController implements MarkerListComponentModeController {
  public isReorderingEnabled(): boolean {
    return false;
  }

  public sortMarkers(markers: MarkerListItem[]): MarkerListItem[] {
    return markers.sort((a, b) => {
      if (a.start !== undefined && b.start !== undefined && a.start !== b.start) {
        return a.start - b.start;
      } else if (a.end !== undefined && b.end !== undefined && a.end !== b.end) {
        return a.end - b.end;
      } else {
        return 0;
      }
    });
  }

  public getNextMarker(markers: MarkerListItem[], marker: MarkerListItem): MarkerListItem | undefined {
    const sortedMarkers = this.sortMarkers(markers);
    return sortedMarkers.find(
      (m) => m.start !== undefined && marker.start !== undefined && (m.start > marker.start || (m.start === marker.start && m.end !== undefined && marker.end !== undefined && m.end > marker.end))
    );
  }
}
