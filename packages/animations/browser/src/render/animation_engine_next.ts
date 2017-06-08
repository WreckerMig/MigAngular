/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import {AnimationMetadata, AnimationPlayer, AnimationTriggerMetadata} from '@angular/animations';
import {TriggerAst} from '../dsl/animation_ast';
import {buildAnimationAst} from '../dsl/animation_ast_builder';
import {AnimationTrigger, buildTrigger} from '../dsl/animation_trigger';
import {AnimationStyleNormalizer} from '../dsl/style_normalization/animation_style_normalizer';

import {AnimationDriver} from './animation_driver';
import {parseTimelineCommand} from './shared';
import {TimelineAnimationEngine} from './timeline_animation_engine';
import {TransitionAnimationEngine} from './transition_animation_engine';

export class AnimationEngine {
  private _transitionEngine: TransitionAnimationEngine;
  private _timelineEngine: TimelineAnimationEngine;

  private _triggerCache: {[key: string]: AnimationTrigger} = {};

  // this method is designed to be overridden by the code that uses this engine
  public onRemovalComplete = (element: any, context: any) => {};

  constructor(driver: AnimationDriver, normalizer: AnimationStyleNormalizer) {
    this._transitionEngine = new TransitionAnimationEngine(driver, normalizer);
    this._timelineEngine = new TimelineAnimationEngine(driver, normalizer);

    this._transitionEngine.onRemovalComplete =
        (element: any, context: any) => { this.onRemovalComplete(element, context); }
  }

  registerTrigger(
      componentId: string, namespaceId: string, hostElement: any, name: string,
      metadata: AnimationTriggerMetadata): void {
    const cacheKey = componentId + '-' + name;
    let trigger = this._triggerCache[cacheKey];
    if (!trigger) {
      const errors: any[] = [];
      const ast = buildAnimationAst(metadata as AnimationMetadata, errors) as TriggerAst;
      if (errors.length) {
        throw new Error(
            `The animation trigger "${name}" has failed to build due to the following errors:\n - ${errors.join("\n - ")}`);
      }
      trigger = buildTrigger(name, ast);
      this._triggerCache[cacheKey] = trigger;
    }
    this._transitionEngine.registerTrigger(namespaceId, name, trigger);
  }

  register(namespaceId: string, hostElement: any) {
    this._transitionEngine.register(namespaceId, hostElement);
  }

  destroy(namespaceId: string, context: any) {
    this._transitionEngine.destroy(namespaceId, context);
  }

  onInsert(namespaceId: string, element: any, parent: any, insertBefore: boolean): void {
    this._transitionEngine.insertNode(namespaceId, element, parent, insertBefore);
  }

  onRemove(namespaceId: string, element: any, context: any): void {
    this._transitionEngine.removeNode(namespaceId, element, context);
  }

  setProperty(namespaceId: string, element: any, property: string, value: any): boolean {
    // @@property
    if (property.charAt(0) == '@') {
      const [id, action] = parseTimelineCommand(property);
      const args = value as any[];
      this._timelineEngine.command(id, element, action, args);
      return false;
    }
    return this._transitionEngine.trigger(namespaceId, element, property, value);
  }

  listen(
      namespaceId: string, element: any, eventName: string, eventPhase: string,
      callback: (event: any) => any): () => any {
    // @@listen
    if (eventName.charAt(0) == '@') {
      const [id, action] = parseTimelineCommand(eventName);
      return this._timelineEngine.listen(id, element, action, callback);
    }
    return this._transitionEngine.listen(namespaceId, element, eventName, eventPhase, callback);
  }

  flush(microtaskId: number = -1): void { this._transitionEngine.flush(microtaskId); }

  get players(): AnimationPlayer[] {
    return (this._transitionEngine.players as AnimationPlayer[])
        .concat(this._timelineEngine.players as AnimationPlayer[]);
  }

  whenRenderingDone(): Promise<any> { return this._transitionEngine.whenRenderingDone(); }
}