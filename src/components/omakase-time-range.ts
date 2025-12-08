import {MediaTimeRange} from 'media-chrome';
import {BehaviorSubject, Observable, Subject, takeUntil} from 'rxjs';
import {MarkerApi} from '../api';
import {MarkerInitEvent, MarkerCreateEvent, MarkerDeleteEvent, MarkerUpdateEvent, MarkerSelectedEvent, MarkerMouseEvent, MarkerVttCue} from '../types';
import {completeUnsubscribeSubjects, nextCompleteObserver, nextCompleteSubject, passiveObservable} from '../util/rxjs-util';
import {MomentMarker, PeriodMarker} from '../timeline';
import {TimeRangeMarkerTrackApi, TimeRangeMarkerTrackVttLoadOptions} from '../api/time-range-marker-track-api';
import {MarkerVttFile} from '../vtt';
import {VttAdapter} from '../common/vtt-adapter';
import {MarkerUtil} from '../timeline/marker/marker-util';
import {MediaUIAttributes} from 'media-chrome/dist/constants';

const calcTimeFromRangeValue = (el: any, value: number = el.range.valueAsNumber): number => {
  const startTime = Number.isFinite(el.mediaSeekableStart) ? el.mediaSeekableStart : 0;
  // Prefer `mediaDuration` when available and finite.
  const endTime = Number.isFinite(el.mediaDuration) ? el.mediaDuration : el.mediaSeekableEnd;
  if (Number.isNaN(endTime)) return 0;
  return value * (endTime - startTime) + startTime;
};

const closestComposedNode = <T extends Element = Element>(childNode: Element, selector: string): T | null => {
  if (!childNode) return null;
  const closest = childNode.closest(selector);
  if (closest) return closest as T;
  return closestComposedNode((childNode.getRootNode() as ShadowRoot).host, selector);
};

const markerElementPrefix = 'omakase-marker';

export class OmakaseTimeRange extends MediaTimeRange implements TimeRangeMarkerTrackApi {
  onSeek$: Subject<number> = new Subject();
  onMouseOver$: Subject<number> = new Subject();
  onMarkerInit$: Subject<MarkerInitEvent> = new Subject();
  onMarkerCreate$: Subject<MarkerCreateEvent> = new Subject();
  onMarkerDelete$: Subject<MarkerDeleteEvent> = new Subject();
  onMarkerUpdate$: Subject<MarkerUpdateEvent> = new Subject();
  onMarkerSelected$: Subject<MarkerSelectedEvent> = new Subject();
  onMarkerMouseEnter$: Subject<MarkerMouseEvent> = new Subject();
  onMarkerMouseLeave$: Subject<MarkerMouseEvent> = new Subject();
  onMarkerClick$: Subject<MarkerMouseEvent> = new Subject();
  onVttLoaded$ = new BehaviorSubject<MarkerVttFile | undefined>(undefined);

  private _previewBox: HTMLElement;
  private _lastPreviewTime?: number;
  private _markerTrack: HTMLDivElement;
  private _markers: MarkerApi[] = [];
  private _destroyed$ = new Subject<void>();
  private _markerVttAdapter = new VttAdapter(MarkerVttFile);

