/*
 * Copyright 2026 ByOmakase, LLC (https://byomakase.org)
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

import {TIMELINE_LANE_CONFIG_DEFAULT, type TimelineLaneStyle} from '../timeline-lane';
import {type Thumbnail, ThumbnailTrack, type TimedItem, type TimedItemState, TimedItemsTrackEventType, TimedItemTemporalUtil, TrackEventType} from '../../media';
import Konva from 'konva';
import {type TimelineImpl} from '../timeline';
import type {PlayerApi} from '../../player';
import {KonvaFactory} from '../konva/konva-factory';
import {ThumbnailImg, ThumbnailImgEventType, ThumbnailTrackImg, type ThumbnailTrackImgState} from './thumbnail-img';
import {BehaviorSubject, catchError, combineLatest, debounceTime, filter, forkJoin, Observable, of, Subject, take, takeUntil} from 'rxjs';
import type {Dimension, Position} from '../model';
import {ImageUtil} from '../konva/image-util';
import {AuthConfig} from '../../common';
import {errorCompleteObserver, freeObserver, nextCompleteObserver} from '../../util/rxjs-util';
import {ObserverBreaker} from '../../common/observer-breaker';
import {UrlUtil} from '../../util/url-util';
import type {Destroyable} from '../../common/capabilities';
import {pulseAnimation} from '../animation-util';
import type {Color, Size, StyledElementWithId} from '../../ui';
import {type ConfigAndStyle, TimelineEventType} from '../timeline-api';
import {omitKeys} from '../../util/object-util';
import type {OmpProvider} from '../../omp-provider';
// @ts-ignore
import lightPlaceholder from './../../../assets/images/thumbnail-placeholder-light.svg?raw';
// @ts-ignore
import darkPlaceholder from './../../../assets/images/thumbnail-placeholder-dark.svg?raw';
import {BaseTrackLane, type TrackLaneConfig} from '../track-lane';

export interface ThumbnailTrackLaneStyle extends TimelineLaneStyle {
  thumbnailHeight?: Size;
  thumbnailStroke: Color;
  thumbnailStrokeWidth: Size;

  thumbnailHoverScale: Size;
  thumbnailHoverStroke: Color;
  thumbnailHoverStrokeWidth: Size;

  /** Custom URL for the thumbnail loading placeholder image. Overrides the built-in light/dark placeholder derived from the timeline's loadingAnimationTheme. */
  placeholderImageUrl?: string | undefined;
}

export interface ThumbnailTrackLaneConfig extends TrackLaneConfig {}

const configDefault: ThumbnailTrackLaneConfig = {
  ...TIMELINE_LANE_CONFIG_DEFAULT,
};

export enum ThumbnailTrackLaneEventType {
  TIMELINE_THUMBNAIL_TRACK_LANE_THUMBNAIL_CLICK = 'TIMELINE_THUMBNAIL_TRACK_LANE_THUMBNAIL_CLICK',
  TIMELINE_THUMBNAIL_TRACK_LANE_THUMBNAIL_MOUSE_ENTER = 'TIMELINE_THUMBNAIL_TRACK_LANE_THUMBNAIL_MOUSE_ENTER',
  TIMELINE_THUMBNAIL_TRACK_LANE_THUMBNAIL_MOUSE_LEAVE = 'TIMELINE_THUMBNAIL_TRACK_LANE_THUMBNAIL_MOUSE_LEAVE',
}

export interface ThumbnailTrackLaneEventData {
  thumbnailTrackImg: ThumbnailTrackImgState;
}

export type ThumbnailTrackLaneEventTypeDataMap = {
  [ThumbnailTrackLaneEventType.TIMELINE_THUMBNAIL_TRACK_LANE_THUMBNAIL_CLICK]: ThumbnailTrackLaneEventData;
  [ThumbnailTrackLaneEventType.TIMELINE_THUMBNAIL_TRACK_LANE_THUMBNAIL_MOUSE_ENTER]: ThumbnailTrackLaneEventData;
  [ThumbnailTrackLaneEventType.TIMELINE_THUMBNAIL_TRACK_LANE_THUMBNAIL_MOUSE_LEAVE]: ThumbnailTrackLaneEventData;
};

