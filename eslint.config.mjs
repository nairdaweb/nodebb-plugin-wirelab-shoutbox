import js from '@eslint/js';
import globals from 'globals';

const style = {
	indent: ['error', 'tab', { SwitchCase: 1 }],
	quotes: ['error', 'single', { avoidEscape: true }],
	semi: ['error', 'always'],
	'prefer-const': 'error',
	'no-var': 'error',
};

export default [
	{ ignores: ['node_modules/**'] },
	js.configs.recommended,
	{
		files: ['library.js', 'lib/**/*.js', 'test/**/*.js'],
		languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node } },
		rules: { ...style, 'no-control-regex': 'off' },
	},
	{
		files: ['public/**/*.js'],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'script',
			globals: {
				...globals.browser, define: 'readonly', require: 'readonly', $: 'readonly',
				app: 'readonly', config: 'readonly', socket: 'readonly', ajaxify: 'readonly',
			},
		},
		rules: style,
	},
];
