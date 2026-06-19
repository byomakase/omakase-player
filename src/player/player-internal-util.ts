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

import {concat, Observable, tap, timeout} from 'rxjs';
import {nextCompleteObserver} from '../util/rxjs-util';
import type {PlayerInternalApi} from './player-api';
import type {PlayerSession} from '../session';

export class PlayerInternalUtil {
  static restorePlayback(player: PlayerInternalApi, playerSession: PlayerSession, nonFatalMessageHandler?: (message: string) => void): Observable<void> {
    return new Observable((observer) => {
      let currentTime$ = player.seekTo(playerSession.playback.currentTime)
      let playbackRate$ = player.setPlaybackRate(playerSession.playback.playbackRate)

      concat(playbackRate$, currentTime$).subscribe({
        complete: () => {
          if (playerSession.playback.playing) {
            player
              .play()
              .pipe(timeout(5000))
              .subscribe({
                next: () => {
                  nextCompleteObserver(observer);
                },
                error: (err) => {
                  let message = `Please interact with active window to initiate playback.`
                  console.debug(message, err);
                  if (nonFatalMessageHandler) {
                    nonFatalMessageHandler(message);
                  }
                  nextCompleteObserver(observer);
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
