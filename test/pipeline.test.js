import { addMembers } from '../lib/ldes';
import { generateFeed } from '../lib/pipeline-generating-ldes';

jest.mock('../lib/ldes', () => ({ addMembers: jest.fn() }));
jest.mock('../constants', () => ({
  ...jest.requireActual('../constants'),
  BATCH_SIZE: 2,
}));

const ZITTING = 'http://ex.org/zitting/1';
const STEMMING = 'http://ex.org/stemming/1';

describe('generateFeed', () => {
  it('finds the members per batch of subjects, and adds the members it builds', async () => {
    const feed = {
      name: 'zittingen',
      findMembers: jest.fn(async (subjects) =>
        subjects.filter((subject) => subject === ZITTING),
      ),
      buildMember: jest.fn(async () => []),
    };

    await generateFeed('unit-1', feed, new Set([ZITTING, STEMMING, 'x']));

    expect(feed.findMembers.mock.calls.map(([subjects]) => subjects)).toEqual([
      [ZITTING, STEMMING],
      ['x'],
    ]);
    expect(feed.buildMember).toHaveBeenCalledTimes(1);
    expect(feed.buildMember.mock.calls[0][0]).toBe(`<${ZITTING}>`);
    expect(addMembers).toHaveBeenCalledTimes(1);
    const [unit, calledFeed, stores] = addMembers.mock.calls[0];
    expect([unit, calledFeed, [...stores.keys()]]).toEqual([
      'unit-1',
      feed,
      [ZITTING],
    ]);
  });

  it('skips the members that cannot be built', async () => {
    const feed = {
      name: 'zittingen',
      findMembers: async (subjects) => subjects,
      buildMember: jest.fn(async () => null),
    };

    await generateFeed('unit-1', feed, new Set([ZITTING]));

    expect(feed.buildMember).toHaveBeenCalledTimes(1);
    expect(addMembers).not.toHaveBeenCalled();
  });

  it('adds nothing when no subject is a member', async () => {
    const feed = {
      name: 'besluiten',
      findMembers: async () => [],
      buildMember: jest.fn(),
    };

    await generateFeed('unit-1', feed, new Set([STEMMING]));

    expect(feed.buildMember).not.toHaveBeenCalled();
    expect(addMembers).not.toHaveBeenCalled();
  });
});
