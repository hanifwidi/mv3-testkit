import { describe, expect, it } from 'vitest';
import { cleanupAll } from '../../src/resource-cleanup.js';

describe('resource cleanup', () => {
  it('closes each resource in order', async () => {
    const closed: string[] = [];
    await cleanupAll([
      { name: 'browser', close: async () => { closed.push('browser'); } },
      { name: 'profile', close: async () => { closed.push('profile'); } },
      { name: 'server', close: async () => { closed.push('server'); } },
    ]);
    expect(closed).toEqual(['browser', 'profile', 'server']);
  });

  it('continues cleanup after a browser-close failure', async () => {
    const closed: string[] = [];
    let caught: unknown;
    try {
      await cleanupAll([
        { name: 'browser', close: async () => { closed.push('browser'); throw new Error('browser failed'); } },
        { name: 'profile', close: async () => { closed.push('profile'); } },
        { name: 'server', close: async () => { closed.push('server'); } },
      ]);
    } catch (error) { caught = error; }
    expect(closed).toEqual(['browser', 'profile', 'server']);
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toHaveLength(1);
    expect(String((caught as AggregateError).errors[0])).toContain('browser');
  });

  it('retains multiple independent failures', async () => {
    await expect(cleanupAll([
      { name: 'browser', close: async () => { throw new Error('A'); } },
      { name: 'profile', close: async () => { throw new Error('B'); } },
    ])).rejects.toMatchObject({ errors: [expect.any(Error), expect.any(Error)] });
  });
});
