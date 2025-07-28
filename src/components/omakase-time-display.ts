import {Subject, Subscription, takeUntil} from 'rxjs';
import {VideoApi} from '../api';
import {nextCompleteSubject} from '../util/rxjs-util';
import {OmakaseTimeRange} from './omakase-time-range';

export class OmakaseTimeDisplay extends HTMLElement {
  private _video?: VideoApi;
  private _timeRange?: OmakaseTimeRange;
  private _destroyed$ = new Subject<void>();

  private _timeChangeSubscription?: Subscription;

  constructor() {
    super();
  }

  set video(video: VideoApi) {
    this._video = video;
    this._video.onVideoLoaded$.pipe(takeUntil(this._destroyed$)).subscribe((loaded) => {
      if (loaded) {
        this.querySelector('span')!.textContent = this.getDisplayTime(this._video!.getCurrentTime(), true);
      }
    });
    this._timeChangeSubscription = this._video.onVideoTimeChange$.pipe(takeUntil(this._destroyed$)).subscribe((time) => {
      if (this._video && this._video.isVideoLoaded()) {
        this.querySelector('span')!.textContent = this.getDisplayTime(time.currentTime, false);
      }
    });
  }

  set timeRange(timeRange: OmakaseTimeRange) {
    this._timeRange = timeRange;
    this._timeChangeSubscription?.unsubscribe();
    this._timeRange.onMouseOver$.pipe(takeUntil(this._destroyed$)).subscribe((time) => {
      if (this._video && this._video.isVideoLoaded()) {
        this.querySelector('span')!.textContent = this.getDisplayTime(time, false);
      }
    });
  }

  getDisplayTime(time: number, isFirstFrame: boolean): string {
    const displayTime = isFirstFrame && this.getAttribute('showduration') ? this._video!.getDuration() : this.getAttribute('countdown') ? this._video!.getDuration() - time : time;
    return this.getAttribute('format') === 'timecode' ? this._video!.formatToTimecode(displayTime) : this.formatToSeconds(displayTime);
  }

  connectedCallback() {
    this.innerHTML = `<span></span>`;
  }

  disconnectedCallback() {
    nextCompleteSubject(this._destroyed$);
  }

  private formatToSeconds(time: number): string {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    const paddedMins = String(mins).padStart(2, '0');
    const paddedSecs = String(secs).padStart(2, '0');
    return `${paddedMins}:${paddedSecs}`;
  }
}
