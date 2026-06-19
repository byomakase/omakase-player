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

import {BehaviorSubject, defer, firstValueFrom, Observable, type Observer, Subject, Subscriber, tap, type TeardownLogic} from 'rxjs';
import {fromPromise} from 'rxjs/internal/observable/innerFrom';

export function passiveObservable<T = void>(subscribe: (this: Observable<T>, subscriber: Subscriber<T>) => TeardownLogic): Observable<T> {
  return fromPromise<T>(firstValueFrom<T>(new Observable<T>(subscribe))) as Observable<T>;
}

export function emptyPassiveObservable(): Observable<void> {
  return passiveObservable((observer) => nextCompleteObserver(observer));
}

export function emptyObservable(): Observable<void> {
  return new Observable<void>((observer) => nextCompleteObserver(observer));
}

export function wrapObservable(o1: Observable<any>): Observable<void> {
  return new Observable((observer) => {
    o1.subscribe({
      next: () => {
        nextCompleteObserver(observer);
      },
      error: (err) => {
        errorCompleteObserver(observer, err);
      },
    });
  });
}

export function completeObserver<T>(observer: Observer<T>): void {
  try {
    observer.complete();
  } catch (e) {
    // nop
    // console.debug(e);
  }
}

export function nextCompleteObserver<T>(observer: Observer<T>, ...[value]: undefined extends T ? [value?: T] : [value: T]): void {
  if (observer) {
    // value is present if T doesn't include undefined; otherwise it may be omitted
    observer.next(value as T);
    completeObserver(observer);
  }
}

export function errorCompleteObserver(observer: Observer<any>, error: any) {
  if (observer) {
    observer.error(error);
    completeObserver(observer);
  }
}

export function freeObserver(observer: Observer<any>): void {
  completeObserver(observer);

  if (observer instanceof Subject || observer instanceof BehaviorSubject) {
    try {
      observer.unsubscribe();
    } catch (e) {
      console.debug(e);
    }
  }
}

export function measuredObservable(
  source$: Observable<any>,
  hooks: {
    onStart: (start: number) => void;
    onEnd: (start: number, end: number) => void;
  }
): Observable<any> {
  return defer(() => {
    const start = performance.now();
    hooks.onStart(start);
    return source$.pipe(
      tap({
        finalize: () => {
          const end = performance.now();
          hooks.onEnd(start, end);
        }
      })
    );
  });
}

export function describedObservable(title: string, source$: Observable<any>, space = 0): Observable<any> {
  return measuredObservable(source$, {
    onStart: (start) => {
      console.debug(`${space > 0 ? ' '.repeat(space) : ''}┌── ${title} :: START`);
    },
    onEnd: (start, end) => {
      console.debug(`${space > 0 ? ' '.repeat(space) : ''}└── ${title} :: END ${(end - start).toFixed(2)}ms`);
    },
  });
}
