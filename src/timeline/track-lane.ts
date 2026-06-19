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

import {BaseTimelineLane, type TimelineLaneConfig, type TimelineLaneStyle} from './timeline-lane';
import type {TimelineLaneApi} from './timeline-lane-api';
import {type Track, TrackEventType} from '../media';
import Konva from 'konva';
import {TrackRepository} from '../repository';
import {BehaviorSubject, filter, take, takeUntil} from 'rxjs';
import {ObserverBreaker} from '../common/observer-breaker';
import type {TimelineImpl} from './timeline';
import type {PlayerApi} from '../player';
import type {OmpProvider} from '../omp-provider';
import {OpStageStatus} from '../common/op-stage';
import {gradientAnimation, pulseAnimation} from './animation-util';
import {KonvaFactory} from './konva/konva-factory';
import {isNullOrUndefined} from '../util/util-functions';

export interface TrackLaneConfig extends TimelineLaneConfig {}

export abstract class BaseTrackLane<C extends TrackLaneConfig, S extends TimelineLaneStyle, T extends Track> extends BaseTimelineLane<C, S> {
  protected _trackRepository?: TrackRepository;

  protected _track?: T | undefined;

  protected _trackSet = new BehaviorSubject(false);
  protected _canRender = false;

  protected _trackUpdateBreaker = new ObserverBreaker();

  protected constructor(config: C, style?: Partial<S>) {
    super(config, style);
  }

  abstract render(): void;

  protected abstract hasVisualElements(): boolean;

  protected settleLayout(): void {
    if (this._loadingGroup && this._timeline) {
      this._loadingGroup.setAttrs({x: 0, y: this.getTimecodedRect().y});
    }
  }

  protected showLoadingGroup(): void {
    if (!this._loadingGroup && this._timeline) {
      const containerDim = this._timeline.getTimecodedContainerDimension();
      const timecodedRect = this.getTimecodedRect();
      this._loadingGroup = new Konva.Group({listening: false, x: 0, y: timecodedRect.y});
      this._loadingAnimation = this.createLoadingGroupContent(containerDim.width, this.style.height);
      this._timeline.addToTimecodedStaticContent(this._loadingGroup);
    }
    this._loadingAnimation?.start();
    this._loadingGroup?.show();
  }

  protected createLoadingGroupContent(width: number, height: number): Konva.Animation {
    const paddingTop = (this.style as Partial<{paddingTop: number}>).paddingTop ?? 0;
    const paddingBottom = (this.style as Partial<{paddingBottom: number}>).paddingBottom ?? 0;
    const contentY = paddingTop;
    const contentHeight = height - paddingTop - paddingBottom;
    if (this.style.loadingAnimationType === 'gradient') {
      return gradientAnimation({
        group: this._loadingGroup!,
        width,
        height: contentHeight,
        y: contentY,
        fill: this.style.loadingAnimationFill ?? '#ffffff',
        ...(this.style.loadingAnimationSpeed !== undefined && {period: this.style.loadingAnimationSpeed}),
      });
    }
    const rect = KonvaFactory.createRect({x: 0, y: contentY, width, height: contentHeight, fill: this.style.loadingAnimationFill, listening: false});
    this._loadingGroup!.add(rect);
    return pulseAnimation({node: rect, ...(this.style.loadingAnimationSpeed !== undefined && {minOpacity: 0, maxOpacity: 1, period: this.style.loadingAnimationSpeed / 2})});
  }

  protected hideLoadingGroup(): void {
    this._loadingAnimation?.stop();
    this._loadingGroup?.hide();
  }

  protected updateLoadingVisibility(): void {
    if (this._config.loadingAnimation && this._track?.loadStage.status === OpStageStatus.IN_PROGRESS && !this.hasVisualElements()) {
      this.showLoadingGroup();
    } else {
      this.hideLoadingGroup();
    }
  }

  /**
   * @internal
   * @param timeline
   * @param player
   * @param ompProvider
   */
  override prepareForTimeline(timeline: TimelineImpl, player: PlayerApi, ompProvider: OmpProvider): void {
    super.prepareForTimeline(timeline, player, ompProvider);
    this._trackRepository = ompProvider.trackRepository;
  }

  setTrack(track: T) {
    this._track = track;
    this._trackUpdateBreaker.break();

    if (this._track) {
      this._track.onEvent$
        .pipe(filter((p) => p.type === TrackEventType.TRACK_UPDATED))
        .pipe(takeUntil(this._trackUpdateBreaker.observer))
        .subscribe((event) => {
          switch (event.type) {
            case TrackEventType.TRACK_UPDATED:
              this.tryUpdateDescription();
              break;
          }
        });

      this._track.onEvent$
        .pipe(filter((p) => p.type === TrackEventType.TRACK_LOADING || p.type === TrackEventType.TRACK_LOADED || p.type === TrackEventType.TRACK_LOAD_ERROR))
        .pipe(takeUntil(this._trackUpdateBreaker.observer))
        .subscribe(() => this.updateLoadingVisibility());

      this.updateLoadingVisibility();

      this._trackSet.next(true);
    } else {
      this._trackSet.next(false);
    }
  }

