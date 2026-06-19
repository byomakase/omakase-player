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
export type Color = `#${string}` | `rgb(${string})` | `rgba(${string})` | `hsl(${string})` | (string & {});
export type Size = number & {};
export type FontWeight = number & {};
export type TextAlign = 'left' | 'right' | 'center' | 'justify';
export type Cursor = 'default' | 'pointer' | 'grab' | 'grabbing' | 'ew-resize' | 'col-resize';

export interface ClassStyleRule<S = {}> {
  className: string;
  style: Partial<S>;
}

export interface IdStyleRule<S = {}> {
  id: string;
  style: Partial<S>;
}

export type StyleRule<S = {}> = ClassStyleRule<S> | IdStyleRule<S>;

export interface StyledElement<S = {}> {
  id?: string | undefined;
  classes?: string[];
  style?: Partial<S> | undefined;
  parent?: StyledElement<S> | undefined;
  description?: string | undefined;
}

export interface StyledElementWithId<S = {}> extends StyledElement<S> {
  id: string;
}

export class UiStyleEngine {
  private readonly _rules: StyleRule<any>[];

  private readonly _onRuleUpdated$: Subject<StyleRule<any>> = new Subject();
  private readonly _onRulesRemoved$: Subject<void> = new Subject();

  readonly onRuleUpdated$: Observable<StyleRule<any>> = this._onRuleUpdated$.asObservable();
  readonly onRulesRemoved$: Observable<void> = this._onRulesRemoved$.asObservable();

  constructor() {
    this._rules = [];
  }

  resolve<S>(el: StyledElement<S>): Partial<S> {
    let computed: Partial<S> = {};

    // 0. Parent styles resolved first (child overrides parent)
    if (el.parent) {
      computed = {...computed, ...this.resolve(el.parent)};
    }

    // 1. Class rules — applied in element class order (later class wins)
    for (const className of el.classes ?? []) {
      for (const rule of this._rules) {
        if ('className' in rule && rule.className === className) {
          computed = {...computed, ...rule.style};
        }
      }
    }

    // 2. Inline style
    if (el.style) {
      computed = {...computed, ...el.style};
    }

    // 3. Id rule (highest priority)
    if (el.id) {
      for (const rule of this._rules) {
        if ('id' in rule && rule.id === el.id) {
          computed = {...computed, ...rule.style};
        }
      }
    }

    return computed;
  }

  updateRule(rule: StyleRule<any>): void {
    const existingRule = this._rules.find((r) => this._rulesMatchKey(r, rule));
    if (existingRule) {
      existingRule.style = {...existingRule.style, ...rule.style};
    } else {
      this._rules.push(rule);
    }
    this._onRuleUpdated$.next(rule);
  }

  private _rulesMatchKey(a: StyleRule<any>, b: StyleRule<any>): boolean {
    if ('id' in a && 'id' in b) {
      return a.id === b.id;
    }
    if ('className' in a && 'className' in b) {
      return a.className === b.className;
    }
    return false;
  }

  findRule(predicate: (rule: StyleRule<any>) => boolean): StyleRule<any> | undefined {
    return this._rules.find(predicate);
  }

  removeRules(predicate: (rule: StyleRule<any>) => boolean): void {
    let removed = false;
    for (let i = this._rules.length - 1; i >= 0; i--) {
      const rule = this._rules[i];
      if (rule && predicate(rule)) {
        this._rules.splice(i, 1);
        removed = true;
      }
    }
    if (removed) {
      this._onRulesRemoved$.next();
    }
  }

  get rules(): StyleRule<any>[] {
    return this._rules;
  }
}
