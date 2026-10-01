import type { Note } from '@planr/core/lib/scheduleTypes';
import { uid } from '@planr/core/lib/id';
import { storage } from './mmkv';

const KEY = 'notes';

export function getNotes(): Note[] {
  const raw = storage.getString(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveNotes(notes: Note[]): void {
  storage.set(KEY, JSON.stringify(notes));
}

export function createNote(input?: Partial<Pick<Note, 'title' | 'body' | 'tags'>>): Note {
  const now = new Date().toISOString();
  const note: Note = {
    id: uid(),
    title: input?.title ?? '',
    body: input?.body ?? '',
    createdAt: now,
    updatedAt: now,
    tags: input?.tags,
  };
  saveNotes([note, ...getNotes()]);
  return note;
}

export function updateNote(
  id: string,
  patch: Partial<Pick<Note, 'title' | 'body' | 'pinned' | 'tags'>>,
): void {
  const notes = getNotes();
  const index = notes.findIndex((n) => n.id === id);
  if (index === -1) return;
  notes[index] = { ...notes[index], ...patch, updatedAt: new Date().toISOString() };
  saveNotes(notes);
}

export function deleteNote(id: string): void {
  saveNotes(getNotes().filter((n) => n.id !== id));
}
