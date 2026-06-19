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

import {catchError, combineLatest, defer, EMPTY, filter, firstValueFrom, map, Observable, Subject, take, takeUntil, tap, throwIfEmpty, timeout} from 'rxjs';
import {CryptoUtil} from '../util/crypto-util';
import type {Destroyable} from '../common/capabilities';
import {MessageChannelClosedError, OmpError} from '../types';
import type {ExtractParameterTypes, ExtractReturnType, UnwrapObservable} from '../types/ts-types';
import {fromPromise} from 'rxjs/internal/observable/innerFrom';
import {ObserverBreaker} from '../common/observer-breaker';
import {freeObserver} from '../util/rxjs-util';
import type {OmpProvider} from '../omp-provider';

type ExtractPropertyTypes<T, K extends keyof T> = {
  requestData: UnwrapObservable<T[K]>;
  responseData: T[K];
};

type ExtractMethodTypes<T, K extends keyof T> = {
  requestData: ExtractParameterTypes<T, K>;
  responseData: ExtractReturnType<T, K>;
};

export enum MessageType {
  REQUEST = 'REQUEST',
  RESPONSE = 'RESPONSE',
}

export interface Message {
  topic: string;
  type: MessageType;
  messageId: string;
}

export interface DataMessage<DataType> extends Message {
  action: string;
  data: DataType;
}

export interface RequestMessage<DataType> extends DataMessage<DataType> {
  type: MessageType.REQUEST;
}

export interface ResponseError {
  name: string;
  message?: string;
}

export interface ResponseMessage<DataType> extends DataMessage<DataType> {
  type: MessageType.RESPONSE;
  requestMessageId: Message['messageId'];
  error?: ResponseError;
}

export interface SendOptions {
  timeout: number;
}

const sendOptionsDefault: SendOptions = {
  timeout: 20000,
};

export class ManagedBroadcastChannel implements Destroyable {
  public readonly onMessage$: Subject<Message> = new Subject<Message>();

  protected _channelId: string;
  protected _broadcastChannel: BroadcastChannel;

  protected _messageListener: (messageEvent: MessageEvent) => void;
  protected _messageerrorListener: (error: any) => void;

  protected _destroyBreaker = new ObserverBreaker();

  constructor(channelId: string) {
    this._channelId = channelId;
    this._broadcastChannel = new BroadcastChannel(this.channelId);

    this._messageListener = (messageEvent: MessageEvent) => {
      let message: Message = messageEvent.data;
      this.onMessage$.next(message);
    };

    this._messageerrorListener = (error: any) => {
      console.error(error);
    };

    this._broadcastChannel.addEventListener('message', this._messageListener);
    this._broadcastChannel.addEventListener('messageerror', this._messageerrorListener);
  }

  postMessage(message: Message) {
    this._broadcastChannel.postMessage(message);
  }

  get channelId(): string {
    return this._channelId;
  }

  get broadcastChannel(): BroadcastChannel {
    return this._broadcastChannel;
  }

  destroy(): void {
    if (this._broadcastChannel) {
      this._broadcastChannel.removeEventListener('message', this._messageListener);
      this._broadcastChannel.removeEventListener('messageerror', this._messageerrorListener);
      this._broadcastChannel.close();
    }
    this._destroyBreaker.destroy();
    freeObserver(this.onMessage$);
  }
}

export class MessageChannelError extends OmpError {
  constructor(message: string) {
    super(message, 'MessageChannelError');
  }
}

export class MessageChannelTimeoutError extends OmpError {
  constructor(message: string) {
    super(message, 'MessageChannelTimeoutError');
  }
}

abstract class UntypedMessageChannel implements Destroyable {
  protected readonly _managedBroadcastChannel: ManagedBroadcastChannel;
  protected readonly _topic: string;

  protected _destroyBreaker = new ObserverBreaker();

  protected constructor(managedBroadcastChannel: ManagedBroadcastChannel, topic: string) {
    this._managedBroadcastChannel = managedBroadcastChannel;
    this._topic = topic;
  }

  protected createResponseMessageStream<ResponseData>(): Observable<ResponseMessage<ResponseData>> {
    return this._managedBroadcastChannel.onMessage$
      .pipe(filter((p) => p.topic === this._topic))
      .pipe(filter((p) => p.type === MessageType.RESPONSE))
      .pipe(map((p) => p as ResponseMessage<ResponseData>))
      .pipe(takeUntil(this._destroyBreaker.observer));
  }

