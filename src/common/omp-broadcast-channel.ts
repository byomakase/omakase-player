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

import {catchError, combineLatest, defer, filter, map, Observable, Subject, take, takeUntil, tap, timeout} from 'rxjs';
import {Destroyable, OmpBroadcastChannelTimeoutError, UnwrapObservable} from '../types';
import {isNullOrUndefined} from '../util/object-util';
import {CryptoUtil} from '../util/crypto-util';
import {nextCompleteSubject} from '../util/rxjs-util';

export enum OmpBroadcastMessageType {
  MESSAGE, MESSAGE_RESPONSE
}

export interface OmpBroadcastMessageResponse<DataType, ErrorType> {
  messageType: OmpBroadcastMessageType.MESSAGE_RESPONSE
  requestMessageId: string;
  data?: DataType;
  error?: ErrorType;
}

export interface OmpBroadcastMessage<DataType> {
  messageType: OmpBroadcastMessageType.MESSAGE
  messageId: string;
  actionName: string;
  data?: DataType;
}

export class OmpBroadcastChannel implements Destroyable {
  private static readonly channelTimeout = 20000;

  private readonly _channelId: string;
  private readonly _onMessage$: Subject<OmpBroadcastMessage<any>> = new Subject<OmpBroadcastMessage<any>>();
  private readonly _onResponse$: Subject<OmpBroadcastMessageResponse<any, any>> = new Subject<OmpBroadcastMessageResponse<any, any>>();

  private _broadcastChannel: BroadcastChannel;

  private _messageListener!: (messageEvent: MessageEvent) => void;
  private _messageerrorListener!: (error: any) => void;

  protected _destroyed$ = new Subject<void>();

  constructor(channelId: string) {
    this._channelId = channelId;

    this._broadcastChannel = new BroadcastChannel(this._channelId);

    this.init();
  }

  private init() {
    this._messageListener = (messageEvent: MessageEvent) => {
      let message: OmpBroadcastMessage<any> | OmpBroadcastMessageResponse<any, any> = messageEvent.data;
      if (message.messageType === OmpBroadcastMessageType.MESSAGE) {
        this._onMessage$.next(message);
      } else {
        this._onResponse$.next(message);
      }
    }

    this._messageerrorListener = (error: any) => {
      console.error(error)
    }

    this._broadcastChannel.addEventListener('message', this._messageListener)
    this._broadcastChannel.addEventListener('messageerror', this._messageerrorListener)
  }

  protected _sendAndObserveResponse<DataType, ErrorType>(message: OmpBroadcastMessage<any>): Observable<OmpBroadcastMessageResponse<DataType, ErrorType>> {
    let send$ = defer(() => new Observable<void>(o$ => {
      this.sendMessage(message);
      o$.next()
      o$.complete();
    }))

    return combineLatest(
      [this._onResponse$
        .pipe(filter(p => p.requestMessageId === message.messageId))
        .pipe(take(1))
        .pipe(timeout(OmpBroadcastChannel.channelTimeout)) // safeguard timeout
        .pipe(tap(p => {
          if (!isNullOrUndefined(p.error)) {
            throw p.error;
          }
        }))
        .pipe(catchError(error => {
          if (error.name === 'TimeoutError') {
            let errorMessage = `Didnt receive response for: ${JSON.stringify(message)}`;
            console.debug(errorMessage)
            throw new OmpBroadcastChannelTimeoutError(errorMessage);
          } else {
            throw error
          }
        })),
        send$
      ]).pipe(take(1), map(([onResponse, sendResponse]) => {
      return onResponse;
    }))
  }

  protected sendResponse<T>(responseToMessageId: string, responseValue: Observable<T> | any): void {
    if (responseValue instanceof Observable) {
      responseValue.pipe(take(1), takeUntil(this._destroyed$)).subscribe({
        next: (value) => {
          this._sendResponse(responseToMessageId, value);
        },
        error: (err: any) => {
          console.error(err);
          this._sendErrorResponse(responseToMessageId, err);
        }
      })
    } else {
      this._sendResponse(responseToMessageId, responseValue);
    }
  }

  protected createMessageStream(actionName: string): Observable<OmpBroadcastMessage<any>> {
    return this._onMessage$.pipe(filter(p => p.actionName === actionName))
  }

