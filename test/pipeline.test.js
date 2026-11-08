import { addMembers } from '../lib/ldes';
import { findMembers } from '../lib/feeds';
import { generateFeed } from '../lib/pipeline-generating-ldes';

jest.mock('../lib/ldes', () => ({ addMembers: jest.fn() }));
jest.mock('../lib/feeds', () => ({ context: {}, findMembers: jest.fn() }));
jest.mock('../constants', () => ({
  ...jest.requireActual('../constants'),
  BATCH_SIZE: 2,
}));

const ZITTING = 'http://ex.org/zitting/1';
const STEMMING = 'http://ex.org/stemming/1';

describe('generateFeed', () => {
  it('finds the members per batch of subjects, and adds the members it builds', async () => {
    findMembers.mockImplementation(async (subjects) =>
      subjects.filter((subject) => subject === ZITTING),
    );
    const feed = { name: 'zittingen', buildMember: jest.fn(async () => []) };

    await generateFeed('unit-1', feed, new Set([ZITTING, STEMMING, 'x']));

    expect(findMembers.mock.calls.map(([subjects]) => subjects)).toEqual([
      [ZITTING, STEMMING],
      ['x'],
    ]);
    expect(findMembers.mock.calls[0][1]).toBe(feed);
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
    findMembers.mockImplementation(async (subjects) => subjects);
    const feed = { name: 'zittingen', buildMember: jest.fn(async () => null) };

    await generateFeed('unit-1', feed, new Set([ZITTING]));

    expect(feed.buildMember).toHaveBeenCalledTimes(1);
    expect(addMembers).not.toHaveBeenCalled();
  });

  it('adds nothing when no subject is a member', async () => {
    findMembers.mockImplementation(async () => []);
    const feed = { name: 'besluiten', buildMember: jest.fn() };

    await generateFeed('unit-1', feed, new Set([STEMMING]));

    expect(feed.buildMember).not.toHaveBeenCalled();
    expect(addMembers).not.toHaveBeenCalled();
  });
});
