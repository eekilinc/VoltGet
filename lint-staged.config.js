export default {
  '**/*.{ts,tsx,js,jsx}': ['eslint --fix', 'prettier --write'],
  '**/*.{json,md,css,html}': ['prettier --write'],
}