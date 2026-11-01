/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import BuilderHints from '../src/components/intelligence/BuilderHints';

function render(element: React.ReactElement) {
  let root!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    root = ReactTestRenderer.create(element);
  });
  return root;
}

const textOf = (root: ReactTestRenderer.ReactTestRenderer) =>
  root.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children as string);

test('renders nothing when there is nothing worth saying', () => {
  expect(render(<BuilderHints hints={[]} />).toJSON()).toBeNull();
});

test('shows each hint and runs its one-tap fix', () => {
  const onAction = jest.fn();
  const fix = { id: 'slot', tone: 'warn' as const, message: 'You finish this slot 2 times in 10.', action: { kind: 'set_time' as const, label: 'Move to 7:00 AM', startTime: '07:00', endTime: '07:30' } };
  const root = render(<BuilderHints hints={[fix, { id: 'tip', tone: 'tip', message: 'Shorter sessions stick better.' }]} onAction={onAction} />);

  expect(textOf(root)).toEqual(expect.arrayContaining([fix.message, 'Shorter sessions stick better.', 'Move to 7:00 AM']));

  const button = root.root.find((node) => typeof node.props.onPress === 'function');
  ReactTestRenderer.act(() => button.props.onPress());
  expect(onAction).toHaveBeenCalledWith(fix);
});

test('hides the fix button when the sheet has no way to apply it', () => {
  const root = render(<BuilderHints hints={[{ id: 'x', tone: 'warn', message: 'Hint', action: { kind: 'set_time', label: 'Fix', startTime: '07:00', endTime: '07:30' } }]} />);
  expect(textOf(root)).not.toContain('Fix');
});
