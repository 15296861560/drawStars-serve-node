// ESLint 配置：代码质量 + 格式校验，风格对齐前端 drawStars-Vue3（剔除 Vue 相关项）。
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: './tsconfig.json'
  },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  rules: {
    // 与前端一致：prettier 格式问题告警
    'prettier/prettier': 'warn',
    // 与前端一致：未使用变量告警，下划线前缀忽略
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }
    ],
    // NestJS 大量使用空构造函数参数（依赖注入），不强制类型标注
    '@typescript-eslint/no-inferrable-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    // WS 事件名等场景可能有意复用同一字符串值，降为告警
    '@typescript-eslint/no-duplicate-enum-values': 'warn',
    // NestJS 中动态 require（按需加载模块）较常见，降为告警
    '@typescript-eslint/no-var-requires': 'warn',
    'prefer-const': 'warn',
    'no-unused-vars': 'off',
    'no-empty': ['warn', { allowEmptyCatch: true }]
  },
  ignorePatterns: ['dist', 'node_modules', 'public', 'schema.gql', '*.cjs']
}