  constructor() {
    super();
    const style = document.createElement('style');
    style.textContent = `
      #appearance:has(+ #range:hover) {
        height: var(--time-range-hover-height, var(--media-range-track-height, 4px));
      }
      #thumb {
        z-index: 2;
        bottom: var(--time-range-thumb-bottom, unset);
      }
      #markers {
        position: absolute;
        width: 100%;
        z-index: 1;
        height: var(--time-range-markers-height, 100%);
        bottom: var(--time-range-markers-bottom-offset, 0);
        background: var(--time-range-background, transparent);
      }
      .marker {
        position: absolute;
        height: 100%;
        outline: var(--time-range-marker-border-size, 1px) solid var(--time-range-marker-border-color, black);
        min-width: var(--time-range-marker-min-width, 5px);
        opacity: var(--time-range-marker-opacity, 0.7)
      }
      .marker-halo {
        position: absolute;
        width: 100%;
        height: var(--time-range-marker-halo-height, 1px);
        bottom: calc(-2px - var(--time-range-marker-halo-height, 1px));
        display: none;
      }
      .marker.focused {
        height: calc(100% + var(--time-range-marker-focus-height, 3px));
        top: var(--time-range-marker-focus-top, calc(-1 * var(--time-range-marker-focus-height, 3px)));
        z-index: 1;
        filter: drop-shadow(0 4px 4px rgba(0, 0, 0, 0.25));
      }
      .marker.focused .marker-halo {
        display: block;
      }
    `;

    this.shadowRoot!.appendChild(style);
    this._previewBox = this.shadowRoot!.querySelector('[part~="preview-box"]')!;
    const markerTrackContainer = this.shadowRoot!.querySelector('#appearance')!;
    this._markerTrack = document.createElement('div');
    this.updateClasses();
    this._markerTrack.id = 'markers';
    markerTrackContainer.appendChild(this._markerTrack);
    const rangeElement = this.shadowRoot!.querySelector('#range') as HTMLElement;
    rangeElement.addEventListener('mousemove', (event: MouseEvent) => {
      for (const marker of this._markers) {
        const markerElement = this._markerTrack.querySelector(`#${markerElementPrefix}-${marker.id}`);
        if (markerElement) {
          if (
            event.clientX >= markerElement.getBoundingClientRect().x &&
            event.clientX < markerElement.getBoundingClientRect().x + markerElement.getBoundingClientRect().width &&
            (this.getAttribute('omakase') === null ||
              (event.clientY >= markerElement.getBoundingClientRect().y && event.clientY < markerElement.getBoundingClientRect().y + markerElement.getBoundingClientRect().height))
          ) {
            if (!markerElement.classList.contains('focused')) {
              markerElement.classList.add('focused');
              this.onMarkerMouseEnter$.next({marker});
            }
          } else if (markerElement.classList.contains('focused')) {
            markerElement.classList.remove('focused');
            this.onMarkerMouseLeave$.next({marker});
          }
        }
      }
    });
    rangeElement.addEventListener('mouseleave', () => {
      for (const marker of this._markers) {
        const markerElement = this._markerTrack.querySelector(`#${markerElementPrefix}-${marker.id}`);
        if (markerElement && markerElement.classList.contains('focused')) {
          markerElement.classList.remove('focused');
          this.onMarkerMouseLeave$.next({marker});
        }
      }
    });
    rangeElement.addEventListener('click', () => {
      const markerElement = this._markerTrack.querySelector(`.focused`);
      if (markerElement) {
        const marker = this._markers.find((marker) => marker.id === markerElement.id.replace(`${markerElementPrefix}-`, ''));
        if (marker) {
          this.onMarkerClick$.next({marker});
        }
      }
    });
  }

  get name(): string {
    return this.getAttribute('name') ?? '';
  }

  override handleEvent(evt: Event | MouseEvent): void {
    if (evt.type === 'input') {
      if (this._lastPreviewTime) {
        this.onSeek$.next(this._lastPreviewTime);
        delete this._lastPreviewTime;
      } else {
        const detail = calcTimeFromRangeValue(this);
        this.onSeek$.next(detail);
      }
      this.updateBar();
    } else if (evt.type === 'pointermove' && evt instanceof MouseEvent) {
      const duration = this.mediaSeekableEnd;
      if (duration) {
        const rects = this.getElementRects(this._previewBox);
        let pointerRatio = (evt.clientX - rects.range.left) / rects.range.width;
        pointerRatio = Math.max(0, Math.min(1, pointerRatio));
        const previewTime = pointerRatio * duration;
        this._lastPreviewTime = previewTime;
        this.onMouseOver$.next(previewTime);
      }
      super.handleEvent(evt);
    } else {
      super.handleEvent(evt);
    }
  }

  override attributeChangedCallback(attrName: string, oldValue: string | null, newValue: string | null): void {
    if (attrName === MediaUIAttributes.MEDIA_BUFFERED && newValue) {
      const bufferingStart = newValue.split(':')[0];
      if (parseFloat(bufferingStart) > 0 && parseFloat(bufferingStart) < 0.1) {
        newValue = newValue.replace(bufferingStart, '0');
        this.setAttribute(MediaUIAttributes.MEDIA_BUFFERED, newValue);
      }
    }
    super.attributeChangedCallback(attrName, oldValue, newValue);
  }

  getMarkers(): MarkerApi[] {
    return this._markers;
  }

