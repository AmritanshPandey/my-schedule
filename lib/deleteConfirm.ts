export interface DeleteConfirmationCopy {
  title: string;
  description: string;
  confirmLabel: string;
}

export function buildDeleteConfirmationCopy(
  noun: string,
  options: {
    name?: string | null;
    title?: string;
    description?: string;
    confirmLabel?: string;
  } = {},
): DeleteConfirmationCopy {
  const name = options.name?.trim();
  const subject = name ? `"${name}"` : `this ${noun}`;

  return {
    title: options.title ?? `Delete ${subject}?`,
    description: options.description ?? `Are you sure you want to delete ${subject}? This cannot be undone.`,
    confirmLabel: options.confirmLabel ?? `Delete ${noun}`,
  };
}
