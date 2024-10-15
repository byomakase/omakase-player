/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Konva from 'konva';
import {Thumbnail} from './thumbnail';
import {catchError, debounceTime, filter, map, Observable, of, Subject, take, takeUntil} from 'rxjs';
import {TIMELINE_LANE_CONFIG_DEFAULT, timelineLaneComposeConfig, TimelineLaneConfigDefaultsExcluded, TimelineLaneStyle, VTT_DOWNSAMPLE_CONFIG_DEFAULT} from '../timeline-lane';
import {ImageUtil} from '../../util/image-util';
import {Dimension, Position} from '../../common/measurement';
import {ThumbnailEvent, ThumbnailVttCue} from '../../types';
import {AxiosRequestConfig} from 'axios';
import {nextCompleteVoidSubject} from '../../util/observable-util';
import {Timeline} from '../timeline';
import {destroyer} from '../../util/destroy-util';
import Decimal from 'decimal.js';
import {KonvaFactory} from '../../factory/konva-factory';
import {VideoControllerApi} from '../../video/video-controller-api';
import {ThumbnailLaneApi} from '../../api';
import {ThumbnailVttFile} from '../../vtt';
import {VttAdapter, VttAdapterConfig} from '../../common/vtt-adapter';
import {VttTimelineLane, VttTimelineLaneConfig} from '../vtt-timeline-lane';
import {AuthUtil} from '../../util/auth-util';

export interface ThumbnailLaneConfig extends VttTimelineLaneConfig<ThumbnailLaneStyle>, VttAdapterConfig<ThumbnailVttFile> {
  axiosConfig?: AxiosRequestConfig;
}

export interface ThumbnailLaneStyle extends TimelineLaneStyle {
  thumbnailHeight: number;
  thumbnailStroke: string;
  thumbnailStrokeWidth: number;

  thumbnailHoverScale: number;
  thumbnailHoverStroke: string;
  thumbnailHoverStrokeWidth: number;
}

const configDefault: ThumbnailLaneConfig = {
  ...TIMELINE_LANE_CONFIG_DEFAULT,
  ...VTT_DOWNSAMPLE_CONFIG_DEFAULT,
  downsampleStrategy: 'drop',
  style: {
    ...TIMELINE_LANE_CONFIG_DEFAULT.style,
    thumbnailHeight: 40,
    thumbnailStroke: 'rgba(121,0,255,0.9)',
    thumbnailStrokeWidth: 0,

    thumbnailHoverScale: 1.5,
    thumbnailHoverStroke: 'rgba(0,255,188,0.9)',
    thumbnailHoverStrokeWidth: 5
  }
}

export class ThumbnailLane extends VttTimelineLane<ThumbnailLaneConfig, ThumbnailLaneStyle, ThumbnailVttCue, ThumbnailVttFile> implements ThumbnailLaneApi {
  public readonly onClick$: Subject<ThumbnailEvent> = new Subject<ThumbnailEvent>();

  protected readonly _vttAdapter: VttAdapter<ThumbnailVttFile> = new VttAdapter(ThumbnailVttFile);
  protected readonly _onSettleLayout$: Subject<void> = new Subject<void>();

  protected readonly _itemsMap: Map<number, Thumbnail | undefined> = new Map<number, Thumbnail | undefined>();
  protected readonly _itemsVisibleSet: Set<number> = new Set<number>();

  protected _thumbnailHover?: Thumbnail;

  protected _timecodedGroup?: Konva.Group;
  protected _timecodedEventCatcher?: Konva.Rect;
  protected _thumbnailsGroup?: Konva.Group;

  protected _thumbnailDimension?: Dimension;

  protected _eventStreamBreaker$ = new Subject<void>();

  constructor(config: TimelineLaneConfigDefaultsExcluded<ThumbnailLaneConfig>) {
    super(timelineLaneComposeConfig(configDefault, config));
    this._vttAdapter.initFromConfig(this._config);
  }

