/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ModalNestingContext, useModalTurn } from '../src/lib/modalTurn';

// The RN Jest preset reports Platform.OS === 'ios', where turn-taking applies.

const shown: Record<string, boolean> = {};

function Probe({ name, wants, dismissMs = 100 }: { name: string; wants: boolean; dismissMs?: number }) {
  shown[name] = useModalTurn(wants, dismissMs);
  return null;
}

function render(element: React.ReactElement) {
  let root!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    root = ReactTestRenderer.create(element);
  });
  return root;
}

// Each test starts well after the previous one's last dismissal window, the
// way real time would; the coordinator's state is module-level by design.
let clock = Date.now();

beforeEach(() => {
  clock += 60_000;
  jest.useFakeTimers({ now: clock });
  for (const key of Object.keys(shown)) delete shown[key];
});

afterEach(() => {
  jest.useRealTimers();
});

test('a lone modal is shown at once', () => {
  const root = render(<Probe name="a" wants />);
  expect(shown.a).toBe(true);
  ReactTestRenderer.act(() => root.unmount());
});

test('a modal opening as another closes waits out the dismissal', () => {
  const root = render(
    <>
      <Probe name="a" wants />
      <Probe name="b" wants={false} />
    </>,
  );
  expect(shown.a).toBe(true);

  ReactTestRenderer.act(() =>
    root.update(
      <>
        <Probe name="a" wants={false} />
        <Probe name="b" wants />
      </>,
    ),
  );
  expect(shown.a).toBe(false);
  expect(shown.b).toBe(false);

  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(100);
  });
  expect(shown.b).toBe(true);
  ReactTestRenderer.act(() => root.unmount());
});

test('a modal waits while another stays open, then shows when it closes', () => {
  const root = render(<Probe name="a" wants />);
  ReactTestRenderer.act(() =>
    root.update(
      <>
        <Probe name="a" wants />
        <Probe name="b" wants />
      </>,
    ),
  );
  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(1000);
  });
  expect(shown.a).toBe(true);
  expect(shown.b).toBe(false);

  ReactTestRenderer.act(() =>
    root.update(
      <>
        <Probe name="a" wants={false} />
        <Probe name="b" wants />
      </>,
    ),
  );
  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(100);
  });
  expect(shown.b).toBe(true);
  ReactTestRenderer.act(() => root.unmount());
});

test('a modal nested in another modal stacks without waiting', () => {
  const root = render(
    <>
      <Probe name="a" wants />
      <ModalNestingContext.Provider value>
        <Probe name="nested" wants />
      </ModalNestingContext.Provider>
    </>,
  );
  expect(shown.a).toBe(true);
  expect(shown.nested).toBe(true);
  ReactTestRenderer.act(() => root.unmount());
});

test('a waiting modal that stops wanting to show leaves the queue', () => {
  const root = render(
    <>
      <Probe name="a" wants />
      <Probe name="b" wants />
      <Probe name="c" wants={false} />
    </>,
  );
  expect(shown.b).toBe(false);

  // b gives up while waiting; c asks; a closes — c gets the turn.
  ReactTestRenderer.act(() =>
    root.update(
      <>
        <Probe name="a" wants={false} />
        <Probe name="b" wants={false} />
        <Probe name="c" wants />
      </>,
    ),
  );
  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(100);
  });
  expect(shown.b).toBe(false);
  expect(shown.c).toBe(true);
  ReactTestRenderer.act(() => root.unmount());
});
