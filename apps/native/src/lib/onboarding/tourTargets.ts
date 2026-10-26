import type { View } from 'react-native';
import type { ComponentRef } from 'react';

/**
 * The native stand-in for the web's `data-tour="<id>"` attributes: views
 * register themselves under a tour target id (components/onboarding/
 * TourTarget.tsx), and CoachMarks looks the current step's target up fresh
 * on every step change — so a step can point at a view mounted anywhere in
 * the tree without threading refs through it.
 */
type ViewRef = ComponentRef<typeof View>;

const targets = new Map<string, ViewRef>();

export function registerTourTarget(id: string, view: ViewRef | null): void {
  if (view) targets.set(id, view);
  else targets.delete(id);
}

export interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Measure a registered target in window coordinates (null when absent or unlaid). */
export function measureTourTarget(id: string): Promise<TargetRect | null> {
  const view = targets.get(id);
  if (!view) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      view.measureInWindow((x, y, width, height) => {
        resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
      });
    } catch {
      resolve(null);
    }
  });
}
