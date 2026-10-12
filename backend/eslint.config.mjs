import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Module nghiệp vụ không đọc MES_Sync trực tiếp (ADR 0007): tên, danh mục chép từ BRAVO lấy qua CatalogLookupService, dữ liệu
// nghiệp vụ chép từ BRAVO, OSM (đơn hàng, nhà máy SX) qua SourceFeedService. Thêm module mới thì gắn NO_SYNC vào khối luật của
// module đó: flat config lấy khối viết sau cho cùng một luật, không gộp, nên không dùng được một khối chung src/modules/**.
const NO_SYNC = {
  group: ['**/platform/sync/*'],
  message: 'Module nghiệp vụ không đọc MES_Sync trực tiếp (ADR 0007): dùng CatalogLookupService hoặc SourceFeedService.',
};
// Module Nhân sự chưa có API công khai cho module khác (ADR 0012): không import phần bên trong
const NO_HR = { group: ['../hr/*', '**/modules/hr/*'], message: 'Module Nhân sự chưa có API công khai (ADR 0012): không import phần bên trong.' };

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'jest.config.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // Ranh giới module (CLAUDE.md mục 6): module chỉ dùng API công khai của module khác, không import phần bên trong
  {
    files: ['src/modules/sewing/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../order/*', '**/modules/order/*', '!../order/schedule-feed.service', '!../order/order.module', '!**/modules/order/schedule-feed.service', '!**/modules/order/order.module'],
              message: 'Module May chỉ dùng API công khai của module Đơn hàng (OrderModule và schedule-feed.service).',
            },
            NO_HR,
            NO_SYNC,
          ],
        },
      ],
    },
  },
  {
    files: ['src/modules/order/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['../sewing/*', '**/modules/sewing/*'], message: 'Module Đơn hàng không phụ thuộc module May (ADR 0009).' }, NO_HR, NO_SYNC] }],
    },
  },
  // Module Nhân sự (ADR 0012) đứng riêng: không đọc bên trong module nghiệp vụ khác
  {
    files: ['src/modules/hr/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['../order/*', '../sewing/*', '**/modules/order/*', '**/modules/sewing/*'], message: 'Module Nhân sự không phụ thuộc module nghiệp vụ khác (ADR 0012).' }, NO_SYNC] },
      ],
    },
  },
);