  addMarker(marker: MarkerApi): MarkerApi {
    this._markers.push(marker);
    this.updateClasses();
    this.addMarkerElement(marker);
    this.onMarkerCreate$.next({marker});
    (marker as MomentMarker).onChange$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.updateMarkerPosition(marker);
      this.onMarkerUpdate$.next({marker, oldValue: {...marker, timeObservation: event.oldTimeObservation} as MomentMarker});
    });
    return marker;
  }

  removeMarker(id: string): void {
    const marker = this._markers.find((marker) => marker.id === id);
    if (marker) {
      this._markers.splice(this._markers.indexOf(marker), 1);
      this._markerTrack.querySelector(`#${markerElementPrefix}-${id}`)?.remove();
      this.onMarkerDelete$.next({marker});
    }
    this.updateClasses();
  }

  updateMarker(id: string, data: Partial<MarkerApi>): void {
    const marker = this._markers.find((marker) => marker.id === id);
    if (marker) {
      const oldValue = {...marker};
      Object.assign(marker, data);
      this.updateMarkerPosition(marker);
      this.onMarkerUpdate$.next({oldValue, marker});
    }
  }

  toggleMarker(id: string): void {
    throw new Error('Method not supported.');
  }

  getSelectedMarker(): MarkerApi | undefined {
    throw new Error('Method not supported.');
  }

  destroy(): void {
    nextCompleteSubject(this._destroyed$);
    completeUnsubscribeSubjects(this.onMarkerCreate$, this.onMarkerDelete$, this.onMarkerUpdate$, this.onMarkerInit$);
    this.remove();
  }

  removeAllMarkers(): void {
    this._markers = [];
    this._markerTrack.innerHTML = '';
    this.updateClasses();
  }

  loadVtt(vttUrl: string, options?: TimeRangeMarkerTrackVttLoadOptions): Observable<MarkerVttFile | undefined> {
    return passiveObservable((observer) => {
      this._markerVttAdapter.loadVtt(vttUrl, {...options}).subscribe((vttFile) => {
        const markers = vttFile?.cues.map((cue, index) => (options?.vttMarkerCreateFn ? options.vttMarkerCreateFn(cue, index) : MarkerUtil.createPeriodMarkerFromCue(cue)));
        if (markers) {
          for (const marker of markers) {
            this.addMarker(marker);
          }
        }
        this.onVttLoaded$.next(vttFile);
        this.onMarkerInit$.next({markers: this._markers});
        nextCompleteObserver(observer, vttFile);
      });
    });
  }

  private getElementRects(box: HTMLElement) {
    // Get the element that enforces the bounds for the time range boxes.
    const bounds = (this.getAttribute('bounds') ? closestComposedNode(this, `#${this.getAttribute('bounds')}`) : this.parentElement) ?? this;

    const boundsRect = bounds.getBoundingClientRect();
    const rangeRect = this.range.getBoundingClientRect();

    // Use offset dimensions to include borders.
    const width = box.offsetWidth;
    const min = -(rangeRect.left - boundsRect.left - width / 2);
    const max = boundsRect.right - rangeRect.left - width / 2;

    return {
      box: {width, min, max},
      bounds: boundsRect,
      range: rangeRect,
    };
  }

  private addMarkerElement(marker: MarkerApi) {
    const markerStart = (marker as MomentMarker).timeObservation.time ?? (marker as PeriodMarker).timeObservation.start;
    const markerEnd = (marker as PeriodMarker).timeObservation.end ?? markerStart;
    const mediaDuration = this.mediaDuration ?? 0;
    const markerElement = document.createElement('div');
    markerElement.classList.add('marker');
    markerElement.id = `${markerElementPrefix}-${marker.id}`;
    markerElement.style.backgroundColor = marker.style.color;
    const markerPosition = (100 * markerStart) / mediaDuration;
    const markerSize = (100 * (markerEnd - markerStart)) / mediaDuration;
    markerElement.style.width = `${markerSize}%`;
    markerElement.style.left = `${markerPosition}%`;
    const markerHalo = document.createElement('div');
    markerHalo.classList.add('marker-halo');
    markerHalo.style.backgroundColor = marker.style.color;
    markerElement.appendChild(markerHalo);
    this._markerTrack.appendChild(markerElement);
  }

  private updateMarkerPosition(marker: MarkerApi) {
    const markerElement = this._markerTrack.querySelector(`#${markerElementPrefix}-${marker.id}`) as HTMLElement;
    if (markerElement) {
      const markerStart = (marker as MomentMarker).timeObservation.time ?? (marker as PeriodMarker).timeObservation.start;
      const markerEnd = (marker as PeriodMarker).timeObservation.end ?? markerStart;
      const mediaDuration = this.mediaDuration ?? 0;
      const markerPosition = (100 * markerStart) / mediaDuration;
      const markerSize = (100 * (markerEnd - markerStart)) / mediaDuration;
      markerElement.style.width = `${markerSize}%`;
      markerElement.style.left = `${markerPosition}%`;
    }
  }

  private updateClasses() {
    const hasMarkers = !!this._markers.length;
    const hasMarkerClass = 'has-markers';
    const parentControlBar = this.closest('media-control-bar');
    if (hasMarkers) {
      this.classList.add(hasMarkerClass);
      if (parentControlBar) {
        parentControlBar.classList.add(hasMarkerClass);
      }
    } else {
      this.classList.remove(hasMarkerClass);
      if (parentControlBar) {
        parentControlBar.classList.remove(hasMarkerClass);
      }
    }
  }
}
