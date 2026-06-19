import {beforeEach, describe, expect, it} from 'vitest';
import {
  DefaultMarker,
  MarkerTrack,
  MarkerType,
  type MarkerState,
} from '../../src/media/marker-track';
import {
  TimedItemTemporalType,
  TimedItemsTrackEventType,
  type TimedItemTemporal,
  type MomentTemporal,
  type SpanTemporal,
} from '../../src/media/timed-items-track';
import {TrackEventType, TrackType} from '../../src/media/track';
import {OpStageStatus} from '../../src/common/op-stage';

function momentTemporal(time: string): MomentTemporal {
  return {type: TimedItemTemporalType.MOMENT, time};
}

function spanTemporal(start: string, end: string): SpanTemporal {
  return {type: TimedItemTemporalType.SPAN, start, end};
}

function createMarker(temporal: TimedItemTemporal, label?: string) {
  return new DefaultMarker({temporal, label});
}

describe('MarkerTrack', () => {
  let track: MarkerTrack;

  beforeEach(() => {
    track = new MarkerTrack();
  });

  describe('initial state', () => {
    it('should have MARKER_TRACK type', () => {
      expect(track.trackType).toBe(TrackType.MARKER_TRACK);
    });

    it('should have empty timedItems', () => {
      expect(track.timedItems).toEqual([]);
    });

    it('should have NOT_STARTED load stage', () => {
      expect(track.loadStage.state.status).toBe(OpStageStatus.NOT_STARTED);
    });

    it('should have areTimedItemsFetched as false', () => {
      expect(track.areTimedItemsFetched).toBe(false);
    });

    it('should expose complete state', () => {
      const state = track.state;
      expect(state.trackType).toBe(TrackType.MARKER_TRACK);
      expect(state.timedItems).toEqual([]);
      expect(state.label).toBeUndefined();
      expect(state.relations).toEqual([]);
      expect(state.loadStage.status).toBe(OpStageStatus.NOT_STARTED);
    });
  });

  describe('load lifecycle events', () => {
    it('should emit TRACK_LOADING on loadStart', () => {
      const events: string[] = [];
      track.onEvent$.subscribe((e) => events.push(e.type));

      track.loadStart();

      expect(events).toEqual([TrackEventType.TRACK_LOADING]);
      expect(track.loadStage.state.status).toBe(OpStageStatus.IN_PROGRESS);
    });

    it('should emit TRACK_LOADED on loadSuccess', () => {
      const events: string[] = [];
      track.loadStart();
      track.onEvent$.subscribe((e) => events.push(e.type));

      track.loadSuccess();

      expect(events).toEqual([TrackEventType.TRACK_LOADED]);
      expect(track.loadStage.state.status).toBe(OpStageStatus.SUCCESS);
    });

    it('should emit TRACK_LOAD_ERROR on loadError', () => {
      const events: any[] = [];
      track.loadStart();
      track.onEvent$.subscribe((e) => events.push(e));

      track.loadError('something went wrong');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TrackEventType.TRACK_LOAD_ERROR);
      expect(events[0].data.error).toBe('something went wrong');
      expect(track.loadStage.state.status).toBe(OpStageStatus.FAILURE);
    });
  });

  describe('addTimedItems', () => {
    it('should add a single marker', () => {
      const marker = createMarker(momentTemporal('10'));
      track.addTimedItems(marker);

      expect(track.timedItems).toHaveLength(1);
      expect(track.timedItems[0]!.id).toBe(marker.id);
    });

    it('should add multiple markers', () => {
      const m1 = createMarker(momentTemporal('10'));
      const m2 = createMarker(momentTemporal('20'));
      track.addTimedItems([m1, m2]);

      expect(track.timedItems).toHaveLength(2);
    });

    it('should sort markers by start time', () => {
      const m1 = createMarker(momentTemporal('30'));
      const m2 = createMarker(momentTemporal('10'));
      const m3 = createMarker(momentTemporal('20'));
      track.addTimedItems([m1, m2, m3]);

      expect(track.timedItemsSorted[0]!.id).toBe(m2.id);
      expect(track.timedItemsSorted[1]!.id).toBe(m3.id);
      expect(track.timedItemsSorted[2]!.id).toBe(m1.id);
    });

    it('should be retrievable by id', () => {
      const marker = createMarker(momentTemporal('10'));
      track.addTimedItems(marker);

      expect(track.getTimedItem(marker.id)).toBe(marker);
    });

    it('should emit TRACK_UPDATING, ITEMS_ADDED, TRACK_UPDATED', () => {
      const events: string[] = [];
      track.onEvent$.subscribe((e) => events.push(e.type));

      track.addTimedItems(createMarker(momentTemporal('10')));

      expect(events).toEqual([
        TrackEventType.TRACK_UPDATING,
        TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_ADDED,
        TrackEventType.TRACK_UPDATED,
      ]);
    });

    it('should include added items in ITEMS_ADDED event data', () => {
      const marker = createMarker(momentTemporal('10'), 'test');
      let eventData: any;
      track.onEvent$.subscribe((e) => {
        if (e.type === TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_ADDED) {
          eventData = e.data;
        }
      });

      track.addTimedItems(marker);

      expect(eventData.trackId).toBe(track.id);
      expect(eventData.updatedTimedItems).toHaveLength(1);
      expect(eventData.updatedTimedItems[0].id).toBe(marker.id);
    });

    it('should reflect added items in state', () => {
      track.addTimedItems(createMarker(spanTemporal('5', '15'), 'span marker'));

      const state = track.state;
      expect(state.timedItems).toHaveLength(1);
      expect(state.timedItems[0]!.label).toBe('span marker');
    });
  });

  describe('deleteTimedItems', () => {
    it('should delete a marker by id', () => {
      const marker = createMarker(momentTemporal('10'));
      track.addTimedItems(marker);

      track.deleteTimedItems(marker.id);

      expect(track.timedItems).toHaveLength(0);
      expect(track.getTimedItem(marker.id)).toBeUndefined();
    });

    it('should delete multiple markers by ids', () => {
      const m1 = createMarker(momentTemporal('10'));
      const m2 = createMarker(momentTemporal('20'));
      const m3 = createMarker(momentTemporal('30'));
      track.addTimedItems([m1, m2, m3]);

      track.deleteTimedItems([m1.id, m3.id]);

      expect(track.timedItems).toHaveLength(1);
      expect(track.timedItems[0]!.id).toBe(m2.id);
    });

    it('should emit TRACK_UPDATING, ITEMS_DELETED, TRACK_UPDATED', () => {
      const marker = createMarker(momentTemporal('10'));
      track.addTimedItems(marker);

      const events: string[] = [];
      track.onEvent$.subscribe((e) => events.push(e.type));

      track.deleteTimedItems(marker.id);

      expect(events).toEqual([
        TrackEventType.TRACK_UPDATING,
        TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_DELETED,
        TrackEventType.TRACK_UPDATED,
      ]);
    });

    it('should not emit events when deleting non-existent id', () => {
      const events: string[] = [];
      track.onEvent$.subscribe((e) => events.push(e.type));

      track.deleteTimedItems('non-existent-id');

      expect(events).toEqual([]);
    });

    it('should include deleted items in ITEMS_DELETED event data', () => {
      const marker = createMarker(momentTemporal('10'));
      track.addTimedItems(marker);

      let eventData: any;
      track.onEvent$.subscribe((e) => {
        if (e.type === TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_DELETED) {
          eventData = e.data;
        }
      });

      track.deleteTimedItems(marker.id);

      expect(eventData.trackId).toBe(track.id);
      expect(eventData.updatedTimedItems).toHaveLength(1);
      expect(eventData.updatedTimedItems[0].id).toBe(marker.id);
    });
  });

  describe('updateTimedItem', () => {
    it('should update marker temporal', () => {
      const marker = createMarker(momentTemporal('10'));
      track.addTimedItems(marker);

      track.updateTimedItem(marker.id, {temporal: momentTemporal('20')});

      expect(marker.temporal).toEqual(momentTemporal('20'));
    });

    it('should update marker label', () => {
      const marker = createMarker(momentTemporal('10'), 'old');
      track.addTimedItems(marker);

      track.updateTimedItem(marker.id, {label: 'new'});

      expect(marker.label).toBe('new');
    });

    it('should emit ITEMS_UPDATING then ITEMS_UPDATED', () => {
      const marker = createMarker(momentTemporal('10'));
      track.addTimedItems(marker);

      const events: string[] = [];
      track.onEvent$.subscribe((e) => events.push(e.type));

      track.updateTimedItem(marker.id, {temporal: momentTemporal('20')});

      expect(events).toEqual([
        TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATING,
        TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATED,
      ]);
    });

    it('should include updated state in ITEMS_UPDATED event', () => {
      const marker = createMarker(momentTemporal('10'));
      track.addTimedItems(marker);

      let eventData: any;
      track.onEvent$.subscribe((e) => {
        if (e.type === TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATED) {
          eventData = e.data;
        }
      });

      track.updateTimedItem(marker.id, {temporal: momentTemporal('20')});

      expect(eventData.updatedTimedItems[0].temporal).toEqual(momentTemporal('20'));
    });

    it('should reject invalid temporal on update', () => {
      const marker = createMarker(momentTemporal('10'));
      track.addTimedItems(marker);

      expect(() => {
        track.updateTimedItem(marker.id, {temporal: momentTemporal('not-a-number')});
      }).toThrow();

      // temporal unchanged
      expect(marker.temporal).toEqual(momentTemporal('10'));
    });

    it('should reject span with start > end', () => {
      const marker = createMarker(spanTemporal('5', '15'));
      track.addTimedItems(marker);

      expect(() => {
        track.updateTimedItem(marker.id, {temporal: spanTemporal('20', '10')});
      }).toThrow();
    });
  });

  describe('DefaultMarker.update', () => {
    it('should update temporal', () => {
      const marker = createMarker(momentTemporal('10'));
      marker.update({temporal: momentTemporal('20')});
      expect(marker.temporal).toEqual(momentTemporal('20'));
    });

    it('should update label', () => {
      const marker = createMarker(momentTemporal('10'), 'old');
      marker.update({label: 'new'});
      expect(marker.label).toBe('new');
    });

    it('should update data', () => {
      const marker = createMarker(momentTemporal('10'));
      marker.update({data: {foo: 'bar'}});
      expect(marker.data).toEqual({foo: 'bar'});
    });

    it('should update multiple fields at once', () => {
      const marker = createMarker(momentTemporal('10'), 'old');
      marker.update({temporal: spanTemporal('5', '15'), label: 'new', data: {x: 1}});
      expect(marker.temporal).toEqual(spanTemporal('5', '15'));
      expect(marker.label).toBe('new');
      expect(marker.data).toEqual({x: 1});
    });

    it('should change markerType when temporal type changes', () => {
      const marker = createMarker(momentTemporal('10'));
      expect(marker.markerType).toBe(MarkerType.MOMENT_MARKER);

      marker.update({temporal: spanTemporal('5', '15')});
      expect(marker.markerType).toBe(MarkerType.SPANNING_MARKER);
    });

    it('should not change temporal when not provided', () => {
      const marker = createMarker(momentTemporal('10'));
      marker.update({label: 'updated'});
      expect(marker.temporal).toEqual(momentTemporal('10'));
    });

    it('should not change label when not provided', () => {
      const marker = createMarker(momentTemporal('10'), 'keep');
      marker.update({temporal: momentTemporal('20')});
      expect(marker.label).toBe('keep');
    });

    it('should allow setting label to undefined', () => {
      const marker = createMarker(momentTemporal('10'), 'has label');
      marker.update({label: undefined});
      expect(marker.label).toBeUndefined();
    });

    it('should reflect update in state', () => {
      const marker = createMarker(momentTemporal('10'), 'old');
      marker.update({temporal: spanTemporal('5', '15'), label: 'new', data: {x: 1}});

      const state = marker.state;
      expect(state.temporal).toEqual(spanTemporal('5', '15'));
      expect(state.label).toBe('new');
      expect(state.data).toEqual({x: 1});
      expect(state.markerType).toBe(MarkerType.SPANNING_MARKER);
    });

    it('should throw on invalid temporal', () => {
      const marker = createMarker(momentTemporal('10'));
      expect(() => marker.update({temporal: momentTemporal('NaN')})).toThrow();
      expect(marker.temporal).toEqual(momentTemporal('10'));
    });

    it('should throw on span with start > end', () => {
      const marker = createMarker(momentTemporal('10'));
      expect(() => marker.update({temporal: spanTemporal('20', '10')})).toThrow();
      expect(marker.temporal).toEqual(momentTemporal('10'));
    });

    it('should throw on Infinity temporal', () => {
      const marker = createMarker(momentTemporal('10'));
      expect(() => marker.update({temporal: momentTemporal('Infinity')})).toThrow();
    });
  });

  describe('marker state', () => {
    it('should have MOMENT_MARKER type for moment temporal', () => {
      const marker = createMarker(momentTemporal('10'));
      expect(marker.markerType).toBe(MarkerType.MOMENT_MARKER);
      expect(marker.state.markerType).toBe(MarkerType.MOMENT_MARKER);
    });

    it('should have SPANNING_MARKER type for span temporal', () => {
      const marker = createMarker(spanTemporal('5', '15'));
      expect(marker.markerType).toBe(MarkerType.SPANNING_MARKER);
      expect(marker.state.markerType).toBe(MarkerType.SPANNING_MARKER);
    });

    it('should have SPANNING_MARKER type for span_start temporal', () => {
      const marker = createMarker({type: TimedItemTemporalType.SPAN_START, start: '5'});
      expect(marker.markerType).toBe(MarkerType.SPANNING_MARKER);
    });

    it('should have SPANNING_MARKER type for span_end temporal', () => {
      const marker = createMarker({type: TimedItemTemporalType.SPAN_END, end: '15'});
      expect(marker.markerType).toBe(MarkerType.SPANNING_MARKER);
    });

    it('should include label in state', () => {
      const marker = createMarker(momentTemporal('10'), 'my label');
      expect(marker.state.label).toBe('my label');
    });

    it('should include data in state', () => {
      const marker = new DefaultMarker({temporal: momentTemporal('10'), data: {key: 'value'}});
      expect(marker.state.data).toEqual({key: 'value'});
    });

    it('should default data to empty object', () => {
      const marker = createMarker(momentTemporal('10'));
      expect(marker.state.data).toEqual({});
    });
  });

  describe('query methods', () => {
    let m1: DefaultMarker, m2: DefaultMarker, m3: DefaultMarker, m4: DefaultMarker;

    beforeEach(() => {
      m1 = createMarker(momentTemporal('10'));
      m2 = createMarker(spanTemporal('20', '30'));
      m3 = createMarker(momentTemporal('25'));
      m4 = createMarker(momentTemporal('40'));
      track.addTimedItems([m1, m2, m3, m4]);
    });

    it('findTimedItemsAtTime should return items matching exact time', () => {
      const items = track.findTimedItemsAtTime(25);
      const ids = items.map((i) => i.id);
      expect(ids).toContain(m2.id); // span 20-30 contains 25
      expect(ids).toContain(m3.id); // moment at 25
      expect(ids).not.toContain(m1.id);
      expect(ids).not.toContain(m4.id);
    });

    it('findFirstTimedItemAtTime should return first matching item', () => {
      const item = track.findFirstTimedItemAtTime(10);
      expect(item?.id).toBe(m1.id);
    });

    it('findFirstTimedItemAtTime should return undefined for no match', () => {
      const item = track.findFirstTimedItemAtTime(99);
      expect(item).toBeUndefined();
    });

    it('findNearestTimedItem should return closest item', () => {
      const item = track.findNearestTimedItem(12);
      expect(item?.id).toBe(m1.id); // 10 is closest to 12
    });

    it('findNearestTimedItem should return undefined for empty track', () => {
      const emptyTrack = new MarkerTrack();
      expect(emptyTrack.findNearestTimedItem(10)).toBeUndefined();
    });
  });

  describe('track state completeness', () => {
    it('should reflect all items in state.timedItems', () => {
      const m1 = createMarker(momentTemporal('10'), 'first');
      const m2 = createMarker(spanTemporal('20', '30'), 'second');
      track.addTimedItems([m1, m2]);

      const state = track.state;
      expect(state.timedItems).toHaveLength(2);

      const s1 = state.timedItems.find((s: MarkerState) => s.id === m1.id)!;
      expect(s1.temporal).toEqual(momentTemporal('10'));
      expect(s1.label).toBe('first');
      expect(s1.markerType).toBe(MarkerType.MOMENT_MARKER);

      const s2 = state.timedItems.find((s: MarkerState) => s.id === m2.id)!;
      expect(s2.temporal).toEqual(spanTemporal('20', '30'));
      expect(s2.label).toBe('second');
      expect(s2.markerType).toBe(MarkerType.SPANNING_MARKER);
    });

    it('state should update after mutations', () => {
      const marker = createMarker(momentTemporal('10'), 'old');
      track.addTimedItems(marker);

      track.updateTimedItem(marker.id, {label: 'new', temporal: momentTemporal('20')});

      const state = track.state;
      const markerState = state.timedItems[0]!;
      expect(markerState.label).toBe('new');
      expect(markerState.temporal).toEqual(momentTemporal('20'));
    });

    it('state should update after delete', () => {
      const m1 = createMarker(momentTemporal('10'));
      const m2 = createMarker(momentTemporal('20'));
      track.addTimedItems([m1, m2]);

      track.deleteTimedItems(m1.id);

      expect(track.state.timedItems).toHaveLength(1);
      expect(track.state.timedItems[0]!.id).toBe(m2.id);
    });
  });
});