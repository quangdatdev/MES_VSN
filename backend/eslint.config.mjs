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
              group: [
                '../order/*',
                '**/modules/order/*',
                '!../order/schedule-feed.service',
                '!../order/order.module',
                '!../order/line-day-plan-guard',
                '!**/modules/order/schedule-feed.service',
                '!**/modules/order/order.module',
                '!**/modules/order/line-day-plan-guard',
              ],
              message: 'Module May chỉ dùng API công khai của module Đơn hàng (OrderModule, schedule-feed.service, line-day-plan-guard).',
            },
            NO_HR,
            NO_SYNC,
          ],
        },
      ],
    },
  },
  // Module Cắt (quyết định 13): chỉ dùng API công khai của Đơn hàng (OrderModule, ShipmentPlanFeed, ShipmentPlanDeleteGuards, LineColorSizeFeed,
  // LineSupplyGuards)
  {
    files: ['src/modules/cutting/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../order/*',
                '**/modules/order/*',
                '!../order/order.module',
                '!../order/shipment-plan-feed.service',
                '!../order/shipment-plan-delete-guard',
                '!../order/line-color-size-feed.service',
                '!../order/line-supply-guard',
                '!**/modules/order/order.module',
                '!**/modules/order/shipment-plan-feed.service',
                '!**/modules/order/shipment-plan-delete-guard',
                '!**/modules/order/line-color-size-feed.service',
                '!**/modules/order/line-supply-guard',
              ],
              message: 'Module Cắt chỉ dùng API công khai của module Đơn hàng (OrderModule, shipment-plan-feed.service, shipment-plan-delete-guard, line-color-size-feed.service, line-supply-guard).',
            },
            { group: ['../sewing/*', '**/modules/sewing/*'], message: 'Module Cắt không phụ thuộc module May.' },
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
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['../sewing/*', '**/modules/sewing/*'], message: 'Module Đơn hàng không phụ thuộc module May (ADR 0009).' },
            { group: ['../cutting/*', '**/modules/cutting/*'], message: 'Module Đơn hàng không phụ thuộc module Cắt: module Cắt đăng ký vào ShipmentPlanDeleteGuards, LineSupplyGuards (quyết định 13.4, 13.8).' },
            NO_HR,
            NO_SYNC,
          ],
        },
      ],
    },
  },
  // Nền tảng không phụ thuộc module nghiệp vụ (CLAUDE.md mục 3): module cấp dữ liệu cho nền tảng bằng cách đăng ký vào service của
  // nền tảng (ví dụ module Nhân sự đăng ký LineSource vào OrgService), không để nền tảng import ngược
  {
    files: ['src/platform/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/modules/**', '**/modules'], message: 'Nền tảng không import module nghiệp vụ: để module đăng ký vào service của nền tảng (như LineSource).' }] },
      ],
    },
  },
  // Module Nhân sự (ADR 0012) đứng riêng: không đọc bên trong module nghiệp vụ khác
  {
    files: ['src/modules/hr/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['../order/*', '../sewing/*', '../cutting/*', '**/modules/order/*', '**/modules/sewing/*', '**/modules/cutting/*'], message: 'Module Nhân sự không phụ thuộc module nghiệp vụ khác (ADR 0012).' }, NO_SYNC] },
      ],
    },
  },
);
