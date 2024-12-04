/*
 * Copyright 2024 ByOmakase, LLC (https://byomakase.org)
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

import {firstValueFrom, Observable, Observer, Subject, Subscriber, TeardownLogic} from 'rxjs';
import {fromPromise} from 'rxjs/internal/observable/innerFrom';

export function passiveObservable<T = void>(subscribe: (this: Observable<T>, subscriber: Subscriber<T>) => TeardownLogic): Observable<T> {
  return fromPromise<T>(firstValueFrom<T>(new Observable<T>(subscribe))) as Observable<T>;
}

export function simplePassiveObservable<T = void>(value?: T): Observable<T> {
  return passiveObservable((observer) => nextCompleteObserver(observer, value as T));
}

export function nextCompleteObserver(observer: Observer<any>, value?: any) {
  if (observer) {
    observer.next(value);
    observer.complete();
  }
}

export function errorCompleteObserver(observer: Observer<any>, error: any) {
  if (observer) {
    observer.error(error);
    observer.complete();
  }
}

export function nextCompleteSubject(subject: Subject<any>, value?: any) {
  if (subject) {
    subject.next(value);
    subject.complete();
  } else {
    //console.debug('subject is undefined or null')
  }
}

export function completeSubject(subject: Subject<any>) {
  if (subject) {
    if (subject.closed) {
      //console.debug('subject is already closed')
    } else {
      subject.complete();
    }
  } else {
    //console.debug('subject is undefined or null')
  }
}

export function completeSubjects(...subjects: Subject<any>[]) {
  subjects.forEach((subject) => {
    completeSubject(subject);
  });
}

export function unsubscribeSubjects(...subjects: Subject<any>[]) {
  subjects.forEach((subject) => {
    unsubscribeSubject(subject);
  });
}

export function completeUnsubscribeSubjects(...subjects: Subject<any>[]) {
  completeSubjects(...subjects);
  unsubscribeSubjects(...subjects);
}

export function unsubscribeSubject(subject: Subject<any>) {
  if (subject) {
    if (subject.closed) {
      //console.debug('subject is closed')
    } else {
      subject.unsubscribe();
    }
  } else {
    //console.debug('subject is undefined or null')
  }
}
