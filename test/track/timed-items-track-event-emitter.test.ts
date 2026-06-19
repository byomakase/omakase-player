import {afterEach, describe, expect, it, vi} from 'vitest';
import {Subject} from 'rxjs';

// Mock the barrel to avoid pulling in browser-dependent modules.
// Only the two enums are needed at runtime; the rest are type-only imports.
vi.mock('../../src/media', () => ({
  TimedItemTemporalType: {
    MOMENT: 'MOMENT',
    SPAN: 'SPAN',
    SPAN_START: 'SPAN_START',
    SPAN_END: 'SPAN_END',
  },
  TimedItemsTrackEventType: {
    TIMED_ITEMS_TRACK_ITEMS_ADDED: 'TIMED_ITEMS_TRACK_ITEMS_ADDED',
    TIMED_ITEMS_TRACK_ITEMS_DELETED: 'TIMED_ITEMS_TRACK_ITEMS_DELETED',
    TIMED_ITEMS_TRACK_ITEMS_UPDATING: 'TIMED_ITEMS_TRACK_ITEMS_UPDATING',
    TIMED_ITEMS_TRACK_ITEMS_UPDATED: 'TIMED_ITEMS_TRACK_ITEMS_UPDATED',
  },
}));

import {TimedItemTemporalType, type TimedItem, type TimedItemsTrack} from '../../src/media';
import {
  TimedItemsTrackEventEmitter,
  TimedItemsTrackEventEmitterThresholdType,
  TimedItemsTrackItemEventType,
  type TimedItemsTrackItemEntryEventData,
  type TimedItemsTrackItemEvent,
  type TimedItemsTrackItemExitEventData,
} from '../../src/track/timed-items-track-event-emitter';

let idCounter = 0;

function makeSpan(start: number, end: number): TimedItem {
  return {
    id: `span-${++idCounter}`,
    temporal: {type: TimedItemTemporalType.SPAN, start: String(start), end: String(end)},
    data: {},
    state: {id: `span-${idCounter}`, data: {}, temporal: {type: TimedItemTemporalType.SPAN, start: String(start), end: String(end)}},
  };
}

function makeMoment(time: number): TimedItem {
  return {
    id: `moment-${++idCounter}`,
    temporal: {type: TimedItemTemporalType.MOMENT, time: String(time)},
    data: {},
    state: {id: `moment-${idCounter}`, data: {}, temporal: {type: TimedItemTemporalType.MOMENT, time: String(time)}},
  };
}

function makeSpanStart(start: number): TimedItem {
  return {
    id: `span-start-${++idCounter}`,
    temporal: {type: TimedItemTemporalType.SPAN_START, start: String(start)},
    data: {},
    state: {id: `span-start-${idCounter}`, data: {}, temporal: {type: TimedItemTemporalType.SPAN_START, start: String(start)}},
  };
}

function makeSpanEnd(end: number): TimedItem {
  return {
    id: `span-end-${++idCounter}`,
    temporal: {type: TimedItemTemporalType.SPAN_END, end: String(end)},
    data: {},
    state: {id: `span-end-${idCounter}`, data: {}, temporal: {type: TimedItemTemporalType.SPAN_END, end: String(end)}},
  };
}

function createMockTrack(items: TimedItem[]): TimedItemsTrack {
  return {
    onEvent$: new Subject(),
    findTimedItemsAtTime(time: number) {
      return items.filter((item) => {
        switch (item.temporal.type) {
          case TimedItemTemporalType.SPAN:
            return time >= Number(item.temporal.start) && time <= Number(item.temporal.end);
          case TimedItemTemporalType.MOMENT:
            return time === Number(item.temporal.time);
          case TimedItemTemporalType.SPAN_START:
            return time >= Number(item.temporal.start);
          case TimedItemTemporalType.SPAN_END:
            return time <= Number(item.temporal.end);
          default:
            return false;
        }
      });
    },
    findTimedItemsInRange(start: number, end: number) {
      return items.filter((item) => {
        switch (item.temporal.type) {
          case TimedItemTemporalType.SPAN:
            return Number(item.temporal.start) <= end && Number(item.temporal.end) >= start;
          case TimedItemTemporalType.MOMENT:
            return Number(item.temporal.time) >= start && Number(item.temporal.time) <= end;
          case TimedItemTemporalType.SPAN_START:
            return Number(item.temporal.start) >= start && Number(item.temporal.start) <= end;
          case TimedItemTemporalType.SPAN_END:
            return Number(item.temporal.end) >= start && Number(item.temporal.end) <= end;
          default:
            return false;
        }
      });
    },
  } as unknown as TimedItemsTrack;
}

