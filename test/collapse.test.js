'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const collapse = require('../lib/collapse');

function runHeadScript(storage) {
	const classes = new Set();
	const code = collapse.HEAD_SCRIPT.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
	vm.runInNewContext(code, {
		localStorage: storage,
		document: { documentElement: { classList: { add: c => classes.add(c) } } },
	});
	return classes;
}

test('head script adds the class only for a stored "1"', () => {
	assert.ok(runHeadScript({ getItem: k => (k === collapse.STORAGE_KEY ? '1' : null) }).has(collapse.HTML_CLASS));
	assert.equal(runHeadScript({ getItem: () => null }).size, 0);
	assert.equal(runHeadScript({ getItem: () => '0' }).size, 0);
});

test('head script never throws when storage is blocked', () => {
	assert.doesNotThrow(() => runHeadScript({ getItem: () => { throw new Error('SecurityError'); } }));
	assert.doesNotThrow(() => runHeadScript(undefined));
});

test('head script survives the NodeBB translator (no square brackets)', () => {
	assert.doesNotMatch(collapse.HEAD_SCRIPT, /[[\]]/);
});

test('injectHeadScript keeps enabled custom HTML and is idempotent', () => {
	const data = { useCustomHTML: true, customHTML: '<meta name="x">' };
	collapse.injectHeadScript(data);
	assert.equal(data.useCustomHTML, true);
	assert.equal(data.customHTML, collapse.HEAD_SCRIPT + '<meta name="x">');
	collapse.injectHeadScript(data);
	assert.equal(data.customHTML, collapse.HEAD_SCRIPT + '<meta name="x">');
});

test('injectHeadScript ignores custom HTML switched off in the ACP', () => {
	const data = { useCustomHTML: false, customHTML: '<b>off</b>' };
	collapse.injectHeadScript(data);
	assert.equal(data.useCustomHTML, true);
	assert.equal(data.customHTML, collapse.HEAD_SCRIPT);
	assert.equal(collapse.injectHeadScript(null), null);
});

test('client script uses the same storage key and class', () => {
	const client = fs.readFileSync(path.join(__dirname, '../public/shoutbox.js'), 'utf8');
	assert.ok(client.includes(`'${collapse.STORAGE_KEY}'`));
	assert.ok(client.includes(`'${collapse.HTML_CLASS}'`));
});
