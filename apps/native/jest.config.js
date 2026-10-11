module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: [
    '<rootDir>/jest.setup.js',
    // Official mock for the native Google Sign-In module, same reasoning as
    // the AsyncStorage one in jest.setup.js.
    '@react-native-google-signin/google-signin/jest/build/jest/setup',
  ],
  // The RN preset's own transformIgnorePatterns (which this replaces, since
  // Jest doesn't merge preset arrays) only lets react-native's own packages
  // through Babel. nativewind and react-native-css-interop need the same
  // treatment — Metro transforms them at build time, but Jest ignores
  // node_modules by default, and their source uses untransformed JSX.
  // firebase/@firebase ship ESM (`export * from ...`) as their resolved
  // entry point too — same reason as nativewind above, same fix.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|nativewind|react-native-css-interop|react-native-gifted-charts|gifted-charts-core|react-native-linear-gradient|firebase|@firebase)/)',
  ],
  // The preset's own `transform` only matches .js/.ts/.tsx (again not
  // merged with the preset, same reason as transformIgnorePatterns above) —
  // @firebase/util ships one file (dist/postinstall.mjs) as literal `.mjs`,
  // which needs the same babel-jest transform or its `export` syntax is
  // loaded raw and fails to parse. The asset pattern is copied verbatim from
  // the preset so image imports keep working.
  transform: {
    '^.+\\.(js|mjs|ts|tsx)$': 'babel-jest',
    '^.+\\.(bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp)$':
      require.resolve('@react-native/jest-preset/jest/assetFileTransformer.js'),
  },
  moduleNameMapper: {
    // Metro handles global.css via nativewind's metro transform; Jest has no
    // such pipeline, so stub CSS imports out entirely for the test runner.
    '\\.css$': '<rootDir>/__mocks__/styleMock.js',
  },
};
