module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
  },
  extends: ['eslint:recommended'],
  env: {
    node: true,
    es6: true,
  },
  overrides: [
    {
      files: ['test/**/*.js'],
      env: { jest: true },
    },
  ],
  rules: {
    semi: 'warn',
  },
};
