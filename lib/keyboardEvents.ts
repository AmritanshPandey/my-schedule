import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export function isTextEditKey(key: string): boolean {
  return key === "Backspace" || key === "Delete";
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest(
    'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]'
  );
}

export function stopTextEditKeyPropagation(e: ReactKeyboardEvent): void {
  if (isTextEditKey(e.key)) e.stopPropagation();
}

export function stopTextEditKeyPropagationFromEditable(e: ReactKeyboardEvent): void {
  if (isTextEditKey(e.key) && isEditableTarget(e.target)) e.stopPropagation();
}
