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

import {BaseComponent, ComponentConfig, ComponentConfigStyleComposed, composeConfigAndDefault} from "../../common/component";
import Konva from "konva";
import {Dimension, HasRectMeasurement, OnMeasurementsChange, Position, RectMeasurement} from "../../common/measurement";
import {Comparable, ThumbnailEvent, ThumbnailVttCue} from "../../types";
import {Constants} from "../../constants";
import {Subject} from "rxjs";
import {completeSubjects, unsubscribeSubjects} from "../../util/observable-util";

export interface ThumbnailStyle {
    x: number;
    y: number;
    width: number;
    height: number;
    stroke: string;
    strokeWidth: number;
    visible: boolean;
}

export interface ThumbnailConfig extends ComponentConfig<ThumbnailStyle> {
    listening: boolean;
}

const configDefault: ThumbnailConfig = {
    listening: false,
    style: {
        ...Constants.POSITION_TOP_LEFT,
        ...Constants.DIMENSION_ZERO,
        stroke: 'rgba(255,73,145)',
        strokeWidth: 5,
        visible: false
    }
}

export class Thumbnail extends BaseComponent<ThumbnailConfig, ThumbnailStyle, Konva.Group> implements OnMeasurementsChange, HasRectMeasurement, Comparable<Thumbnail> {
    private listening: boolean;
    private thumbnailVttCue: ThumbnailVttCue;

    // region konva
    private group: Konva.Group;
    private backgroundRect: Konva.Rect;
    private image: Konva.Image;
    // endregion

    public readonly onClick$: Subject<ThumbnailEvent> = new Subject<ThumbnailEvent>();
    public readonly onMouseOver$: Subject<ThumbnailEvent> = new Subject<ThumbnailEvent>();
    public readonly onMouseMove$: Subject<ThumbnailEvent> = new Subject<ThumbnailEvent>();
    public readonly onMouseOut$: Subject<ThumbnailEvent> = new Subject<ThumbnailEvent>();
    public readonly onMouseLeave$: Subject<ThumbnailEvent> = new Subject<ThumbnailEvent>();

    constructor(config: Partial<ComponentConfigStyleComposed<ThumbnailConfig>>) {
        super(composeConfigAndDefault(config, configDefault));

        this.listening = this.config.listening;
    }

    protected createCanvasNode(): Konva.Group {
        this.group = new Konva.Group({
            x: this.style.x,
            y: this.style.y,
            width: this.style.width,
            height: this.style.height,
            visible: this.style.visible,
            listening: this.listening
        });

        this.backgroundRect = new Konva.Rect({
            x: 0,
            y: 0,
            width: this.group.width(),
            height: this.group.height(),
            strokeWidth: this.style.strokeWidth,
            stroke: this.style.stroke
        })

        this.group.add(this.backgroundRect)

        return this.group;
    }

    protected afterCanvasNodeInit() {
        this.group.on('click', (event) => {
            this.onClick$.next({
                thumbnail: this
            })
        })

        this.group.on('mouseover', (event) => {
            this.onMouseOver$.next({
                thumbnail: this
            })
        })

        this.group.on('mousemove', (event) => {
            this.onMouseMove$.next({
                thumbnail: this
            })
        })

        this.group.on('mouseout', (event) => {
            this.onMouseOut$.next({
                thumbnail: this
            })
        })

        this.group.on('mouseleave', (event) => {
            this.onMouseLeave$.next({
                thumbnail: this
            })
        })

        this.group.on('touchstart', (event) => {
            this.onMouseOver$.next({
                thumbnail: this
            })
        })

        this.group.on('touchend', (event) => {
            this.onClick$.next({
                thumbnail: this
            })
            this.onMouseOut$.next({
                thumbnail: this
            })
        })
    }

    destroy() {
        this.thumbnailVttCue = void 0;
        for (let eventListenersKey in this.group.eventListeners) {
            this.group.removeEventListener(eventListenersKey);
        }

        let subjects = [this.onClick$, this.onMouseOver$, this.onMouseMove$, this.onMouseOut$, this.onMouseLeave$];
        completeSubjects(...subjects)
        unsubscribeSubjects(...subjects);

        super.destroy();
    }

    onMeasurementsChange() {
        this.backgroundRect.size(this.group.getSize());
    }

    setImage(image: Konva.Image) {
        if (this.image) {
            this.image.destroy();
        }

        this.image = image;

        this.style = {
            width: image.width(),
            height: image.height()
        }

        this.group.setAttrs({
            ...this.image.getSize()
        });

        this.backgroundRect.setAttrs({
            ...this.image.getSize()
        });

        this.group.add(this.image);
    }

    setVisible(visible: boolean) {
        this.style = {
            visible: visible
        }
        if (this.isInitialized()) {
            this.group.visible(visible);
        }
    }

    setPosition(position: Position) {
        this.style = {
            ...position
        }
        if (this.isInitialized()) {
            this.group.position(position)
        }
    }

    setVisibleAndX(visible: boolean, x: number) {
        this.style = {
            visible: visible,
            x: x
        }

        if (this.isInitialized()) {
            this.group.setAttrs({
                visible: visible,
                x: x
            })
        }
    }

    getPosition(): Position {
        return this.group.getPosition();
    }

    getDimension(): Dimension {
        return this.group.getSize();
    }

    setDimension(dimension: Dimension) {
        this.style = {
            ...dimension
        }
        if (this.isInitialized()) {
            this.group.size(dimension);
        }
        this.onMeasurementsChange();
    }

    getRect(): RectMeasurement {
        return {
            ...this.getPosition(),
            ...this.getDimension()
        };
    }

    getThumbnailVttCue(): ThumbnailVttCue {
        return this.thumbnailVttCue;
    }

    setThumbnailVttCue(thumbnailVttCue: ThumbnailVttCue) {
        this.thumbnailVttCue = thumbnailVttCue;
    }

    getImage(): Konva.Image {
        return this.image;
    }

    compareTo(o: Thumbnail): number {
        return this.thumbnailVttCue && o ? this.thumbnailVttCue.url === o.thumbnailVttCue.url ? 0 : -1 : -1;
    }
}
