export default {
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'es5',
  printWidth: 100,
  bracketSpacing: true,
  arrowParens: 'avoid',
  endOfLine: 'lf',
  plugins: [],
  overrides: [
    {
      files: ['*.json', '*.md', '*.css'],
      options: { printWidth: 120 },
    },
  ],
}