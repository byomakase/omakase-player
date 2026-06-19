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

import Konva from 'konva';
import {StyleAdapter} from '../style-adapter';
import {ObserverBreaker} from '../../common/observer-breaker';
import {nullifier} from '../../util/util-functions';
import type {WithOptionalPartial} from '../../types/ts-types';
import type {Destroyable} from '../../common/capabilities';
import {konvaUnlistener} from '../konva/konva-util';

export interface ComponentConfig<S> {
  style: S;
}

/**
 * Intended to be used in component constructors. 'style' property is made optional, style type 'S' type is made Partial
 */
export type ConfigWithOptionalStyle<T extends ComponentConfig<any>> = WithOptionalPartial<T, 'style'>;

export interface KonvaComponent<C extends ComponentConfig<S>, S, T extends Konva.Node> extends Destroyable {
  get konvaNode(): T;

  get config(): C;

  get style(): S;

  set style(value: Partial<S>);
}

export abstract class BaseKonvaComponent<C extends ComponentConfig<S>, S, T extends Konva.Node> implements KonvaComponent<C, S, T> {
  protected readonly _styleAdapter: StyleAdapter<S>;

  protected _config: C;
  private _konvaNode?: T;

  protected _destroyBreaker = new ObserverBreaker();

  protected constructor(config: C) {
    this._config = config;
    this._styleAdapter = new StyleAdapter(config.style);
  }

  protected abstract provideKonvaNode(): T;

  destroy() {
    this._konvaNode?.destroy();

    this._destroyBreaker.destroy();

    nullifier(this._konvaNode);
  }

  get config(): C {
    return this._config;
  }

  get konvaNode(): T {
    if (!this._konvaNode) {
      this._konvaNode = this.provideKonvaNode();
    }
    return this._konvaNode;
  }

  get style(): S {
    return this._styleAdapter.style;
  }

  set style(value: Partial<S>) {
    this._styleAdapter.style = value;
  }
}




export interface KonvaComponent2<K extends Konva.Node> extends Destroyable {
  konvaNode: K;
}

export abstract class BaseKonvaComponent2<K extends Konva.Node> implements KonvaComponent2<K> {
  protected _konvaNode?: K;

  protected _destroyBreaker = new ObserverBreaker();

  protected constructor() {
  }

  protected abstract provideKonvaNode(): K;

  get konvaNode(): K {
    if (!this._konvaNode) {
      this._konvaNode = this.provideKonvaNode();
    }
    return this._konvaNode;
  }

  destroy() {
    konvaUnlistener(this._konvaNode);

    this._konvaNode?.destroy();

    this._destroyBreaker.destroy();

    nullifier(this._konvaNode);
  }
}
