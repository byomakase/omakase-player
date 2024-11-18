import { MediaTimeRange } from 'media-chrome';
import { Subject } from 'rxjs';

const calcTimeFromRangeValue = (el: any, value: number = el.range.valueAsNumber): number => {
  const startTime = Number.isFinite(el.mediaSeekableStart) ? el.mediaSeekableStart : 0;
  // Prefer `mediaDuration` when available and finite.
  const endTime = Number.isFinite(el.mediaDuration) ? el.mediaDuration : el.mediaSeekableEnd;
  if (Number.isNaN(endTime)) return 0;
  return value * (endTime - startTime) + startTime;
};

const closestComposedNode = <T extends Element = Element>(
  childNode: Element,
  selector: string
): T | null => {
  if (!childNode) return null;
  const closest = childNode.closest(selector);
  if (closest) return closest as T;
  return closestComposedNode(
    (childNode.getRootNode() as ShadowRoot).host,
    selector
  );
};

export class OmakaseTimeRange extends MediaTimeRange {
  onSeek$: Subject<number> = new Subject();
  onMouseOver$: Subject<number> = new Subject();

  private _previewBox: HTMLElement;
  private _lastPreviewTime?: number;

  constructor() {
    super();
    this._previewBox = this.shadowRoot!.querySelector('[part~="preview-box"]')!;
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

  private getElementRects(box: HTMLElement) {
    // Get the element that enforces the bounds for the time range boxes.
    const bounds =
      (this.getAttribute('bounds')
        ? closestComposedNode(this, `#${this.getAttribute('bounds')}`)
        : this.parentElement) ?? this;

    const boundsRect = bounds.getBoundingClientRect();
    const rangeRect = this.range.getBoundingClientRect();

    // Use offset dimensions to include borders.
    const width = box.offsetWidth;
    const min = -(rangeRect.left - boundsRect.left - width / 2);
    const max = boundsRect.right - rangeRect.left - width / 2;

    return {
      box: { width, min, max },
      bounds: boundsRect,
      range: rangeRect,
    };
  }
}