export type ThumbnailTrackLaneEvent = {
  [K in ThumbnailTrackLaneEventType]: {
    type: K;
    data: ThumbnailTrackLaneEventTypeDataMap[K];
  };
}[keyof ThumbnailTrackLaneEventTypeDataMap];

class ThumbnailWrapper implements Destroyable {
  private _thumbnail: Thumbnail;
  private _thumbnailTrackImg: ThumbnailTrackImg;
  private _placeholderImg: ThumbnailImg;
  private _placeholderAnimation: Konva.Animation | undefined;
  private _placeholderRetired = false;

  private _style: ThumbnailTrackLaneStyle;
  private _thumbnailHeight: number;

  constructor(thumbnail: Thumbnail, x: number, placeholderUrl: string | undefined, style: ThumbnailTrackLaneStyle, thumbnailHeight: number) {
    this._thumbnail = thumbnail;
    this._style = style;
    this._thumbnailHeight = thumbnailHeight;

    this._placeholderImg = new ThumbnailImg({
      listening: false,
      style: {
        x: x,
        y: 0,
        visible: true,
        stroke: style.thumbnailStroke,
        strokeWidth: 0,
      },
    });
    // No placeholder to show (no theme default, no custom URL, or it failed to load) — the real
    // thumbnail still loads and appears via loadThumbnailImage() below, just without a pulsing
    // placeholder in front of it while it does.
    if (placeholderUrl) {
      this._placeholderImg.loadImage(ImageUtil.createKonvaImageSizedByHeight(placeholderUrl, thumbnailHeight, AuthConfig.authentication)).subscribe((image) => {
        this._placeholderAnimation = pulseAnimation({node: image});
      });
    }

    this._thumbnailTrackImg = new ThumbnailTrackImg(
      {
        listening: true,
        style: {
          x: x,
          y: 0,
          visible: false,
          stroke: style.thumbnailStroke,
          strokeWidth: style.thumbnailStrokeWidth,
        },
      },
      thumbnail
    );

    this.loadThumbnailImage();
  }

  private _stopPlaceholderAnimation() {
    this._placeholderAnimation?.stop();
    this._placeholderAnimation = undefined;
  }

  private loadThumbnailImage() {
    let thumbnailTrackImageLoader = ImageUtil.createKonvaImageSizedByHeight(this._thumbnail.url, this._thumbnailHeight, AuthConfig.authentication);

    this._thumbnailTrackImg.loadImage(thumbnailTrackImageLoader).subscribe({
      next: () => {
        this._stopPlaceholderAnimation();
        this.updateVisible(true);
        this._retirePlaceholder();
      },
      error: () => {
        this._stopPlaceholderAnimation();
      },
      complete: () => {
        this._stopPlaceholderAnimation();
      }
    });
  }

  private _retirePlaceholder() {
    this._placeholderImg.destroy();
    this._placeholderRetired = true;
  }

  updateThumbnail(thumbnail: Thumbnail) {
    this._thumbnail = thumbnail;
    this.loadThumbnailImage();
  }

  updateStyle(style: ThumbnailTrackLaneStyle) {
    this._style = style;
    this._thumbnailTrackImg.style = {
      stroke: style.thumbnailStroke,
      strokeWidth: style.thumbnailStrokeWidth,
    };
  }

  updatePlaceholderImage(placeholderUrl: string) {
    if (this._placeholderRetired) {
      return;
    }

    this._placeholderImg.loadImage(ImageUtil.createKonvaImageSizedByHeight(placeholderUrl, this._thumbnailHeight, AuthConfig.authentication)).subscribe((image) => {
      if (this._placeholderRetired) {
        return;
      }
      this._stopPlaceholderAnimation();
      this._placeholderAnimation = pulseAnimation({node: image});
    });
  }

  updateVisible(visible: boolean) {
    this._placeholderImg.setVisible(visible);
    this._thumbnailTrackImg.setVisible(visible);
  }

  updateVisibleAndX(visible: boolean, x: number) {
    this._placeholderImg.setVisibleAndX(visible, x);
    this._thumbnailTrackImg.setVisibleAndX(visible, x);
  }

  get thumbnailTrackImg(): ThumbnailTrackImg {
    return this._thumbnailTrackImg;
  }

