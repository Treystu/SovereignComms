module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2021: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  extends: ['eslint:recommended', 'prettier'],
  ignorePatterns: ['dist', 'node_modules'],
  rules: {
    'no-unused-vars': 'off',
    'no-undef': 'off',
  },
};
