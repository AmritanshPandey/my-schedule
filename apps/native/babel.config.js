module.exports = {
  presets: ['module:@react-native/babel-preset', 'nativewind/babel'],
  plugins: [
    // zod v4 (packages/core/lib/scheduleSchema.ts — the same validator the web
    // app runs on every load, write and sync) ships `export * as core from ...`
    // in its ESM build. The RN preset doesn't include this transform, and
    // without it Metro can't bundle zod at all. Metro applies this project-wide
    // config to node_modules too, which is what makes the one plugin enough.
    '@babel/plugin-transform-export-namespace-from',
  ],
};
