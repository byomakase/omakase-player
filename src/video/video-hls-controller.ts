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
// TODO important when building !
// import Hls from "hls.js/dist/hls.min";
import Hls, {MediaPlaylist} from "hls.js";

import {first, forkJoin, fromEvent, Observable} from "rxjs";
import {Video} from "./video";
import {z} from "zod";

export class VideoHlsController extends VideoController {
    protected hls: Hls;


    constructor(playerHTMLElementId: string, crossorigin: 'anonymous' | 'use-credentials') {
        super(playerHTMLElementId, crossorigin);

        if (Hls.isSupported()) {
            console.debug('video load with hls.js')
        } else {
            console.error('hls is not supported through MediaSource extensions')
        }

        let config = {
            ...Hls.DefaultConfig,
            enableWorker: false
            // TODO for PROD builds we should remove this property and use hls.js/dist/hls.min | See https://github.com/video-dev/hls.js/issues/5146#issuecomment-1375070955
        };

        this.hls = new Hls(config);
    }

    videoLoad(sourceUrl: string, frameRate: number, duration: number): Observable<Video> {
        return new Observable<Video>(o$ => {

            this.hls.on(Hls.Events.ERROR, function (event, data) {
                let errorType = data.type;
                let errorDetails = data.details;
                let errorFatal = data.fatal;

                /**
                 * Temporarily excluding audioTrackLoadError from error handler.
                 * This error propagation is causing that HLS streams, with audio group defined but without audio tracks,
                 * are not to be playable by OmakasePlayer
                 */
                if (!errorDetails.includes("audioTrackLoadError")) {
                    o$.error(`Error loading video. Hls error details: ${errorDetails}`);
                    o$.complete();
                }
            });

            let hlsMediaAttached$ = new Observable<boolean>(o$ => {
                // MEDIA_ATTACHED event is fired by hls object once MediaSource is ready
                this.hls.once(Hls.Events.MEDIA_ATTACHED, function (event, mediaAttachedData) {
                    console.debug('video element and hls.js are now bound together');
                    o$.next(true);
                    o$.complete();
                });
            })

            let hlsManifestParsed$ = new Observable<boolean>(o$ => {
                this.hls.once(Hls.Events.MANIFEST_PARSED, function (event, manifestParsedData) {
                    console.debug('manifest loaded, found ' + manifestParsedData.levels.length + ' quality level');
                    o$.next(true);
                    o$.complete();
                });
            })

            let videoLoadedData$ = fromEvent(this.videoElement, HTMLVideoElementEventKeys.LOADEDDATA).pipe(first());
            let videoLoadedMetadata$ = fromEvent(this.videoElement, HTMLVideoElementEventKeys.LOADEDMETEDATA).pipe(first());

            forkJoin([hlsMediaAttached$, hlsManifestParsed$, videoLoadedData$, videoLoadedMetadata$]).pipe(first()).subscribe(result => {
                duration = duration ? z.coerce.number().parse(duration) : duration;
                duration = duration ? duration : this.videoElement.duration;
                let video = new Video(sourceUrl, frameRate, duration)

                o$.next(video);
                o$.complete();
            })

            this.hls.loadSource(sourceUrl)
            this.hls.attachMedia(this.videoElement);
        })
    }

    protected initEventHandlers() {
        super.initEventHandlers();

        this.hls.on(Hls.Events.ERROR, function (event, data) {
            let errorType = data.type;
            let errorDetails = data.details;
            let errorFatal = data.fatal;

            console.error(event, data);

            if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR
                || data.details === Hls.ErrorDetails.BUFFER_APPEND_ERROR
                || data.details === Hls.ErrorDetails.BUFFER_APPENDING_ERROR) {

                // TODO: commenting out unitialized variable
                // this.videoPlaybackStateHolder.buffering = true;
            }
        });
    }

    getAudioTracks(): MediaPlaylist[] {
        if (!this.isVideoLoaded) {
            return null;
        }
        return this.hls.audioTracks;
    }

    getCurrentAudioTrack(): any {
        return this.getAudioTracks()[this.hls.audioTrack];
    }

    setAudioTrack(audioTrackId: number) {
        if (!this.isVideoLoaded) {
            return null;
        }

        let previousIndex: number = this.hls.audioTrack;
        this.hls.audioTrack = audioTrackId;
        let currentIndex: number = this.hls.audioTrack;

        if (currentIndex >= 0 && previousIndex !== currentIndex) {
            this.onAudioSwitched$.next({
                audioTrack: this.getCurrentAudioTrack()
            });
        }
    }

    getHls(): Hls {
        return this.hls;
    }


}
