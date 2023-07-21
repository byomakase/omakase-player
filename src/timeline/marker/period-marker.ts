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
import {BaseMarker, MARKER_STYLE_DEFAULT, MarkerConfig, MarkerStyle} from "./marker";
import {PeriodMarkerChangeEvent, PeriodObservation} from "../../types";
import {BaseMarkerHandle, MARKER_HANDLE_STYLE_DEFAULT, MarkerHandleConfig, MarkerHandleStyle} from "./marker-handle";
import Decimal from "decimal.js";
import {VerticalMeasurement} from "../../common/measurement";
import {Timeline} from "../timeline";
import {MarkerLane} from "./marker-lane";
import {takeUntil} from "rxjs";
import {ComponentConfigStyleComposed} from "../../common/component";
import {z, ZodType} from "zod";
import {isNullOrUndefined} from "../../util/object-util";

// region marker handle
export interface PeriodMarkerHandleStyle extends MarkerHandleStyle {
    markerSymbolSize: number
    periodMarkerHandleType: 'start' | 'end';
}

export interface PeriodMarkerHandleConfig extends MarkerHandleConfig<PeriodMarkerHandleStyle> {

}

const markerHandleConfigDefault: Partial<PeriodMarkerHandleConfig> = {
    editable: true,
    style: {
        ...MARKER_HANDLE_STYLE_DEFAULT,
        markerSymbolSize: 20,
        periodMarkerHandleType: 'start'
    }
}

export class PeriodMarkerHandle extends BaseMarkerHandle<PeriodMarkerHandleConfig, PeriodMarkerHandleStyle> {

    constructor(config: ComponentConfigStyleComposed<PeriodMarkerHandleConfig>, markerLane: MarkerLane, timeline: Timeline) {
        super({
            ...markerHandleConfigDefault,
            ...config,
            style: {
                ...markerHandleConfigDefault.style,
                ...config.style,
            },
        }, markerLane, timeline);
    }

    protected createSymbol(): Konva.Shape {
        switch (this.style.markerSymbolType) {
            case 'triangle':
                let diagonal = Decimal.sqrt(2).mul(this.style.markerSymbolSize).toNumber();
                let halfDiagonal = diagonal / 2;
                return new Konva.Line({
                    points: this.style.periodMarkerHandleType === 'start' ? [-halfDiagonal, 0, 0, 0, 0, halfDiagonal] : [0, 0, halfDiagonal, 0, 0, halfDiagonal],
                    fill: this.style.color,
                    closed: true,
                    offsetY: halfDiagonal / 2,
                })
            case 'circle':
                return new Konva.Arc({
                    fill: this.style.color,
                    innerRadius: 0,
                    outerRadius: this.style.markerSymbolSize / 2,
                    angle: 180,
                    rotation: this.style.periodMarkerHandleType === 'start' ? 90 : -90
                })
            case 'square':
                return new Konva.Line({
                    points: [
                        0, 0,
                        this.style.markerSymbolSize, 0,
                        this.style.markerSymbolSize, this.style.markerSymbolSize
                    ],
                    fill: this.style.color,
                    closed: true,
                    rotation: this.style.periodMarkerHandleType === 'start' ? 225 : 45,
                    offsetX: this.style.markerSymbolSize / 2,
                    offsetY: this.style.markerSymbolSize / 2,
                })
            default:
                throw Error('Unknown type');
        }
    }
}

// endregion

export interface PeriodMarkerStyle extends MarkerStyle {
    selectedAreaOpacity: number;
    markerHandleAreaOpacity: number;
}

export interface PeriodMarkerConfig extends MarkerConfig<PeriodObservation, PeriodMarkerStyle> {

}

const markerConfigDefault: Partial<PeriodMarkerConfig> = {
    editable: true,
    style: {
        ...MARKER_STYLE_DEFAULT,
        selectedAreaOpacity: 0.2,
        markerHandleAreaOpacity: 0.7
    }
}

export class PeriodMarker extends BaseMarker<PeriodObservation, PeriodMarkerConfig, PeriodMarkerStyle, PeriodMarkerChangeEvent> {
    private startMarkerHandle: PeriodMarkerHandle;
    private endMarkerHandle: PeriodMarkerHandle;

    // region konva
    private selectedAreaRect: Konva.Rect;
    private markerHandleRect: Konva.Rect;

    // endregion