  protected createRequestMessageStream<RequestData>(action: string): Observable<RequestMessage<RequestData>> {
    return this._managedBroadcastChannel.onMessage$
      .pipe(filter((p) => p.topic === this._topic))
      .pipe(filter((p) => p.type === MessageType.REQUEST))
      .pipe(map((p) => p as RequestMessage<RequestData>))
      .pipe(filter((p) => p.action === action))
      .pipe(takeUntil(this._destroyBreaker.observer));
  }

  protected createRequestMessageDataStream<T>(action: string): Observable<T> {
    return this.createRequestMessageStream<T>(action).pipe(map((p) => p.data));
  }

  protected createMessageId(): string {
    return CryptoUtil.fastId();
  }

  protected _sendAndObserveResponse<ResponseData>(message: RequestMessage<any>, providedSendOptions?: Partial<SendOptions>): Observable<ResponseMessage<ResponseData>> {
    let send$ = defer(
      () =>
        new Observable<void>((o$) => {
          this.sendRequestMessage(message);
          o$.next();
          o$.complete();
        })
    );

    let sendOptions: SendOptions = {
      ...sendOptionsDefault,
      ...providedSendOptions,
    };

    return combineLatest([
      this.createResponseMessageStream<ResponseData>()
        .pipe(filter((p) => p.requestMessageId === message.messageId))
        .pipe(timeout(sendOptions.timeout)) // safeguard timeout
        .pipe(take(1))
        .pipe(takeUntil(this._destroyBreaker.observer))
        .pipe(
          tap((p) => {
            if (p.error) {
              if (p.error!.name && p.error!.message) {
                let reconstructedError = new Error(p.error!.message);
                reconstructedError.name = p.error!.name;
                throw reconstructedError;
              } else {
                throw p.error;
              }
            }
          })
        )
        .pipe(
          throwIfEmpty(() => {
            return new MessageChannelClosedError(this._topic);
          }),
          catchError((error) => {
            if (error instanceof MessageChannelClosedError) {
              console.debug(`Message channel closed for topic: ${this._topic}. This error is non-fatal and can be ignored.`)
              return EMPTY;
            } else if (error.name === 'TimeoutError') {
              let errorMessage = `Didnt receive response for: \n${JSON.stringify(message, null, 1)}.\nSend options: \n${JSON.stringify(sendOptions, null, 1)}`;
              console.debug(errorMessage);
              throw new MessageChannelTimeoutError(errorMessage);
            } else {
              console.debug(error);
              throw error;
            }
          })
        ),
      send$,
    ]).pipe(
      take(1),
      map(([onResponse, sendResponse]) => {
        return onResponse;
      })
    );
  }

  protected sendResponse<ResponseData>(request: RequestMessage<any>, responseValue: Observable<ResponseData> | ResponseData): void {
    if (responseValue instanceof Observable) {
      responseValue
        .pipe(take(1))
        .pipe(takeUntil(this._destroyBreaker.observer))
        .subscribe({
          next: (value) => {
            this._sendResponse(request, value);
          },
          error: (err: any) => {
            console.error(err);

            let error: ResponseError = {
              name: err.name,
              message: err.message,
            };

            this._sendErrorResponse(request, error);
          },
        });
    } else {
      this._sendResponse(request, responseValue);
    }
  }

  protected createResponseHook<ResponseData>(request: RequestMessage<any>) {
    return (responseValue: Observable<ResponseData> | ResponseData) => {
      return this.sendResponse(request, responseValue);
    };
  }

  protected createErrorResponseHook(request: RequestMessage<any>) {
    return (error: Error) => {
      this._sendErrorResponse(request, error);
    };
  }

  protected sendRequestMessage<RequestData>(message: RequestMessage<RequestData>): void {
    try {
      this._managedBroadcastChannel.postMessage(message);
    } catch (e) {
      console.debug(e);
      let errorMsg = `Failed sending message: ${JSON.stringify(message)}`;
      console.debug(errorMsg);
      throw new MessageChannelError(errorMsg);
    }
  }

  protected createRequestMessage<RequestData>(action: string, data: RequestData): RequestMessage<RequestData> {
    return {
      topic: this._topic,
      type: MessageType.REQUEST,
      messageId: this.createMessageId(),
      action: action,
      data: data,
    };
  }

  private _createResponseMessage(request: RequestMessage<any>): Omit<ResponseMessage<any>, 'data' | 'error'> {
    return {
      topic: this._topic,
      type: MessageType.RESPONSE,
      messageId: this.createMessageId(),
      requestMessageId: request.messageId,
      action: request.action,
    };
  }

