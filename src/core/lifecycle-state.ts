export const RESTART_STATES = [
  'UNDISCOVERED', 'STARTING', 'RUNNING', 'STOP_REQUESTED',
  'STOPPED_OBSERVED', 'EVENT_TRIGGERED', 'RUNNING_AGAIN',
] as const;
export type LifecycleState = typeof RESTART_STATES[number] | 'INCONCLUSIVE';
export interface LifecyclePhase {
  state: LifecycleState;
  at: string;
  /** Index of the next CDP observation; ties phases to the observed event stream. */
  eventCursor: number;
}

export class LifecycleStateMachine {
  readonly phases: LifecyclePhase[] = [{ state: 'UNDISCOVERED', at: new Date().toISOString(), eventCursor: 0 }];
  get state(): LifecycleState { return this.phases[this.phases.length - 1].state; }

  advance(state: LifecycleState, eventCursor: number): void {
    const current = this.phases[this.phases.length - 1];
    const next = RESTART_STATES.indexOf(current.state as typeof RESTART_STATES[number]) + 1;
    if (current.state === 'INCONCLUSIVE' || !Number.isSafeInteger(eventCursor) || eventCursor < current.eventCursor ||
      (state !== 'INCONCLUSIVE' && state !== RESTART_STATES[next])) {
      throw new Error(`Invalid lifecycle transition: ${current.state} -> ${state} at cursor ${eventCursor}`);
    }
    this.phases.push({ state, eventCursor, at: new Date().toISOString() });
  }
}
