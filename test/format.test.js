'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const format = require('../lib/format');

const users = new Map([
	['adrian', { userslug: 'adrian', username: 'adrian' }],
	['tomek_rf', { userslug: 'tomek_rf', username: 'tomek_rf' }],
]);

test('normalize strips control and bidi characters, keeps emoji sequences', () => {
	assert.equal(format.normalize('  a\u0007b\u202ec\r\n\r\n\r\n\r\nd  '), 'abc\n\nd');
	assert.equal(format.normalize('👩\u200d🔧 ok'), '👩\u200d🔧 ok');
	assert.equal(format.normalize(null), '');
	assert.equal(format.normalize({ toString: () => 'x' }), '');
});

test('length counts code points', () => {
	assert.equal(format.length('😀😀'), 2);
});

test('validate: empty, length, lines and links', () => {
	assert.equal(format.validate('', { canLinks: true }), 'empty');
	assert.equal(format.validate('a'.repeat(300), { canLinks: false }), null);
	assert.equal(format.validate('a'.repeat(301), { canLinks: false }), 'too-long');
	assert.equal(format.validate('😀'.repeat(300), { canLinks: false }), null);
	assert.equal(format.validate('1\n2\n3\n4\n5\n6\n7', { canLinks: false }), 'too-many-lines');
	assert.equal(format.validate('see https://example.com', { canLinks: false }), 'links');
	assert.equal(format.validate('see https://example.com', { canLinks: true }), null);
});

test('hasLink catches schemes, www and bare domains, not ordinary text', () => {
	for (const s of ['http://a.b', 'x www.foo.bar', 'buy at cheap-pills.xyz now', 'shop.example.pl/x', 'wirelab.pl.']) {
		assert.equal(format.hasLink(s), true, s);
	}
	for (const s of ['Mean Well IRM-20-5 ok', 'v1.2.3', 'napięcie 3.3 V', 'plik main.py', 'user@mail', 'e.g. this']) {
		assert.equal(format.hasLink(s), false, s);
	}
});

test('render escapes HTML completely', () => {
	const html = format.render('<img src=x onerror=alert(1)> <script>x</script> "q" \'a\'');
	assert.ok(!html.includes('<img'));
	assert.ok(!html.includes('<script'));
	assert.ok(html.includes('&lt;img src&#61;x onerror&#61;alert(1)&gt;'));
});

test('render: inline markdown only', () => {
	assert.equal(format.render('**b** *i* _u_ ~~s~~ `c<d>`'), '<strong>b</strong> <em>i</em> <em>u</em> <del>s</del> <code>c&lt;d&gt;</code>');
	assert.equal(format.render('snake_case_name 2*3*4'), 'snake_case_name 2*3*4');
	assert.equal(format.render('# not a heading\n> not a quote'), '# not a heading<br>&gt; not a quote');
	assert.equal(format.render('[x](javascript:alert(1))'), '[x](javascript:alert(1))');
	assert.equal(format.render('`**no**`'), '<code>**no**</code>');
});

test('render: autolinks only http(s), trailing punctuation outside', () => {
	const html = format.render('see https://wirelab.pl/a?b=1&c=2.');
	assert.equal(html, 'see <a href="https://wirelab.pl/a?b&#61;1&amp;c&#61;2" rel="nofollow ugc noopener noreferrer" target="_blank">wirelab.pl/a?b&#61;1&amp;c&#61;2</a>.');
	assert.ok(format.render('www.example.com').includes('href="https://www.example.com/"'));
	assert.ok(!format.render('javascript:alert(1)').includes('<a'));
	assert.ok(!format.render('https://x.pl', { links: false }).includes('<a'));
	assert.ok(format.render('(https://wirelab.pl/x_(y))').includes('href="https://wirelab.pl/x_(y)"'));
});

test('render: mentions of existing users only', () => {
	const html = format.render('@adrian and @nobody, @tomek_rf.', { mentions: users, relativePath: '/forum' });
	assert.equal(html, '<a class="sb-mention" href="/forum/user/adrian">@adrian</a> and @nobody, <a class="sb-mention" href="/forum/user/tomek_rf">@tomek_rf</a>.');
	assert.equal(format.render('mail a@adrian.pl', { mentions: users }), 'mail a@adrian.pl');
	assert.equal(format.render('`@adrian`', { mentions: users }), '<code>@adrian</code>');
});

test('extractMentions: unique slugs, no code, capped', () => {
	assert.deepEqual(format.extractMentions('@Adrian @adrian @tomek_rf. `@x` a@b.pl'), ['adrian', 'tomek_rf']);
	assert.equal(format.extractMentions('@a1 @a2 @a3 @a4 @a5 @a6 @a7').length, 5);
});

test('excerpt', () => {
	assert.equal(format.excerpt('a\nb', 10), 'a b');
	assert.equal(format.excerpt('abcdef', 4), 'abc…');
});
