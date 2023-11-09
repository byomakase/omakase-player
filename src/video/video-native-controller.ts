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

import {HTMLVideoElementEventKeys, VideoController} from "./video-controller";
import {first, forkJoin, fromEvent, Observable} from "rxjs";
import {Video} from "./video";
import {z} from "zod";

export class VideoNativeController extends VideoController {

    constructor(playerHTMLElementId: string, crossorigin: 'anonymous' | 'use-credentials') {
        super(playerHTMLElementId, crossorigin);
    }

    videoLoad(sourceUrl: string, frameRate: number, duration: number): Observable<Video> {
        return new Observable<Video>(o$ => {
            let videoLoadedData$ = fromEvent(this.videoElement, HTMLVideoElementEventKeys.LOADEDDATA).pipe(first());

            forkJoin([videoLoadedData$]).pipe(first()).subscribe(result => {
                duration = duration ? z.coerce.number().parse(duration) : duration;
                duration = duration ? duration : this.videoElement.duration;
                let video = new Video(sourceUrl, frameRate, duration)

                o$.next(video);
                o$.complete();
            })

            this.videoElement.src = sourceUrl;
            this.videoElement.load();
        })
    }

}
