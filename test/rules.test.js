'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const rules = require('../lib/rules');

const HOUR = 3600 * 1000;
const NOW = Date.UTC(2026, 8, 30, 12);
const settings = rules.normalizeSettings({});

function user(over) {
	return Object.assign({
		uid: 5, canWrite: true, isModerator: false, emailConfirmed: true,
		joindate: NOW - 48 * HOUR, postcount: 3, mute: null, now: NOW,
	}, over);
}

test('normalizeSettings: defaults and bounds', () => {
	assert.deepEqual(settings, rules.DEFAULT_SETTINGS);
	const s = rules.normalizeSettings({ requireEmail: 'off', minAccountAgeHours: '-5', minPosts: '1e3', linkMinRankLevel: '3', rateBurst: '0' });
	assert.equal(s.requireEmail, false);
	assert.equal(s.minAccountAgeHours, 0);
	assert.equal(s.minPosts, 1);
	assert.equal(s.linkMinRankLevel, 3);
	assert.equal(s.rateBurst, 1);
});

test('writeBlockReason: account requirements', () => {
	assert.equal(rules.writeBlockReason(user(), settings), null);
	assert.equal(rules.writeBlockReason(user({ uid: 0 }), settings), 'guest');
	assert.equal(rules.writeBlockReason(user({ canWrite: false }), settings), 'no-privilege');
	assert.equal(rules.writeBlockReason(user({ emailConfirmed: false }), settings), 'email');
	assert.equal(rules.writeBlockReason(user({ joindate: NOW - 23 * HOUR }), settings), 'age');
	assert.equal(rules.writeBlockReason(user({ joindate: NOW - 24 * HOUR }), settings), null);
	assert.equal(rules.writeBlockReason(user({ postcount: 0 }), settings), 'posts');
	assert.equal(rules.writeBlockReason(user({ emailConfirmed: false }), rules.normalizeSettings({ requireEmail: 'off' })), null);
});

test('writeBlockReason: moderators skip account checks and mutes, not the privilege', () => {
	const mod = { isModerator: true, emailConfirmed: false, postcount: 0, joindate: NOW, mute: { until: 0 } };
	assert.equal(rules.writeBlockReason(user(mod), settings), null);
	assert.equal(rules.writeBlockReason(user(Object.assign({}, mod, { canWrite: false })), settings), 'no-privilege');
});

test('mutes: timed, permanent, expired', () => {
	assert.equal(rules.writeBlockReason(user({ mute: { until: NOW + 1000 } }), settings), 'muted');
	assert.equal(rules.writeBlockReason(user({ mute: { until: '0' } }), settings), 'muted');
	assert.equal(rules.writeBlockReason(user({ mute: { until: NOW - 1 } }), settings), null);
	assert.equal(rules.isMuteActive(null, NOW), false);
	assert.equal(rules.isMuteActive({ until: '' }, NOW), false);
	assert.deepEqual(rules.muteInfo({ until: 0, reason: 'spam' }, NOW), { permanent: true, until: 0, reason: 'spam' });
});

test('buildMute: durations and required reason', () => {
	assert.equal(rules.buildMute('15m', 'spam', NOW).until, NOW + 15 * 60 * 1000);
	assert.equal(rules.buildMute('1h', 'spam', NOW).until, NOW + HOUR);
	assert.equal(rules.buildMute('24h', 'spam', NOW).until, NOW + 24 * HOUR);
	assert.equal(rules.buildMute('perm', 'spam', NOW).until, 0);
	assert.throws(() => rules.buildMute('2d', 'spam', NOW), /mute-duration/);
	assert.throws(() => rules.buildMute('1h', '  ', NOW), /mute-reason/);
	assert.throws(() => rules.buildMute('__proto__', 'x', NOW), /mute-duration/);
	assert.equal(rules.buildMute('1h', 'x'.repeat(500), NOW).reason.length, rules.LIMITS.reasonMaxLength);
});

test('canPostLinks: from rank level, moderators always', () => {
	assert.equal(rules.canPostLinks({ rankLevel: 1 }, settings), false);
	assert.equal(rules.canPostLinks({ rankLevel: 2 }, settings), true);
	assert.equal(rules.canPostLinks({ rankLevel: 0, isModerator: true }, settings), true);
	assert.equal(rules.canPostLinks({ rankLevel: 0 }, rules.normalizeSettings({ linkMinRankLevel: 0 })), true);
});

test('RateLimiter: minimum interval and burst window', () => {
	const rl = new rules.RateLimiter({ burst: 3, windowMs: 10000, minIntervalMs: 1000 });
	assert.equal(rl.hit(1, 0), 0);
	assert.equal(rl.hit(1, 500), 500);
	assert.equal(rl.hit(1, 1000), 0);
	assert.equal(rl.hit(1, 2000), 0);
	assert.equal(rl.hit(1, 3000), 7000);
	assert.equal(rl.hit(2, 3000), 0, 'per user');
	assert.equal(rl.hit(1, 10000), 0, 'window slides');
});

test('retention: 7 days and 2000 messages', () => {
	assert.equal(rules.retentionCut(NOW), NOW - 7 * 24 * HOUR);
	assert.equal(rules.overflow(1999), 0);
	assert.equal(rules.overflow(2005), 5);
	assert.equal(rules.LIMITS.maxLength, 300);
	assert.equal(rules.LIMITS.initialCount, 50);
	assert.equal(rules.pageCount('500'), 50);
	assert.equal(rules.pageCount('x'), 50);
	assert.equal(rules.pageCount(10), 10);
});

test('canDelete: own messages, moderators any', () => {
	assert.equal(rules.canDelete({ uid: 5 }, { uid: '5' }), true);
	assert.equal(rules.canDelete({ uid: 5 }, { uid: 6 }), false);
	assert.equal(rules.canDelete({ uid: 5, isModerator: true }, { uid: 6 }), true);
	assert.equal(rules.canDelete({ uid: 0 }, { uid: 0 }), false);
	assert.equal(rules.canDelete({ uid: 5 }, null), false);
});

test('canMute: moderators only, not self, not other moderators', () => {
	assert.equal(rules.canMute({ uid: 1, isModerator: true }, { uid: 5 }), true);
	assert.equal(rules.canMute({ uid: 2 }, { uid: 5 }), false);
	assert.equal(rules.canMute({ uid: 1, isModerator: true }, { uid: 1 }), false);
	assert.equal(rules.canMute({ uid: 1, isModerator: true }, { uid: 3, isModerator: true }), false);
	assert.equal(rules.canMute({ uid: 1, isModerator: true }, { uid: 0 }), false);
});
