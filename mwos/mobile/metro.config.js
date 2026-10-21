const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList) ? existingBlockList : [existingBlockList]).filter(Boolean),
  // Native compiler caches are large and never contain JavaScript runtime sources.
  /[\\/](?:android|ReactAndroid)[\\/](?:build|\.cxx)[\\/].*/,
];
config.maxWorkers = 1;
config.transformer.unstable_workerThreads = true;
config.watcher.unstable_workerThreads = true;

module.exports = config;