  override prepareForTimeline(timeline: Timeline, videoController: VideoControllerApi) {
    super.prepareForTimeline(timeline, videoController);

    let timecodedRect = this.getTimecodedRect();

    this._timecodedGroup = new Konva.Group({
      ...timecodedRect
    });

    this._timecodedEventCatcher = KonvaFactory.createEventCatcherRect({
      ...this._timecodedGroup.getSize()
    });

    this._thumbnailsGroup = new Konva.Group({
      x: 0,
      y: this.style.height / 2 - this.style.thumbnailHeight / 2,
      width: this._timecodedGroup.width(),
      height: this._config.style.height ,
    });

    this._timecodedGroup.add(this._timecodedEventCatcher);
    this._timecodedGroup.add(this._thumbnailsGroup);

    this._timeline!.addToTimecodedFloatingContent(this._timecodedGroup, 1);

    this._thumbnailHover = new Thumbnail({
      style: {
        visible: false,
        stroke: this.style.thumbnailHoverStroke,
        strokeWidth: this.style.thumbnailHoverStrokeWidth
      }
    })

    this._timeline!.addToSurfaceLayerTimecodedFloatingContent(this._thumbnailHover.konvaNode);

    this._onSettleLayout$.pipe(takeUntil(this._destroyed$)).subscribe(() => {
      this.hideThumbnailHover();
    })

    this._onSettleLayout$.pipe(takeUntil(this._destroyed$)).subscribe(() => {
      this.adjustThumbnails();
    })

    this._onSettleLayout$.pipe(debounceTime(100), takeUntil(this._destroyed$)).subscribe(() => {
      this.createAndAdjustThumbnails();
    })

    this._timecodedGroup.on('mouseout mouseleave', (event) => {
      this.hideThumbnailHover();
    })

    let onVttFileLoaded = () => {
      this._videoController!.onVideoLoaded$.pipe(filter(p => !!p), take(1), takeUntil(this._destroyed$)).subscribe({
        next: (event) => {
          this.createEntitiesAsync().subscribe();
        }
      })
    }

    this._vttAdapter.vttFileLoaded$.pipe(takeUntil(this._destroyed$)).subscribe({
      next: () => {
        onVttFileLoaded();
      }
    });

    this._videoController!.onVideoLoading$.pipe(takeUntil(this._destroyed$)).subscribe((event) => {
      this.clearContent();
    })

    if (this.vttUrl) {
      this.loadVtt(this.vttUrl, this.getVttLoadOptions(this._config.axiosConfig)).subscribe();
    } else if (this.vttFile) {
      onVttFileLoaded();
    }
  }

  protected settleLayout() {
    let timelineTimecodedDimension = this._timeline!.getTimecodedFloatingDimension();
    let timecodedRect = this.getTimecodedRect();

    this._timecodedGroup!.setAttrs({
      x: timecodedRect.x,
      y: timecodedRect.y
    });

    [this._timecodedGroup, this._timecodedEventCatcher, this._thumbnailsGroup].forEach(node => {
      node!.width(timecodedRect.width)
    })

    let clipFactorHeightDecimal = new Decimal(timelineTimecodedDimension.height).div(this.style.height);
    let clipFactorYDecimal = new Decimal(timecodedRect.height).div(this.style.height);

    let clipX = -this._timeline!.style.rightPaneClipPadding;
    let clipY = timecodedRect.y - timecodedRect.y * clipFactorYDecimal.toNumber();
    let clipWidth = timecodedRect.width + (this._timeline!.style.rightPaneClipPadding * 2);
    let clipHeight = clipFactorHeightDecimal.mul(timecodedRect.height).toNumber();

    this._timecodedGroup!.clipFunc((ctx) => {
      ctx.rect(clipX, clipY, clipWidth, clipHeight)
    });

    this._onSettleLayout$.next();
  }

  override onMeasurementsChange() {
    super.onMeasurementsChange();
    this.hideThumbnailHover();

    this.createAndAdjustThumbnails();
  }

  override destroy() {
    super.destroy();

    destroyer(
      this._timecodedGroup,
      this._thumbnailHover
    )

    this.fireEventStreamBreaker();
  }

  override clearContent() {
    this.fireEventStreamBreaker();
    this._itemsMap.forEach((p: Thumbnail | undefined) => p?.destroy())
    this._itemsMap.clear()
    this._itemsVisibleSet.clear()
    this._thumbnailsGroup?.destroyChildren();
  }

