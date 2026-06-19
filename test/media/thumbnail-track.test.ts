import {beforeEach, describe, expect, it} from 'vitest';
import {
  DefaultThumbnail,
  ThumbnailTrack,
  type ThumbnailState,
} from '../../src/media/thumbnail-track';
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

function createThumbnail(temporal: TimedItemTemporal, url: string, label?: string) {
  return new DefaultThumbnail({temporal, url, label});
}

describe('ThumbnailTrack', () => {
  let track: ThumbnailTrack;

  beforeEach(() => {
    track = new ThumbnailTrack();
  });

  describe('initial state', () => {
    it('should have THUMBNAIL_TRACK type', () => {
      expect(track.trackType).toBe(TrackType.THUMBNAIL_TRACK);
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
      expect(state.trackType).toBe(TrackType.THUMBNAIL_TRACK);
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

      track.loadError('failed to load');

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(TrackEventType.TRACK_LOAD_ERROR);
      expect(events[0].data.error).toBe('failed to load');
      expect(track.loadStage.state.status).toBe(OpStageStatus.FAILURE);
    });
  });

  describe('addTimedItems', () => {
    it('should add a single thumbnail', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      track.addTimedItems(thumb);

      expect(track.timedItems).toHaveLength(1);
      expect(track.timedItems[0]!.id).toBe(thumb.id);
    });

    it('should add multiple thumbnails', () => {
      const t1 = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      const t2 = createThumbnail(momentTemporal('20'), 'http://img/2.jpg');
      track.addTimedItems([t1, t2]);

      expect(track.timedItems).toHaveLength(2);
    });

    it('should sort thumbnails by start time', () => {
      const t1 = createThumbnail(momentTemporal('30'), 'http://img/3.jpg');
      const t2 = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      const t3 = createThumbnail(momentTemporal('20'), 'http://img/2.jpg');
      track.addTimedItems([t1, t2, t3]);

      expect(track.timedItemsSorted[0]!.id).toBe(t2.id);
      expect(track.timedItemsSorted[1]!.id).toBe(t3.id);
      expect(track.timedItemsSorted[2]!.id).toBe(t1.id);
    });

    it('should be retrievable by id', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      track.addTimedItems(thumb);

      expect(track.getTimedItem(thumb.id)).toBe(thumb);
    });

    it('should emit TRACK_UPDATING, ITEMS_ADDED, TRACK_UPDATED', () => {
      const events: string[] = [];
      track.onEvent$.subscribe((e) => events.push(e.type));

      track.addTimedItems(createThumbnail(momentTemporal('10'), 'http://img/1.jpg'));

      expect(events).toEqual([
        TrackEventType.TRACK_UPDATING,
        TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_ADDED,
        TrackEventType.TRACK_UPDATED,
      ]);
    });

    it('should include added items in ITEMS_ADDED event data', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      let eventData: any;
      track.onEvent$.subscribe((e) => {
        if (e.type === TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_ADDED) {
          eventData = e.data;
        }
      });

      track.addTimedItems(thumb);

      expect(eventData.trackId).toBe(track.id);
      expect(eventData.updatedTimedItems).toHaveLength(1);
      expect(eventData.updatedTimedItems[0].id).toBe(thumb.id);
    });

    it('should reflect added items in state', () => {
      track.addTimedItems(createThumbnail(spanTemporal('5', '15'), 'http://img/1.jpg', 'thumb1'));

      const state = track.state;
      expect(state.timedItems).toHaveLength(1);
      expect(state.timedItems[0]!.label).toBe('thumb1');
      expect(state.timedItems[0]!.url).toBe('http://img/1.jpg');
    });
  });

  describe('deleteTimedItems', () => {
    it('should delete a thumbnail by id', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      track.addTimedItems(thumb);

      track.deleteTimedItems(thumb.id);

      expect(track.timedItems).toHaveLength(0);
      expect(track.getTimedItem(thumb.id)).toBeUndefined();
    });

    it('should delete multiple thumbnails by ids', () => {
      const t1 = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      const t2 = createThumbnail(momentTemporal('20'), 'http://img/2.jpg');
      const t3 = createThumbnail(momentTemporal('30'), 'http://img/3.jpg');
      track.addTimedItems([t1, t2, t3]);

      track.deleteTimedItems([t1.id, t3.id]);

      expect(track.timedItems).toHaveLength(1);
      expect(track.timedItems[0]!.id).toBe(t2.id);
    });

    it('should emit TRACK_UPDATING, ITEMS_DELETED, TRACK_UPDATED', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      track.addTimedItems(thumb);

      const events: string[] = [];
      track.onEvent$.subscribe((e) => events.push(e.type));

      track.deleteTimedItems(thumb.id);

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
  });

  describe('updateTimedItem', () => {
    it('should update thumbnail temporal', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      track.addTimedItems(thumb);

      track.updateTimedItem(thumb.id, {temporal: momentTemporal('20')});

      expect(thumb.temporal).toEqual(momentTemporal('20'));
    });

    it('should update thumbnail label', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg', 'old');
      track.addTimedItems(thumb);

      track.updateTimedItem(thumb.id, {label: 'new'});

      expect(thumb.label).toBe('new');
    });

    it('should update thumbnail url', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/old.jpg');
      track.addTimedItems(thumb);

      track.updateTimedItem(thumb.id, {url: 'http://img/new.jpg'});

      expect(thumb.url).toBe('http://img/new.jpg');
    });

    it('should emit ITEMS_UPDATING then ITEMS_UPDATED', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      track.addTimedItems(thumb);

      const events: string[] = [];
      track.onEvent$.subscribe((e) => events.push(e.type));

      track.updateTimedItem(thumb.id, {temporal: momentTemporal('20')});

      expect(events).toEqual([
        TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATING,
        TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATED,
      ]);
    });

    it('should include updated state in ITEMS_UPDATED event', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      track.addTimedItems(thumb);

      let eventData: any;
      track.onEvent$.subscribe((e) => {
        if (e.type === TimedItemsTrackEventType.TIMED_ITEMS_TRACK_ITEMS_UPDATED) {
          eventData = e.data;
        }
      });

      track.updateTimedItem(thumb.id, {url: 'http://img/new.jpg'});

      expect(eventData.updatedTimedItems[0].url).toBe('http://img/new.jpg');
    });

    it('should reject invalid temporal on update', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      track.addTimedItems(thumb);

      expect(() => {
        track.updateTimedItem(thumb.id, {temporal: momentTemporal('not-a-number')});
      }).toThrow();

      expect(thumb.temporal).toEqual(momentTemporal('10'));
    });

    it('should reject span with start > end', () => {
      const thumb = createThumbnail(spanTemporal('5', '15'), 'http://img/1.jpg');
      track.addTimedItems(thumb);

      expect(() => {
        track.updateTimedItem(thumb.id, {temporal: spanTemporal('20', '10')});
      }).toThrow();
    });
  });

  describe('DefaultThumbnail.update', () => {
    it('should update temporal', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      thumb.update({temporal: momentTemporal('20')});
      expect(thumb.temporal).toEqual(momentTemporal('20'));
    });

    it('should update label', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg', 'old');
      thumb.update({label: 'new'});
      expect(thumb.label).toBe('new');
    });

    it('should update url', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/old.jpg');
      thumb.update({url: 'http://img/new.jpg'});
      expect(thumb.url).toBe('http://img/new.jpg');
    });

    it('should update data', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      thumb.update({data: {foo: 'bar'}});
      expect(thumb.data).toEqual({foo: 'bar'});
    });

    it('should update multiple fields at once', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/old.jpg', 'old');
      thumb.update({temporal: spanTemporal('5', '15'), label: 'new', url: 'http://img/new.jpg', data: {x: 1}});
      expect(thumb.temporal).toEqual(spanTemporal('5', '15'));
      expect(thumb.label).toBe('new');
      expect(thumb.url).toBe('http://img/new.jpg');
      expect(thumb.data).toEqual({x: 1});
    });

    it('should not change temporal when not provided', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      thumb.update({label: 'updated'});
      expect(thumb.temporal).toEqual(momentTemporal('10'));
    });

    it('should not change label when not provided', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg', 'keep');
      thumb.update({temporal: momentTemporal('20')});
      expect(thumb.label).toBe('keep');
    });

    it('should not change url when not provided', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      thumb.update({label: 'updated'});
      expect(thumb.url).toBe('http://img/1.jpg');
    });

    it('should allow setting label to undefined', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg', 'has label');
      thumb.update({label: undefined});
      expect(thumb.label).toBeUndefined();
    });

    it('should reflect update in state', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/old.jpg', 'old');
      thumb.update({temporal: spanTemporal('5', '15'), label: 'new', url: 'http://img/new.jpg', data: {x: 1}});

      const state = thumb.state;
      expect(state.temporal).toEqual(spanTemporal('5', '15'));
      expect(state.label).toBe('new');
      expect(state.url).toBe('http://img/new.jpg');
      expect(state.data).toEqual({x: 1});
    });

    it('should throw on invalid temporal', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      expect(() => thumb.update({temporal: momentTemporal('NaN')})).toThrow();
      expect(thumb.temporal).toEqual(momentTemporal('10'));
    });

    it('should throw on span with start > end', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      expect(() => thumb.update({temporal: spanTemporal('20', '10')})).toThrow();
      expect(thumb.temporal).toEqual(momentTemporal('10'));
    });

    it('should throw on Infinity temporal', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      expect(() => thumb.update({temporal: momentTemporal('Infinity')})).toThrow();
    });
  });

  describe('thumbnail state', () => {
    it('should include url in state', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      expect(thumb.state.url).toBe('http://img/1.jpg');
    });

    it('should include label in state', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg', 'my thumb');
      expect(thumb.state.label).toBe('my thumb');
    });

    it('should include data in state', () => {
      const thumb = new DefaultThumbnail({temporal: momentTemporal('10'), url: 'http://img/1.jpg', data: {key: 'value'}});
      expect(thumb.state.data).toEqual({key: 'value'});
    });

    it('should default data to empty object', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      expect(thumb.state.data).toEqual({});
    });
  });

  describe('query methods', () => {
    let t1: DefaultThumbnail, t2: DefaultThumbnail, t3: DefaultThumbnail, t4: DefaultThumbnail;

    beforeEach(() => {
      t1 = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      t2 = createThumbnail(spanTemporal('20', '30'), 'http://img/2.jpg');
      t3 = createThumbnail(momentTemporal('25'), 'http://img/3.jpg');
      t4 = createThumbnail(momentTemporal('40'), 'http://img/4.jpg');
      track.addTimedItems([t1, t2, t3, t4]);
    });

    it('findTimedItemsAtTime should return items matching exact time', () => {
      const items = track.findTimedItemsAtTime(25);
      const ids = items.map((i) => i.id);
      expect(ids).toContain(t2.id);
      expect(ids).toContain(t3.id);
      expect(ids).not.toContain(t1.id);
      expect(ids).not.toContain(t4.id);
    });

    it('findFirstTimedItemAtTime should return first matching item', () => {
      const item = track.findFirstTimedItemAtTime(10);
      expect(item?.id).toBe(t1.id);
    });

    it('findFirstTimedItemAtTime should return undefined for no match', () => {
      const item = track.findFirstTimedItemAtTime(99);
      expect(item).toBeUndefined();
    });

    it('findNearestTimedItem should return closest item', () => {
      const item = track.findNearestTimedItem(12);
      expect(item?.id).toBe(t1.id);
    });

    it('findNearestTimedItem should return undefined for empty track', () => {
      const emptyTrack = new ThumbnailTrack();
      expect(emptyTrack.findNearestTimedItem(10)).toBeUndefined();
    });
  });

  describe('track state completeness', () => {
    it('should reflect all items in state.timedItems', () => {
      const t1 = createThumbnail(momentTemporal('10'), 'http://img/1.jpg', 'first');
      const t2 = createThumbnail(spanTemporal('20', '30'), 'http://img/2.jpg', 'second');
      track.addTimedItems([t1, t2]);

      const state = track.state;
      expect(state.timedItems).toHaveLength(2);

      const s1 = state.timedItems.find((s: ThumbnailState) => s.id === t1.id)!;
      expect(s1.temporal).toEqual(momentTemporal('10'));
      expect(s1.label).toBe('first');
      expect(s1.url).toBe('http://img/1.jpg');

      const s2 = state.timedItems.find((s: ThumbnailState) => s.id === t2.id)!;
      expect(s2.temporal).toEqual(spanTemporal('20', '30'));
      expect(s2.label).toBe('second');
      expect(s2.url).toBe('http://img/2.jpg');
    });

    it('state should update after mutations', () => {
      const thumb = createThumbnail(momentTemporal('10'), 'http://img/old.jpg', 'old');
      track.addTimedItems(thumb);

      track.updateTimedItem(thumb.id, {label: 'new', url: 'http://img/new.jpg', temporal: momentTemporal('20')});

      const state = track.state;
      const thumbState = state.timedItems[0]!;
      expect(thumbState.label).toBe('new');
      expect(thumbState.url).toBe('http://img/new.jpg');
      expect(thumbState.temporal).toEqual(momentTemporal('20'));
    });

    it('state should update after delete', () => {
      const t1 = createThumbnail(momentTemporal('10'), 'http://img/1.jpg');
      const t2 = createThumbnail(momentTemporal('20'), 'http://img/2.jpg');
      track.addTimedItems([t1, t2]);

      track.deleteTimedItems(t1.id);

      expect(track.state.timedItems).toHaveLength(1);
      expect(track.state.timedItems[0]!.id).toBe(t2.id);
    });
  });
});