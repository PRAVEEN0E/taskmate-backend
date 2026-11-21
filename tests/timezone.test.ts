import { describe, it, expect } from 'vitest';
import { dayBounds } from '../src/modules/dashboard/service.js';
describe('owner-local dashboard boundaries', () => {
  it('uses IST instead of server-local midnight', () => {
    const { start, end } = dayBounds(new Date('2026-11-21T20:00:00Z'), 'Asia/Kolkata');
    expect(start.toISOString()).toBe('2026-11-21T18:30:00.000Z');
    expect(end.toISOString()).toBe('2026-11-22T18:30:00.000Z');
  });
  it('handles a 23-hour daylight saving day', () => {
    const { start, end } = dayBounds(new Date('2026-03-08T16:00:00Z'), 'America/New_York');
    expect((+end - +start) / 3600000).toBe(23);
  });
});