function collectEvents(emitter: TimedItemsTrackEventEmitter): TimedItemsTrackItemEvent[] {
  const events: TimedItemsTrackItemEvent[] = [];
  emitter.onEvent$.subscribe((e) => events.push(e));
  return events;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('TimedItemsTrackEventEmitter', () => {
  let time$: Subject<number>;
  let emitter: TimedItemsTrackEventEmitter;

  afterEach(() => {
    emitter?.destroy();
    idCounter = 0;
  });

  // 1. SPAN — normal forward traversal
  describe('SPAN — normal traversal, all thresholds', () => {
    it('start and end threshold', () => {
      const span = makeSpan(10, 20);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.START_AND_END);
      const events = collectEvents(emitter);

      // Before threshold zone
      time$.next(9);
      expect(events).toHaveLength(0);

      // Enter threshold zone (start - threshold = 10 - 0.5 = 9.5)
      time$.next(9.8);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      // Inside the span — emit exact event
      time$.next(15);
      expect(events).toHaveLength(2);
      expect((events[1]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // Past the end (end + threshold = 20 + 0.5 = 20.5)
      time$.next(20.1);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // clear threshold
      time$.next(25);
      expect(events).toHaveLength(3);

      // enter from end direction
      time$.next(20.1);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[3]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      // Inside the span — exact event
      time$.next(15);
      expect(events).toHaveLength(5);
      expect((events[4]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // outside the span from the start
      time$.next(9.8);
      expect(events).toHaveLength(6);
      expect(events[5]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // clear threshold
      time$.next(25);
      expect(events).toHaveLength(6);

      // middle of the span
      time$.next(15);
      expect(events).toHaveLength(7);
      expect(events[6]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
    });

    it('start threshold', () => {
      const span = makeSpan(10, 20);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.START);
      const events = collectEvents(emitter);

      // Before threshold zone
      time$.next(9);
      expect(events).toHaveLength(0);

      // Enter threshold zone (start - threshold = 10 - 0.5 = 9.5)
      time$.next(9.8);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      // Inside the span — exact promotion
      time$.next(15);
      expect(events).toHaveLength(2);
      expect((events[1]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // Past the end (no end expansion, exits at span boundary)
      time$.next(20.1);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // clear threshold
      time$.next(25);
      expect(events).toHaveLength(3);

      // enter from end direction - no event since no end threshold
      time$.next(20.1);
      expect(events).toHaveLength(3);

      // Inside the span — direct exact entry
      time$.next(19.99);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[3]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // Inside the span — already exact, no extra events
      time$.next(15);
      expect(events).toHaveLength(4);

      // outside the span from the start
      time$.next(9.8);
      expect(events).toHaveLength(5);
      expect(events[4]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // clear threshold
      time$.next(25);
      expect(events).toHaveLength(5);

      // middle of the span — direct exact entry
      time$.next(15);
      expect(events).toHaveLength(6);
      expect(events[5]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[5]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);
    });

    it('end threshold', () => {
      const span = makeSpan(10, 20);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.END);
      const events = collectEvents(emitter);

      // Before threshold zone — no start expansion
      time$.next(9);
      expect(events).toHaveLength(0);

      time$.next(9.8);
      expect(events).toHaveLength(0);

      // Inside the span — direct exact entry (range starts at 10, no start expansion)
      time$.next(10.01);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // Inside the span — already exact, no extra events
      time$.next(15);
      expect(events).toHaveLength(1);

      // Past the end (exact item exits at span boundary)
      time$.next(20.1);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // clear threshold
      time$.next(25);
      expect(events).toHaveLength(2);

      // Enter from end threshold zone — near entry (outside span, inside end threshold)
      time$.next(20.01);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      // Inside the span — exact promotion
      time$.next(15);
      expect(events).toHaveLength(4);
      expect((events[3]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // outside the span from the start (exact item exits at span boundary)
      time$.next(9.8);
      expect(events).toHaveLength(5);
      expect(events[4]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // clear threshold
      time$.next(25);
      expect(events).toHaveLength(5);

      // middle of the span — direct exact entry
      time$.next(15);
      expect(events).toHaveLength(6);
      expect(events[5]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[5]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);
    });
    it('minimum threshold — small span [10, 11] with threshold 5', () => {
      // Span duration (1s) < threshold (5s) → MINIMUM expands to midpoint ± threshold/2
      // Midpoint = 10.5, range = [10.5 - 2.5, 10.5 + 2.5] = [8, 13]
      const span = makeSpan(10, 11);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 5, TimedItemsTrackEventEmitterThresholdType.MINIMUM);
      const events = collectEvents(emitter);

      // Before expanded threshold range
      time$.next(7);
      expect(events).toHaveLength(0);

      // Enter expanded threshold range at 8 → near entry
      time$.next(8);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      // Inside span — exact promotion
      time$.next(10.5);
      expect(events).toHaveLength(2);
      expect((events[1]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // Past span end (exact item exits at span boundary)
      time$.next(11.5);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // Clear threshold
      time$.next(20);
      expect(events).toHaveLength(3);

      // Re-enter from end direction inside expanded threshold → near entry
      time$.next(12);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[3]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      // Back inside span — exact promotion
      time$.next(10.5);
      expect(events).toHaveLength(5);
      expect((events[4]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // Exit from start side (exact item exits at span boundary)
      time$.next(9);
      expect(events).toHaveLength(6);
      expect(events[5]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);
    });

    it('no threshold', () => {
      const span = makeSpan(10, 20);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$);
      const events = collectEvents(emitter);

      // Before span — no threshold to extend
      time$.next(9);
      expect(events).toHaveLength(0);

      time$.next(9.99);
      expect(events).toHaveLength(0);

      // Exactly at span start → exact entry (no threshold = no near)
      time$.next(10);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems).toHaveLength(0);

      // Inside — already exact, no extra events
      time$.next(15);
      expect(events).toHaveLength(1);

      // Past span end → exit
      time$.next(20.01);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // Seek back inside → re-entry as exact (no ineligibility without threshold)
      time$.next(15);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // Exit from start side
      time$.next(9.99);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);
    });
  });

  // 2. SPAN — tiny span forward (the bug fix)
  describe('SPAN — tiny span (double entry/exit bug)', () => {
    it('start and end threshold', () => {
      // Span [52, 52.005] with threshold 0.5
      // Threshold range: [51.5, 52.505]
      const span = makeSpan(52, 52.005);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.START_AND_END);
      const events = collectEvents(emitter);

      // Before threshold zone
      time$.next(51);
      expect(events).toHaveLength(0);

      // Enter threshold zone — near entry
      time$.next(51.8);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      // Tick inside span itself — exact promotion
      time$.next(52.002);
      expect(events).toHaveLength(2);
      expect((events[1]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // Past the span end — exit (exact item exits at span boundary)
      time$.next(52.01);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // Still inside end threshold zone — must NOT re-enter (the bug)
      time$.next(52.1);
      expect(events).toHaveLength(3);

      // Past end threshold entirely — ineligibility cleared
      time$.next(52.6);
      expect(events).toHaveLength(3);

      // Seek to middle of span — exact re-entry
      time$.next(52.002);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[3]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);
    });

    it('start threshold', () => {
      // Span [52, 52.005] with threshold 0.5, START only
      // Threshold range: [51.5, 52.005] — no expansion on end side
      const span = makeSpan(52, 52.005);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.START);
      const events = collectEvents(emitter);

      time$.next(51);
      expect(events).toHaveLength(0);

      // Enter start threshold zone → near entry
      time$.next(51.8);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      // Inside span — exact promotion
      time$.next(52.002);
      expect(events).toHaveLength(2);
      expect((events[1]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // Past span end → exit (exact item exits at span boundary)
      time$.next(52.01);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // No end threshold — no re-entry possible from this side
      time$.next(52.1);
      expect(events).toHaveLength(3);

      // Clear ineligibility by moving far past end
      time$.next(52.3);
      expect(events).toHaveLength(3);

      // Seek to middle of span — exact re-entry
      time$.next(52.002);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[3]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);
    });

    it('end threshold', () => {
      // Span [52, 52.005] with threshold 0.5, END only
      // Threshold range: [52, 52.505] — no expansion on start side
      const span = makeSpan(52, 52.005);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.END);
      const events = collectEvents(emitter);

      // Before span start — no start threshold, not entered
      time$.next(51.8);
      expect(events).toHaveLength(0);

      // Inside span → direct exact entry (range starts at 52)
      time$.next(52.002);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // Past span end → exit (exact item exits at span boundary)
      time$.next(52.01);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // Still inside end threshold zone — must NOT re-enter
      time$.next(52.1);
      expect(events).toHaveLength(2);

      // Clear ineligibility by moving past end threshold (52.505)
      time$.next(52.6);
      expect(events).toHaveLength(2);

      // Seek to middle of span — exact re-entry
      time$.next(52.002);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);
    });

    it('minimum threshold', () => {
      // Span [52, 52.005] with threshold 0.5, MINIMUM
      // Duration 0.005 < threshold 0.5, so midpoint-centered:
      // midpoint = 52.0025, range = [51.7525, 52.2525]
      const span = makeSpan(52, 52.005);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.MINIMUM);
      const events = collectEvents(emitter);

      time$.next(51);
      expect(events).toHaveLength(0);

      // Enter expanded threshold zone → near entry
      time$.next(51.8);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      // Inside span — exact promotion
      time$.next(52.002);
      expect(events).toHaveLength(2);
      expect((events[1]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // Past span end → exit (exact item exits at span boundary)
      time$.next(52.01);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // Still inside expanded threshold zone — must NOT re-enter
      time$.next(52.1);
      expect(events).toHaveLength(3);

      // Clear ineligibility by moving past expanded threshold (52.2525)
      time$.next(52.3);
      expect(events).toHaveLength(3);

      // Seek to middle of span — exact re-entry
      time$.next(52.002);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[3]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);
    });
  });

  // 3. SPAN — re-entry after clearing ineligibility (exit end)
  describe('SPAN — re-entry after clearing ineligibility (exit end)', () => {
    it('start and end threshold', () => {
      // Span [52, 52.005], threshold 0.5, START_AND_END
      // Threshold range: [51.5, 52.505]
      const span = makeSpan(52, 52.005);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.START_AND_END);
      const events = collectEvents(emitter);

      // 1. Near entry from start threshold + exit on end side → ineligible on end
      time$.next(51.8);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      time$.next(52.01);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 2. While ineligible on end, re-enter from start threshold (allowed) — near
      time$.next(51.8);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      // 3. Exit on end side again → ineligible on end again
      time$.next(52.01);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 4. Re-enter in the middle of the span (allowed — inside span clears ineligibility) — exact
      time$.next(52.002);
      expect(events).toHaveLength(5);
      expect(events[4]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[4]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // 5. Exit on end side again → ineligible on end
      time$.next(52.01);
      expect(events).toHaveLength(6);
      expect(events[5]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 6. Try re-entry from forbidden end side — blocked by ineligibility
      time$.next(52.1);
      expect(events).toHaveLength(6);

      // 7. Clear threshold by moving past 52.505
      time$.next(52.6);
      expect(events).toHaveLength(6);

      // 8. Enter from previously forbidden end side — now allowed — near
      time$.next(52.1);
      expect(events).toHaveLength(7);
      expect(events[6]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[6]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);
    });

    it('start threshold', () => {
      // Span [52, 52.005], threshold 0.5, START only
      // Threshold range: [51.5, 52.005] — no end expansion
      const span = makeSpan(52, 52.005);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.START);
      const events = collectEvents(emitter);

      // 1. Near entry from start threshold + exit on end side → ineligible on end
      time$.next(51.8);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      time$.next(52.01);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 2. While ineligible on end, re-enter from start threshold (allowed) — near
      time$.next(51.8);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      // 3. Exit on end side again → ineligible on end
      time$.next(52.01);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 4. Re-enter in the middle of the span — exact
      time$.next(52.002);
      expect(events).toHaveLength(5);
      expect(events[4]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[4]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // 5. Exit on end side again
      time$.next(52.01);
      expect(events).toHaveLength(6);
      expect(events[5]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 6. End side has no threshold expansion — try from just past end
      //    No end threshold means entry range ends at 52.005, so 52.1 is outside entry range
      time$.next(52.1);
      expect(events).toHaveLength(6);

      // 7. Clear by moving far away
      time$.next(52.3);
      expect(events).toHaveLength(6);

      // 8. Still no end threshold — 52.1 is outside entry range [51.5, 52.005]
      time$.next(52.1);
      expect(events).toHaveLength(6);

      // But entering inside the span works — exact
      time$.next(52.002);
      expect(events).toHaveLength(7);
      expect(events[6]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[6]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);
    });

    it('end threshold', () => {
      // Span [52, 52.005], threshold 0.5, END only
      // Threshold range: [52, 52.505] — no start expansion
      const span = makeSpan(52, 52.005);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.END);
      const events = collectEvents(emitter);

      // 1. Exact entry inside span + exit on end side → ineligible on end
      time$.next(52.002);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      time$.next(52.01);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 2. No start threshold — try start side, outside entry range [52, 52.505]
      time$.next(51.8);
      expect(events).toHaveLength(2);

      // 3. Re-enter in the middle of the span (allowed) — exact
      time$.next(52.002);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // 4. Exit on end side again
      time$.next(52.01);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 5. Try re-entry from forbidden end side — blocked
      time$.next(52.1);
      expect(events).toHaveLength(4);

      // 6. Clear threshold by moving past 52.505
      time$.next(52.6);
      expect(events).toHaveLength(4);

      // 7. Enter from previously forbidden end side — now allowed — near
      time$.next(52.1);
      expect(events).toHaveLength(5);
      expect(events[4]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[4]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);
    });

    it('minimum threshold', () => {
      // Span [52, 52.005], threshold 0.5, MINIMUM
      // Duration 0.005 < 0.5, midpoint = 52.0025, range = [51.7525, 52.2525]
      const span = makeSpan(52, 52.005);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.MINIMUM);
      const events = collectEvents(emitter);

      // 1. Near entry from start threshold + exit on end side → ineligible on end
      time$.next(51.8);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      time$.next(52.01);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 2. While ineligible on end, re-enter from start threshold (allowed) — near
      time$.next(51.8);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      // 3. Exit on end side again → ineligible on end
      time$.next(52.01);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 4. Re-enter in the middle of the span — exact
      time$.next(52.002);
      expect(events).toHaveLength(5);
      expect(events[4]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[4]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // 5. Exit on end side again
      time$.next(52.01);
      expect(events).toHaveLength(6);
      expect(events[5]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 6. Try re-entry from forbidden end side — blocked
      time$.next(52.1);
      expect(events).toHaveLength(6);

      // 7. Clear threshold by moving past 52.2525
      time$.next(52.3);
      expect(events).toHaveLength(6);

      // 8. Enter from previously forbidden end side — now allowed — near
      time$.next(52.1);
      expect(events).toHaveLength(7);
      expect(events[6]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[6]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);
    });

    it('end-side ineligibility clears through backward seek past range start', () => {
      // Span [52, 52.005], threshold 0.5, START_AND_END
      // Threshold range: [51.5, 52.505]
      // After exit-end, seeking backward past range.start (51.5) clears end-side ineligibility
      const span = makeSpan(52, 52.005);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.START_AND_END);
      const events = collectEvents(emitter);

      // 1. Exact entry inside span
      time$.next(52.002);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // 2. Exit end → ineligible on end
      time$.next(52.01);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 3. Seek backward past range.start (51.5) — clears end-side ineligibility
      time$.next(51.0);
      expect(events).toHaveLength(2);

      // 4. Come back to end threshold zone — now allowed (ineligibility was cleared)
      time$.next(52.1);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);
    });
  });

  // 4. SPAN — re-entry after clearing ineligibility (exit start)
  describe('SPAN — re-entry after clearing ineligibility (exit start)', () => {
    it('start and end threshold', () => {
      // Span [52, 52.005], threshold 0.5, START_AND_END
      // Threshold range: [51.5, 52.505]
      const span = makeSpan(52, 52.005);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.START_AND_END);
      const events = collectEvents(emitter);

      // 1. Exact entry inside span + exit on start side → ineligible on start
      time$.next(52.002);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      time$.next(51.99);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 2. While ineligible on start, re-enter from end threshold (allowed) — near
      time$.next(52.1);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      // 3. Exit on start side again → ineligible on start
      time$.next(51.99);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 4. Re-enter in the middle of the span — exact
      time$.next(52.002);
      expect(events).toHaveLength(5);
      expect(events[4]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[4]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // 5. Exit on start side again
      time$.next(51.99);
      expect(events).toHaveLength(6);
      expect(events[5]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 6. Try re-entry from forbidden start side — blocked
      time$.next(51.8);
      expect(events).toHaveLength(6);

      // 7. Clear threshold by moving below 51.5
      time$.next(51.4);
      expect(events).toHaveLength(6);

      // 8. Enter from previously forbidden start side — now allowed — near
      time$.next(51.8);
      expect(events).toHaveLength(7);
      expect(events[6]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[6]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);
    });

    it('start threshold', () => {
      // Span [52, 52.005], threshold 0.5, START only
      // Threshold range: [51.5, 52.005] — no end expansion
      const span = makeSpan(52, 52.005);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.START);
      const events = collectEvents(emitter);

      // 1. Exact entry inside span + exit on start side → ineligible on start
      time$.next(52.002);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      time$.next(51.99);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 2. No end threshold — 52.1 outside entry range [51.5, 52.005]
      time$.next(52.1);
      expect(events).toHaveLength(2);

      // 3. Re-enter middle (allowed — clears ineligibility) — exact
      time$.next(52.002);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // 4. Exit start again → ineligible
      time$.next(51.99);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 5. Re-enter middle again — exact
      time$.next(52.002);
      expect(events).toHaveLength(5);
      expect(events[4]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[4]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // 6. Exit start again
      time$.next(51.99);
      expect(events).toHaveLength(6);
      expect(events[5]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 7. Try forbidden start side — blocked
      time$.next(51.8);
      expect(events).toHaveLength(6);

      // 8. Clear threshold by moving below 51.5
      time$.next(51.4);
      expect(events).toHaveLength(6);

      // 9. Enter from start side — now allowed — near
      time$.next(51.8);
      expect(events).toHaveLength(7);
      expect(events[6]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[6]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);
    });

    it('end threshold', () => {
      // Span [52, 52.005], threshold 0.5, END only
      // Threshold range: [52, 52.505] — no start expansion
      // Start-exit ineligibility (threshold = range.start = 52) clears immediately
      // since time (51.99) < threshold (52) at the same tick.
      const span = makeSpan(52, 52.005);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.END);
      const events = collectEvents(emitter);

      // 1. Exact entry inside span + exit on start side
      time$.next(52.002);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      time$.next(51.99);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 2. Ineligibility cleared same tick — end threshold re-entry works — near
      time$.next(52.1);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      // 3. Exit start again — ineligibility clears immediately again
      time$.next(51.99);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 4. Re-enter middle — works immediately — exact
      time$.next(52.002);
      expect(events).toHaveLength(5);
      expect(events[4]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[4]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);
    });

    it('minimum threshold', () => {
      // Span [52, 52.005], threshold 0.5, MINIMUM
      // Duration 0.005 < 0.5, midpoint = 52.0025, range = [51.7525, 52.2525]
      const span = makeSpan(52, 52.005);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.MINIMUM);
      const events = collectEvents(emitter);

      // 1. Exact entry inside span + exit on start side → ineligible on start
      time$.next(52.002);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      time$.next(51.99);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 2. While ineligible on start, re-enter from end threshold (allowed) — near
      time$.next(52.1);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      // 3. Exit on start side again → ineligible
      time$.next(51.99);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 4. Re-enter middle — exact
      time$.next(52.002);
      expect(events).toHaveLength(5);
      expect(events[4]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[4]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // 5. Exit start again
      time$.next(51.99);
      expect(events).toHaveLength(6);
      expect(events[5]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 6. Try forbidden start side — blocked
      time$.next(51.8);
      expect(events).toHaveLength(6);

      // 7. Clear threshold by moving below 51.7525
      time$.next(51.7);
      expect(events).toHaveLength(6);

      // 8. Enter from start side — now allowed — near
      time$.next(51.8);
      expect(events).toHaveLength(7);
      expect(events[6]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[6]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);
    });

    it('forward through span clears start-side ineligibility', () => {
      // Span [52, 52.005], threshold 0.5, START_AND_END
      // Threshold range: [51.5, 52.505]
      // After exit-start, moving forward past range.end (52.505) clears
      // start-side ineligibility via the special SPAN clearing path (lines 155-159).
      const span = makeSpan(52, 52.005);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.START_AND_END);
      const events = collectEvents(emitter);

      // 1. Exact entry inside span
      time$.next(52.002);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(span.id);

      // 2. Exit start → ineligible on start
      time$.next(51.99);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // 3. Try start-side re-entry — blocked
      time$.next(51.8);
      expect(events).toHaveLength(2);

      // 4. Move forward past range.end (52.505) — clears start-side ineligibility
      time$.next(52.6);
      expect(events).toHaveLength(2);

      // 5. Now start-side re-entry is allowed — near
      time$.next(51.8);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);
    });
  });

  // 5. MOMENT — entry and exit, all thresholds
  describe('MOMENT — entry and exit, all thresholds', () => {
    it('start and end threshold', () => {
      // Moment at 30, threshold 0.5, START_AND_END
      // Threshold range: [29.5, 30.5]
      const moment = makeMoment(30);
      const track = createMockTrack([moment]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.START_AND_END);
      const events = collectEvents(emitter);

      // Before threshold
      time$.next(29);
      expect(events).toHaveLength(0);

      // Enter threshold zone from start side — near (|29.8-30|=0.2 > 0.001)
      time$.next(29.8);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(moment.id);

      // At exact moment time — exact promotion (|30-30|=0 < 0.001)
      time$.next(30);
      expect(events).toHaveLength(2);
      expect((events[1]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(moment.id);

      // Past end of threshold → exit
      time$.next(30.6);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // Re-enter from end side — near (|30.2-30|=0.2 > 0.001)
      time$.next(30.2);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[3]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(moment.id);

      // Exit start side
      time$.next(29.4);
      expect(events).toHaveLength(5);
      expect(events[4]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // Re-enter at exact moment time — direct exact entry
      time$.next(30);
      expect(events).toHaveLength(6);
      expect(events[5]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[5]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(moment.id);
    });

    it('start threshold', () => {
      // Moment at 30, threshold 0.5, START only
      // Threshold range: [29.5, 30]
      const moment = makeMoment(30);
      const track = createMockTrack([moment]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.START);
      const events = collectEvents(emitter);

      // Before threshold
      time$.next(29);
      expect(events).toHaveLength(0);

      // Enter from start side — near (|29.8-30|=0.2 > 0.001)
      time$.next(29.8);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(moment.id);

      // At moment time — exact promotion
      time$.next(30);
      expect(events).toHaveLength(2);
      expect((events[1]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(moment.id);

      // Past end (no end expansion, range ends at 30) → exit
      time$.next(30.1);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // End side has no threshold — 30.1 outside entry range [29.5, 30]
      time$.next(30.1);
      expect(events).toHaveLength(3);

      // Re-enter at exact moment time — direct exact entry
      time$.next(30);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[3]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(moment.id);

      // Exit start side
      time$.next(29.4);
      expect(events).toHaveLength(5);
      expect(events[4]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // Re-enter from start threshold — near
      time$.next(29.8);
      expect(events).toHaveLength(6);
      expect(events[5]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[5]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(moment.id);
    });

    it('end threshold', () => {
      // Moment at 30, threshold 0.5, END only
      // Threshold range: [30, 30.5]
      const moment = makeMoment(30);
      const track = createMockTrack([moment]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.END);
      const events = collectEvents(emitter);

      // Before — no start expansion, 29.8 outside entry range [30, 30.5]
      time$.next(29.8);
      expect(events).toHaveLength(0);

      // Enter at exact moment time — direct exact entry
      time$.next(30);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(moment.id);

      // Inside end threshold — still inside (already exact, no promotion needed)
      time$.next(30.2);
      expect(events).toHaveLength(1);

      // Past end threshold → exit
      time$.next(30.6);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // Re-enter from end threshold — near (|30.2-30|=0.2 > 0.001)
      time$.next(30.2);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(moment.id);

      // Exit start side (no start expansion, range starts at 30)
      time$.next(29.8);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // Re-enter at exact moment time — direct exact entry
      time$.next(30);
      expect(events).toHaveLength(5);
      expect(events[4]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[4]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(moment.id);
    });

    it('minimum threshold', () => {
      // Moment at 30, threshold 0.5, MINIMUM
      // Duration 0 < 0.5, midpoint = 30, range = [29.75, 30.25]
      // Same as START_AND_END for a moment (midpoint == moment time)
      const moment = makeMoment(30);
      const track = createMockTrack([moment]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.MINIMUM);
      const events = collectEvents(emitter);

      // Before threshold
      time$.next(29);
      expect(events).toHaveLength(0);

      // Enter from start side — near
      time$.next(29.8);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(moment.id);

      // At moment time — exact promotion
      time$.next(30);
      expect(events).toHaveLength(2);
      expect((events[1]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(moment.id);

      // Past end → exit
      time$.next(30.3);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // Re-enter from end side — near
      time$.next(30.2);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[3]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(moment.id);

      // Exit start side
      time$.next(29.7);
      expect(events).toHaveLength(5);
      expect(events[4]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // Re-enter at exact moment time — direct exact entry
      time$.next(30);
      expect(events).toHaveLength(6);
      expect(events[5]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[5]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(moment.id);
    });

    it('no threshold', () => {
      // Moment at 30, no threshold — only exact time match triggers entry
      const moment = makeMoment(30);
      const track = createMockTrack([moment]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$);
      const events = collectEvents(emitter);

      // Before
      time$.next(29.99);
      expect(events).toHaveLength(0);

      // Exact time → exact entry (no threshold = no near)
      time$.next(30);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(moment.id);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems).toHaveLength(0);

      // Any other time → exit
      time$.next(30.01);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // Re-enter at exact time — exact
      time$.next(30);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(moment.id);
    });
  });

  // 6. SPAN_START — entry and exit, all thresholds
  describe('SPAN_START — entry and exit, all thresholds', () => {
    it('start and end threshold', () => {
      // SPAN_START at 30, threshold 0.5, START_AND_END
      // _createThresholdRange(30, Infinity) = [29.5, Infinity]
      // Near: [29.5, 30), Exact: [30, ∞). Exit only when time < 30.
      const item = makeSpanStart(30);
      const track = createMockTrack([item]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.START_AND_END);
      const events = collectEvents(emitter);

      // Before threshold
      time$.next(29);
      expect(events).toHaveLength(0);

      // Enter start threshold zone — near
      time$.next(29.6);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(item.id);

      // Still near-active within threshold zone (no exit until range.start exceeded)
      time$.next(29.55);
      expect(events).toHaveLength(1);

      time$.next(29.9);
      expect(events).toHaveLength(1);

      // Past start — exact promotion
      time$.next(30);
      expect(events).toHaveLength(2);
      expect((events[1]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(item.id);

      // Far forward — still active (extends infinitely)
      time$.next(35);
      expect(events).toHaveLength(2);

      // Back before start but still in threshold zone — exit
      // (exit at 29.8 keeps ineligibility: 29.8 >= 29.5, not cleared)
      time$.next(29.8);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // Same threshold zone — blocked (ineligible: 29.9 >= 29.5 && 29.9 < 30)
      time$.next(29.9);
      expect(events).toHaveLength(3);

      // Clear ineligibility (29.4 < 29.5)
      time$.next(29.4);
      expect(events).toHaveLength(3);

      // Re-enter — near (ineligibility cleared)
      time$.next(29.8);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[3]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(item.id);
    });

    it('start threshold', () => {
      // SPAN_START at 30, threshold 0.5, START
      // _createThresholdRange(30, Infinity) = [29.5, Infinity] — same as START_AND_END
      const item = makeSpanStart(30);
      const track = createMockTrack([item]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.START);
      const events = collectEvents(emitter);

      time$.next(29);
      expect(events).toHaveLength(0);

      // Near entry
      time$.next(29.6);
      expect(events).toHaveLength(1);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(item.id);

      // Still near-active within threshold zone
      time$.next(29.55);
      expect(events).toHaveLength(1);

      time$.next(29.9);
      expect(events).toHaveLength(1);

      // Exact promotion
      time$.next(30);
      expect(events).toHaveLength(2);
      expect((events[1]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(item.id);

      // Still active forward
      time$.next(35);
      expect(events).toHaveLength(2);

      // Back before start but still in threshold zone — exit
      time$.next(29.8);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // Same threshold zone — blocked (ineligible: 29.9 >= 29.5 && 29.9 < 30)
      time$.next(29.9);
      expect(events).toHaveLength(3);

      // Clear ineligibility (29.4 < 29.5)
      time$.next(29.4);
      expect(events).toHaveLength(3);

      // Re-enter — near (ineligibility cleared)
      time$.next(29.8);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[3]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(item.id);
    });

    it('end threshold', () => {
      // SPAN_START at 30, threshold 0.5, END
      // _createThresholdRange(30, Infinity) = [30, Infinity] — no start expansion
      const item = makeSpanStart(30);
      const track = createMockTrack([item]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.END);
      const events = collectEvents(emitter);

      // Before start — no threshold expansion, outside range
      time$.next(29.8);
      expect(events).toHaveLength(0);

      // At start — exact entry
      time$.next(30);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(item.id);

      // Still active forward
      time$.next(35);
      expect(events).toHaveLength(1);

      // Exit
      time$.next(29.5);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // Exact re-entry
      time$.next(30);
      expect(events).toHaveLength(3);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(item.id);
    });

    it('minimum threshold', () => {
      // SPAN_START at 30, threshold 0.5, MINIMUM
      // Infinity - 30 > 0.5 → no expansion, range = [30, Infinity]
      const item = makeSpanStart(30);
      const track = createMockTrack([item]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.MINIMUM);
      const events = collectEvents(emitter);

      time$.next(29.8);
      expect(events).toHaveLength(0);

      // Exact entry
      time$.next(30);
      expect(events).toHaveLength(1);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(item.id);

      time$.next(35);
      expect(events).toHaveLength(1);

      // Exit
      time$.next(29.5);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // Exact re-entry
      time$.next(30);
      expect(events).toHaveLength(3);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(item.id);
    });

    it('no threshold', () => {
      const item = makeSpanStart(30);
      const track = createMockTrack([item]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$);
      const events = collectEvents(emitter);

      time$.next(29.99);
      expect(events).toHaveLength(0);

      // Exact entry
      time$.next(30);
      expect(events).toHaveLength(1);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(item.id);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems).toHaveLength(0);

      // Still active
      time$.next(100);
      expect(events).toHaveLength(1);

      // Exit
      time$.next(29.5);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // Re-entry
      time$.next(30);
      expect(events).toHaveLength(3);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(item.id);
    });
  });

  // 7. SPAN_END — entry and exit, all thresholds
  describe('SPAN_END — entry and exit, all thresholds', () => {
    it('start and end threshold', () => {
      // SPAN_END at 20, threshold 0.5, START_AND_END
      // _createThresholdRange(0, 20) = [0, 20.5] (end expanded)
      // Exact: time <= 20. Near: 20 < time <= 20.5. Exit when time > 20.
      const item = makeSpanEnd(20);
      const track = createMockTrack([item]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.START_AND_END);
      const events = collectEvents(emitter);

      // Inside span — exact entry
      time$.next(15);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(item.id);

      // Still active going backward
      time$.next(5);
      expect(events).toHaveLength(1);

      // Past end — exit
      time$.next(20.1);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // In end threshold zone — blocked (ineligible: 20.15 > 20 && 20.15 <= 20.5)
      time$.next(20.15);
      expect(events).toHaveLength(2);

      // Clear ineligibility (25 > 20.5)
      time$.next(25);
      expect(events).toHaveLength(2);

      // Near entry in end threshold zone
      time$.next(20.1);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(item.id);

      // Still near-active within threshold zone (no exit until range.end exceeded)
      time$.next(20.15);
      expect(events).toHaveLength(3);

      time$.next(20.4);
      expect(events).toHaveLength(3);

      // Back inside span — exact promotion
      time$.next(15);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[3]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(item.id);
    });

    it('start threshold', () => {
      // SPAN_END at 20, threshold 0.5, START
      // _createThresholdRange(0, 20) = [0, 20] — no end expansion
      const item = makeSpanEnd(20);
      const track = createMockTrack([item]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.START);
      const events = collectEvents(emitter);

      // Exact entry
      time$.next(15);
      expect(events).toHaveLength(1);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(item.id);

      // Exit
      time$.next(20.1);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // No end threshold — 20.1 outside entry range [0, 20]
      time$.next(20.1);
      expect(events).toHaveLength(2);

      // Exact re-entry
      time$.next(15);
      expect(events).toHaveLength(3);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(item.id);
    });

    it('end threshold', () => {
      // SPAN_END at 20, threshold 0.5, END
      // _createThresholdRange(0, 20) = [0, 20.5] — end expanded
      const item = makeSpanEnd(20);
      const track = createMockTrack([item]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.END);
      const events = collectEvents(emitter);

      // Exact entry
      time$.next(15);
      expect(events).toHaveLength(1);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(item.id);

      // Past end — exit
      time$.next(20.1);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // Blocked (ineligible in end threshold zone)
      time$.next(20.15);
      expect(events).toHaveLength(2);

      // Clear ineligibility
      time$.next(25);
      expect(events).toHaveLength(2);

      // Near entry in end threshold zone
      time$.next(20.1);
      expect(events).toHaveLength(3);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(item.id);

      // Still near-active within threshold zone
      time$.next(20.05);
      expect(events).toHaveLength(3);

      time$.next(20.4);
      expect(events).toHaveLength(3);

      // Back inside span — exact promotion
      time$.next(15);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[3]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(item.id);
    });

    it('minimum threshold', () => {
      // SPAN_END at 20, threshold 0.5, MINIMUM
      // 20 - 0 > 0.5 → no expansion, range = [0, 20]
      const item = makeSpanEnd(20);
      const track = createMockTrack([item]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 0.5, TimedItemsTrackEventEmitterThresholdType.MINIMUM);
      const events = collectEvents(emitter);

      // Exact entry
      time$.next(15);
      expect(events).toHaveLength(1);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(item.id);

      // Exit
      time$.next(20.1);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // No expansion — 20.1 outside range [0, 20]
      time$.next(20.1);
      expect(events).toHaveLength(2);

      // Exact re-entry
      time$.next(15);
      expect(events).toHaveLength(3);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(item.id);
    });

    it('no threshold', () => {
      const item = makeSpanEnd(20);
      const track = createMockTrack([item]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$);
      const events = collectEvents(emitter);

      // Before end — exact entry
      time$.next(15);
      expect(events).toHaveLength(1);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(item.id);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems).toHaveLength(0);

      // Still active
      time$.next(5);
      expect(events).toHaveLength(1);

      // Past end — exit
      time$.next(20.1);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);

      // Re-entry
      time$.next(15);
      expect(events).toHaveLength(3);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(item.id);
    });
  });

  // Overlapping items — multi-item tracks
  describe('Overlapping items', () => {
    it('two overlapping spans — staggered entry/exit', () => {
      // Span A: [10, 20], Span B: [15, 25], threshold 1
      // Range A: [9, 21], Range B: [14, 26]
      const spanA = makeSpan(10, 20);
      const spanB = makeSpan(15, 25);
      const track = createMockTrack([spanA, spanB]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 1, TimedItemsTrackEventEmitterThresholdType.START_AND_END);
      const events = collectEvents(emitter);

      // A enters near (9.6 in threshold range [9, 21] but 9.6 < 10)
      time$.next(9.6);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems).toHaveLength(1);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(spanA.id);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems).toHaveLength(0);

      // A promoted to exact (10 in [10, 20])
      time$.next(10);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[1]!.data as TimedItemsTrackItemEntryEventData).nearItems).toHaveLength(0);
      expect((events[1]!.data as TimedItemsTrackItemEntryEventData).exactItems).toHaveLength(1);
      expect((events[1]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(spanA.id);

      // B enters near (14.6 in [14, 26] but 14.6 < 15); A still exact-active
      time$.next(14.6);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).nearItems).toHaveLength(1);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(spanB.id);
      expect((events[2]!.data as TimedItemsTrackItemEntryEventData).exactItems).toHaveLength(0);

      // B promoted to exact (15 in [15, 25]); A still exact-active
      time$.next(15);
      expect(events).toHaveLength(4);
      expect(events[3]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[3]!.data as TimedItemsTrackItemEntryEventData).nearItems).toHaveLength(0);
      expect((events[3]!.data as TimedItemsTrackItemEntryEventData).exactItems).toHaveLength(1);
      expect((events[3]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(spanB.id);

      // A exits (20.1 > 20), B still active
      time$.next(20.1);
      expect(events).toHaveLength(5);
      expect(events[4]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);
      expect((events[4]!.data as TimedItemsTrackItemExitEventData).items).toHaveLength(1);
      expect((events[4]!.data as TimedItemsTrackItemExitEventData).items[0]!.id).toBe(spanA.id);

      // B exits (25.1 > 25)
      time$.next(25.1);
      expect(events).toHaveLength(6);
      expect(events[5]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);
      expect((events[5]!.data as TimedItemsTrackItemExitEventData).items).toHaveLength(1);
      expect((events[5]!.data as TimedItemsTrackItemExitEventData).items[0]!.id).toBe(spanB.id);
    });

    it('two items entering on same tick — mixed near/exact', () => {
      // Span A: [10, 20], Span B: [9.5, 25], threshold 1
      // Range A: [9, 21], Range B: [8.5, 26]
      const spanA = makeSpan(10, 20);
      const spanB = makeSpan(9.5, 25);
      const track = createMockTrack([spanA, spanB]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 1, TimedItemsTrackEventEmitterThresholdType.START_AND_END);
      const events = collectEvents(emitter);

      // A is near (9.6 < 10), B is exact (9.6 in [9.5, 25]) — single entry event
      time$.next(9.6);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems).toHaveLength(1);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(spanA.id);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems).toHaveLength(1);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(spanB.id);

      // A promoted to exact (10 in [10, 20]); B already exact-active, no re-emit
      time$.next(10);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[1]!.data as TimedItemsTrackItemEntryEventData).nearItems).toHaveLength(0);
      expect((events[1]!.data as TimedItemsTrackItemEntryEventData).exactItems).toHaveLength(1);
      expect((events[1]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(spanA.id);
    });

    it('one item exits while another stays active', () => {
      // Span A: [10, 15], Span B: [10, 25], threshold 1
      // Range A: [9, 16], Range B: [9, 26]
      const spanA = makeSpan(10, 15);
      const spanB = makeSpan(10, 25);
      const track = createMockTrack([spanA, spanB]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 1, TimedItemsTrackEventEmitterThresholdType.START_AND_END);
      const events = collectEvents(emitter);

      // Both enter exact (10 in [10, 15] and [10, 25])
      time$.next(10);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems).toHaveLength(0);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems).toHaveLength(2);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(spanA.id);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[1]!.id).toBe(spanB.id);

      // A exits (15.1 > 15), B stays active (15.1 in [10, 25])
      time$.next(15.1);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);
      expect((events[1]!.data as TimedItemsTrackItemExitEventData).items).toHaveLength(1);
      expect((events[1]!.data as TimedItemsTrackItemExitEventData).items[0]!.id).toBe(spanA.id);

      // B exits (25.1 > 25)
      time$.next(25.1);
      expect(events).toHaveLength(3);
      expect(events[2]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);
      expect((events[2]!.data as TimedItemsTrackItemExitEventData).items).toHaveLength(1);
      expect((events[2]!.data as TimedItemsTrackItemExitEventData).items[0]!.id).toBe(spanB.id);
    });

    it('simultaneous exit of multiple items', () => {
      // Span A: [10, 20], Span B: [12, 20], threshold 1
      // Range A: [9, 21], Range B: [11, 21]
      const spanA = makeSpan(10, 20);
      const spanB = makeSpan(12, 20);
      const track = createMockTrack([spanA, spanB]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 1, TimedItemsTrackEventEmitterThresholdType.START_AND_END);
      const events = collectEvents(emitter);

      // Both enter exact at t=12 (12 in [10, 20] and [12, 20])
      time$.next(12);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems).toHaveLength(0);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems).toHaveLength(2);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[0]!.id).toBe(spanA.id);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).exactItems[1]!.id).toBe(spanB.id);

      // Both exit simultaneously (20.1 > 20)
      time$.next(20.1);
      expect(events).toHaveLength(2);
      expect(events[1]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_EXIT);
      expect((events[1]!.data as TimedItemsTrackItemExitEventData).items).toHaveLength(2);
      expect((events[1]!.data as TimedItemsTrackItemExitEventData).items[0]!.id).toBe(spanA.id);
      expect((events[1]!.data as TimedItemsTrackItemExitEventData).items[1]!.id).toBe(spanB.id);
    });
  });

  describe('Consecutive ticks within threshold — no spurious exit/re-entry', () => {
    it('START_AND_END — start side', () => {
      // Span [10, 20], threshold 2, START_AND_END
      // Range: [8, 22]
      const span = makeSpan(10, 20);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 2, TimedItemsTrackEventEmitterThresholdType.START_AND_END);
      const events = collectEvents(emitter);

      // First tick in start threshold zone — near entry
      time$.next(8.5);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems).toHaveLength(1);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      // Consecutive ticks still in threshold zone — no events
      time$.next(8.6);
      expect(events).toHaveLength(1);

      time$.next(8.3);
      expect(events).toHaveLength(1);
    });

    it('START_AND_END — end side', () => {
      // Span [10, 20], threshold 2, START_AND_END
      // Range: [8, 22]
      const span = makeSpan(10, 20);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 2, TimedItemsTrackEventEmitterThresholdType.START_AND_END);
      const events = collectEvents(emitter);

      // First tick in end threshold zone — near entry
      time$.next(20.5);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems).toHaveLength(1);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      // Consecutive ticks still in threshold zone — no events
      time$.next(20.6);
      expect(events).toHaveLength(1);

      time$.next(20.2);
      expect(events).toHaveLength(1);
    });

    it('START — start side', () => {
      // Span [10, 20], threshold 2, START
      // Range: [8, 20]
      const span = makeSpan(10, 20);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 2, TimedItemsTrackEventEmitterThresholdType.START);
      const events = collectEvents(emitter);

      // First tick in start threshold zone — near entry
      time$.next(8.5);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems).toHaveLength(1);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      // Consecutive ticks still in threshold zone — no events
      time$.next(8.6);
      expect(events).toHaveLength(1);

      time$.next(8.4);
      expect(events).toHaveLength(1);
    });

    it('END — end side', () => {
      // Span [10, 20], threshold 2, END
      // Range: [10, 22]
      const span = makeSpan(10, 20);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 2, TimedItemsTrackEventEmitterThresholdType.END);
      const events = collectEvents(emitter);

      // First tick in end threshold zone — near entry
      time$.next(20.5);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems).toHaveLength(1);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      // Consecutive ticks still in threshold zone — no events
      time$.next(20.6);
      expect(events).toHaveLength(1);

      time$.next(20.4);
      expect(events).toHaveLength(1);
    });

    it('MINIMUM — start side', () => {
      // Span [10, 10.5], threshold 2, MINIMUM
      // Span width 0.5 < threshold 2 → midpoint 10.25, range: [9.25, 11.25]
      const span = makeSpan(10, 10.5);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 2, TimedItemsTrackEventEmitterThresholdType.MINIMUM);
      const events = collectEvents(emitter);

      // First tick in start threshold zone — near entry
      time$.next(9.5);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems).toHaveLength(1);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      // Consecutive ticks still in threshold zone — no events
      time$.next(9.6);
      expect(events).toHaveLength(1);

      time$.next(9.4);
      expect(events).toHaveLength(1);
    });

    it('MINIMUM — end side', () => {
      // Span [10, 10.5], threshold 2, MINIMUM
      // Span width 0.5 < threshold 2 → midpoint 10.25, range: [9.25, 11.25]
      const span = makeSpan(10, 10.5);
      const track = createMockTrack([span]);
      time$ = new Subject<number>();
      emitter = new TimedItemsTrackEventEmitter(track, time$, 2, TimedItemsTrackEventEmitterThresholdType.MINIMUM);
      const events = collectEvents(emitter);

      // First tick in start threshold zone — near entry
      time$.next(11);
      expect(events).toHaveLength(1);
      expect(events[0]!.type).toBe(TimedItemsTrackItemEventType.TIMED_ITEMS_TRACK_ITEM_ENTRY);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems).toHaveLength(1);
      expect((events[0]!.data as TimedItemsTrackItemEntryEventData).nearItems[0]!.id).toBe(span.id);

      // Consecutive ticks still in threshold zone — no events
      time$.next(11.2);
      expect(events).toHaveLength(1);

      time$.next(10.9);
      expect(events).toHaveLength(1);
    });
  });
});
