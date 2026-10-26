// Two related npm-workspace hoisting fixups for apps/native's NativeWind setup.
//
// 1. nativewind (hoisted to root node_modules) does a bare
//    `require("tailwindcss/package.json")` from its own location, walking UP
//    from node_modules/nativewind and finding the root's tailwindcss — v4,
//    used by apps/web (Next.js + @tailwindcss/postcss). nativewind only
//    supports v3. apps/native carries its own tailwindcss@^3.4 devDependency,
//    but nativewind's resolution never reaches it since apps/native isn't an
//    ancestor of nativewind's install location. Symlinking that v3 copy into
//    node_modules/nativewind/node_modules/tailwindcss puts it back in
//    nativewind's own upward resolution path, without touching the root's v4.
//
// 2. react-native-css-interop must be a SINGLE module instance everywhere —
//    it holds a runtime registry (the compiled CSS, mapping className ->
//    style) as module-level state. nativewind ships its own nested copy at
//    node_modules/nativewind/node_modules/react-native-css-interop, which is
//    what actually registers the compiled CSS at build time. If anything
//    else in the graph (Jest's mocks, or a component importing
//    "react-native-css-interop/jsx-runtime") resolves to a DIFFERENT copy —
//    e.g. one hoisted to root by npm — it reads an empty registry and every
//    className silently does nothing, with no error anywhere. Symlinking
//    root's node_modules/react-native-css-interop to nativewind's own nested
//    copy makes every resolution path converge on the one instance that
//    actually holds the CSS.
//
// Both idempotent — safe to run on every install.
import { existsSync, mkdirSync, symlinkSync, lstatSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function link(source, target, label) {
  if (!existsSync(source)) return; // source not installed (yet) — nothing to link
  if (existsSync(target)) {
    const stat = lstatSync(target);
    if (stat.isSymbolicLink()) return; // already linked
    rmSync(target, { recursive: true, force: true });
  }
  mkdirSync(dirname(target), { recursive: true });
  symlinkSync(source, target, "dir");
  console.log(`[link-native-tailwind] ${label}`);
}

link(
  join(root, "apps/native/node_modules/tailwindcss"),
  join(root, "node_modules/nativewind/node_modules/tailwindcss"),
  "linked apps/native's tailwindcss v3 into nativewind's own node_modules",
);

link(
  join(root, "node_modules/nativewind/node_modules/react-native-css-interop"),
  join(root, "node_modules/react-native-css-interop"),
  "linked root's react-native-css-interop to nativewind's own copy (single instance)",
);
