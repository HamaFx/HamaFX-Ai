// Re-exported so packages can `import config from "@hamafx/config/prettier"`
// when they want to override locally. Default config is the root .prettierrc.json.
/** @type {import("prettier").Config} */
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  arrowParens: 'always',
  plugins: ['@ianvs/prettier-plugin-sort-imports', 'prettier-plugin-tailwindcss'],
  importOrder: [
    '<BUILTIN_MODULES>',
    '',
    '<THIRD_PARTY_MODULES>',
    '',
    '^@(shared|ai|data|indicators|db|ui)/(.*)$',
    '',
    '^@/(.*)$',
    '',
    '^[./]',
  ],
  importOrderParserPlugins: ['typescript', 'jsx', 'decorators-legacy'],
  importOrderTypeScriptVersion: '5.0.0',
};
