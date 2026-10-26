import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.ts'], rules: { '@typescript-eslint/consistent-type-imports': 'off' } },
  { files: ['**/*.cjs'], languageOptions: { sourceType: 'commonjs', globals: { require: 'readonly', module: 'readonly' } }, rules: { '@typescript-eslint/no-require-imports': 'off' } },
);