    constructor(config: ComponentConfigStyleComposed<PeriodMarkerConfig>) {
        super({
            ...markerConfigDefault,
            ...config,
            style: {
                ...markerConfigDefault.style,
                ...config.style,
            },
        });

        this.observation.start = z.coerce.number()
            .min(0)
            .optional()
            .nullable()
            .parse(this.observation.start);

        this.observation.end = z.coerce.number()
            .min(0)
            .optional()
            .nullable()
            .parse(this.observation.end);

        if (!isNullOrUndefined(this.observation.end) && !isNullOrUndefined(this.observation.start)) {
            this.observation.start = z.coerce.number()
                .lte(this.observation.end)
                .parse(this.observation.start);
        }

    }

    protected createCanvasNode(): Konva.Group {
        super.createCanvasNode();

        this.initStartMarkerHandle();
        this.initEndMarkerHandle();
        this.initSelectedAreaRect();

        return this.group;
    }

    onChange() {
        this.settlePosition()
        let event: PeriodMarkerChangeEvent = {
            timeObservation: this.observation
        }
        this.onChange$.next(event)
    }

    onMeasurementsChange() {
        super.onMeasurementsChange();

        if (this.hasStart() && this.hasEnd()) {
            let verticalMeasurement = this.startMarkerHandle.getVerticalMeasurement();

            this.selectedAreaRect.setAttrs({
                y: verticalMeasurement.y,
                height: verticalMeasurement.height,
            });

            let markerHandleVerticalMeasurement: VerticalMeasurement = {
                y: this.startMarkerHandle.getHandleGroup().y(),
                height: this.startMarkerHandle.getHandleGroup().getClientRect().height
            }

            this.markerHandleRect.setAttrs({
                y: verticalMeasurement.y + markerHandleVerticalMeasurement.y - markerHandleVerticalMeasurement.height / 2,
                height: markerHandleVerticalMeasurement.height,
            });
        }

        this.settlePosition();
    }

    private initSelectedAreaRect() {
        if (this.selectedAreaRect) {
            this.selectedAreaRect.destroy();
        }

        if (this.markerHandleRect) {
            this.markerHandleRect.destroy();
        }

        if (!this.hasStart() || !this.hasEnd()) {
            return;
        }

        let verticalMeasurement = this.startMarkerHandle.getVerticalMeasurement();
        let startX = this.timeline.timeToTimelinePosition(this.observation.start);
        let endX = this.timeline.timeToTimelinePosition(this.observation.end);

        this.selectedAreaRect = new Konva.Rect({
            x: startX,
            y: verticalMeasurement.y,
            width: endX - startX,
            height: verticalMeasurement.height,
            listening: false,
            fill: this.style.color,
            opacity: this.style.selectedAreaOpacity
        })

        let markerHandleVerticalMeasurement: VerticalMeasurement = {
            y: this.startMarkerHandle.getHandleGroup().y(),
            height: this.startMarkerHandle.getHandleGroup().getClientRect().height
        }

        this.markerHandleRect = new Konva.Rect({
            x: startX,
            y: verticalMeasurement.y + markerHandleVerticalMeasurement.y - markerHandleVerticalMeasurement.height / 2,
            width: endX - startX,
            height: markerHandleVerticalMeasurement.height,
            listening: false,
            fill: this.style.color,
            opacity: this.style.markerHandleAreaOpacity
        })

        this.group.add(this.selectedAreaRect);
        this.group.add(this.markerHandleRect);
    }

    private initStartMarkerHandle() {
        if (this.startMarkerHandle) {
            this.startMarkerHandle.destroy();
            this.startMarkerHandle = void 0;
        }

        if (!this.hasStart()) {
            return;
        }

        let startX = this.timeline.timeToTimelinePosition(this.observation.start);
        this.startMarkerHandle = new PeriodMarkerHandle({
            x: startX,
            editable: this.editable,
            style: {
                color: this.style.color,
                markerRenderType: this.style.renderType,
                markerSymbolType: this.style.symbolType,
                periodMarkerHandleType: 'start',
            }
        }, this.markerLane, this.timeline);

        this.startMarkerHandle.onDrag = (markerHandleGroup) => {
            if (this.editable) {
                if (this.hasEnd()) {
                    if (markerHandleGroup.x() > this.endMarkerHandle.getPosition().x) {
                        markerHandleGroup.x(this.endMarkerHandle.getPosition().x);
                    }
                }
                this.settleMeasurements()
                if (this.hasStart() && this.hasEnd()) {
                    this.markerHandleRect.opacity(1);
                }
            }
        }

        this.startMarkerHandle.onDragEnd = (markerHandleGroup) => {
            if (this.editable) {
                let newTime = this.timeline.timelinePositionToTime(markerHandleGroup.x());
                this.setTimeObservation({
                    ...this.observation,
                    start: newTime
                })
                if (this.hasStart() && this.hasEnd()) {
                    this.markerHandleRect.opacity(this.style.markerHandleAreaOpacity);
                }
            }
        }

        this.group.add(this.startMarkerHandle.initCanvasNode());
    }

