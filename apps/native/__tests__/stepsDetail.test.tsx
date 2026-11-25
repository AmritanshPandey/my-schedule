/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Task } from '@planr/core/lib/scheduleTypes';
import TaskDetailView from '../src/components/activity/TaskDetailView';

const MARK = { done: true, at: '2026-11-24T09:30:00.000Z' };
const steps = (done: number): Task => ({
  id: 't', title: 'Portfolio', planId: 'p', startTime: '9:00 AM', endTime: '10:00 AM', subtaskMode: 'steps',
  subtasks: ['One', 'Two', 'Three'].map((task, i) => ({ id: `s${i}`, task, ...(i < done ? { mark: MARK } : null) })),
});

function render(task: Task, props: Partial<React.ComponentProps<typeof TaskDetailView>> = {}) {
  let root!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    root = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <TaskDetailView task={task} linkedPlan={null} onClose={() => {}} onToggleSubtask={() => {}} onToggleComplete={() => {}} {...props} />
      </SafeAreaProvider>,
    );
  });
  return root;
}
const has = (root: ReactTestRenderer.ReactTestRenderer, testID: string) => root.root.findAll((n) => n.props.testID === testID).length > 0;
const json = (root: ReactTestRenderer.ReactTestRenderer) => JSON.stringify(root.toJSON());

test('finished steps fold away and the count is overall', () => {
  const out = json(render(steps(1)));
  expect(out).toContain('1 of 3 steps');
  expect(out).toContain('Done (1)');
  expect(out).not.toContain('"One"');
  expect(out).toContain('Two');
});

test('finishing is offered only once every step is done', () => {
  const onFinishTask = jest.fn();
  expect(has(render(steps(2), { onFinishTask }), 'finish-task')).toBe(false);
  const root = render(steps(3), { onFinishTask });
  expect(has(root, 'finish-task')).toBe(true);
  expect(json(root)).toContain('Finish this task');
});

test('a one-off offers to continue, and a repeating task does not', () => {
  const onContinue = jest.fn();
  const once = { ...steps(1), recurrence: { type: 'once' as const, dateISO: '2026-11-24' } };
  expect(json(render(once, { onContinue }))).toContain('Continue on another day');
  expect(json(render(steps(1), { onContinue }))).not.toContain('Continue on another day');
});

test('a checklist keeps its plain count and order', () => {
  const list = { ...steps(0), subtaskMode: 'checklist' as const, completedSubtaskIds: ['s0'] };
  const out = json(render(list));
  expect(out).toContain('1/3');
  expect(out).not.toContain('Done (');
});
