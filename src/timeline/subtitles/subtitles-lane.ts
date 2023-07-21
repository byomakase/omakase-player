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

import {BaseTimelineLane, TimelaneLaneConfig, TIMELINE_LANE_STYLE_DEFAULT, TimelineLaneStyle} from "../timeline-lane";
import Konva from "konva";
import {ShapeUtil} from "../../util/shape-util";
import {Constants} from "../../constants";
import {catchError, debounceTime, first, map, Observable, of, Subject, take, takeUntil} from "rxjs";
import {SubtitlesVttFile} from "../../track/subtitles-vtt-file";
import {HorizontalMeasurement, Position} from "../../common/measurement";
import {OmakaseTextTrackCue, SubtitlesVttCue} from "../../types";
import {SubtitlesLaneItem} from "./subtitles-lane-item";
import {ComponentConfigStyleComposed} from "../../common/component";

export interface SubtitlesLaneStyle extends TimelineLaneStyle {
    paddingTop: number;
    paddingBottom: number;
    subtitlesLaneItemOpacity: number;
    subtitlesLaneItemFill: string;
}

const styleDefault: SubtitlesLaneStyle = {
    ...TIMELINE_LANE_STYLE_DEFAULT,
    height: 40,
    paddingTop: 0,
    paddingBottom: 0,
    subtitlesLaneItemOpacity: 0.9,
    subtitlesLaneItemFill: 'rgba(255,73,145)'
}

export interface SubtitlesLaneConfig extends TimelaneLaneConfig<SubtitlesLaneStyle> {
    subtitlesVttUrl: string;
}

export class SubtitlesLane extends BaseTimelineLane<SubtitlesLaneConfig, SubtitlesLaneStyle> {
    // region config
    private _subtitlesVttUrl: string;
    // endregion

    // region components
    protected readonly subtitlesLaneItemsMap: Map<number, SubtitlesLaneItem> = new Map<number, SubtitlesLaneItem>();
    // endregion

    // region konva
    protected timecodedGroup: Konva.Group;
    protected timecodedEventCatcher: Konva.Rect;
    protected subtitlesLaneItemsGroup: Konva.Group;
    // endregion

    private subtitlesVttFile: SubtitlesVttFile;

    readonly onSettleLayout$: Subject<void> = new Subject<void>();

    constructor(config: ComponentConfigStyleComposed<SubtitlesLaneConfig>) {
        super({
            ...config,
            style: {
                ...styleDefault,
                ...config.style
            }
        });

        this._subtitlesVttUrl = this.config.subtitlesVttUrl;
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

        this.subtitlesLaneItemsGroup = new Konva.Group({
            ...Constants.POSITION_TOP_LEFT,
            y: this.style.paddingTop,
            width: this.timecodedGroup.width(),
            height: this.timecodedGroup.height() - (this.style.paddingTop + this.style.paddingBottom)
        });

        this.timecodedGroup.add(this.timecodedEventCatcher);
        this.timecodedGroup.add(this.subtitlesLaneItemsGroup);

        this.timeline.addToTimecodedSubtitlesGroup(this.timecodedGroup);

        return this.bodyGroup;
    }

    protected settleLayout() {
        super.settleLayout();

        this.timecodedGroup.setAttrs({
            ...this.timelinePosition,
        })

        let horizontalMeasurement = this.timeline.getTimecodedGroupHorizontalMeasurement();
        [this.timecodedGroup, this.timecodedEventCatcher, this.subtitlesLaneItemsGroup].forEach(node => {
            node.width(horizontalMeasurement.width)
        })

        this.onSettleLayout$.next();
    }

    protected afterCanvasNodeInit() {
        super.afterCanvasNodeInit();

        this.fetchAndCreateSubtitles();
    }

    clearContent() {
        this.subtitlesVttFile = void 0;
        this.clearItems();
    }

    private clearItems(){
        this.subtitlesLaneItemsMap.forEach(p => p.destroy())
        this.subtitlesLaneItemsMap.clear()
        this.subtitlesLaneItemsGroup.destroyChildren();
    }

    private createEntities() {
        if (!this.isVttLoaded()) {
            return;
        }

        this.clearItems();

        let cues = this.subtitlesVttFile.getCues();

        cues.forEach(cue => {
            let horizontalMeasurement = this.resolveItemHorizontalMeasurement(cue);

            let subtitlesLaneItem = new SubtitlesLaneItem({
                ...horizontalMeasurement,
                textTrackCue: cue,
                style: {
                    height: this.subtitlesLaneItemsGroup.height(),
                    fill: this.style.subtitlesLaneItemFill,
                    opacity: this.style.subtitlesLaneItemOpacity
                }
            }, this);
            this.subtitlesLaneItemsMap.set(cue.startTime, subtitlesLaneItem);
            this.subtitlesLaneItemsGroup.add(subtitlesLaneItem.initCanvasNode());
        })
    }

    resolveItemHorizontalMeasurement(textTrackCue: OmakaseTextTrackCue): HorizontalMeasurement {
        let startTimeX = this.timeline.constrainTimelinePosition(this.timeline.timeToTimelinePosition(textTrackCue.startTime));
        let endTimeX = this.timeline.constrainTimelinePosition(this.timeline.timeToTimelinePosition(textTrackCue.endTime));
        return {
            x: startTimeX,
            width: endTimeX - startTimeX
            // width: new Decimal(endTimeX - startTimeX).ceil().toNumber()
        }
    }

    private fetchAndCreateSubtitles() {
        this.fetchSubtitlesVttFile(this._subtitlesVttUrl).pipe(take(1)).subscribe((subtitlesVttFile) => {
            this.subtitlesVttFile = subtitlesVttFile;
            this.createEntities();
        })
    }

    private fetchSubtitlesVttFile(url: string): Observable<SubtitlesVttFile> {
        if (url) {
            return SubtitlesVttFile.create(url).pipe(map(subtitlesVttFile => {
                return subtitlesVttFile;
            }), catchError((err, caught) => {
                return of(void 0);
            }))
        } else {
            return of(void 0);
        }
    }

    isVttLoaded(): boolean {
        return !!this.subtitlesVttFile;
    }

    get subtitlesVttUrl(): string {
        return this._subtitlesVttUrl;
    }

    set subtitlesVttUrl(value: string) {
        this._subtitlesVttUrl = value;
        this.clearContent();
        this.fetchAndCreateSubtitles();
    }
}
