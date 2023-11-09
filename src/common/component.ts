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
 *
 */

import Konva from "konva";
import {map, Observable, of, Subject} from "rxjs";
import {StyleAdapter} from "./style-adapter";
import {WithOptionalPartial} from "../types/types";
import {Destroyable} from "../types";
import {nextCompleteVoidSubject} from "../util/observable-util";

export interface ComponentConfig<S> {
    style: S
}

/***
 * Intended to be used in component constructors. 'style' property is made optional, style type 'S' type is made Partial
 */
export type ComponentConfigStyleComposed<T extends ComponentConfig<any>> = WithOptionalPartial<T, 'style'>;

export const composeConfigAndDefault = <T extends ComponentConfig<any>>(config: Partial<ComponentConfigStyleComposed<T>>, configDefault: T): T => {
    return {
        ...configDefault,
        ...config,
        style: {
            ...configDefault.style,
            ...config.style,
        },
    }
}

export interface Component<C extends ComponentConfig<S>, S, T extends Konva.Node> extends Destroyable {
    get style(): S;

    set style(value: Partial<S>);

    initCanvasNode(): T;

    getCanvasNode(): T;

    isInitialized(): boolean;
}

export abstract class BaseComponent<C extends ComponentConfig<S>, S, T extends Konva.Node> implements Component<C, S, T> {
    protected config: C;
    protected styleAdapter: StyleAdapter<S>;
    protected canvasNode: T;

    public readonly onDestroy$ = new Subject<void>();

    protected constructor(config: C) {
        this.config = config;
        this.styleAdapter = new StyleAdapter(config.style);
    }

    protected abstract createCanvasNode(): T;

    initCanvasNode(): T {
        if (this.isInitialized()) {
            throw new Error('Konva node already initalized')
        }
        this.canvasNode = this.createCanvasNode();
        this.afterCanvasNodeInit();
        return this.canvasNode;
    }

    initCanvasNodeAsync(): Observable<T> {
        return this.createCanvasNodeAsync().pipe(map(konvaNode => {
            this.canvasNode = konvaNode;
            this.afterCanvasNodeInit();
            return this.canvasNode;
        }))
    }

    protected createCanvasNodeAsync(): Observable<T> {
        return of(this.createCanvasNode());
    }

    protected afterCanvasNodeInit() {

    }

    destroy() {
        if (this.isInitialized()) {
            this.getCanvasNode().destroy();
        }

        nextCompleteVoidSubject(this.onDestroy$);

        this.config = void 0;
        this.styleAdapter = void 0;
        this.canvasNode = void 0;
    }

    getCanvasNode(): T {
        return this.canvasNode;
    }

    isInitialized(): boolean {
        return !!this.getCanvasNode();
    }

    get style(): S {
        return this.styleAdapter.style;
    }

    set style(value: Partial<S>) {
        this.styleAdapter.style = value;
    }


}