  get placeholderImg(): ThumbnailImg {
    return this._placeholderImg;
  }

  get thumbnail(): Thumbnail {
    return this._thumbnail;
  }

  destroy() {
    this._stopPlaceholderAnimation();
    this._retirePlaceholder();
    this._thumbnailTrackImg.destroy();
  }
}

class ThumbnailHoverWrapper implements Destroyable {
  private _thumbnailImg?: ThumbnailImg;
  private _thumbnail?: Thumbnail;

  constructor() {}

  setPosition(position: Position) {
    this._thumbnailImg?.setPosition(position);
    this._thumbnailImg?.setVisible(true);
  }

  set thumbnail(value: Thumbnail) {
    this._thumbnail = value;
  }

  set thumbnailImg(value: ThumbnailImg) {
    this._thumbnailImg = value;
  }

  get thumbnail(): Thumbnail | undefined {
    return this._thumbnail;
  }

  get thumbnailImg(): ThumbnailImg | undefined {
    return this._thumbnailImg;
  }

  destroy() {
    this._thumbnailImg?.destroy();
  }
}

export class ThumbnailTrackLane extends BaseTrackLane<ThumbnailTrackLaneConfig, ThumbnailTrackLaneStyle, ThumbnailTrack> {
  private readonly _onEvent$: Subject<ThumbnailTrackLaneEvent> = new Subject<ThumbnailTrackLaneEvent>();

  protected _firstItemAvailable = new BehaviorSubject(false);

  protected _placeholderImageUrl?: string;
  protected _placeholderKonvaImage?: Konva.Image | undefined;

  protected _currentThumbnailWrapper: ThumbnailWrapper | undefined;
  protected _thumbnailHoverWrapper: ThumbnailHoverWrapper;

  protected _timecodedEventCatcher?: Konva.Rect;
  protected _thumbnailsGroup?: Konva.Group;
  private _lastEffectiveThumbnailHeight?: number;

  protected _thumbnailDimension?: Dimension;

  protected readonly _visibleTimedItems: Set<TimedItem['id']> = new Set<TimedItem['id']>();
  protected readonly _thumbnailWrappers: Map<Thumbnail['id'], ThumbnailWrapper> = new Map<Thumbnail['id'], ThumbnailWrapper>();

  protected _handleTimelineZoom = new Subject<void>();
  protected _handleTimelineScroll = new Subject<void>();

  protected _eventsBreaker = new ObserverBreaker();

  constructor(configAndStyle?: ConfigAndStyle<ThumbnailTrackLaneConfig, ThumbnailTrackLaneStyle>) {
    super(
      {
        ...configDefault,
        ...omitKeys(configAndStyle, 'style'),
      },
      configAndStyle?.style
    );

    this._handleTimelineZoom
      .pipe(debounceTime(100))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(() => {
        this.createMissingThumbnails();
      });

    this._handleTimelineScroll
      .pipe(debounceTime(100))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(() => {
        this.createMissingThumbnails();
      });

    this._thumbnailHoverWrapper = new ThumbnailHoverWrapper();

    combineLatest([this._prepared, this._trackSet, this._firstItemAvailable])
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(([prepared, trackSet, firstItemAvailable]) => {
        this._canRender = prepared && trackSet && firstItemAvailable;

        if (prepared && trackSet) {
          this.trySetOnTrackDeleted();
          this.tryUpdateDescription();
        }

        if (this._canRender) {
          this.render();
        }
      });
  }

  private get effectiveThumbnailHeight(): number {
    // Uses the raw _style field rather than the `style` getter: this is now also called from
    // prepareForTimeline() (via updateThumbnailsGroupBounds()), before _prepared flips true and
    // the getter's checkIsPrepared() guard would throw.
    return this._style!.thumbnailHeight ?? this.getContentHeight('right');
  }

