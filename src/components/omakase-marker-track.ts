import {BehaviorSubject, fromEvent, Observable, Subject, takeUntil} from 'rxjs';
import {completeUnsubscribeSubjects, nextCompleteSubject} from '../util/rxjs-util';
import {MomentMarker, PeriodMarker} from '../timeline';
import {MarkerTrackApi} from '../api/marker-track-api';
import {MarkerCreateEvent, MarkerDeleteEvent, MarkerInitEvent, MarkerSelectedEvent, MarkerUpdateEvent, MomentObservation, PeriodObservation} from '../types';
import {MarkerVttFile} from '../vtt';
import {MarkerApi} from '../api';
import {isNullOrUndefined} from '../util/object-util';

const markerElementPrefix = 'omakase-marker';
const markerElementActiveClass = 'active-marker';
const markerElementFocusClass = 'focused-marker';
const markerElementReadonlyClass = 'readonly-marker';

export class OmakaseMarkerTrack extends HTMLElement implements MarkerTrackApi {
  private _container?: HTMLDivElement;
  private _uuid?: string;
  private _destroyed$ = new Subject<void>();
  private _draggingPointMarker?: HTMLDivElement;
  private _draggingPeriodMarker?: HTMLDivElement;
  private _draggingPeriodMarkerEnd?: 'start' | 'end';
  private _markerMoved = false;
  private _markerDragStartTime?: Date;
  private _markerDragDelay = 100;
  private _markers: Array<MomentMarker | PeriodMarker> = [];
  private _selectedMarker?: MomentMarker | PeriodMarker;
  private _mouseupListener?: (event: MouseEvent) => void;
  private _mousemoveListener?: (event: MouseEvent) => void;
  private _resizeObserver = new ResizeObserver((entries) => {
    for (const marker of this._markers) {
      this.updateMarkerPosition(marker);
    }
  });

  onShow$ = new Subject<void>();
  onHide$ = new Subject<void>();
  onMarkerInit$ = new Subject<MarkerInitEvent>();
  onMarkerCreate$ = new Subject<MarkerCreateEvent>();
  onMarkerDelete$ = new Subject<MarkerDeleteEvent>();
  onMarkerUpdate$ = new Subject<MarkerUpdateEvent>();
  onMarkerSelected$ = new Subject<MarkerSelectedEvent>();
  onVttLoaded$ = new BehaviorSubject<MarkerVttFile | undefined>(undefined);

  get mediaDuration(): number {
    return parseFloat(this.getAttribute('mediaduration') ?? '0');
  }

  set mediaDuration(duration: number) {
    this.setAttribute('mediaduration', duration.toString());
  }

  get name() {
    return this.getAttribute('name') ?? '';
  }

  get uuid() {
    return this._uuid;
  }

  set uuid(uuid: string | undefined) {
    this._uuid = uuid;
  }

  get onDestroy$(): Observable<void> {
    return this._destroyed$;
  }

  connectedCallback() {
    this._container = document.createElement('div');
    this._container.classList.add('omakase-marker-track-container');
    this._container.onclick = (event) => {
      event.stopPropagation();
    };

    fromEvent(window, 'resize')
      .pipe(takeUntil(this._destroyed$))
      .subscribe({
        next: () => {
          for (const marker of this._markers) {
            this.updateMarkerSize(marker);
          }
        },
      });

    this._mouseupListener = this.clearDraggingMarker.bind(this);
    document.addEventListener('mouseup', this._mouseupListener);
    this._mousemoveListener = this.moveDraggingMarker.bind(this);
    document.addEventListener('mousemove', this._mousemoveListener);
    this.appendChild(this._container);
    this._resizeObserver.observe(this._container);
  }

  disconnectedCallback() {
    if (this._mouseupListener) {
      document.removeEventListener('mouseup', this._mouseupListener);
    }
    if (this._mousemoveListener) {
      document.removeEventListener('mousemove', this._mousemoveListener);
    }
    this._resizeObserver.disconnect();
    nextCompleteSubject(this._destroyed$);
  }

  getMarkers(): MarkerApi[] {
    return this._markers;
  }

  getSelectedMarker(): MarkerApi | undefined {
    return this._selectedMarker;
  }

