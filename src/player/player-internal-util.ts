/*
 * Copyright 2026 ByOmakase, LLC (https://byomakase.org)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {concat, Observable, timeout} from 'rxjs';
import {nextCompleteObserver} from '../util/rxjs-util';
import type {PlayerConfig, PlayerInternalApi} from './player-api';
import type {PlayerSession} from '../session';
import type {MainMediaState, MediaLiveState} from '../media';
import {PlayerTextHandlerType} from './player-text-track';
import {TextTrackUtil} from '../text/text-track-util';
import type {LiveTimelineAnchor} from './player-controller-api';
import {LivePlaybackTrackerUtil} from '../live/live-model';

export class PlayerInternalUtil {
  /**
   * Anchor for a window resuming this session. Only live media has one - a VOD timeline is the same
   * in every instance, while a live one starts at 0 from whatever window was fetched.
   *
   */
  static resolveLiveTimelineAnchor(liveState: MediaLiveState | undefined): LiveTimelineAnchor | undefined {
    return liveState
      ? {
          liveStartTime: liveState.liveStartTime,
          segmentDurations: liveState.leadingSegmentDurations,
          startSN: liveState.startSN,
        }
      : void 0;
  }

  /**
   * Text handlers to use for a main media's own tracks.
   */
  static resolveTextMainTracksHandler(configured: PlayerConfig['textMainTracksHandler'], mainMediaState: MainMediaState | undefined): PlayerConfig['textMainTracksHandler'] {
    return TextTrackUtil.rendersTextNatively(mainMediaState) ? [PlayerTextHandlerType.EMBEDDED] : configured;
  }

  /**
   * Whether a restored session was actively following the live edge when it was saved — recomputed
   * from the snapshot via the shared {@link LivePlaybackTrackerUtil.resolvePinnedToLive} predicate rather
   * than a separately-plumbed flag, since `PlayerLocal`/`PlayerDetached` have no reference to
   * `LivePlaybackTracker` (it's owned by the outer `Player` facade) and therefore no way to attach the
   * real value to `PlayerSession`.
   */
  private static wasPinnedToLive(playerSession: PlayerSession): boolean {
    const liveState = playerSession.liveState;
    return !!liveState && LivePlaybackTrackerUtil.resolvePinnedToLive(true, playerSession.playback.playing, playerSession.playback.currentTime, liveState.liveSyncPosition);
  }

  static restorePlayback(player: PlayerInternalApi, playerSession: PlayerSession, nonFatalMessageHandler?: (message: string) => void): Observable<void> {
    return new Observable((observer) => {
      let currentTime$ = player.seekTo(playerSession.playback.currentTime);
      let playbackRate$ = player.setPlaybackRate(playerSession.playback.playbackRate);

      concat(playbackRate$, currentTime$).subscribe({
        complete: () => {
          if (playerSession.playback.playing) {
            let finishRestore = () => {
              // Detaching/restoring takes real time — a session pinned to the live edge when it was
              // saved is now behind by however long that took. Catch back up instead of leaving
              // playback resumed at the stale saved position. seekToLive() itself is a safe no-op
              // (`false`) if the restored media somehow isn't live, so no extra guard is needed here.
              if (PlayerInternalUtil.wasPinnedToLive(playerSession)) {
                player.seekToLive().subscribe({
                  next: () => {
                    nextCompleteObserver(observer);
                  },
                  error: (err) => {
                    console.debug(`seekToLive after session restore failed`, err);
                    nextCompleteObserver(observer);
                  },
                });
              } else {
                nextCompleteObserver(observer);
              }
            };

            player
              .play()
              .pipe(timeout(5000))
              .subscribe({
                next: () => {
                  finishRestore();
                },
                error: (err) => {
                  let message = `Please interact with active window to initiate playback.`;
                  console.debug(message, err);
                  if (nonFatalMessageHandler) {
                    nonFatalMessageHandler(message);
                  }
                  finishRestore();
                },
              });
          } else {
            nextCompleteObserver(observer);
          }
        },
      });
    });
  }
}
