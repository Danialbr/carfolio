const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier');

module.exports = [
  ...expoConfig,
  prettier,
  { ignores: ['node_modules/**', 'drizzle/**', '.expo/**', 'coverage/**', 'dist/**'] },
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    // fast-check is used as a namespace import by design; its named exports
    // collide with jest globals and importing them individually reads worse.
    files: ['__tests__/**/*.ts', '__tests__/**/*.tsx'],
    rules: { 'import/no-named-as-default-member': 'off' },
  },
  {
    // The financial layer must never touch floating-point money helpers or the
    // UTC date trap. These two patterns cause most money and date bugs in apps
    // like this one, and they are trivially detectable — so they are errors.
    files: [
      'domain/**/*.ts',
      'db/**/*.ts',
      'services/**/*.ts',
      'app/**/*.tsx',
      'components/**/*.tsx',
      'state/**/*.ts',
    ],
    rules: {
      'no-restricted-globals': ['error', { name: 'parseFloat', message: 'Money is integer cents. Use domain/money.ts parseAmount().' }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='toFixed']",
          message: 'toFixed() on money is a rounding bug. Use domain/money.ts formatters.',
        },
        {
          selector: "CallExpression[callee.property.name='toISOString']",
          message: 'toISOString() yields UTC and shifts business dates after ~7pm. Use domain/dates.ts todayISO().',
        },
      ],
    },
  },
];
