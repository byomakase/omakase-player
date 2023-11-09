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
import Decimal from "decimal.js";
import {Constants} from "../constants";
import {ColorUtil} from "./color-util";

export class ShapeUtil {
    static createGoldenRatioWedge(config: {
        x: number,
        y: number,
        height: number,
        color: string
    }): Konva.Line {
        let b = new Decimal(config.height).div(Constants.GOLDEN_RATIO + 1).toDecimalPlaces(2).toNumber();
        let a = config.height - b;
        let halfWidth = a / 2;
        return new Konva.Line({
            points: [
                config.x - halfWidth, config.y,
                config.x + halfWidth, config.y,
                config.x + halfWidth, config.y + a,
                config.x, config.y + a + b,
                config.x - halfWidth, config.y + a,
            ],
            fill: config.color,
            stroke: config.color,
            closed: true,
            listening: false
        })
    }

    static createTriangle(config: {
        x: number,
        y: number,
        height: number,
        color: string
    }): Konva.Line {
        let halfWidth = config.height / 2;
        return new Konva.Line({
            points: [
                config.x - halfWidth, config.y,
                config.x + halfWidth, config.y,
                config.x, config.y + config.height,
            ],
            fill: config.color,
            closed: true,
            listening: false
        })
    }

    static createEventCatcher(config: Konva.RectConfig = {}) {
        return new Konva.Rect({
            ...Constants.POSITION_TOP_LEFT,
            opacity: 0,
            listening: true,
            ...config,
        });
    }

    static createDebugRect() {
        return new Konva.Rect({
            ...Constants.POSITION_TOP_LEFT,
            width: 100,
            height: 100,
            fill: ColorUtil.randomHexColor(),
            opacity: 1,
        });
    }
}