  private fireEventStreamBreaker() {
    nextCompleteVoidSubject(this._eventStreamBreaker$);
    this._eventStreamBreaker$ = new Subject<void>();
  }

  private createAndAdjustThumbnails() {
    if (!this._videoController!.isVideoLoaded() || !this.vttFile) {
      return;
    }

    if (!this._thumbnailDimension) {
      return;
    }

    this.resolveVisibleTimestamps();
    this.vttFile.cues.forEach(cue => {
      let x = this._timeline!.timeToTimelinePosition(cue.startTime);
      let visible = this._itemsVisibleSet.has(cue.startTime);
      if (this._timeline!.constrainTimelinePosition(x) === x) { // exclude thumbnails that don't fit on timeline, maybe timestamps are incorrect
        if (this._itemsMap.has(cue.startTime)) {
          let thumbnail = this._itemsMap.get(cue.startTime);
          if (thumbnail) {
            thumbnail.setVisibleAndX(visible, x)
          }
        } else {
          if (visible) {
            this._itemsMap.set(cue.startTime, void 0); // this indicates that thumbnail started to load
            ImageUtil.createKonvaImageSizedByHeight(cue.url, this.style.thumbnailHeight, AuthUtil.authentication).subscribe({
              next: (image) => {
                // use fresh visible status, maybe it has changed while waiting for response
                let mostRecentVisible = this._itemsVisibleSet.has(cue.startTime);
                let thumbnail = this.createThumbnail(cue, image, mostRecentVisible);
                this._itemsMap.set(cue.startTime, thumbnail);
                this._thumbnailsGroup!.add(thumbnail.konvaNode);
              },
              error: (err) => {
                console.debug(`Error loading: ${cue.url}`, err);
              }
            })
          }
        }
      }
    })
  }

  private adjustThumbnails() {
    if (!this._videoController!.isVideoLoaded() || !this.vttFile) {
      return;
    }

    if (!this._thumbnailDimension) {
      return;
    }

    this.resolveVisibleTimestamps();
    this._itemsMap.forEach(thumbnail => {
      if (thumbnail && thumbnail.cue) {
        let x = this._timeline!.timeToTimelinePosition(thumbnail.cue.startTime);
        let visible = this._itemsVisibleSet.has(thumbnail.cue.startTime);
        thumbnail.setVisibleAndX(visible, x);
      } else {
        // not loaded yet
      }
    })
  }

  private resolveVisibleTimestamps() {
    let lastThumbnailBoundary: number;
    this.vttFile?.cues.forEach(cue => {
      let x = this._timeline!.timeToTimelinePosition(cue.startTime);
      if (this._timeline!.constrainTimelinePosition(x) === x) { // exclude thumbnails that don't fit on timeline, maybe timestamps are incorrect
        let visible = lastThumbnailBoundary ? x >= (lastThumbnailBoundary) : true;
        if (visible) {
          lastThumbnailBoundary = x + this._thumbnailDimension!.width;
          this._itemsVisibleSet.add(cue.startTime);
        } else {
          this._itemsVisibleSet.delete(cue.startTime);
        }
      }
    })
  }

  private createThumbnail(thumbnailVttCue: ThumbnailVttCue, image: Konva.Image, visible: boolean) {
    let x = this._timeline!.timeToTimelinePosition(thumbnailVttCue.startTime);

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

    thumbnail.cue = thumbnailVttCue;
    thumbnail.setImage(image);


    thumbnail.onClick$.pipe(takeUntil(this._eventStreamBreaker$)).subscribe((event) => {
      this.onClick$.next(event);
    })

    thumbnail.onMouseOver$.pipe(takeUntil(this._eventStreamBreaker$)).subscribe((event) => {
      this.showThumbnailHover(event.thumbnail)
    })

    thumbnail.onMouseMove$.pipe(takeUntil(this._eventStreamBreaker$)).subscribe((event) => {
      this.showThumbnailHover(event.thumbnail)
    })

    thumbnail.onMouseOut$.pipe(takeUntil(this._eventStreamBreaker$)).subscribe((event) => {
      this.hideThumbnailHover();
    })

    thumbnail.onMouseLeave$.pipe(takeUntil(this._eventStreamBreaker$)).subscribe((event) => {
      this.hideThumbnailHover();
    })

    return thumbnail;
  }

