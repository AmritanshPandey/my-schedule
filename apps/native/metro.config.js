const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const projectRoot = __dirname;
// apps/native/../.. -> the monorepo root, where packages/core lives.
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = {
  // Metro only watches its own project root by default. @planr/core lives
  // outside apps/native (in packages/core, hoisted to the monorepo root's
  // node_modules as a symlink), so without this Metro can resolve it once
  // but never picks up edits to it.
  watchFolders: [monorepoRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],
    unstable_enableSymlinks: true,
    unstable_enablePackageExports: true,
  },
};

module.exports = withNativeWind(mergeConfig(getDefaultConfig(projectRoot), config), {
  input: './global.css',
});
