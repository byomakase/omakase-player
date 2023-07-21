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

import Decimal from "decimal.js";
import {FrameUtil} from "./frame-util";

export class TimeUtil {
    public static readonly VIDEO_ZERO_TIMESTAMP = `${TimeUtil.padZero(0)}:${TimeUtil.padZero(0)}:${TimeUtil.padZero(0)}:${TimeUtil.padZero(0)}`;

    static formatVideoTimestamp(time: number, frameRateDecimal: Decimal) {
        if (time <= 0) {
            return TimeUtil.VIDEO_ZERO_TIMESTAMP;
        }

        const hours = Math.floor(time / 3600);
        const minutes = Math.floor((time % 3600) / 60);
        const seconds = Math.floor(time % 60);

        let frameInSecond = new Decimal(FrameUtil.timeToFrame(time, frameRateDecimal)).mod(frameRateDecimal).toNumber();
        return `${TimeUtil.padZero(hours)}:${TimeUtil.padZero(minutes)}:${TimeUtil.padZero(seconds)}:${TimeUtil.padZero(frameInSecond)}`;
    }

    private static padZero(num, length = 2) {
        return num.toString().padStart(length, "0");
    }
}
