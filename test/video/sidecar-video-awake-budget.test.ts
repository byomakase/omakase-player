import {describe, expect, it, vi} from 'vitest';
import {type SidecarVideoAwakeCandidate, SidecarVideoAwakeBudget} from '../../src/video/sidecar-video-awake-budget';

const candidate = (priority: number) => {
  let result = {
    priority,
    awakePriority: () => result.priority,
    yieldAwake: vi.fn(),
    retryAwake: vi.fn(),
  };
  return result as typeof result & SidecarVideoAwakeCandidate;
};

describe('SidecarVideoAwakeBudget', () => {
  it('grants slots up to limit', () => {
    let budget = new SidecarVideoAwakeBudget(2, 1);
    expect(budget.tryAcquire(candidate(5))).toBe(true);
    expect(budget.tryAcquire(candidate(5))).toBe(true);
    expect(budget.tryAcquire(candidate(5))).toBe(false);
    expect(budget.awakeCount).toBe(2);
  });

  it('notifies waiting candidates once slot is released', async () => {
    let budget = new SidecarVideoAwakeBudget(1, 1);
    let holder = candidate(5);
    let waiting = candidate(5);
    budget.tryAcquire(holder);
    expect(budget.tryAcquire(waiting)).toBe(false);

    budget.release(holder);
    expect(waiting.retryAwake).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(waiting.retryAwake).toHaveBeenCalledTimes(1);
  });

  it('does not notify withdrawn candidates', async () => {
    let budget = new SidecarVideoAwakeBudget(1, 1);
    let holder = candidate(5);
    let waiting = candidate(5);
    budget.tryAcquire(holder);
    budget.tryAcquire(waiting);
    budget.withdraw(waiting);
    budget.release(holder);
    await Promise.resolve();
    expect(waiting.retryAwake).not.toHaveBeenCalled();
  });

  it('preempts least important holder only by more than margin', () => {
    let budget = new SidecarVideoAwakeBudget(1, 1);
    let holder = candidate(5);
    budget.tryAcquire(holder);

    expect(budget.tryAcquire(candidate(4.5))).toBe(false);
    expect(holder.yieldAwake).not.toHaveBeenCalled();

    let closer = candidate(3);
    expect(budget.tryAcquire(closer)).toBe(true);
    expect(holder.yieldAwake).toHaveBeenCalledTimes(1);
  });

  it('never preempts active sidecar inside its time window', () => {
    let budget = new SidecarVideoAwakeBudget(1, 1);
    let active = candidate(Number.NEGATIVE_INFINITY);
    budget.tryAcquire(active);
    expect(budget.tryAcquire(candidate(Number.NEGATIVE_INFINITY))).toBe(false);
    expect(budget.tryAcquire(candidate(0))).toBe(false);
    expect(active.yieldAwake).not.toHaveBeenCalled();
  });
});
