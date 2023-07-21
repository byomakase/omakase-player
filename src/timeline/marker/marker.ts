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

import {OnMeasurementsChange} from "../../common/measurement";
import {BaseComponent, Component, ComponentConfig} from "../../common/component";
import Konva from "konva";
import {HasMarkerLane, MarkerLane} from "./marker-lane";
import {MarkerChangeEvent, MarkerEvent, TimeObservation} from "../../types";
import {Constants} from "../../constants";
import {Subject, takeUntil} from "rxjs";
import {Timeline} from "../timeline";
import {Validators} from "../../validators";
import {completeSubjects, unsubscribeSubjects} from "../../util/observable-util";

export type MarkerRenderType = 'lane' | 'spanning'
export type MarkerSymbolType = 'square' | 'triangle' | 'circle';

export interface MarkerStyle {
    color: string;
    renderType: MarkerRenderType;
    symbolType: MarkerSymbolType;
}

export const MARKER_STYLE_DEFAULT: MarkerStyle = {
    color: 'rgba(255,73,145)',
    renderType: 'lane',
    symbolType: 'square'
}

export interface MarkerConfig<T extends TimeObservation, S extends MarkerStyle> extends ComponentConfig<S> {
    id: string;
    observation: T;
    description?: string;
    editable?: boolean;
}

export interface Marker<T extends TimeObservation, C extends MarkerConfig<T, S>, S extends MarkerStyle, E extends MarkerChangeEvent> extends Component<C, S, Konva.Group>, HasMarkerLane, OnMeasurementsChange {
    onChange$: Subject<E>;
    onClick$: Subject<MarkerEvent>;
    onMouseEnter$: Subject<MarkerEvent>;
    onMouseLeave$: Subject<MarkerEvent>;

    get style(): S;

    setStyle(value: Partial<S>);

    getId(): string;

    getDescription(): string;

    getTimeObservation(): T;

    setTimeObservation(timeObservation: T): void;

    setEditable(editable: boolean);

    setTimeline(timeline: Timeline);
}

export type GenericMarker = Marker<TimeObservation, MarkerConfig<TimeObservation, MarkerStyle>, MarkerStyle, MarkerChangeEvent>;

export abstract class BaseMarker<T extends TimeObservation, C extends MarkerConfig<T, S>, S extends MarkerStyle, E extends MarkerChangeEvent> extends BaseComponent<C, S, Konva.Group> implements Marker<T, C, S, E> {
    protected id: string;
    protected observation: T;
    protected description: string;
    protected editable: boolean;

    // region konva
    protected group: Konva.Group;
    // endregion

    protected markerLane: MarkerLane;
    protected timeline: Timeline;

    public readonly onChange$: Subject<E> = new Subject<E>();
    public readonly onClick$: Subject<MarkerEvent> = new Subject<MarkerEvent>();
    public readonly onMouseEnter$: Subject<MarkerEvent> = new Subject<MarkerEvent>();
    public readonly onMouseLeave$: Subject<MarkerEvent> = new Subject<MarkerEvent>();

    protected constructor(config: C) {
        super(config);
        this.id = Validators.id()(this.config.id);
        this.description = Validators.description()(this.config.description);
        this.editable = Validators.boolean()(this.config.editable);
        this.observation = this.config.observation;
    }

    protected createCanvasNode(): Konva.Group {
        this.group = new Konva.Group({
            ...Constants.POSITION_TOP_LEFT,
            ...this.timeline.getTimecodedGroupDimension()
        });

        return this.group;
    }

    protected afterCanvasNodeInit() {
        this.timeline.onZoom$.pipe(takeUntil(this.onDestroy$)).subscribe((event) => {
            this.onMeasurementsChange();
        })

        this.group.on('click', (event) => {
            this.onClick$.next({})
        })

        this.group.on('mouseenter', (event) => {
            this.onMouseEnter$.next({})
        })

        this.group.on('mouseleave', (event) => {
            this.onMouseLeave$.next({})
        })
    }

    onMeasurementsChange() {
        this.group.setAttrs({
            ...this.timeline.getTimecodedGroupDimension()
        })
    }

    destroy() {
        super.destroy();

        let subjects = [this.onChange$, this.onClick$, this.onMouseEnter$, this.onMouseLeave$];
        completeSubjects(...subjects);
        unsubscribeSubjects(...subjects)
    }

    abstract onChange();

    setTimeline(timeline: Timeline) {
        this.timeline = timeline;
    }

    setMarkerLane(markerLane: MarkerLane) {
        this.markerLane = markerLane;
    }

    getId(): string {
        return this.id;
    }

    getDescription(): string {
        return this.description;
    }

    getTimeObservation(): T {
        return this.observation;
    }

    setTimeObservation(timeObservation: T) {
        if (this.editable) {
            this.observation = timeObservation;
            this.onChange();
        }
    }

    setEditable(editable: boolean) {
        this.editable = editable;
    }

    get style(): S {
        return this.styleAdapter.style;
    }

    setStyle(value: Partial<S>) {
        this.styleAdapter.style = value;
    }
}
