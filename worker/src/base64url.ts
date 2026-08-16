/**
 * base64url encode/decode — shared by firestore.ts (signs an outgoing
 * service-account JWT) and auth.ts (verifies an incoming Firebase ID token).
 * Split out on its own so auth.ts doesn't need to load the (heavier)
 * Firestore REST client just for these two functions.
 */

export function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = "";
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Inverse of base64url() — decodes a base64url string (as found in a JWT
 *  segment) back to raw bytes. */
export function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