  addMarker(marker: Partial<MarkerApi>) {
    if (this.isMomentMarker(marker)) {
      return this.addMomentMarker(marker as MomentMarker);
    } else if (this.isPeriodMarker(marker)) {
      return this.addPeriodMarker(marker as PeriodMarker);
    } else {
      throw new Error('Marker type not supported');
    }
  }

  removeMarker(id: string): void {
    const marker = this._markers.find((marker) => marker.id === id);
    if (marker) {
      this._markers.splice(this._markers.indexOf(marker), 1);
      this._container!.querySelector(`#${markerElementPrefix}-${id}`)?.remove();
      this.onMarkerDelete$.next({marker});
    }
  }

  removeAllMarkers(): void {
    for (const marker of [...this._markers]) {
      this.removeMarker(marker.id);
    }
  }

  updateMarker(id: string, data: Partial<MarkerApi>): void {
    let marker = this._markers.find((marker) => marker.id === id);
    if (marker) {
      const oldValue = {...marker} as any;
      Object.assign(marker, data);
      this.onMarkerUpdate$.next({oldValue, marker});
      this.updateMarkerPosition(marker);
      this.updateMarkerColor(marker);
    }
  }

  toggleMarker(id: string): void {
    this._container!.querySelectorAll(`.${markerElementActiveClass}`).forEach((element) => {
      element.classList.remove(markerElementActiveClass);
    });
    if (this._selectedMarker?.id !== id) {
      this._container?.querySelector(`#${markerElementPrefix}-${id}`)?.classList.add(markerElementActiveClass);
      this._selectedMarker = this._markers.find((marker) => marker.id === id);
    } else {
      delete this._selectedMarker;
    }
    this.onMarkerSelected$.next({marker: this._selectedMarker});
  }

  destroy(): void {
    nextCompleteSubject(this._destroyed$);
    completeUnsubscribeSubjects(this.onVttLoaded$, this.onMarkerCreate$, this.onMarkerDelete$, this.onMarkerUpdate$, this.onMarkerInit$);
    this.remove();
  }

  isVisible(): boolean {
    return !this.classList.contains('d-none');
  }

  toggleVisibility(): void {
    this.classList.toggle('d-none');
  }

  hide(): void {
    this.classList.add('d-none');
    this.onHide$.next();
  }

  show(): void {
    this.classList.remove('d-none');
    this.onShow$.next();
  }

  private focusMarker(id: string): void {
    this.unfocusMarkers();
    this._container?.querySelector(`#${markerElementPrefix}-${id}`)?.classList.add(markerElementFocusClass);
  }

  private unfocusMarkers(): void {
    this._container!.querySelectorAll(`.${markerElementFocusClass}`).forEach((element) => {
      element.classList.remove(markerElementFocusClass);
    });
  }

  private isMomentMarker(marker: Partial<MarkerApi>) {
    return !isNullOrUndefined((marker as Partial<MomentMarker>).timeObservation?.time);
  }

  private isPeriodMarker(marker: Partial<MarkerApi>) {
    return !isNullOrUndefined((marker as Partial<PeriodMarker>).timeObservation?.start) || !isNullOrUndefined((marker as Partial<PeriodMarker>).timeObservation?.end);
  }

