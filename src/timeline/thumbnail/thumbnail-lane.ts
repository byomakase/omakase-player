/**
 *       Copyright 2023 ByOmakase, LLC (https://byomakase.org)
 *
 *       Licensed under the Apache License, Version 2.0 (the "License");
 *       you may not use this file except in compliance with the License.
 *       You may obtain a copy of the License at
 *
 *           http://www.apache.org/licenses/LICENSE-2.0
 *
 *       Unless required by applicable law or agreed to in writing, software
 *       distributed under the License is distributed on an "AS IS" BASIS,
 *       WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *       See the License for the specific language governing permissions and
 *       limitations under the License.
 */

import Konva from "konva";
import {Thumbnail} from "./thumbnail";
import {catchError, debounceTime, map, Observable, of, Subject, switchMap, take, takeUntil} from "rxjs";
import {BaseTimelineLane, TimelaneLaneConfig, TIMELINE_LANE_STYLE_DEFAULT, TimelineLaneStyle} from "../timeline-lane";
import {ThumbnailVttFile} from "../../track/thumbnail-vtt-file";
import {ImageUtil} from "../../util/image-util";
import {Position} from "../../common/measurement";
import {ThumbnailEvent, ThumbnailVttCue} from "../../types";
import {ShapeUtil} from "../../util/shape-util";
import {ComponentConfigStyleComposed} from "../../common/component";
import {AxiosRequestConfig} from "axios";
import {nextCompleteVoidSubject} from "../../util/observable-util";

export interface ThumbnailLaneStyle extends TimelineLaneStyle {
  thumbnailHeight: number;
  thumbnailStroke: string;
  thumbnailStrokeWidth: number;

  thumbnailHoverScale: number;
  thumbnailHoverStroke: string;
  thumbnailHoverStrokeWidth: number;
}

const styleDefault: ThumbnailLaneStyle = {
  ...TIMELINE_LANE_STYLE_DEFAULT,
  thumbnailHeight: 40,
  thumbnailStroke: 'rgba(121,0,255,0.9)',
  thumbnailStrokeWidth: 0,

  thumbnailHoverScale: 1.5,
  thumbnailHoverStroke: 'rgba(0,255,188,0.9)',
  thumbnailHoverStrokeWidth: 5
}

export interface ThumbnailLaneConfig extends TimelaneLaneConfig<ThumbnailLaneStyle> {
  thumbnailVttUrl: string;
  axiosConfig: AxiosRequestConfig;
}

export class ThumbnailLane extends BaseTimelineLane<ThumbnailLaneConfig, ThumbnailLaneStyle> {
  // region config
  private _thumbnailVttUrl: string;
  private _axiosConfig: AxiosRequestConfig;
  // endregion

  // region components
  protected readonly thumbnailsMap: Map<number, Thumbnail> = new Map<number, Thumbnail>();
  protected readonly thumbnailsVisibleSet: Set<number> = new Set<number>();

  protected thumbnailHover: Thumbnail;
  // endregion

  // region konva
  protected timecodedGroup: Konva.Group;
  protected timecodedEventCatcher: Konva.Rect;
  protected thumbnailsGroup: Konva.Group;
  // endregion

  private thumbnailVttFile: ThumbnailVttFile;
  private thumbnailWidth: number;

  private readonly onSettleLayout$: Subject<void> = new Subject<void>();
  private eventStreamBreaker$ = new Subject<void>();

  public readonly onClick$: Subject<ThumbnailEvent> = new Subject<ThumbnailEvent>();

  constructor(config: ComponentConfigStyleComposed<ThumbnailLaneConfig>) {
    super({
      ...config,
      style: {
        ...styleDefault,
        ...config.style
      }
    });

    this._thumbnailVttUrl = this.config.thumbnailVttUrl;
    this._axiosConfig = this.config.axiosConfig;
  }

  protected createCanvasNode(): Konva.Group {
    super.createCanvasNode();

    this.timecodedGroup = new Konva.Group({
      ...this.timelinePosition,
      width: this.timeline.getTimecodedGroupDimension().width,
      height: this.bodyGroup.height()
    });

    this.timecodedEventCatcher = ShapeUtil.createEventCatcher({
      width: this.timecodedGroup.width(),
      height: this.timecodedGroup.height()
    });

    this.thumbnailsGroup = new Konva.Group({
      x: 0,
      y: this.style.height / 2 - this.style.thumbnailHeight / 2,
      width: this.timecodedGroup.width(),
      height: this.timecodedGroup.height()
    });

    this.timecodedGroup.add(this.timecodedEventCatcher);
    this.timecodedGroup.add(this.thumbnailsGroup);

    this.timeline.addToTimecodedThumbnailsGroup(this.timecodedGroup);

    this.thumbnailHover = new Thumbnail({
      style: {
        visible: false,
        stroke: this.style.thumbnailHoverStroke,
        strokeWidth: this.style.thumbnailHoverStrokeWidth
      }
    })

    this.timeline.addToTimecodedSurfaceGroup(this.thumbnailHover.initCanvasNode());

    return this.bodyGroup;
  }

