import {describe, expect, it} from 'vitest';
import {Subject} from 'rxjs';
import {SidecarVideoLoadQueue} from '../../src/video/sidecar-video-load-queue';

describe('SidecarVideoLoadQueue', () => {
  it('runs loads up to concurrency and starts pending once one completes', () => {
    let queue = new SidecarVideoLoadQueue(2);
    let loads = [new Subject<void>(), new Subject<void>(), new Subject<void>()];
    let started: number[] = [];
    loads.forEach((load, index) =>
      queue
        .run(() => {
          started.push(index);
          return load;
        })
        .subscribe()
    );
    expect(started).toEqual([0, 1]);
    expect(queue.pending).toBe(1);

    loads[0]!.complete();
    expect(started).toEqual([0, 1, 2]);
    expect(queue.running).toBe(2);
  });

  it('frees slot when load errors or is unsubscribed', () => {
    let queue = new SidecarVideoLoadQueue(1);
    let failing = new Subject<void>();
    let started = 0;
    queue.run(() => failing).subscribe({error: () => {}});
    let running = queue.run(() => (started++, new Subject<void>())).subscribe();
    let pending = queue.run(() => (started++, new Subject<void>())).subscribe();
    expect(started).toBe(0);

    failing.error(new Error('failed'));
    expect(started).toBe(1);

    running.unsubscribe();
    expect(started).toBe(2);
    pending.unsubscribe();
    expect(queue.running).toBe(0);
  });

  it('drops unsubscribed pending load', () => {
    let queue = new SidecarVideoLoadQueue(1);
    let first = new Subject<void>();
    let started = 0;
    queue.run(() => first).subscribe();
    queue
      .run(() => (started++, new Subject<void>()))
      .subscribe()
      .unsubscribe();
    first.complete();
    expect(started).toBe(0);
    expect(queue.running).toBe(0);
  });
});