  /**
   * Recenters `_thumbnailsGroup` within the lane's current (border/padding-inset) content height.
   * Returns whether `effectiveThumbnailHeight` itself changed — when it has (i.e. no explicit
   * `thumbnailHeight` override, so it tracks content height), already-loaded thumbnail images are
   * baked to the old height and must be reloaded via a full render(), not just repositioned.
   */
  private updateThumbnailsGroupBounds(): boolean {
    let contentHeight = this.getContentHeight('right');
    let thumbHeight = this.effectiveThumbnailHeight;
    let changed = this._lastEffectiveThumbnailHeight !== thumbHeight;
    this._thumbnailsGroup?.setAttrs({y: (contentHeight - thumbHeight) / 2, height: contentHeight});
    this._lastEffectiveThumbnailHeight = thumbHeight;
    return changed;
  }

  protected createStyledElement(): StyledElementWithId<ThumbnailTrackLaneStyle> {
    return {
      id: this._id,
      classes: [this._ui!.resolveStyleClass('TimelineLane'), this._ui!.resolveStyleClass('ThumbnailTrackLane')],
    };
  }

  protected override handleStyleUpdate(): void {
    super.handleStyleUpdate();

    let placeholderImageUrl = this.resolvePlaceholderImageUrl();
    if (placeholderImageUrl !== this._placeholderImageUrl) {
      this._placeholderImageUrl = placeholderImageUrl;
      this._placeholderKonvaImage = undefined;

      this._thumbnailWrappers.forEach((wrapper) => wrapper.updatePlaceholderImage(placeholderImageUrl));
    }

    this._thumbnailWrappers.forEach((wrapper) => wrapper.updateStyle(this.style));

    if (this._thumbnailHoverWrapper.thumbnailImg) {
      this._thumbnailHoverWrapper.thumbnailImg.style = {
        stroke: this.style.thumbnailHoverStroke,
        strokeWidth: this.style.thumbnailHoverStrokeWidth,
      };
    }

    // A border/padding change moves and/or resizes the content area. Recenter the group always;
    // when that also changed effectiveThumbnailHeight (no explicit thumbnailHeight override),
    // already-loaded thumbnail images are baked to the old height and need a full re-render.
    if (this.updateThumbnailsGroupBounds()) {
      this.render();
    }
  }

  private resolvePlaceholderImageUrl(): string {
    // Uses the raw _style field rather than the `style` getter: this is called from
    // prepareForTimeline(), before _prepared flips true and the getter's guard would throw.
    if (this._style!.placeholderImageUrl) {
      return this._style!.placeholderImageUrl;
    }
    let loadingAnimationTheme = this._timeline!.style.loadingAnimationTheme;
    return UrlUtil.formatBase64Url('image/svg+xml', btoa(loadingAnimationTheme === 'light' ? lightPlaceholder : darkPlaceholder));
  }

  private refreshFirstItemAvailable() {
    if (this._track && this._track.timedItems.length > 0) {
      if (!this._firstItemAvailable.value) {
        this._firstItemAvailable.next(true);
      }
    } else {
      if (this._firstItemAvailable.value) {
        this._firstItemAvailable.next(false);
      }
    }
  }

  setTrack(track: ThumbnailTrack) {
    super.setTrack(track);

    this.refreshFirstItemAvailable();

    if (this._track) {
      this._track.onEvent$.pipe(takeUntil(this._trackUpdateBreaker.observer)).subscribe((event) => {
        switch (event.type) {
          case TrackEventType.TRACK_UPDATED:
            this.handleTrackUpdated();
            break;
          case TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_DELETED:
            this.handleTimedItemsDeleted(event.data.updatedTimedItems);
            break;
          case TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATED:
            this.handleTimedItemsUpdated(event.data.updatedTimedItems);
            break;
        }
      });
    } else {
      this.clearContent();
    }
  }

  clearContent() {
    super.clearContent();
    this._eventsBreaker.break();

    this._thumbnailWrappers.forEach((p) => p.destroy());
    this._thumbnailWrappers.clear();

    this._visibleTimedItems.clear();

    this._thumbnailsGroup?.destroyChildren();
  }