  protected settleLayout() {
    super.settleLayout();

    this.timecodedGroup.setAttrs({
      ...this.timelinePosition
    })

    let horizontalMeasurement = this.timeline.getTimecodedGroupHorizontalMeasurement();
    [this.timecodedGroup, this.timecodedEventCatcher, this.thumbnailsGroup].forEach(node => {
      node.width(horizontalMeasurement.width)
    })

    this.onSettleLayout$.next();
  }

  protected afterCanvasNodeInit() {
    super.afterCanvasNodeInit();

    this.fetchAndCreateThumbnails();

    this.onSettleLayout$.pipe(takeUntil(this.onDestroy$)).subscribe(() => {
      this.hideThumbnailHover();
      this.adjustThumbnails();
    })

    this.onSettleLayout$.pipe(takeUntil(this.onDestroy$)).pipe(debounceTime(100)).subscribe(() => {
      this.createAndAdjustThumbnails();
    })

    this.timecodedGroup.on('mouseout mouseleave', (event) => {
      this.hideThumbnailHover();
    })
  }

  onMeasurementsChange() {
    super.onMeasurementsChange();
    this.hideThumbnailHover();

    this.createAndAdjustThumbnails();
  }

  destroy() {
    super.destroy();
    this.timecodedGroup.destroy();
    this.thumbnailHover.destroy();
    this.fireEventStreamBreaker();
  }

  clearContent() {
    this.fireEventStreamBreaker();

    this.thumbnailVttFile = void 0;
    this.clearItems();
  }

  private clearItems() {
    this.thumbnailsMap.forEach(p => p.destroy())
    this.thumbnailsMap.clear()
    this.thumbnailsVisibleSet.clear()
    this.thumbnailsGroup.destroyChildren();
  }

  private fireEventStreamBreaker() {
    nextCompleteVoidSubject(this.eventStreamBreaker$);
    this.eventStreamBreaker$ = new Subject<void>();
  }

  private createAndAdjustThumbnails() {
    if (!this.isVttLoaded()) {
      return;
    }

    this.resolveVisibleTimestamps();
    this.thumbnailVttFile.getCues().forEach(cue => {
      let x = this.timeline.timeToTimelinePosition(cue.startTime);
      let visible = this.thumbnailsVisibleSet.has(cue.startTime);
      if (this.timeline.constrainTimelinePosition(x) === x) { // exclude thumbnails that don't fit on timeline, maybe timestamps are incorrect
        if (this.thumbnailsMap.has(cue.startTime)) {
          let thumbnail = this.thumbnailsMap.get(cue.startTime);
          if (thumbnail) {
            thumbnail.setVisibleAndX(visible, x)
          }
        } else {
          if (visible) {
            this.thumbnailsMap.set(cue.startTime, null); // this indicates that thumbnail started to load
            ImageUtil.createKonvaImageSizedByHeight(cue.url, this.style.thumbnailHeight).subscribe(image => {
              // use fresh visible status, maybe it has changed while waiting for response
              let mostRecentVisible = this.thumbnailsVisibleSet.has(cue.startTime);
              let thumbnail = this.createThumbnail(cue, image, mostRecentVisible);
              this.thumbnailsMap.set(cue.startTime, thumbnail);
              this.thumbnailsGroup.add(thumbnail.getCanvasNode());
            })
          }
        }
      }
    })
  }

  private adjustThumbnails() {
    if (!this.isVttLoaded()) {
      return;
    }

    this.resolveVisibleTimestamps();
    this.thumbnailsMap.forEach(thumbnail => {
      if (thumbnail) {
        let x = this.timeline.timeToTimelinePosition(thumbnail.getThumbnailVttCue().startTime);
        let visible = this.thumbnailsVisibleSet.has(thumbnail.getThumbnailVttCue().startTime);
        thumbnail.setVisibleAndX(visible, x);
      } else {
        // not loaded yet
      }
    })
  }

  private resolveVisibleTimestamps() {
    let lastThumbnailBoundary;
    let cues = this.thumbnailVttFile.getCues();
    cues.forEach(cue => {
      let x = this.timeline.timeToTimelinePosition(cue.startTime);
      if (this.timeline.constrainTimelinePosition(x) === x) { // exclude thumbnails that don't fit on timeline, maybe timestamps are incorrect
        let visible = lastThumbnailBoundary ? x >= (lastThumbnailBoundary) : true;
        if (visible) {
          lastThumbnailBoundary = x + this.thumbnailWidth;
          this.thumbnailsVisibleSet.add(cue.startTime);
        } else {
          this.thumbnailsVisibleSet.delete(cue.startTime);
        }
      }
    })
  }