  protected tryUpdateDescription() {
    if (isNullOrUndefined(this._config.description) && isNullOrUndefined(this._description)) {
      this.updateDescriptionTextLabel(this._track?.label);
    }
  }

  protected trySetOnTrackDeleted() {
    if (this._track && this._trackRepository) {
      this._trackRepository
        .onTrackDeleted$(this._track.id)
        .pipe(takeUntil(this._trackUpdateBreaker.observer))
        .subscribe((event) => {
          this._trackUpdateBreaker.break();
          this.clearContent();
          this._track = void 0;
          this._canRender = false;
        });
    }
  }

  destroy() {
    super.destroy();

    this._trackUpdateBreaker.destroy();
    this._trackSet.complete();
  }
}

export interface MultiTrackLaneConfig extends TimelineLaneConfig {}

export interface MultiTrackLaneTrackConfig {
  /** Zero-based index at which to insert the track into the lane's track list. When omitted, the track is appended at the end. */
  trackOrderIndex?: number | undefined;
}

/**
 * Marks a timeline lane that manages multiple tracks.
 * Use this type when you need to accept any multi-track lane without caring about its concrete type.
 */
export interface MultiTrackTimelineLane<
  C extends MultiTrackLaneConfig = MultiTrackLaneConfig,
  S extends TimelineLaneStyle = TimelineLaneStyle,
  T extends Track = Track,
  TC extends MultiTrackLaneTrackConfig = MultiTrackLaneTrackConfig,
> extends TimelineLaneApi<S> {
  /**
   * Adds a track to this lane. Accepts either the track object itself or its ID, in which case
   * the track is resolved from the track repository.
   *
   * @param trackOrId - The track to add, or the ID of a track already registered in the track repository.
   * @param config - Optional per-track configuration (insertion index, style overrides, etc.).
   * @throws If a track with the same ID has already been added to this lane.
   * @throws If an ID is provided but no matching track exists in the track repository.
   */
  addTrack(track: T, config?: TC): void;
  addTrack(id: T['id'], config?: TC): void;

  /** Returns a shallow copy of all tracks currently added to this lane, in insertion order. */
  getTracks(): T[];
}