  render(): void {
    this.clearContent();

    if (this._canRender) {
      // Placeholder availability never gates real thumbnail rendering: an unset placeholderImageUrl
      // (no custom URL, no theme default) or a failed load just means thumbnails render without a
      // pulsing placeholder in front of them while they load, not that they don't render at all.
      let placeholderImageLoader$: Observable<Konva.Image | undefined> = this._placeholderKonvaImage
        ? of(this._placeholderKonvaImage)
        : this._placeholderImageUrl
          ? ImageUtil.createKonvaImageSizedByHeight(this._placeholderImageUrl, this.effectiveThumbnailHeight, AuthConfig.authentication).pipe(
              catchError((err) => {
                console.debug(`Could not load thumbnail placeholder image: ${this._placeholderImageUrl}`, err);
                return of(undefined);
              })
            )
          : of(undefined);

      forkJoin([this.resolveThumbnailDimension(), placeholderImageLoader$])
        .pipe(take(1))
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: ([thumbnailDimension, placeholderKonvaImage]) => {
            this._thumbnailDimension = thumbnailDimension;
            this._placeholderKonvaImage = placeholderKonvaImage;

            this.createMissingThumbnails();
          },
          error: (err) => {
            console.error(err);
            console.debug(`Track not ready yet. Could not resolve thumbnail dimension.`);
          },
        });
    }
  }

  protected handleTimelineZoom() {
    super.handleTimelineZoom();
    this._handleTimelineZoom.next();
  }

  protected handleTimelineScroll() {
    super.handleTimelineScroll();
    this._handleTimelineScroll.next();
  }

  protected hasVisualElements(): boolean {
    return this._thumbnailWrappers.size > 0;
  }

  protected settleLayout() {
    super.settleLayout();

    this.hideThumbnailHover();

    let timelineTimecodedDimension = this._timeline!.getTimecodedFloatingDimensionForLane(this.id);
    let timecodedRect = this.getTimecodedRect();

    this._timecodedGroup!.setAttrs({
      x: timecodedRect.x,
      y: timecodedRect.y,
    });

    [this._timecodedGroup, this._timecodedEventCatcher, this._thumbnailsGroup].forEach((node) => {
      node!.width(timecodedRect.width);
    });

    // clipY/clipHeight used to be computed via a (timecodedRect.height / this.style.height) ratio,
    // which canceled out to exactly 1 pre-border/padding (timecodedRect.height always equaled the
    // raw lane height then) — i.e. clipY was always 0 and clipHeight always simplified to
    // timelineTimecodedDimension.height. Now that border/padding insets make timecodedRect.height
    // smaller than the raw height, that ratio is no longer 1 and would clip away the top of the
    // content by the inset amount. Use the values the formula always actually produced.
    let clipX = -this._timeline!.style.rightPaneClipPadding;
    let clipY = 0;
    let clipWidth = timecodedRect.width + this._timeline!.style.rightPaneClipPadding * 2;
    let clipHeight = timelineTimecodedDimension.height;

    this._timecodedGroup!.clipFunc((ctx) => {
      ctx.rect(clipX, clipY, clipWidth, clipHeight);
    });

    this.adjustThumbnails();
  }

  onMeasurementsChange() {
    super.onMeasurementsChange();
    this.hideThumbnailHover();
    this.createMissingThumbnails();
  }

  override prepareForTimeline(timeline: TimelineImpl, player: PlayerApi, ompProvider: OmpProvider) {
    super.prepareForTimeline(timeline, player, ompProvider);

    // Fires on every rendered-left-edge advance (see TimelineEventType.TIMELINE_LIVE_ORIGIN_ADVANCED),
    // including the default per-tick case, not just a TimelineConfig.liveHistoryRetention-capped
    // advance — thumbnails are never pruned upstream (unlike captions), so something has to reclaim
    // wrappers that fall permanently before the new edge regardless of what moved it.
    timeline.onEvent$
      .pipe(filter((p) => p.type === TimelineEventType.TIMELINE_LIVE_ORIGIN_ADVANCED))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((event) => {
        this.pruneThumbnailsBefore(event.data.origin);
      });

    this._placeholderImageUrl = this.resolvePlaceholderImageUrl();

    let timecodedRect = this.getTimecodedRect();

    this._timecodedGroup = new Konva.Group({
      ...timecodedRect,
    });

    this._timecodedEventCatcher = KonvaFactory.createEventCatcherRect({
      ...this._timecodedGroup.getSize(),
    });

    // _timecodedGroup is already built from getTimecodedRect(), which itself is the border/padding
    // inset content rect — so positioning within it (a local 0..contentHeight frame) must not add
    // insets.top again, or content would be pushed further down than the border/padding call for.
    this._thumbnailsGroup = new Konva.Group({
      x: 0,
      width: this._timecodedGroup.width(),
    });
    this.updateThumbnailsGroupBounds();

    this._timecodedGroup.add(this._timecodedEventCatcher);
    this._timecodedGroup.add(this._thumbnailsGroup);

    this._timeline!.addToTimecodedFloatingContent(this._timecodedGroup, 1);

    this._thumbnailHoverWrapper.thumbnailImg = new ThumbnailImg({
      style: {
        visible: false,
        stroke: this._style!.thumbnailHoverStroke,
        strokeWidth: this._style!.thumbnailHoverStrokeWidth,
      },
    });

    this._timeline!.addToSurfaceLayerSpreadContent(this._thumbnailHoverWrapper.thumbnailImg.konvaNode);

    this._timecodedGroup.on('mouseout mouseleave', (event) => {
      this.hideThumbnailHover();
    });

    this._prepared.next(true);
  }

  private resolveThumbnailDimension(): Observable<Dimension> {
    return new Observable<Dimension>((observable) => {
      if (this._track) {
        // try loading first thumbnail to define proportional dimensions

        let first = this._track.timedItemsSorted[0];
        if (first) {
          let imageSub$: Observable<Konva.Image>;
          // if (firstCue.xywh) {
          //   imageSub$ = ImageUtil.createKonvaImageFromSpriteByHeight(firstCue.url, firstCue.xywh, this.style.thumbnailHeight, AuthConfig.authentication);
          // } else {
          //   imageSub$ = ImageUtil.createKonvaImageSizedByHeight(firstCue.url, this.style.thumbnailHeight, AuthConfig.authentication);
          // }
          imageSub$ = ImageUtil.createKonvaImageSizedByHeight(first.url, this.effectiveThumbnailHeight, AuthConfig.authentication);
          imageSub$.subscribe({
            next: (image) => {
              nextCompleteObserver(observable, {
                width: image.getSize().width,
                height: this.effectiveThumbnailHeight,
              });
            },
            error: (err) => {
              console.debug(`Error loading: ${first.url}`, err);
              errorCompleteObserver(observable, `Error loading: ${first.url}`);
            },
          });
        } else {
          errorCompleteObserver(observable, 'Cannot find first item in track');
        }
      } else {
        errorCompleteObserver(observable, 'Track not set');
      }
    });
  }

  private updateVisibleTimedItems() {
    this._visibleTimedItems.clear();

    let rendered: {
      thumbnailId: Thumbnail['id'];
      x: number;
      width: number;
    }[] = [];

    let lastThumbnailBoundary: number;
    this._track?.timedItemsSorted.forEach((timedItem) => {
      let startTime = TimedItemTemporalUtil.extractStartTime(timedItem.temporal) ?? 0;
      let x = this._timeline!.timeToTimelinePosition(startTime);
      if (this._timeline!.constrainTimelinePosition(x) === x) {
        // exclude thumbnails that don't fit on timeline, maybe timestamps are incorrect
        let isRendered = lastThumbnailBoundary ? x >= lastThumbnailBoundary : true;
        if (isRendered) {
          lastThumbnailBoundary = x + this._thumbnailDimension!.width;
          rendered.push({
            thumbnailId: timedItem.id,
            x: x,
            width: this._thumbnailDimension!.width,
          });
        }
      }
    });

    let timelineVisibleRange = this._timeline!.getVisiblePositionRange();
    rendered.forEach((p) => {
      let x2 = p.x + p.width;
      if (timelineVisibleRange.start <= x2 && timelineVisibleRange.end >= p.x) {
        this._visibleTimedItems.add(p.thumbnailId);
      }
    });
  }

  private createMissingThumbnails() {
    if (!this._thumbnailDimension) {
      return;
    }

    this.updateVisibleTimedItems();

    this._track?.timedItemsSorted.forEach((thumbnail) => {
      this.addThumbnailWrapper(thumbnail);
    });
  }

  private addThumbnailWrapper(thumbnail: Thumbnail) {
    let startTime = TimedItemTemporalUtil.extractStartTime(thumbnail.temporal) ?? 0;
    let x = this._timeline!.timeToTimelinePosition(startTime);
    let visible = this._visibleTimedItems.has(thumbnail.id);

    if (this._thumbnailWrappers.has(thumbnail.id)) {
      // update visible
      let thumbnailWrapper = this._thumbnailWrappers.get(thumbnail.id)!;
      thumbnailWrapper.updateVisible(visible);
    } else {
      if (visible) {
        // add new wrapper
        let thumbnailWrapper = new ThumbnailWrapper(thumbnail, x, this._placeholderImageUrl, this.style, this.effectiveThumbnailHeight);

        this._thumbnailsGroup!.add(thumbnailWrapper.thumbnailTrackImg.konvaNode);
        this._thumbnailWrappers.set(thumbnail.id, thumbnailWrapper);
        this._thumbnailsGroup!.add(thumbnailWrapper.placeholderImg.konvaNode);

        let thumbnailTrackImg = thumbnailWrapper.thumbnailTrackImg;

        thumbnailTrackImg.onEvent$.pipe(takeUntil(this._eventsBreaker.observer)).subscribe((event) => {
          switch (event.type) {
            case ThumbnailImgEventType.TIMELINE_THUMBNAIL_CLICK:
              this._onEvent$.next({
                type: ThumbnailTrackLaneEventType.TIMELINE_THUMBNAIL_TRACK_LANE_THUMBNAIL_CLICK,
                data: {
                  thumbnailTrackImg: thumbnailTrackImg.state,
                },
              });
              break;
            case ThumbnailImgEventType.TIMELINE_THUMBNAIL_MOUSE_ENTER:
              this._onEvent$.next({
                type: ThumbnailTrackLaneEventType.TIMELINE_THUMBNAIL_TRACK_LANE_THUMBNAIL_MOUSE_ENTER,
                data: {
                  thumbnailTrackImg: thumbnailTrackImg.state,
                },
              });
              break;
            case ThumbnailImgEventType.TIMELINE_THUMBNAIL_MOUSE_LEAVE:
              this.hideThumbnailHover();
              this._onEvent$.next({
                type: ThumbnailTrackLaneEventType.TIMELINE_THUMBNAIL_TRACK_LANE_THUMBNAIL_MOUSE_LEAVE,
                data: {
                  thumbnailTrackImg: thumbnailTrackImg.state,
                },
              });
              break;
            case ThumbnailImgEventType.TIMELINE_THUMBNAIL_MOUSE_MOVE:
              if (this._currentThumbnailWrapper !== thumbnailWrapper) {
                this._currentThumbnailWrapper = thumbnailWrapper;
                this.showThumbnailHover(thumbnailWrapper);
              }
              break;
          }
        });
      }
    }
  }

  private adjustThumbnails() {
    if (!this._thumbnailDimension) {
      return;
    }

    this.updateVisibleTimedItems();
    this._thumbnailWrappers.forEach((thumbnailWrapper) => {
      let startTime = TimedItemTemporalUtil.extractStartTime(thumbnailWrapper.thumbnail.temporal) ?? 0;
      let x = this._timeline!.timeToTimelinePosition(startTime);
      let visible = this._visibleTimedItems.has(thumbnailWrapper.thumbnail.id);
      thumbnailWrapper.updateVisibleAndX(visible, x);
    });
  }

  private handleTrackUpdated() {
    this.refreshFirstItemAvailable();
    this.createMissingThumbnails();
    this.adjustThumbnails();
  }

  private handleTimedItemsUpdated(timedItemStates: TimedItemState[]) {
    this.refreshFirstItemAvailable();
    timedItemStates.forEach((timedItemState) => {
      let thumbnailWrapper = this._thumbnailWrappers.get(timedItemState.id);
      let updatedThumbnail = this._track!.timedItemsSorted.find((thumbnail) => thumbnail.id === timedItemState.id);
      if (thumbnailWrapper && updatedThumbnail) {
        thumbnailWrapper.updateThumbnail(updatedThumbnail);
      }
    });
  }

  private handleTimedItemsDeleted(timedItemStates: TimedItemState[]) {
    this.refreshFirstItemAvailable();
    timedItemStates.forEach((timedItemState) => {
      let thumbnailWrapper = this._thumbnailWrappers.get(timedItemState.id);
      if (thumbnailWrapper) {
        thumbnailWrapper.destroy();
        this._thumbnailWrappers.delete(timedItemState.id);
      }
    });
  }

  /** See the {@link TimelineEventType.TIMELINE_LIVE_ORIGIN_ADVANCED} subscription in prepareForTimeline(). */
  private pruneThumbnailsBefore(origin: number) {
    this._thumbnailWrappers.forEach((thumbnailWrapper, id) => {
      let startTime = TimedItemTemporalUtil.extractStartTime(thumbnailWrapper.thumbnail.temporal) ?? 0;
      if (startTime < origin) {
        thumbnailWrapper.destroy();
        this._thumbnailWrappers.delete(id);
        this._visibleTimedItems.delete(id);
      }
    });
  }

  private showThumbnailHover(thumbnailWrapper: ThumbnailWrapper) {
    let resolveThumbnailHoverPosition = () => {
      if (this._thumbnailHoverWrapper.thumbnailImg && this._thumbnailHoverWrapper.thumbnailImg.image) {
        let timelineTimecodedRect = this._timeline!.getTimecodedFloatingRect();
        let thumbnailHoverImageSize = this._thumbnailHoverWrapper.thumbnailImg.image.getSize();
        let x = thumbnailWrapper.thumbnailTrackImg.getPosition().x + thumbnailWrapper.thumbnailTrackImg.getDimension().width / 2 - thumbnailHoverImageSize.width / 2;
        let halfStroke = thumbnailWrapper.thumbnailTrackImg.style.strokeWidth > 0 ? thumbnailWrapper.thumbnailTrackImg.style.strokeWidth / 2 : 0;
        let xWithStroke = x - halfStroke;
        x = xWithStroke < 0 ? halfStroke : x + thumbnailHoverImageSize.width + halfStroke > timelineTimecodedRect.width ? timelineTimecodedRect.width - thumbnailHoverImageSize.width - halfStroke : x;
        let timelineLaneTimecodedRect = this.getTimecodedRect();
        let y =
          timelineLaneTimecodedRect.y + this._thumbnailsGroup!.y() + thumbnailWrapper.thumbnailTrackImg.getDimension().height / 2 - this._thumbnailHoverWrapper.thumbnailImg.getDimension().height / 2;
        return {x, y};
      } else {
        return void 0;
      }
    };

    if (this._thumbnailHoverWrapper.thumbnail && this._thumbnailHoverWrapper.thumbnail.id === thumbnailWrapper.thumbnail.id) {
      let position = resolveThumbnailHoverPosition();
      if (position) {
        this._thumbnailHoverWrapper.setPosition(position);
      }
    } else {
      if (thumbnailWrapper.thumbnailTrackImg.image) {
        let targetWidth = thumbnailWrapper.thumbnailTrackImg.image.width() * this.style.thumbnailHoverScale;
        this._thumbnailHoverWrapper.thumbnail = thumbnailWrapper.thumbnail;

        this._thumbnailHoverWrapper.thumbnailImg?.loadImage(ImageUtil.createKonvaImageSizedByWidth(thumbnailWrapper.thumbnail.url, targetWidth, AuthConfig.authentication)).subscribe((event) => {
          let position = resolveThumbnailHoverPosition();
          if (position) {
            this._thumbnailHoverWrapper.setPosition(position);
          }
        });
      }
    }
  }

  private hideThumbnailHover() {
    if (this._thumbnailHoverWrapper.thumbnailImg?.style.visible) {
      this._thumbnailHoverWrapper.thumbnailImg.setVisible(false);
    }
    this._currentThumbnailWrapper = void 0;
  }

  get onEvent$(): Observable<ThumbnailTrackLaneEvent> {
    return this._onEvent$.asObservable();
  }

  destroy() {
    super.destroy();

    this._thumbnailHoverWrapper?.destroy();

    this._thumbnailWrappers.forEach((p) => p.destroy());
    this._thumbnailWrappers.clear();

    this._eventsBreaker.destroy();

    freeObserver(this._onEvent$);
  }
}
