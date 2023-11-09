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

export class TimestampUtil {
    public static readonly VIDEO_ZERO_TIMESTAMP = `${TimestampUtil.padZero(0)}:${TimestampUtil.padZero(0)}:${TimestampUtil.padZero(0)}:${TimestampUtil.padZero(0)}`;

    static formatVideoTimestamp(time: number, frameRateDecimal: Decimal): string {
        if (time <= 0) {
            return TimestampUtil.VIDEO_ZERO_TIMESTAMP;
        }

        const hours = Math.floor(time / 3600);
        const minutes = Math.floor((time % 3600) / 60);
        const seconds = Math.floor(time % 60);

        let frameInSecond = new Decimal(FrameUtil.timeToFrame(time, frameRateDecimal)).mod(frameRateDecimal).toNumber();
        return `${TimestampUtil.padZero(hours)}:${TimestampUtil.padZero(minutes)}:${TimestampUtil.padZero(seconds)}:${TimestampUtil.padZero(frameInSecond)}`;
    }

    static formattedTimestampToFrame(timestamp: string, frameRateDecimal: Decimal): number {
        // Split the timestamp into its components
        const parts = timestamp.split(':');

        // Check if the format is valid
        if (parts.length !== 4) {
            throw new Error('Invalid timestamp format. It should be in the format "HH:MM:SS:FF".');
        }

        // Extract hours, minutes, seconds, and frames
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        const seconds = parseInt(parts[2], 10);
        const frames = parseInt(parts[3], 10);

        // Calculate the total number of frames
        const totalFrames = new Decimal(hours * 3600 + minutes * 60 + seconds).mul(frameRateDecimal).plus(frames).toNumber();
        return totalFrames;
    }

    private static padZero(num, length = 2) {
        return num.toString().padStart(length, "0");
    }
}
