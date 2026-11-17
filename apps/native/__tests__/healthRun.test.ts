import { toHealthRun } from '../src/lib/healthRun';

const start = new Date('2026-11-15T07:30:00');

describe('toHealthRun', () => {
  it('reads metres and seconds as they are', () => {
    expect(
      toHealthRun({ uuid: 'w1', startDate: start, duration: { unit: 's', quantity: 1800 }, totalDistance: { unit: 'm', quantity: 5000 } }),
    ).toEqual({ id: 'w1', startMs: start.getTime(), distanceM: 5000, durationSec: 1800 });
  });

  it('converts km, miles and minutes', () => {
    expect(
      toHealthRun({ uuid: 'w2', startDate: start, duration: { unit: 'min', quantity: 30 }, totalDistance: { unit: 'km', quantity: 5.2 } }),
    ).toEqual({ id: 'w2', startMs: start.getTime(), distanceM: 5200, durationSec: 1800 });
    expect(
      toHealthRun({ uuid: 'w3', startDate: start, duration: { unit: 's', quantity: 600 }, totalDistance: { unit: 'mi', quantity: 1 } })?.distanceM,
    ).toBe(1609);
  });

  it('skips a workout with no distance or an unknown unit', () => {
    expect(toHealthRun({ uuid: 'w4', startDate: start, duration: { unit: 's', quantity: 600 } })).toBeNull();
    expect(
      toHealthRun({ uuid: 'w5', startDate: start, duration: { unit: 's', quantity: 600 }, totalDistance: { unit: 'furlong', quantity: 3 } }),
    ).toBeNull();
  });
});