  private addMomentMarker(marker: MomentMarker) {
    const markerContainer = document.createElement('div');
    const circleDiv = document.createElement('div');
    circleDiv.style.width = this._container!.offsetHeight / 2 + 'px';
    circleDiv.style.left = `-${this._container!.offsetHeight / 4}px`;
    if (this.hasAttribute('editorial')) {
      circleDiv.style.height = this._container!.offsetHeight + 'px';
    } else {
      circleDiv.style.height = this._container!.offsetHeight / 2 + 'px';
      circleDiv.style.top = this._container!.offsetHeight / 4 + 'px';
    }
    circleDiv.style.backgroundColor = marker.style.color;
    circleDiv.classList.add('omakase-moment-marker-circle');
    markerContainer.appendChild(circleDiv);
    const lineDiv = document.createElement('div');
    lineDiv.style.height = this._container!.offsetHeight + 'px';
    lineDiv.style.backgroundColor = marker.style.color;
    lineDiv.classList.add('omakase-moment-marker-line');
    markerContainer.appendChild(lineDiv);
    const selectedDiv = document.createElement('div');
    selectedDiv.style.height = this._container!.offsetHeight + 'px';
    selectedDiv.style.backgroundColor = marker.style.color;
    if (this.hasAttribute('editorial')) {
      selectedDiv.style.left = circleDiv.style.left;
      selectedDiv.style.width = circleDiv.style.width;
    }
    selectedDiv.classList.add('omakase-moment-marker-selected-area');
    markerContainer.appendChild(selectedDiv);
    markerContainer.style.left = `${(marker.timeObservation.time * this._container!.offsetWidth) / this.mediaDuration}px`;
    markerContainer.classList.add('omakase-moment-marker');
    markerContainer.id = `${markerElementPrefix}-${marker.id}`;
    if (marker.editable) {
      markerContainer.onmousedown = (event) => {
        event.stopPropagation();
        this._draggingPointMarker = markerContainer;
        this._markerDragStartTime = new Date();
      };
    } else {
      markerContainer.classList.add(markerElementReadonlyClass);
    }
    markerContainer.onclick = (event) => {
      event.stopPropagation();
      if (!this._markerMoved) {
        this.toggleMarker(marker.id);
      }
    };
    markerContainer.onmouseenter = () => {
      this.focusMarker(marker.id);
    };
    this._container!.appendChild(markerContainer);
    this._markers.push(marker);
    this.onMarkerCreate$.next({marker});
    marker.onChange$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.updateMarkerPosition(marker);
      this.onMarkerUpdate$.next({marker, oldValue: {...marker, timeObservation: event.oldTimeObservation} as MomentMarker});
    });
    marker.onStyleChange$.pipe(takeUntil(this._destroyed$)).subscribe(() => {
      this.updateMarkerColor(marker);
      this.onMarkerUpdate$.next({marker, oldValue: {...marker} as MomentMarker});
    });
    return marker;
  }

  private addPeriodMarker(marker: PeriodMarker) {
    const markerContainer = document.createElement('div');
    const rectangleDiv = document.createElement('div');
    if (this.getAttribute('editorial') !== null) {
      rectangleDiv.style.height = this._container!.offsetHeight + 'px';
    } else {
      rectangleDiv.style.height = this._container!.offsetHeight / 2 + 'px';
      rectangleDiv.style.top = this._container!.offsetHeight / 4 + 'px';
    }
    rectangleDiv.style.backgroundColor = marker.style.color;
    rectangleDiv.classList.add('omakase-period-marker-rectangle');
    markerContainer.appendChild(rectangleDiv);
    const startLine = document.createElement('div');
    startLine.style.height = this._container!.offsetHeight + 'px';
    startLine.style.backgroundColor = marker.style.color;
    startLine.classList.add('omakase-period-marker-start-line');
    markerContainer.appendChild(startLine);
    const endLine = document.createElement('div');
    endLine.style.height = this._container!.offsetHeight + 'px';
    endLine.style.backgroundColor = marker.style.color;
    endLine.classList.add('omakase-period-marker-end-line');
    markerContainer.appendChild(endLine);
    const selectedDiv = document.createElement('div');
    selectedDiv.style.height = this._container!.offsetHeight + 'px';
    selectedDiv.style.backgroundColor = marker.style.color;
    selectedDiv.classList.add('omakase-period-marker-selected-area');
    markerContainer.appendChild(selectedDiv);
    markerContainer.style.left = (marker.timeObservation.start! * this._container!.offsetWidth) / this.mediaDuration + 'px';
    markerContainer.style.right = this._container!.offsetWidth - (marker.timeObservation.end! * this._container!.offsetWidth) / this.mediaDuration + 'px';
    markerContainer.classList.add('omakase-period-marker');
    markerContainer.id = `${markerElementPrefix}-${marker.id}`;
    if (marker.editable) {
      startLine.onmousedown = (event) => {
        event.stopPropagation();
        this._draggingPeriodMarker = markerContainer;
        this._draggingPeriodMarkerEnd = 'start';
        this._markerDragStartTime = new Date();
      };
      endLine.onmousedown = (event) => {
        event.stopPropagation();
        this._draggingPeriodMarker = markerContainer;
        this._draggingPeriodMarkerEnd = 'end';
        this._markerDragStartTime = new Date();
      };
      startLine.onmouseenter = () => {
        this.focusMarker(marker.id);
      };
      endLine.onmouseenter = () => {
        this.focusMarker(marker.id);
      };
    } else {
      markerContainer.classList.add(markerElementReadonlyClass);
    }
    rectangleDiv.onclick = (event) => {
      event.stopPropagation();
      if (!this._markerMoved) {
        this.toggleMarker(marker.id);
      }
    };
    this._container!.appendChild(markerContainer);
    this._markers.push(marker);
    this.onMarkerCreate$.next({marker});
    marker.onChange$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.updateMarkerPosition(marker);
      this.onMarkerUpdate$.next({marker, oldValue: {...marker, timeObservation: event.oldTimeObservation} as PeriodMarker});
    });
    marker.onStyleChange$.pipe(takeUntil(this._destroyed$)).subscribe(() => {
      this.updateMarkerColor(marker);
      this.onMarkerUpdate$.next({marker, oldValue: {...marker} as PeriodMarker});
    });
    return marker;
  }

  private clearDraggingMarker() {
    setTimeout(() => {
      if (this._draggingPointMarker) {
        this.updateMarker(this._draggingPointMarker.id.replace(`${markerElementPrefix}-`, ''), {timeObservation: this.getDraggingPointMarkerTime()});
      }
      if (this._draggingPeriodMarker) {
        this.updateMarker(this._draggingPeriodMarker.id.replace(`${markerElementPrefix}-`, ''), {timeObservation: this.getDraggingPeriodMarkerTime()});
      }
      delete this._draggingPointMarker;
      delete this._markerDragStartTime;
      delete this._draggingPeriodMarker;
      delete this._draggingPeriodMarkerEnd;
      this._markerMoved = false;
    });
  }

  private moveDraggingMarker(event: MouseEvent) {
    if (this._markerDragStartTime && new Date().getTime() - this._markerDragStartTime!.getTime() > this._markerDragDelay) {
      const x = Math.min(Math.max(event.clientX - this._container!.getBoundingClientRect().x, 0), this._container!.getBoundingClientRect().width);
      if (this._draggingPointMarker) {
        this._draggingPointMarker.style.left = `${x}px`;
        this._markerMoved = true;
      } else if (this._draggingPeriodMarker) {
        if (this._draggingPeriodMarkerEnd === 'start') {
          this._draggingPeriodMarker.style.left = `${Math.min(x, this._container!.offsetWidth - parseFloat(this._draggingPeriodMarker.style.right))}px`;
        } else if (this._draggingPeriodMarkerEnd === 'end') {
          this._draggingPeriodMarker.style.right = `${Math.min(this._container!.getBoundingClientRect().width - x, this._container!.offsetWidth - parseFloat(this._draggingPeriodMarker.style.left))}px`;
        }
        this._markerMoved = true;
      }
    }
  }

  private getDraggingPointMarkerTime(): MomentObservation {
    return {
      time: this.mediaDuration * (parseFloat(this._draggingPointMarker!.style.left) / this._container!.offsetWidth),
    };
  }

  private getDraggingPeriodMarkerTime(): PeriodObservation {
    return {
      start: this.mediaDuration * (parseFloat(this._draggingPeriodMarker!.style.left) / this._container!.offsetWidth),
      end: this.mediaDuration * ((this._container!.offsetWidth - parseFloat(this._draggingPeriodMarker!.style.right)) / this._container!.offsetWidth),
    };
  }

  private updateMarkerPosition(marker: MomentMarker | PeriodMarker) {
    const markerElement = this._container?.querySelector(`#${markerElementPrefix}-${marker.id}`) as HTMLDivElement | null;
    if (markerElement) {
      if (this.isMomentMarker(marker)) {
        markerElement.style.left = ((marker as MomentMarker).timeObservation.time / this.mediaDuration) * this._container!.offsetWidth + 'px';
      } else if (this.isPeriodMarker(marker)) {
        markerElement.style.left = ((marker as PeriodMarker).timeObservation.start! / this.mediaDuration) * this._container!.offsetWidth + 'px';
        markerElement.style.right = this._container!.offsetWidth - ((marker as PeriodMarker).timeObservation.end! / this.mediaDuration) * this._container!.offsetWidth + 'px';
      }
    }
  }

  private updateMarkerColor(marker: MomentMarker | PeriodMarker) {
    const markerElement = this._container?.querySelector(`#${markerElementPrefix}-${marker.id}`) as HTMLDivElement | null;
    if (markerElement) {
      if (this.isMomentMarker(marker)) {
        const circleDiv = markerElement.querySelector('.omakase-moment-marker-circle') as HTMLDivElement | null;
        const lineDiv = markerElement.querySelector('.omakase-moment-marker-line') as HTMLDivElement | null;
        const selectedDiv = markerElement.querySelector('.omakase-moment-marker-selected-area') as HTMLDivElement | null;
        if (circleDiv) {
          circleDiv.style.backgroundColor = marker.style.color;
        }
        if (lineDiv) {
          lineDiv.style.backgroundColor = marker.style.color;
        }
        if (selectedDiv) {
          selectedDiv.style.backgroundColor = marker.style.color;
        }
      } else if (this.isPeriodMarker(marker)) {
        const rectangleDiv = markerElement.querySelector('.omakase-period-marker-rectangle') as HTMLDivElement | null;
        const startLine = markerElement.querySelector('.omakase-period-marker-start-line') as HTMLDivElement | null;
        const endLine = markerElement.querySelector('.omakase-period-marker-end-line') as HTMLDivElement | null;
        const selectedDiv = markerElement.querySelector('.omakase-period-marker-selected-area') as HTMLDivElement | null;
        if (rectangleDiv) {
          rectangleDiv.style.backgroundColor = marker.style.color;
        }
        if (startLine) {
          startLine.style.backgroundColor = marker.style.color;
        }
        if (endLine) {
          endLine.style.backgroundColor = marker.style.color;
        }
        if (selectedDiv) {
          selectedDiv.style.backgroundColor = marker.style.color;
        }
      }
    }
  }

  private updateMarkerSize(marker: MomentMarker | PeriodMarker) {
    const markerElement = this._container?.querySelector(`#${markerElementPrefix}-${marker.id}`) as HTMLDivElement | null;
    if (markerElement) {
      if (this.isMomentMarker(marker)) {
        const circleDiv = markerElement.querySelector('.omakase-moment-marker-circle') as HTMLDivElement | null;
        const lineDiv = markerElement.querySelector('.omakase-moment-marker-line') as HTMLDivElement | null;
        const selectedDiv = markerElement.querySelector('.omakase-moment-marker-selected-area') as HTMLDivElement | null;
        if (circleDiv) {
          circleDiv.style.width = this._container!.offsetHeight / 2 + 'px';
          circleDiv.style.left = `-${this._container!.offsetHeight / 4}px`;
          if (this.hasAttribute('editorial')) {
            circleDiv.style.height = this._container!.offsetHeight + 'px';
          } else {
            circleDiv.style.height = this._container!.offsetHeight / 2 + 'px';
            circleDiv.style.top = this._container!.offsetHeight / 4 + 'px';
          }
        }
        if (lineDiv) {
          lineDiv.style.height = this._container!.offsetHeight + 'px';
        }
        if (selectedDiv) {
          selectedDiv.style.height = this._container!.offsetHeight + 'px';
          if (this.hasAttribute('editorial') && circleDiv) {
            selectedDiv.style.left = circleDiv.style.left;
            selectedDiv.style.width = circleDiv.style.width;
          }
        }
      } else if (this.isPeriodMarker(marker)) {
        const rectangleDiv = markerElement.querySelector('.omakase-period-marker-rectangle') as HTMLDivElement | null;
        const startLine = markerElement.querySelector('.omakase-period-marker-start-line') as HTMLDivElement | null;
        const endLine = markerElement.querySelector('.omakase-period-marker-end-line') as HTMLDivElement | null;
        const selectedDiv = markerElement.querySelector('.omakase-period-marker-selected-area') as HTMLDivElement | null;
        if (rectangleDiv) {
          if (this.getAttribute('editorial') !== null) {
            rectangleDiv.style.height = this._container!.offsetHeight + 'px';
          } else {
            rectangleDiv.style.height = this._container!.offsetHeight / 2 + 'px';
            rectangleDiv.style.top = this._container!.offsetHeight / 4 + 'px';
          }
        }
        if (startLine) {
          startLine.style.height = this._container!.offsetHeight + 'px';
        }
        if (endLine) {
          endLine.style.height = this._container!.offsetHeight + 'px';
        }
        if (selectedDiv) {
          selectedDiv.style.height = this._container!.offsetHeight + 'px';
        }
      }
    }
  }
}
