/**
 * @file jest.config.js
 * @role インフラ層ユニットテスト・総合テスト設定
 * @responsibility
 *  - Backend Lambda および CDK スタックのテスト実行環境（Jest）を定義します。
 *  - TypeScript のパス解決やモック設定、カバレッジ測定の基準を管理。
 */

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  setupFilesAfterEnv: ['aws-cdk-lib/testhelpers/jest-autoclean'],
};
