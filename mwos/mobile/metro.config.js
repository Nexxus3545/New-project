const { getDefaultConfig } = require('expo/metro-config');
const fs = require('node:fs');
const path = require('node:path');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...new Set([__dirname, ...(config.watchFolders || [])])];

// Managed worktrees may share dependencies through a Windows junction.
// Metro must see the dependency target without using the original checkout's App.
const modulesPath = path.join(__dirname, 'node_modules');
if (fs.existsSync(modulesPath)) {
  const dependencyRoot = fs.realpathSync(modulesPath);
  if (dependencyRoot !== modulesPath) {
    config.watchFolders = [...new Set([...(config.watchFolders || []), dependencyRoot])];
    config.resolver.nodeModulesPaths = [...new Set([...(config.resolver.nodeModulesPaths || []), dependencyRoot])];
  }
}

const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList) ? existingBlockList : [existingBlockList]).filter(Boolean),
  // Native compiler caches are large and never contain JavaScript runtime sources.
  /[\\/](?:android|ReactAndroid)[\\/](?:build|\.cxx)[\\/].*/,
];
config.maxWorkers = 1;
config.transformer.unstable_workerThreads = false;
config.watcher.unstable_workerThreads = false;

module.exports = config;
