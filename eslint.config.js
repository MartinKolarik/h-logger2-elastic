const { defineConfig } = require('eslint/config');
const javascript = require('@martin-kolarik/eslint-config');

module.exports = defineConfig([
	{
		ignores: [ '**/*.d.ts' ],
	},
	javascript,
]);
