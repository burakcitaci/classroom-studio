import parser from '@typescript-eslint/parser';

export default [
  { ignores: ['dist/**', 'graphify-out/**', 'test-results/**', 'playwright-report/**'] },
  {
    files: ['apps/**/*.ts', 'libs/**/*.ts'],
    languageOptions: { parser },
    rules: {
      'no-debugger': 'error',
      'no-duplicate-imports': ['error', { allowSeparateTypeImports: true }],
      'no-unreachable': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
];
