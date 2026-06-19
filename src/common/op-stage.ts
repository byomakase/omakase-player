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

import type {Serializable} from './capabilities';

export enum OpStageStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
}

export interface OpStageState extends Serializable {
  status: OpStageStatus;
  error: string | undefined;
}

export class OpStage {
  protected _status: OpStageStatus;
  protected _error: string | undefined;

  constructor(args?: {status: OpStageStatus; error: string | undefined}) {
    this._status = args?.status ?? OpStageStatus.NOT_STARTED;
    this._error = args?.error;
  }

  static of(status: OpStageStatus, error?: string): OpStage {
    return new OpStage({status, error});
  }

  start() {
    if (this._status === OpStageStatus.NOT_STARTED) {
      this._status = OpStageStatus.IN_PROGRESS;
    } else {
      throw new Error(`Cannot start(). Op must be in ${OpStageStatus.NOT_STARTED} status: ${this.status}`);
    }
  }

  success() {
    if (this._status === OpStageStatus.IN_PROGRESS) {
      this._status = OpStageStatus.SUCCESS;
    } else {
      throw new Error(`Cannot success(). Op must be in ${OpStageStatus.IN_PROGRESS} status: ${this.status}`);
    }
  }

  failure(error: string | undefined) {
    if (this._status === OpStageStatus.IN_PROGRESS) {
      this._status = OpStageStatus.FAILURE;
      this._error = error;
    } else {
      throw new Error(`Cannot failure(). Op must be in ${OpStageStatus.IN_PROGRESS} status: ${this.status}`);
    }
  }

  get status(): OpStageStatus {
    return this._status;
  }

  get error(): string | undefined {
    return this._error;
  }

  get state(): OpStageState {
    return {
      status: this._status,
      error: this._error,
    };
  }
}