  protected createDataStream<T>(actionName: string): Observable<T> {
    return this.createMessageStream(actionName).pipe(map(p => p.data as T));
  }

  protected sendMessage<DataType>(message: OmpBroadcastMessage<DataType>): void {
    this._broadcastChannel.postMessage(message);
  }

  protected createMessage<DataType>(actionName: string, data?: DataType): OmpBroadcastMessage<DataType> {
    return {
      messageType: OmpBroadcastMessageType.MESSAGE,
      messageId: CryptoUtil.uuid(),
      actionName: actionName,
      data: data
    }
  }

  private _sendResponse(requestMessageId: string, data: any): void {
    let message: OmpBroadcastMessageResponse<any, any> = {
      messageType: OmpBroadcastMessageType.MESSAGE_RESPONSE,
      requestMessageId: requestMessageId,
      data: data
    };
    this._broadcastChannel.postMessage(message);
  }

  private _sendErrorResponse(requestMessageId: string, error: any): void {
    let message: OmpBroadcastMessageResponse<any, any> = {
      messageType: OmpBroadcastMessageType.MESSAGE_RESPONSE,
      requestMessageId: requestMessageId,
      error: error
    };
    this._broadcastChannel.postMessage(message);
  }

  get channelId(): string {
    return this._channelId;
  }

  destroy() {
    if (this._broadcastChannel) {
      this._broadcastChannel.removeEventListener('message', this._messageListener)
      this._broadcastChannel.removeEventListener('messageerror', this._messageerrorListener)
      this._broadcastChannel.close()
    }
    nextCompleteSubject(this._destroyed$);
  }
}

export type OmpBroadcastChannelActionsMap<T extends Record<string, {
  requestType?: any,
  responseType?: any
}>> = {
  /**
   * actionName: {
   *   requestType: Type,
   *   responseType: Type
   * }
   */
  [K in Extract<keyof T, string>]: {
    requestType: T[K]['requestType'] extends undefined ? [void] : T[K]['requestType'];      // default to void if undefined
    responseType: T[K]['responseType'] extends undefined ? void : T[K]['responseType'];     // default to void if undefined
  };
};

export type OmpBroadcastChannelActionName<T extends OmpBroadcastChannelActionsMap<any>> = Extract<keyof T, string>; // extract only string keys

/**
 * If remote method response is awaited value is always Observable. For methods that already return Observable we need to unwrap it as return type is already Observable
 */
export class TypedOmpBroadcastChannel<T extends OmpBroadcastChannelActionsMap<any>> extends OmpBroadcastChannel {

  constructor(channelId: string) {
    super(channelId);
  }

  createRequestStream<ActionName extends OmpBroadcastChannelActionName<T>, ResponseType extends T[ActionName]['responseType']>(action: ActionName): Observable<UnwrapObservable<ResponseType>> {
    return this.createDataStream<UnwrapObservable<ResponseType>>(action)
  }

  createRequestResponseStream<ActionName extends OmpBroadcastChannelActionName<T>, RequestType extends T[ActionName]['requestType'], ResponseType extends T[ActionName]['responseType']>(action: ActionName): Observable<[UnwrapObservable<RequestType>, (response: ResponseType) => void]> {
    let createResponseHook = (request: OmpBroadcastMessage<any>) => {
      return (responseValue: ResponseType) => {
        return this.sendResponse(request.messageId, responseValue)
      }
    }

    return this.createMessageStream(action).pipe(map(request => {
      return [
        request.data,
        createResponseHook(request)
      ]
    }))
  }

  sendAndObserveResponse<ActionName extends OmpBroadcastChannelActionName<T>, RequestType extends T[ActionName]['requestType'], ResponseType extends T[ActionName]['responseType']>(action: ActionName, arg?: RequestType): Observable<UnwrapObservable<ResponseType>> {
    let message = this.createMessage(action, arg);
    return this._sendAndObserveResponse<UnwrapObservable<ResponseType>, any>(message)
      .pipe(map(p => p.data as UnwrapObservable<ResponseType>));
  }

  send<ActionName extends OmpBroadcastChannelActionName<T>, RequestType extends T[ActionName]['requestType']>(action: ActionName, arg?: RequestType): void {
    let message = this.createMessage(action, arg);
    this.sendMessage(message);
  }


}





































