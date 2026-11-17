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

import type {Destroyable} from './common/capabilities';
import {filter, Observable, Subject, take, takeUntil} from 'rxjs';
import {freeObserver, nextCompleteObserver, passiveObservable} from './util/rxjs-util';
import {DomAudioElement} from './dom/dom-media-element';
import {DomElementEventType} from './dom/dom-element';
import {BlobUtil} from './util/blob/blob-util';
import {UrlSource} from './source';
import {UrlUtil} from './util/url-util';
import {ObserverBreaker} from './common/observer-breaker';
import {WorkerUtil} from './worker/worker-util';

// @ts-ignore
import syncProcessor from './worker/sync-audio-worklet-processor?raw'; // @ts-ignore
import silentWavBase64 from './../assets/silent.wav.base64.txt?raw';

/**
 * Page-wide singleton holding the shared {@link AudioContext} and the sync worklet.
 *
 * Shared between all player instances on the page, so it is reference counted: each owner calls {@link acquire} once
 * and {@link release} once when done. The underlying instance is created lazily on first access and torn down when the
 * last owner releases it. A later access creates a fresh instance.
 */
export class OmakaseAudioContextProvider implements Destroyable {
  private static _instance: OmakaseAudioContextProvider | undefined;
  private static _refCount = 0;

  static get instance(): OmakaseAudioContextProvider {
    return (this._instance ??= new OmakaseAudioContextProvider());
  }

  /** Registers an owner. Does not create the instance - that happens lazily on first access. */
  static acquire(): void {
    this._refCount++;
  }

  /** Unregisters an owner. Destroys the instance (if one was created) when the last owner releases. */
  static release(): void {
    if (this._refCount === 0) {
      console.warn('OmakaseAudioContextProvider released more times than acquired');
      return;
    }
    if (--this._refCount === 0) {
      this._instance?.destroy();
    }
  }

  /** Static accessor so the audio subsystem can reach the shared AudioContext. */
  static get audioContext(): AudioContext {
    return this.instance.audioContext;
  }

  private readonly _onSyncTick$: Subject<{}> = new Subject<{}>();

  private _audioContext: AudioContext;

  /**
   * Time synchronization worklet
   * @protected
   */
  private _syncWorklet?: AudioWorkletNode | undefined;
  private _syncWorkletSource?: MediaElementAudioSourceNode | undefined;
  private _syncWorkletGain?: GainNode | undefined;
  private _syncWorkletAudioElement?: DomAudioElement | undefined;
  private _syncProcessorUrl?: string | undefined;

  protected _destroyBreaker = new ObserverBreaker();

  private constructor() {
    this._audioContext = new AudioContext();
    console.debug(`AudioContext created`);

    try {
      this._audioContext.resume().then((event) => {
        console.debug('AudioContext resumed');
      });
    } catch (e) {
      console.debug(`AudioContext resume failed: ${e}. We will try again on play()`);
    }

    this.createSyncWorklet();
  }

  protected createSyncWorklet(): void {
    if (this._syncWorklet) {
      console.debug('syncWorklet already exists');
    } else {
      new Observable<AudioWorkletNode>((observer) => {
        let domAudioElement = new DomAudioElement({loop: true});
        this._syncWorkletAudioElement = domAudioElement;
        domAudioElement.onEvent$
          .pipe(filter((p) => p.type === DomElementEventType.DOM_ELEMENT_LOADED))
          .pipe(
            filter((p) => !!p),
            take(1)
          )
          .pipe(takeUntil(this._destroyBreaker.observer))
          .subscribe({
            next: (syncWorkletAudioElement) => {
              this._syncWorkletSource = this._audioContext.createMediaElementSource(domAudioElement.htmlElement);
              const workletName = 'sync-audio-worklet-processor';
              try {
                let audioWorkletNode = new AudioWorkletNode(this._syncWorkletSource.context, workletName, {
                  parameterData: {},
                });
                nextCompleteObserver(observer, audioWorkletNode);
              } catch (e) {
                this.revokeProcessorUrl();
                this._syncProcessorUrl = BlobUtil.createObjectURL(BlobUtil.createBlob([syncProcessor], {type: 'application/javascript'}));
                this._syncWorkletSource.context.audioWorklet.addModule(this._syncProcessorUrl).then(() => {
                  if (!this._audioContext || !this._syncWorkletSource) {
                    return; // destroyed while the module was loading
                  }
                  let audioWorkletNode = new AudioWorkletNode(this._syncWorkletSource!.context, workletName, {
                    parameterData: {},
                  });
                  nextCompleteObserver(observer, audioWorkletNode);
                });
              }
            },
          });

        domAudioElement.loadSource(UrlSource.of(UrlUtil.formatBase64Url('audio/wav', silentWavBase64))).subscribe();
      })
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe((audioWorkletNode) => {
          this._syncWorklet = audioWorkletNode;
          this._syncWorklet.port.onmessage = (event: MessageEvent) => {
            this._onSyncTick$.next({});
          };

          this._syncWorkletSource!.connect(this._syncWorklet).connect(this._syncWorkletSource!.context.destination);

          this._syncWorkletGain = this._audioContext.createGain();
          this._syncWorkletGain.gain.value = 0; // Set gain to 0 (silent)
          this._syncWorkletGain.connect(this._syncWorkletSource!.context.destination);

          this._syncWorkletSource!.connect(this._syncWorkletGain);
        });
    }
  }

  tryResumeAudioContext(): Observable<void> {
    return new Observable<void>((observer) => {
      if (this.isAudioContextRunning) {
        // console.debug('AudioContext running');
        nextCompleteObserver(observer);
      } else {
        console.debug('AudioContext resuming..');
        this._audioContext?.resume().then((event) => {
          console.debug('AudioContext resumed');
          nextCompleteObserver(observer);
        });
      }
    });
  }

  private revokeProcessorUrl(): void {
    if (this._syncProcessorUrl) {
      BlobUtil.revokeObjectURL(this._syncProcessorUrl);
      this._syncProcessorUrl = void 0;
    }
  }

  get audioContext(): AudioContext {
    return this._audioContext;
  }

  get isAudioContextRunning(): boolean {
    return this._audioContext.state === 'running';
  }

  get onSyncTick$(): Observable<{}> {
    return this._onSyncTick$.asObservable();
  }

  /**
   * Unconditionally tears down this instance. Owners should use {@link OmakaseAudioContextProvider.release} instead,
   * which calls this only when no other owner is left.
   */
  destroy() {
    this._destroyBreaker.destroy();

    freeObserver(this._onSyncTick$);

    if (this._syncWorklet) {
      WorkerUtil.dispose(this._syncWorklet);
      this._syncWorklet = void 0;
    }

    this._syncWorkletSource?.disconnect();
    this._syncWorkletGain?.disconnect();
    this._syncWorkletSource = void 0;
    this._syncWorkletGain = void 0;

    this._syncWorkletAudioElement?.destroy();
    this._syncWorkletAudioElement = void 0;

    this.revokeProcessorUrl();

    if (this._audioContext && this._audioContext.state !== 'closed') {
      this._audioContext.close().then(() => {
        console.debug(`AudioContext closed`);
      });
    }
    // @ts-ignore
    this._audioContext = void 0;

    if (OmakaseAudioContextProvider._instance === this) {
      OmakaseAudioContextProvider._instance = void 0;
    }
  }
}
