// Lint script triển khai (CommonJS, chạy thẳng bằng Node, không qua TypeScript): npm run lint ở thư mục gốc
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { require: 'readonly', module: 'writable', process: 'readonly', __dirname: 'readonly', __filename: 'readonly', console: 'readonly', setTimeout: 'readonly' },
    },
  },
];
