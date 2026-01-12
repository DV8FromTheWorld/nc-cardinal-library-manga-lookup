const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project and workspace directories
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');
const appRoot = path.resolve(projectRoot, '../app');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo
config.watchFolders = [monorepoRoot];

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(appRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Force Metro to resolve (sub)dependencies only from the `nodeModulesPaths`
config.resolver.disableHierarchicalLookup = true;

// 4. Configure source extensions with platform-specific resolution
// .native.tsx files will be resolved before .tsx on React Native
config.resolver.sourceExts = [
  'native.tsx',
  'native.ts',
  'tsx',
  'ts',
  'native.js',
  'native.jsx',
  'js',
  'jsx',
  'json',
];

module.exports = config;
