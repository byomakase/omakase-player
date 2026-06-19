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

import {type ClassStyleRule, type StyledElement, type StyleRule, UiStyleEngine} from './ui-style';
import {StringUtil} from '../util/string-util';
import {asyncScheduler, Observable, observeOn, Subject, takeUntil} from 'rxjs';
import {DEFAULT_ELEMENT_STYLES, type ElementStyleByName, type ElementStyleName} from './styles';
import {type UiElement, UiElementPropsEngine} from './ui-element-props';
import {ObserverBreaker} from '../common/observer-breaker';
import type {Destroyable} from '../common/capabilities';

export enum UiEventType {
  UI_STYLE_RULE_UPDATED = 'UI_STYLE_RULE_UPDATED',
  UI_STYLE_RULES_REMOVED = 'UI_STYLE_RULES_REMOVED',
  UI_ELEMENT_UPDATED = 'UI_ELEMENT_UPDATED',
  UI_ELEMENTS_REMOVED = 'UI_ELEMENTS_REMOVED',
}

export interface UiStyleRuleEventData {
  rule: StyleRule<any>;
}

export interface UiAppearanceRuleEventData {
  element: UiElement;
}

export type UiEventTypeDataMap = {
  [UiEventType.UI_STYLE_RULE_UPDATED]: UiStyleRuleEventData;
  [UiEventType.UI_STYLE_RULES_REMOVED]: {};
  [UiEventType.UI_ELEMENT_UPDATED]: UiAppearanceRuleEventData;
  [UiEventType.UI_ELEMENTS_REMOVED]: {elements: UiElement[]};
};

export type UiEvent = {
  [K in UiEventType]: {
    type: K;
    data: UiEventTypeDataMap[K];
  };
}[UiEventType];

export interface UiApi {
  /**
   * Emits whenever a style rule or element is updated or removed.
   *
   * Delivered asynchronously via `asyncScheduler` — subscribers always receive
   * events on the next tick, never synchronously. Switch on `event.type` to
   * handle specific event kinds:
   * - `UI_STYLE_RULE_UPDATED` — a style rule was added or merged
   * - `UI_STYLE_RULES_REMOVED` — style rules were removed
   * - `UI_ELEMENT_UPDATED` — an element's props were updated
   * - `UI_ELEMENTS_REMOVED` — one or more elements were removed
   */
  onEvent$: Observable<UiEvent>;

  /**
   * Snapshot of all currently tracked UI elements.
   *
   * An element is tracked as long as it has at least one non-undefined prop.
   * It is automatically removed (and `UI_ELEMENTS_REMOVED` emitted) once all
   * its props are cleared.
   */
  elements: UiElement[];

  /**
   * Snapshot of all registered style rules (both class-based and id-based).
   */
  styleRules: StyleRule<any>[];

  /**
   * Computes the merged style for an element using the following cascade priority
   * (later steps override earlier ones):
   * 1. Class rules — applied in `element.classes` array order; later class wins
   * 2. Inline `element.style`
   * 3. Id rule — highest priority, overrides everything else
   *
   * Any combination of `id`, `classes`, and `style` on the element is accepted.
   */
  resolveStyle<S>(element: StyledElement<S>): Partial<S>;

  /**
   * Returns the class name string for a named default element style.
   */
  resolveStyleClass<T extends ElementStyleName>(name: T): string;

  /**
   * Adds or merges a style rule into the registry.
   *
   * If a rule with the same key already exists (`id` or `className`), its style
   * is shallow-merged with the incoming rule. Otherwise the rule is appended.
   * Emits `UI_STYLE_RULE_UPDATED` after the update.
   */
  updateStyleRule<S>(rule: StyleRule<S>): void;

  /**
   * Removes all style rules for which `predicate` returns `true`.
   *
   * Iterates the rule registry and deletes every matching entry, then emits
   * `UI_STYLE_RULES_REMOVED`. Default styles registered at construction time
   * can also be removed this way.
   *
   * @example
   * // Remove all per-instance scoped rules for a specific track
   * ui.removeStyleRules((rule) => 'className' in rule && rule.className.startsWith('marker-track['));
   */
  removeStyleRules(predicate: (rule: StyleRule<any>) => boolean): void;

  /**
   * Adds or updates an element's props in the registry.
   *
   * - If the element exists, props are shallow-merged. Keys explicitly set to
   *   `undefined` are deleted from the stored props.
   * - If all props become `undefined` after the merge, the element is removed
   *   and `UI_ELEMENTS_REMOVED` is emitted instead.
   * - If the element does not exist and has at least one non-undefined prop, it
   *   is created and `UI_ELEMENT_UPDATED` is emitted.
   */
  updateElement(element: UiElement): void;

