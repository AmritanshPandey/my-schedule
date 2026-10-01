/**
 * Two narrow type-only gaps between what actually runs on React Native and
 * what this project's TypeScript config knows about — both real at runtime,
 * neither reflected in a `.d.ts` this app's tsconfig would otherwise see.
 */

/**
 * `firebase/auth`'s published typings (`typings` in its package.json) point
 * at the default/browser `.d.ts` regardless of platform — Firebase ships a
 * separate `getReactNativePersistence` export in a React-Native-specific
 * build (`@firebase/auth/dist/index.rn.d.ts`) that Metro's bundler resolves
 * to at build time via its own platform resolution, but there's no
 * package.json "exports" map routing TypeScript's *type* resolution there
 * too — so the function is real and callable, just missing from the types
 * this project's `tsconfig` (moduleResolution "bundler") actually loads.
 * Declaration merging adds it back without needing to touch firebase's own
 * package.json or fork its types.
 */
declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: unknown): import('firebase/auth').Persistence;
}

/**
 * Hermes (React Native's JS engine, since 0.74) implements TextEncoder/
 * TextDecoder natively, but this project's tsconfig deliberately omits the
 * "dom" lib (most of it doesn't exist here) and RN ships no lib of its own
 * for these two — so they're real globals with no ambient type. Declared
 * minimally rather than pulling in "dom" wholesale, which would make
 * browser-only APIs that really are absent on this platform look available.
 * Wrapped in `declare global` because this file is a module (see the
 * `export {}` below) — a bare `declare const` here would otherwise be scoped
 * to this module instead of actually being global.
 */
declare global {
  const TextEncoder: {
    new (): { encode(input: string): Uint8Array };
  };
  const TextDecoder: {
    new (label?: string): { decode(input?: Uint8Array): string };
  };
}

// Makes this file a module (rather than a global script) so the `declare
// module 'firebase/auth'` block above AUGMENTS the real module's types
// (declaration merging) instead of replacing them wholesale — without this,
// every other export from 'firebase/auth' would disappear.
export {};