export abstract class BaseMultiTrackLane<C extends MultiTrackLaneConfig, S extends TimelineLaneStyle, T extends Track, TC extends MultiTrackLaneTrackConfig>
  extends BaseTimelineLane<C, S>
  implements MultiTrackTimelineLane<C, S, T, TC>
{
  protected _trackRepository?: TrackRepository;

  protected _tracks: T[] = [];
  protected _tracksMap: Map<T['id'], T> = new Map<T['id'], T>();
  protected _trackConfigs: Map<T['id'], TC> = new Map<T['id'], TC>();
  protected _trackBreakers: Map<T['id'], ObserverBreaker> = new Map<T['id'], ObserverBreaker>();

  protected _canRender = false;

  protected constructor(config: C, style?: Partial<S>) {
    super(config, style);

    this._prepared
      .pipe(filter((p) => p))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe((prepared) => {
        this._canRender = prepared;
        this.render();
      });
  }

  protected abstract render(): void;

  protected abstract updatePositions(): void;

  protected abstract onTrackRemoved(trackId: T['id']): void;

  protected abstract hasVisualElements(): boolean;

  protected settleLayout(): void {
    if (this._loadingGroup && this._timeline) {
      this._loadingGroup.setAttrs({x: 0, y: this.getTimecodedRect().y});
    }
  }

  protected showLoadingGroup(): void {
    if (!this._loadingGroup && this._timeline) {
      const containerDim = this._timeline.getTimecodedContainerDimension();
      const timecodedRect = this.getTimecodedRect();
      this._loadingGroup = new Konva.Group({listening: false, x: 0, y: timecodedRect.y});
      this._loadingAnimation = this.createLoadingGroupContent(containerDim.width, this.style.height);
      this._timeline.addToTimecodedStaticContent(this._loadingGroup);
    }
    this._loadingAnimation?.start();
    this._loadingGroup?.show();
  }

  protected createLoadingGroupContent(width: number, height: number): Konva.Animation {
    const paddingTop = (this.style as Partial<{paddingTop: number}>).paddingTop ?? 0;
    const paddingBottom = (this.style as Partial<{paddingBottom: number}>).paddingBottom ?? 0;
    const contentY = paddingTop;
    const contentHeight = height - paddingTop - paddingBottom;
    if (this.style.loadingAnimationType === 'gradient') {
      return gradientAnimation({
        group: this._loadingGroup!,
        width,
        height: contentHeight,
        y: contentY,
        fill: this.style.loadingAnimationFill ?? '#ffffff',
        ...(this.style.loadingAnimationSpeed !== undefined && {period: this.style.loadingAnimationSpeed}),
      });
    }
    const rect = KonvaFactory.createRect({x: 0, y: contentY, width, height: contentHeight, fill: this.style.loadingAnimationFill, listening: false});
    this._loadingGroup!.add(rect);
    return pulseAnimation({node: rect, ...(this.style.loadingAnimationSpeed !== undefined && {period: this.style.loadingAnimationSpeed})});
  }

  protected hideLoadingGroup(): void {
    this._loadingAnimation?.stop();
    this._loadingGroup?.hide();
  }

  protected updateLoadingVisibility(): void {
    if (this._config.loadingAnimation && this._tracks.some((t) => t.loadStage.status === OpStageStatus.IN_PROGRESS) && !this.hasVisualElements()) {
      this.showLoadingGroup();
    } else {
      this.hideLoadingGroup();
    }
  }

  /**
   * @internal
   * @param timeline
   * @param player
   * @param ompProvider
   */
  override prepareForTimeline(timeline: TimelineImpl, player: PlayerApi, ompProvider: OmpProvider): void {
    super.prepareForTimeline(timeline, player, ompProvider);
    this._trackRepository = ompProvider.trackRepository;
  }

  addTrack(track: T, config?: TC): void;
  addTrack(id: T['id'], config?: TC): void;
  addTrack(trackOrId: T | T['id'], config?: TC): void {
    const track: T = typeof trackOrId === 'string' ? (this._trackRepository!.getOrFail(trackOrId) as T) : trackOrId;
    const isFirstTrack = this._tracks.length === 0;

    if (this._tracksMap.has(track.id)) {
      throw new Error(`Track with id ${track.id} already added`);
    }

    const trackBreaker = new ObserverBreaker();
    this._trackBreakers.set(track.id, trackBreaker);

    this._tracksMap.set(track.id, track);

    if (config) {
      this._trackConfigs.set(track.id, config);
    }

    if (config?.trackOrderIndex !== undefined) {
      if (config.trackOrderIndex < 0 || config.trackOrderIndex > this._tracks.length) {
        throw new Error(`Index ${config.trackOrderIndex} is out of bounds for tracks array of length ${this._tracks.length}`);
      }
      this._tracks.splice(config.trackOrderIndex, 0, track);
    } else {
      this._tracks.push(track);
    }

    this._prepared
      .pipe(
        filter((p) => p),
        take(1),
        takeUntil(trackBreaker.observer),
        takeUntil(this._destroyBreaker.observer)
      )
      .subscribe(() => {
        this.trySetOnTrackDeleted(track, trackBreaker);
      });

    track.onEvent$
      .pipe(filter((p) => p.type === TrackEventType.TRACK_LOADING || p.type === TrackEventType.TRACK_LOADED || p.type === TrackEventType.TRACK_LOAD_ERROR))
      .pipe(takeUntil(trackBreaker.observer))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(() => this.updateLoadingVisibility());

    this.updateLoadingVisibility();

    if (isFirstTrack && !this._config.description && !this._description) {
      this.updateDescriptionTextLabel(track.label);
    }
  }

  removeTrack(trackId: T['id']): void {
    if (!this._tracksMap.has(trackId)) {
      throw new Error(`Track with id ${trackId} not found`);
    }

    const index = this._tracks.findIndex((t) => t.id === trackId);
    this._tracks.splice(index, 1);
    this._tracksMap.delete(trackId);
    this._trackConfigs.delete(trackId); // delete track lane config

    const breaker = this._trackBreakers.get(trackId);
    breaker?.destroy();
    this._trackBreakers.delete(trackId);

    this.onTrackRemoved(trackId);
    this.updateLoadingVisibility();
  }

  getTracks(): T[] {
    return [...this._tracks];
  }

  protected trySetOnTrackDeleted(track: T, trackBreaker: ObserverBreaker) {
    this._trackRepository!.onTrackDeleted$(track.id)
      .pipe(takeUntil(trackBreaker.observer))
      .pipe(takeUntil(this._destroyBreaker.observer))
      .subscribe(() => {
        this.removeTrack(track.id);
      });
  }

  destroy() {
    super.destroy();

    this._trackBreakers.forEach((breaker) => breaker.destroy());
    this._trackBreakers.clear();
  }
}