    private initEndMarkerHandle() {
        if (this.endMarkerHandle) {
            this.endMarkerHandle.destroy();
            this.endMarkerHandle = void 0;
        }

        if (!this.hasEnd()) {
            return;
        }

        let endX = this.hasEnd() ? this.timeline.timeToTimelinePosition(this.observation.end) : void 0;
        this.endMarkerHandle = new PeriodMarkerHandle({
            x: endX,
            editable: this.editable,
            style: {
                periodMarkerHandleType: 'end',
                color: this.style.color,
                markerRenderType: this.style.renderType,
                markerSymbolType: this.style.symbolType
            }
        }, this.markerLane, this.timeline);

        this.endMarkerHandle.onDrag = (markerHandleGroup) => {
            if (this.editable) {
                if (this.hasStart()) {
                    if (markerHandleGroup.x() < this.startMarkerHandle.getPosition().x) {
                        markerHandleGroup.x(this.startMarkerHandle.getPosition().x);
                    }
                }
                this.settleMeasurements()
                if (this.hasStart() && this.hasEnd()) {
                    this.markerHandleRect.opacity(1);
                }
            }
        }

        this.endMarkerHandle.onDragEnd = (markerHandleGroup) => {
            if (this.editable) {
                let newTime = this.timeline.timelinePositionToTime(markerHandleGroup.x());
                this.setTimeObservation({
                    ...this.observation,
                    end: newTime
                })
                if (this.hasStart() && this.hasEnd()) {
                    this.markerHandleRect.opacity(this.style.markerHandleAreaOpacity);
                }
            }
        }

        this.group.add(this.endMarkerHandle.initCanvasNode());
    }

    private settlePosition() {
        if (this.hasStart()) {
            this.startMarkerHandle.setPosition({
                ...this.startMarkerHandle.getPosition(),
                x: this.timeline.timeToTimelinePosition(this.observation.start)
            })
        }

        if (this.hasEnd()) {
            this.endMarkerHandle.setPosition({
                ...this.endMarkerHandle.getPosition(),
                x: this.timeline.timeToTimelinePosition(this.observation.end)
            })
        }

        this.settleMeasurements();
    }

    private settleMeasurements() {
        if (this.hasStart() && this.hasEnd()) {
            this.selectedAreaRect.setAttrs({
                x: this.startMarkerHandle.getPosition().x,
                width: this.endMarkerHandle.getPosition().x - this.startMarkerHandle.getPosition().x
            })
            this.markerHandleRect.setAttrs({
                x: this.startMarkerHandle.getPosition().x,
                width: this.endMarkerHandle.getPosition().x - this.startMarkerHandle.getPosition().x
            })
        }
    }

    setTimeObservation(timeObservation: PeriodObservation) {
        if (this.editable) {
            this.observation = timeObservation;

            this.initStartMarkerHandle();
            this.initEndMarkerHandle();
            this.initSelectedAreaRect();

            this.onChange();
        }
    }

    setEditable(editable: boolean) {
        super.setEditable(editable);
    }

    protected afterCanvasNodeInit() {
        super.afterCanvasNodeInit();

        this.styleAdapter.onChange$.pipe(takeUntil(this.onDestroy$)).subscribe((style) => {
            if (this.hasStart()) {
                this.initStartMarkerHandle();
            }

            if (this.hasEnd()) {
                this.initEndMarkerHandle()
            }

            if (this.hasStart() && this.hasEnd()) {
                this.initSelectedAreaRect();
            }
        })
    }

    private hasStart() {
        return this.observation && !isNullOrUndefined(this.observation.start);
    }

    private hasEnd() {
        return this.observation && !isNullOrUndefined(this.observation.end);
    }
}
