'use strict';

/*
 * Message text: normalisation, validation and rendering to safe HTML.
 *
 * Messages are stored as plain text and rendered on the server on every read. The renderer
 * escapes everything and then adds only a fixed set of tags: <strong>, <em>, <del>, <code>,
 * <br>, <a> for http(s) autolinks and <a> for @mentions of existing users. No HTML typed by a
 * user ever reaches the page. Emoji images are added afterwards by nodebb-plugin-emoji.
 */

const { LIMITS } = require('./rules');

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;', '=': '&#61;' };

function escapeHtml(s) {
	return String(s).replace(/[&<>"'`=]/g, c => ESC[c]);
}

/*
 * Removed from input: C0/C1 control characters (except newline), bidi overrides and
 * isolates, LRM/RLM, zero-width space and BOM. ZWJ (U+200D) stays, emoji sequences need it.
 */
const STRIP = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/**
 * Canonical form of a message as typed: NFC, \n newlines, no control or bidi characters,
 * no trailing spaces, at most one empty line in a row, trimmed.
 *
 * @param {*} raw
 * @returns {string}
 */
function normalize(raw) {
	if (typeof raw !== 'string') return '';
	return raw
		.normalize('NFC')
		.replace(/\r\n?/g, '\n')
		.replace(/\t/g, ' ')
		.replace(STRIP, '')
		.split('\n').map(l => l.replace(/\s+$/u, '')).join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

/** Length in user-perceived code points (an emoji counts once, not as two UTF-16 units). */
function length(text) {
	return Array.from(String(text)).length;
}

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/giu;
const TLDS = 'pl|com|net|org|io|eu|de|uk|us|ru|info|biz|xyz|top|site|online|shop|store|app|dev|me|co|link|click|live|club|tk|ml|ga|cf|gq|cn|in|to|ly|gg|tv|cc|su|ua|cz|sk';
const BARE_DOMAIN_RE = new RegExp(`(?:^|[^\\w@.-])[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9-]{1,63})*\\.(?:${TLDS})(?=$|[\\s/:?#)\\]!,;]|\\.(?:\\s|$))`, 'iu');

/**
 * Whether the text contains a link: http(s)://, www. or a bare domain such as "example.com"
 * (common spam trick). Used for the "links from rank N" rule, so it errs on the strict side.
 *
 * @param {string} text normalised text
 * @returns {boolean}
 */
function hasLink(text) {
	URL_RE.lastIndex = 0;
	return URL_RE.test(text) || BARE_DOMAIN_RE.test(text);
}

/**
 * Checks a normalised message.
 *
 * @param {string} text normalised with normalize()
 * @param {{canLinks: boolean}} opts
 * @returns {null|'empty'|'too-long'|'too-many-lines'|'links'} error code, null when valid
 */
function validate(text, opts) {
	if (!text) return 'empty';
	if (length(text) > LIMITS.maxLength) return 'too-long';
	if (text.split('\n').length > LIMITS.maxLines) return 'too-many-lines';
	if (!(opts && opts.canLinks) && hasLink(text)) return 'links';
	return null;
}

const MENTION_RE = /(^|[^\p{L}\p{N}_@/.-])@([\p{L}\p{N}][\p{L}\p{N}_.-]{0,39})/gu;

function trimMention(name) {
	return name.replace(/[.-]+$/u, '');
}

/**
 * Slugs mentioned in the text (lower case, unique, at most `max`), ignoring code spans.
 *
 * @param {string} text
 * @param {number} [max=5]
 * @returns {string[]}
 */
function extractMentions(text, max) {
	const limit = max || 5;
	const out = [];
	const noCode = String(text).replace(/`[^`\n]+`/g, ' ');
	MENTION_RE.lastIndex = 0;
	let m;
	while ((m = MENTION_RE.exec(noCode)) && out.length < limit) {
		const slug = trimMention(m[2]).toLowerCase();
		if (slug && !out.includes(slug)) out.push(slug);
	}
	return out;
}

/**
 * Splits a URL match from trailing punctuation that belongs to the sentence.
 *
 * @param {string} raw
 * @returns {{url: string, rest: string}}
 */
function splitTrailing(raw) {
	let url = raw;
	let rest = '';
	for (;;) {
		const last = url.slice(-1);
		if (/[.,;:!?'"*_~]/.test(last) || (last === ')' && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length)) {
			rest = last + rest;
			url = url.slice(0, -1);
		} else {
			break;
		}
	}
	return { url, rest };
}

function safeHref(url) {
	const full = /^www\./i.test(url) ? `https://${url}` : url;
	try {
		const u = new URL(full);
		if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
		return u.href;
	} catch {
		return '';
	}
}

function shorten(url) {
	const shown = url.replace(/^https?:\/\//i, '');
	const chars = Array.from(shown);
	return chars.length > 48 ? `${chars.slice(0, 45).join('')}…` : shown;
}

/**
 * Inline markdown on already escaped text. Placeholders (\u0000n\u0000) are left alone.
 */
function emphasis(html) {
	return html
		.replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, '<strong>$1</strong>')
		.replace(/~~(?=\S)([^~\n]*?\S)~~/g, '<del>$1</del>')
		.replace(/(^|[^\p{L}\p{N}*])\*(?=\S)([^*\n]*?\S)\*(?![\p{L}\p{N}*])/gu, '$1<em>$2</em>')
		.replace(/(^|[^\p{L}\p{N}_])_(?=\S)([^_\n]*?\S)_(?![\p{L}\p{N}_])/gu, '$1<em>$2</em>');
}

/**
 * Renders a normalised message to HTML.
 *
 * @param {string} text normalised text
 * @param {object} [opts]
 * @param {Map<string, {userslug: string, username: string}>} [opts.mentions] existing users by lower-case slug
 * @param {string} [opts.relativePath] NodeBB relative_path
 * @param {boolean} [opts.links=true] turn URLs into links (false: shown as text)
 * @returns {string} HTML
 */
function render(text, opts) {
	opts = opts || {};
	const mentions = opts.mentions || new Map();
	const rp = opts.relativePath || '';
	const links = opts.links !== false;
	const tokens = [];
	const hold = (html) => {
		tokens.push(html);
		return `\u0000${tokens.length - 1}\u0000`;
	};

	const renderText = (plain) => {
		let out = '';
		let last = 0;
		URL_RE.lastIndex = 0;
		let m;
		while ((m = URL_RE.exec(plain))) {
			const { url, rest } = splitTrailing(m[0]);
			const href = links ? safeHref(url) : '';
			out += escapeHtml(plain.slice(last, m.index));
			out += href ?
				hold(`<a href="${escapeHtml(href)}" rel="nofollow ugc noopener noreferrer" target="_blank">${escapeHtml(shorten(url))}</a>`) :
				escapeHtml(url);
			out += escapeHtml(rest);
			last = m.index + m[0].length;
		}
		out += escapeHtml(plain.slice(last));
		out = out.replace(MENTION_RE, (whole, before, name) => {
			const clean = trimMention(name);
			const user = mentions.get(clean.toLowerCase());
			if (!user) return whole;
			const tail = name.slice(clean.length);
			return `${before}${hold(`<a class="sb-mention" href="${escapeHtml(`${rp}/user/${encodeURIComponent(user.userslug)}`)}">@${escapeHtml(user.username)}</a>`)}${tail}`;
		});
		return emphasis(out);
	};

	let html = '';
	let last = 0;
	const CODE_RE = /`([^`\n]+)`/g;
	let c;
	while ((c = CODE_RE.exec(text))) {
		html += renderText(text.slice(last, c.index));
		html += hold(`<code>${escapeHtml(c[1])}</code>`);
		last = c.index + c[0].length;
	}
	html += renderText(text.slice(last));
	html = html.replace(/\n/g, '<br>');
	return html.replace(/\u0000(\d+)\u0000/g, (_, i) => tokens[i]);
}

/**
 * Plain one-line excerpt (for notifications): newlines to spaces, at most `max` characters.
 *
 * @param {string} text
 * @param {number} [max=120]
 * @returns {string} unescaped text
 */
function excerpt(text, max) {
	const chars = Array.from(String(text).replace(/\s*\n\s*/g, ' '));
	const limit = max || 120;
	return chars.length > limit ? `${chars.slice(0, limit - 1).join('')}…` : chars.join('');
}

module.exports = {
	escapeHtml,
	normalize,
	length,
	hasLink,
	validate,
	extractMentions,
	render,
	excerpt,
};
