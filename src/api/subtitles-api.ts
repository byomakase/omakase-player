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

import {Api} from "./api";
import {Observable} from "rxjs";
import {OmakaseTextTrack, OmakaseTextTrackCue, SubtitlesEvent, SubtitlesVttTrackConfig} from "../types";
import {SubtitlesVttTrack} from "../track/subtitles-vtt-track";

export interface SubtitlesApi extends Api {
    /***
     * Fires on subtitles create
     */
    onCreate$: Observable<SubtitlesEvent>;

    /***
     * Fires on subtitles remove
     */
    onRemove$: Observable<SubtitlesEvent>;

    /***
     * Fires on subtitles show
     */
    onShow$: Observable<SubtitlesEvent>;

    /***
     * Fires on subtitles hide
     */
    onHide$: Observable<SubtitlesEvent>;

    /***
     * Creates new Subtitles VTT track
     * @param config SubtitlesVttTrack configuration
     */
    createVttTrack(config: SubtitlesVttTrackConfig): Observable<SubtitlesVttTrack>;

    /***
     * Returns all VTT tracks
     */
    getTracks(): OmakaseTextTrack<OmakaseTextTrackCue>[];

    /***
     * Removes VTT track by ID
     * @param id VTT track ID
     */
    removeTrack(id: string);

    /***
     * Removes all VTT tracks
     */
    removeAllTracks();

    /***
     * Returns current active VTT track
     */
    getCurrentTrack(): OmakaseTextTrack<OmakaseTextTrackCue> | undefined;

    /***
     * Shows active VTT track
     */
    showTrack();

    /***
     * Shows VTT track by ID
     * @param id VTT track ID
     */
    showTrack(id: string);

    /***
     * Hides active VTT track
     */
    hideTrack();

    /***
     * Hides VTT track by ID
     * @param id VTT track ID
     */
    hideTrack(id: string);

}
