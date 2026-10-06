/**
 * Two test projects, deliberately separated:
 *
 *   node — domain/, db/ and services/. Runs in plain node with no React Native
 *          runtime, so it starts in milliseconds. This is where the money math
 *          lives and where coverage is enforced.
 *   ui   — components and screens, under the jest-expo preset.
 *
 * The split is what makes ~100% coverage on the financial layer realistic to
 * maintain: those tests don't pay the cost of a native runtime.
 */
const transformIgnore = [
  'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*'
    + '|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|drizzle-orm))',
];

module.exports = {
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/__tests__/(domain|db|services)/**/*.test.ts'],
      transform: { '^.+\\.[jt]sx?$': ['babel-jest', { configFile: './babel.config.js' }] },
      transformIgnorePatterns: transformIgnore,
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
    },
    {
      displayName: 'ui',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/__tests__/ui/**/*.test.tsx'],
      // npm nests expo-modules-core under expo/ (a peer conflict with
      // react-native-worklets stops it hoisting), and jest-expo's setup file
      // requires it by bare name. Resolving from expo's own folder fixes that
      // here rather than forcing a dependency into package.json, which is how
      // the last unbuildable install happened.
      modulePaths: ['<rootDir>/node_modules/expo/node_modules'],
      transformIgnorePatterns: transformIgnore,
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
    },
  ],
  collectCoverageFrom: ['domain/**/*.ts', '!domain/**/index.ts'],
  coverageThreshold: {
    global: { branches: 90, functions: 95, lines: 95, statements: 95 },
  },
};