  /**
   * Gets an element by id, or `undefined` if it doesn't exist.
   * @param id Requested element's id
   */
  getElement(id: UiElement['id']): UiElement | undefined;
}

export class Ui implements UiApi, Destroyable {
  private _onEvent$: Subject<UiEvent> = new Subject<UiEvent>();

  private _styleEngine: UiStyleEngine;
  private _elementPropsEngine: UiElementPropsEngine;

  protected _destroyBreaker = new ObserverBreaker();

  static readonly defaultStyles: {[K in ElementStyleName]: ClassStyleRule<ElementStyleByName[K]>} = Object.fromEntries(
    (Object.keys(DEFAULT_ELEMENT_STYLES) as ElementStyleName[]).map((name) => [name, {className: StringUtil.toDashCase(name), style: DEFAULT_ELEMENT_STYLES[name]}])
  ) as {[K in ElementStyleName]: ClassStyleRule<ElementStyleByName[K]>};

  static formatStyleClassName<T extends ElementStyleName>(name: T): string {
    return this.defaultStyles[name].className;
  }

  constructor() {
    this._styleEngine = new UiStyleEngine();
    this._elementPropsEngine = new UiElementPropsEngine();

    this._styleEngine.onRuleUpdated$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((rule) => {
      this._onEvent$.next({
        type: UiEventType.UI_STYLE_RULE_UPDATED,
        data: {rule},
      });
    });

    this._styleEngine.onRulesRemoved$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((rule) => {
      this._onEvent$.next({
        type: UiEventType.UI_STYLE_RULES_REMOVED,
        data: {rule},
      });
    });

    this._elementPropsEngine.onElementUpdated$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((element) => {
      this._onEvent$.next({
        type: UiEventType.UI_ELEMENT_UPDATED,
        data: {element},
      });
    });

    this._elementPropsEngine.onElementsRemoved$.pipe(takeUntil(this._destroyBreaker.observer)).subscribe((elements) => {
      this._onEvent$.next({
        type: UiEventType.UI_ELEMENTS_REMOVED,
        data: {elements},
      });
    });

    for (const rule of Object.values(Ui.defaultStyles)) {
      this._styleEngine.updateRule(rule);
    }
  }

  get onEvent$(): Observable<UiEvent> {
    return this._onEvent$.pipe(observeOn(asyncScheduler));
  }

  resolveStyle<S>(element: StyledElement<S>): Partial<S> {
    return this._styleEngine.resolve(element);
  }

  resolveStyleClass<T extends ElementStyleName>(name: T): string {
    return Ui.formatStyleClassName(name);
  }

  updateStyleRule<S>(rule: StyleRule<S>): void {
    this._styleEngine.updateRule(rule);
  }

  removeStyleRules(predicate: (rule: StyleRule<any>) => boolean) {
    this._styleEngine.removeRules(predicate);
  }

  updateElement(element: UiElement): void {
    this._elementPropsEngine.updateElement(element);
  }

  findStyleRule(predicate: (rule: StyleRule<any>) => boolean): StyleRule<any> | undefined {
    return this._styleEngine.findRule(predicate);
  }

  removeElements(id: UiElement['id'] | UiElement['id'][]): void {
    this._elementPropsEngine.removeElements(id);
  }

  getElement(id: UiElement['id']): UiElement | undefined {
    return this._elementPropsEngine.elements.get(id);
  }

  get elements(): UiElement[] {
    return [...this._elementPropsEngine.elements.values()];
  }

  get styleRules(): StyleRule<any>[] {
    return this._styleEngine.rules;
  }

  destroy() {
    this._destroyBreaker.destroy();
  }
}

export function affectsStyledElement(event: UiEvent, element: StyledElement<any>): boolean {
  switch (event.type) {
    case UiEventType.UI_STYLE_RULES_REMOVED:
      return true;
    case UiEventType.UI_STYLE_RULE_UPDATED: {
      const rule = event.data.rule;
      if ('id' in rule) {
        if (!!element.id && rule.id === element.id) {
          return true;
        }
      } else if ('className' in rule) {
        if (!!element.classes?.includes(rule.className)) {
          return true;
        }
      }
      return !!element.parent && affectsStyledElement(event, element.parent);
    }
    default:
      return false;
  }
}