  private createThumbnail(thumbnailVttCue: ThumbnailVttCue, image: Konva.Image, visible: boolean) {
    let x = this.timeline.timeToTimelinePosition(thumbnailVttCue.startTime);

    let thumbnail = new Thumbnail({
      listening: true,
      style: {
        x: x,
        y: 0,
        visible: visible,
        stroke: this.style.thumbnailStroke,
        strokeWidth: this.style.thumbnailStrokeWidth
      }
    })

    thumbnail.setThumbnailVttCue(thumbnailVttCue);

    thumbnail.initCanvasNode();
    thumbnail.setImage(image);


    thumbnail.onClick$.pipe(takeUntil(this.eventStreamBreaker$)).subscribe((event) => {
      this.onClick$.next(event);
    })

    thumbnail.onMouseOver$.pipe(takeUntil(this.eventStreamBreaker$)).subscribe((event) => {
      this.showThumbnailHover(event.thumbnail)
    })

    thumbnail.onMouseMove$.pipe(takeUntil(this.eventStreamBreaker$)).subscribe((event) => {
      this.showThumbnailHover(event.thumbnail)
    })

    thumbnail.onMouseOut$.pipe(takeUntil(this.eventStreamBreaker$)).subscribe((event) => {
      this.hideThumbnailHover();
    })

    thumbnail.onMouseLeave$.pipe(takeUntil(this.eventStreamBreaker$)).subscribe((event) => {
      this.hideThumbnailHover();
    })

    return thumbnail;
  }

  private showThumbnailHover(thumbnail: Thumbnail) {
    this.thumbnailHover.setVisible(true);
    if (this.thumbnailHover.compareTo(thumbnail) === 0) {
      // let position = this.resolveThumbnailPosition(this.thumbnailHover);
      let position = this.resolveThumbnailHoverPosition(thumbnail);
      this.thumbnailHover.setPosition(position)
      this.thumbnailHover.setVisible(true);
    } else {
      ImageUtil.createKonvaImageSizedByWidth(thumbnail.getThumbnailVttCue().url, thumbnail.getImage().width() * this.style.thumbnailHoverScale).subscribe(image => {
        this.thumbnailHover.setDimension(image.getSize());
        this.thumbnailHover.setImage(image);
        // this.thumbnailHover.setPosition(this.resolveThumbnailPosition(this.thumbnailHover))
        this.thumbnailHover.setPosition(this.resolveThumbnailHoverPosition(thumbnail))
        this.thumbnailHover.getCanvasNode().moveToTop();
      })
    }
  }

  private hideThumbnailHover() {
    if (this.thumbnailHover && this.thumbnailHover.style.visible) {
      this.thumbnailHover.setVisible(false);
    }
  }

  private resolveThumbnailHoverPosition(thumbnail: Thumbnail): Position {
    // let pointerPosition = this.timeline.getRelativePointerPosition();
    let timecodedRect = this.timeline.getTimecodedGroupRect();
    let thumbnailHoverImageSize = this.thumbnailHover.getImage().getSize();
    // let x = pointerPosition.x - imageSize.width / 2; // center thumbnail
    let x = thumbnail.getPosition().x + thumbnail.getDimension().width / 2 - thumbnailHoverImageSize.width / 2;
    let halfStroke = thumbnail.style.strokeWidth > 0 ? thumbnail.style.strokeWidth / 2 : 0;
    let xWithStroke = x - halfStroke;
    x = xWithStroke < 0 ? halfStroke : (x + thumbnailHoverImageSize.width + halfStroke) > timecodedRect.width ? (timecodedRect.width - thumbnailHoverImageSize.width - halfStroke) : x;
    let rect = this.getRect();
    let y = rect.y + this.thumbnailsGroup.y() + thumbnail.getDimension().height / 2 - this.thumbnailHover.getDimension().height / 2;
    return {x, y}
  }


  private fetchAndCreateThumbnails() {
    this.fetchThumbnailVttFile(this._thumbnailVttUrl, this._axiosConfig, this.style.thumbnailHeight).pipe(take(1)).subscribe((result) => {
      if (result) {
        this.thumbnailVttFile = result.thumbnailVttFile;
        this.thumbnailWidth = result.thumbnailWidth;
        this.createAndAdjustThumbnails();
      }
    })
  }

  private fetchThumbnailVttFile(url: string, axiosConfig: AxiosRequestConfig, thumbnailHeight: number): Observable<{
    thumbnailVttFile: ThumbnailVttFile,
    thumbnailWidth: number
  }> {
    if (url) {
      return ThumbnailVttFile.create(url, axiosConfig).pipe(switchMap(thumbnailVttFile => {
        let firstCue: ThumbnailVttCue = thumbnailVttFile.getCues()[0];
        return ImageUtil.createKonvaImageSizedByHeight(firstCue.url, thumbnailHeight).pipe(map(image => {
          let thumbnailWidth = image.getSize().width;
          return {
            thumbnailVttFile: thumbnailVttFile,
            thumbnailWidth: thumbnailWidth
          };
        }))
      }), catchError((err, caught) => {
        return of(void 0);
      }))
    } else {
      return of(void 0);
    }
  }

  isVttLoaded(): boolean {
    return !!this.thumbnailVttFile && !!this.thumbnailWidth;
  }

  getThumbnailVttFile(): ThumbnailVttFile {
    return this.thumbnailVttFile;
  }

  get thumbnailVttUrl(): string {
    return this._thumbnailVttUrl;
  }

  set thumbnailVttUrl(value: string) {
    this._thumbnailVttUrl = value;
    this.clearContent();
    this.fetchAndCreateThumbnails();
  }
}
