const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// Drizzle ships migrations as .sql files that babel-plugin-inline-import turns
// into string literals at build time. Metro must treat them as source, not assets.
config.resolver.sourceExts.push('sql');

module.exports = config;
