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
import {IFrame} from "konva/lib/types";

export interface AnimateConf {
    layer: Konva.Layer,
    duration: number,
    from: number,
    to: number,
    onUpdateHandler: (frame: IFrame, value: number) => void,
    onCompleteHandler?: (frame: IFrame, value: number) => void
}

export function animate(conf: AnimateConf) {
    if (conf.from === conf.to) {
        return;
    }

    let isRising = conf.from < conf.to;

    // we will always animate from 0 to maxValue
    let maxValue = isRising ? (conf.to - conf.from) : (conf.from - conf.to);

    let animation = new Konva.Animation((frame) => {
        let newValue = Konva.Easings.StrongEaseInOut(frame.time, 0, maxValue, conf.duration);

        if (newValue >= maxValue) {
            conf.onUpdateHandler(frame, conf.to); // trigger update on last possible value, which is conf.to
            animation.stop();
            if (conf.onCompleteHandler) {
                conf.onCompleteHandler(frame, conf.to);
                animation = null;
            }
        } else {
            let updatedValue = conf.from + newValue * (isRising ? 1 : -1);
            conf.onUpdateHandler(frame, updatedValue);
        }

    }, conf.layer);

    animation.start();
}