  private showThumbnailHover(thumbnail: Thumbnail) {
    this._thumbnailHover!.setVisible(true);
    if (this._thumbnailHover!.compareTo(thumbnail) === 0) {
      // let position = this.resolveThumbnailPosition(this.thumbnailHover);
      let position = this.resolveThumbnailHoverPosition(thumbnail);
      if (position) {
        this._thumbnailHover!.setPosition(position)
        this._thumbnailHover!.setVisible(true);
      }
    } else {
      if (thumbnail.cue && thumbnail.image) {
        ImageUtil.createKonvaImageSizedByWidth(thumbnail.cue.url, thumbnail.image.width() * this.style.thumbnailHoverScale, AuthUtil.authentication).subscribe({
          next: (image) => {
            this._thumbnailHover!.setDimension(image.getSize());
            this._thumbnailHover!.setImage(image);

            let position = this.resolveThumbnailHoverPosition(thumbnail);
            if (position) {
              this._thumbnailHover!.setPosition(position)
              this._thumbnailHover!.konvaNode.moveToTop();
            }
          },
          error: (err) => {
            console.error(err);
          }
        })
      }
    }
  }

  private hideThumbnailHover() {
    if (this._thumbnailHover && this._thumbnailHover.style.visible) {
      this._thumbnailHover.setVisible(false);
    }
  }

  private resolveThumbnailHoverPosition(thumbnail: Thumbnail): Position | undefined {
    if (this._thumbnailHover && this._thumbnailHover.image) {
      let timelineTimecodedRect = this._timeline!.getTimecodedFloatingRect();
      let thumbnailHoverImageSize = this._thumbnailHover.image.getSize();
      let x = thumbnail.getPosition().x + thumbnail.getDimension().width / 2 - thumbnailHoverImageSize.width / 2;
      let halfStroke = thumbnail.style.strokeWidth > 0 ? thumbnail.style.strokeWidth / 2 : 0;
      let xWithStroke = x - halfStroke;
      x = xWithStroke < 0 ? halfStroke : (x + thumbnailHoverImageSize.width + halfStroke) > timelineTimecodedRect.width ? (timelineTimecodedRect.width - thumbnailHoverImageSize.width - halfStroke) : x;
      let timelineLaneTimecodedRect = this.getTimecodedRect();
      let y = timelineLaneTimecodedRect.y + this._thumbnailsGroup!.y() + thumbnail.getDimension().height / 2 - this._thumbnailHover.getDimension().height / 2;
      return {x, y}
    } else {
      return void 0;
    }
  }

  private createEntitiesAsync(): Observable<boolean> {
    if (!this.vttFile) {
      throw new Error('VTT file not loaded')
    }

    if (!this._timeline) {
      throw new Error('TimelineLane not initalized. Maybe you forgot to add TimelineLane to Timeline?')
    }

    this.clearContent();

    return this.resolveDimension(this.vttFile).pipe(map(dimension => {
      if (dimension) {
        this._thumbnailDimension = dimension;
        this.createAndAdjustThumbnails();
      } else {
        console.debug(`Unable to load first cue and determine thumbnail size, thumbnails will not be loaded`);
      }
      return true;
    }), catchError(err => {
      console.error(err);
      return of(false);
    }))
  }

  private resolveDimension(vttFile: ThumbnailVttFile): Observable<Dimension | undefined> {
    return new Observable<Dimension | undefined>(o$ => {
      if (vttFile) {
        // try loading first thumbnail to define proportional dimensions
        let firstCue: ThumbnailVttCue = vttFile.cues[0];
        if (firstCue) {
          ImageUtil.createKonvaImageSizedByHeight(firstCue.url, this.style.thumbnailHeight, AuthUtil.authentication).subscribe({
            next: (image) => {
              o$.next({
                width: image.getSize().width,
                height: this.style.thumbnailHeight
              });
              o$.complete();
            },
            error: err => {
              console.debug(`Error loading: ${firstCue.url}`, err);
              o$.next(void 0);
              o$.complete();
            }
          })
        } else {
          o$.next(void 0);
          o$.complete();
        }
      } else {
        o$.next(void 0);
        o$.complete();
      }
    })
  }
}
