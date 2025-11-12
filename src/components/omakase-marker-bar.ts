import {Subject, takeUntil} from 'rxjs';
import {VttAdapter} from '../common/vtt-adapter';
import {MarkerUtil} from '../timeline/marker/marker-util';
import {CryptoUtil} from '../util/crypto-util';
import {destroyer} from '../util/destroy-util';
import {isNullOrUndefined} from '../util/object-util';
import {MarkerTrackConfig} from '../video/model';
import {MarkerVttFile} from '../vtt';
import {OmakaseMarkerTrack} from './omakase-marker-track';
import {nextCompleteSubject} from '../util/rxjs-util';

export interface MarkerTrackComponentConfig extends MarkerTrackConfig {
  mediaDuration: number;
}

export class OmakaseMarkerBar extends HTMLElement {
  private _markerVttAdapter = new VttAdapter(MarkerVttFile);
  private _markerTracks: OmakaseMarkerTrack[] = [];
  private _destroyed$ = new Subject<void>();

  get markerTracks(): OmakaseMarkerTrack[] {
    return this._markerTracks;
  }

  createMarkerTrack(config: MarkerTrackComponentConfig) {
    const markerTrack = document.createElement('omakase-marker-track') as OmakaseMarkerTrack;
    markerTrack.setAttribute('mediaduration', config.mediaDuration.toString());
    if (this.getAttribute('editorial') !== null) {
      markerTrack.setAttribute('editorial', '');
    }
    markerTrack.uuid = config.id ?? CryptoUtil.uuid();
    if (config.description) {
      markerTrack.setAttribute('name', config.description);
    }
    if (config.vttUrl) {
      this._markerVttAdapter.loadVtt(config.vttUrl, {...config.vttLoadOptions}).subscribe((vttFile) => {
        const markers = vttFile?.cues.map((cue, index) => (config.vttMarkerCreateFn ? config.vttMarkerCreateFn(cue, index) : MarkerUtil.createPeriodMarkerFromCue(cue)));
        if (markers) {
          for (const marker of markers) {
            markerTrack.addMarker(marker);
          }
        }
        markerTrack.onMarkerInit$.next({markers: markerTrack.getMarkers()});
        markerTrack.onVttLoaded$.next(vttFile);
      });
    }
    this.appendChild(markerTrack);
    if (!isNullOrUndefined(config.visible) && !config.visible) {
      markerTrack.hide();
    }
    this._markerTracks.push(markerTrack);
    markerTrack.onDestroy$.pipe(takeUntil(this._destroyed$)).subscribe(() => {
      this._markerTracks.splice(this._markerTracks.indexOf(markerTrack), 1);
    });
    return markerTrack;
  }

  disconnectedCallback() {
    nextCompleteSubject(this._destroyed$);
  }

  clearMarkerTracks() {
    destroyer(...this._markerTracks);
    this._markerTracks = [];
  }
}