  private _sendResponse<ResponseData>(request: RequestMessage<any>, responseData: ResponseData): void {
    this._managedBroadcastChannel.postMessage({
      ...this._createResponseMessage(request),
      data: responseData,
    } as ResponseMessage<ResponseData>);
  }

  private _sendErrorResponse(request: RequestMessage<any>, error: ResponseError): void {
    console.debug(`Request action "${request.action}" resulted in error "${error.message}":`, {
      request: request,
      error: error,
    });
    this._managedBroadcastChannel.postMessage({
      ...this._createResponseMessage(request),
      error: error,
    } as ResponseMessage<any>);
  }

  destroy() {
    try {
      this._destroyBreaker.destroy();
    } catch (e) {
      console.debug(e);
    }
  }
}

type ExtractActions<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? ExtractMethodTypes<T, K> : ExtractPropertyTypes<T, K>;
};

type ExtractActionType<T extends ExtractActions<any>> = Extract<keyof T, string>; // extract only string keys

/**
 * If remote method response is awaited value is always Observable. For methods that already return Observable we need to unwrap it as return type is already Observable
 */
abstract class BaseMessageChannel<ChannelDef extends ExtractActions<any>> extends UntypedMessageChannel {
  protected constructor(managedBroadcastChannel: ManagedBroadcastChannel, topic: string) {
    super(managedBroadcastChannel, topic);
  }

  send<ActionName extends ExtractActionType<ChannelDef>, RequestData extends ChannelDef[ActionName]['requestData']>(action: ActionName, arg?: RequestData): void {
    let message = this.createRequestMessage(action, arg);
    this.sendRequestMessage(message);
  }

  sendAndWaitForResponse<Action extends ExtractActionType<ChannelDef>, RequestData extends ChannelDef[Action]['requestData'], ResponseData extends ChannelDef[Action]['responseData']>(
    action: Action,
    arg?: RequestData,
    sendOptions?: Partial<SendOptions>
  ): Observable<UnwrapObservable<ResponseData>> {
    let message = this.createRequestMessage(action, arg);
    return fromPromise(firstValueFrom(this._sendAndObserveResponse<UnwrapObservable<ResponseData>>(message, sendOptions).pipe(map((p) => p.data as UnwrapObservable<ResponseData>))));
  }

  listen<Action extends ExtractActionType<ChannelDef>, ResponseData extends ChannelDef[Action]['responseData']>(action: Action): Observable<UnwrapObservable<ResponseData>> {
    return this.createRequestMessageDataStream<UnwrapObservable<ResponseData>>(action);
  }

  receive<Action extends ExtractActionType<ChannelDef>, RequestData extends ChannelDef[Action]['requestData']>(action: Action): Observable<RequestData> {
    return this.createRequestMessageStream<RequestData>(action).pipe(
      map((request) => {
        return request.data;
      })
    );
  }

  receiveAndSendResponse<Action extends ExtractActionType<ChannelDef>, RequestData extends ChannelDef[Action]['requestData'], ResponseData extends ChannelDef[Action]['responseData']>(
    action: Action
  ): Observable<[RequestData, (response: UnwrapObservable<ResponseData> | ResponseData) => void, (error: Error) => void]> {
    return this.createRequestMessageStream<RequestData>(action).pipe(
      map((request) => {
        return [request.data, this.createResponseHook<Observable<ResponseData> | ResponseData>(request), this.createErrorResponseHook(request)];
      })
    );
  }
}

export class MessageChannel<T> extends BaseMessageChannel<ExtractActions<T>> {
  constructor(managedBroadcastChannel: ManagedBroadcastChannel, topic?: string) {
    super(managedBroadcastChannel, topic ? topic : CryptoUtil.uuid());
    // console.debug(`MessageChannel[${this._topic}]`)
  }

  get topic(): string {
    return this._topic;
  }

  get managedBroadcastChannel(): ManagedBroadcastChannel {
    return this._managedBroadcastChannel;
  }
}

  export interface MessageChannelBinding extends Destroyable {
  bind(): void;
}

export abstract class BaseMessageChannelBinding implements MessageChannelBinding {
  protected _ompProvider: OmpProvider;

  protected _destroyBreaker = new ObserverBreaker();

  protected constructor(ompProvider: OmpProvider) {
    this._ompProvider = ompProvider;
  }

  abstract bind(): void;

  destroy() {
    this._destroyBreaker.destroy();
  }
}
