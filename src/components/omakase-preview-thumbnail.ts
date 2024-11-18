import { Subject, takeUntil } from 'rxjs';
import { nextCompleteSubject } from '../util/rxjs-util';
import { OmakaseTimeRange } from './omakase-time-range';
import { ThumbnailVttFile } from '../vtt';
import { ImageUtil } from '../util/image-util';
import { AuthUtil } from '../util/auth-util';

export class OmakasePreviewThumbnail extends HTMLElement {
  private _timeRange?: OmakaseTimeRange;
  private _vttFile?: ThumbnailVttFile;
  private _thumbnailFn?: (time: number) => string | undefined;
  private _destroyed$ = new Subject<void>();

  constructor() {
    super();
  }

  set vttFile(vttFile: ThumbnailVttFile) {
    this._vttFile = vttFile;
  }

  set thumbnailFn(thumbnailFn: ((time: number) => string | undefined) | undefined) {
    this._thumbnailFn = thumbnailFn;
  }

  set timeRange(timeRange: OmakaseTimeRange) {
    this._timeRange = timeRange;
    this._timeRange.onMouseOver$.pipe(takeUntil(this._destroyed$)).subscribe(time => {
        if (this._vttFile) {
            const thumbnailUrl = this._thumbnailFn ? this._thumbnailFn(time) : this._vttFile.findNearestCue(time)?.url;
            if (thumbnailUrl) {
                if (AuthUtil.authentication) {
                    ImageUtil.getProtectedImageUrl(thumbnailUrl, AuthUtil.authentication).subscribe(objectUrl => {
                        this.querySelector('img')!.src = objectUrl;
                    })
                } else {
                    this.querySelector('img')!.src = thumbnailUrl;
                }
            }
        }
    })
  }

connectedCallback() {
    this.innerHTML = `<img src=""/>`;
  }

  disconnectedCallback() {
    nextCompleteSubject(this._destroyed$);
  }
}
