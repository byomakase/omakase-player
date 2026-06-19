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

import {Observable, Subject} from 'rxjs';
import {hasNonUndefinedValues, isEmptyObject} from '../util/object-util';

export interface UiElementProps {
  focused?: boolean | undefined;
}

export interface UiElement<S extends UiElementProps = UiElementProps> {
  id: string;
  props?: Partial<S> | undefined;
}

export class UiElementPropsEngine {
  private readonly _elements: Map<UiElement['id'], UiElement> = new Map();

  private readonly _onElementUpdated$: Subject<UiElement> = new Subject();
  private readonly _onElementsRemoved$: Subject<UiElement[]> = new Subject();

  readonly onElementUpdated$: Observable<UiElement> = this._onElementUpdated$.asObservable();
  readonly onElementsRemoved$: Observable<UiElement[]> = this._onElementsRemoved$.asObservable();

  constructor() {}

  resolve<S extends UiElementProps = UiElementProps>(id: string): Partial<S> {
    return (this._elements.get(id)?.props ?? {}) as Partial<S>;
  }

  updateElement(newElement: UiElement): void {
    const element = this._elements.get(newElement.id);
    if (element) {
      element.props = {...element.props, ...newElement.props};
      this._onElementUpdated$.next(element);

      for (const key of Object.keys(element.props) as (keyof typeof element.props)[]) {
        if (element.props[key] === undefined) {
          delete element.props[key];
        }
      }

      if (isEmptyObject(element.props)) {
        this.removeElements(newElement.id);
      }
    } else {
      if (newElement.props && hasNonUndefinedValues(newElement.props)) {
        this._elements.set(newElement.id, newElement);
        this._onElementUpdated$.next(newElement);
      }
    }
  }

  removeElements(idOrIds: UiElement['id'] | UiElement['id'][]): void {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    const removed: UiElement[] = [];
    for (const id of ids) {
      const element = this._elements.get(id);
      if (element) {
        removed.push(element);
        this._elements.delete(id);
      }
    }
    if (removed.length > 0) {
      this._onElementsRemoved$.next(removed);
    }
  }

  get elements(): Map<UiElement['id'], UiElement> {
    return this._elements;
  }
}
