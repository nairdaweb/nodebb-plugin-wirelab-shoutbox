'use strict';

/*
 * Pure rules of the shoutbox: limits, who may write, links, mutes, rate limiting and
 * retention. No NodeBB imports, so everything here is unit-tested without a forum.
 */

/** Hard limits. The retention values are also the pruning thresholds (see retentionCut). */
const LIMITS = Object.freeze({
	maxLength: 300,
	maxLines: 6,
	initialCount: 50,
	pageSize: 50,
	retentionDays: 7,
	retentionMax: 2000,
	reasonMaxLength: 200,
});

/** Defaults of the settings editable in the ACP (hash "shoutbox"). */
const DEFAULT_SETTINGS = Object.freeze({
	requireEmail: true,
	minAccountAgeHours: 24,
	minPosts: 1,
	linkMinRankLevel: 2,
	rateBurst: 5,
	rateWindowSeconds: 20,
	rateMinIntervalSeconds: 2,
});

/** Mute durations offered to moderators, in ms. 0 = permanent. */
const MUTE_DURATIONS = Object.freeze({
	'15m': 15 * 60 * 1000,
	'1h': 60 * 60 * 1000,
	'24h': 24 * 60 * 60 * 1000,
	perm: 0,
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function toInt(value, fallback, min, max) {
	let n;
	if (typeof value === 'number') n = Math.trunc(value);
	else if (/^\s*-?\d+\s*$/.test(String(value === undefined || value === null ? '' : value))) n = parseInt(value, 10);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, n));
}

function toBool(value, fallback) {
	if (value === true || value === 'on' || value === 'true' || value === '1' || value === 1) return true;
	if (value === false || value === 'off' || value === 'false' || value === '0' || value === 0) return false;
	return fallback;
}

/**
 * Settings from meta.settings.get('shoutbox') with defaults and bounds applied.
 *
 * @param {object|null} raw
 * @returns {object} same keys as DEFAULT_SETTINGS
 */
function normalizeSettings(raw) {
	raw = raw || {};
	const d = DEFAULT_SETTINGS;
	return {
		requireEmail: toBool(raw.requireEmail, d.requireEmail),
		minAccountAgeHours: toInt(raw.minAccountAgeHours, d.minAccountAgeHours, 0, 24 * 365),
		minPosts: toInt(raw.minPosts, d.minPosts, 0, 100000),
		linkMinRankLevel: toInt(raw.linkMinRankLevel, d.linkMinRankLevel, 0, 50),
		rateBurst: toInt(raw.rateBurst, d.rateBurst, 1, 100),
		rateWindowSeconds: toInt(raw.rateWindowSeconds, d.rateWindowSeconds, 1, 3600),
		rateMinIntervalSeconds: toInt(raw.rateMinIntervalSeconds, d.rateMinIntervalSeconds, 0, 600),
	};
}

/**
 * Whether a mute record is in force.
 *
 * @param {{until?: number|string}|null} mute stored mute (until = 0 means permanent)
 * @param {number} now ms
 * @returns {boolean}
 */
function isMuteActive(mute, now) {
	if (!mute || mute.until === undefined || mute.until === null || mute.until === '') return false;
	const until = parseInt(mute.until, 10);
	if (!Number.isFinite(until)) return false;
	return until === 0 || until > now;
}

/**
 * Why a user may not write, or null when they may.
 *
 * Moderators (and administrators) skip the account checks but not the privilege itself;
 * a mute applies to everyone except moderators.
 *
 * @param {object} p
 * @param {number} p.uid
 * @param {boolean} p.canWrite has the shoutbox:write privilege
 * @param {boolean} p.isModerator shoutbox:moderate, administrator or global moderator
 * @param {boolean} p.emailConfirmed
 * @param {number} p.joindate ms
 * @param {number} p.postcount
 * @param {object|null} p.mute
 * @param {number} p.now ms
 * @param {object} settings normalised settings
 * @returns {null|'guest'|'no-privilege'|'muted'|'email'|'age'|'posts'}
 */
function writeBlockReason(p, settings) {
	if (!p || !(parseInt(p.uid, 10) > 0)) return 'guest';
	if (!p.canWrite) return 'no-privilege';
	if (p.isModerator) return null;
	if (isMuteActive(p.mute, p.now)) return 'muted';
	if (settings.requireEmail && !p.emailConfirmed) return 'email';
	const joindate = parseInt(p.joindate, 10) || 0;
	if (settings.minAccountAgeHours > 0 && (!joindate || p.now - joindate < settings.minAccountAgeHours * HOUR)) return 'age';
	if ((parseInt(p.postcount, 10) || 0) < settings.minPosts) return 'posts';
	return null;
}

/**
 * Whether the user may post links: moderators always; others from the given rank level of
 * nodebb-plugin-rank-badges (level 2 = "Apprentice"/"Praktykant" in the default ladder).
 *
 * @param {{isModerator: boolean, rankLevel: number}} p
 * @param {object} settings
 * @returns {boolean}
 */
function canPostLinks(p, settings) {
	if (p.isModerator) return true;
	if (!settings.linkMinRankLevel) return true;
	return (parseInt(p.rankLevel, 10) || 0) >= settings.linkMinRankLevel;
}

/**
 * Remaining time of a mute, for display. null when not muted.
 *
 * @param {object|null} mute
 * @param {number} now
 * @returns {{permanent: boolean, until: number, reason: string}|null}
 */
function muteInfo(mute, now) {
	if (!isMuteActive(mute, now)) return null;
	const until = parseInt(mute.until, 10);
	return { permanent: until === 0, until, reason: String(mute.reason || '') };
}

/**
 * Builds a mute record.
 *
 * @param {string} duration key of MUTE_DURATIONS
 * @param {string} reason required, trimmed, at most LIMITS.reasonMaxLength characters
 * @param {number} now
 * @returns {{until: number, reason: string, duration: string}}
 * @throws {Error} '[[shoutbox:error.mute-duration]]' or '[[shoutbox:error.mute-reason]]'
 */
function buildMute(duration, reason, now) {
	if (!Object.prototype.hasOwnProperty.call(MUTE_DURATIONS, duration)) throw new Error('[[shoutbox:error.mute-duration]]');
	const text = String(reason || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
	if (!text) throw new Error('[[shoutbox:error.mute-reason]]');
	const ms = MUTE_DURATIONS[duration];
	return {
		until: ms === 0 ? 0 : now + ms,
		reason: Array.from(text).slice(0, LIMITS.reasonMaxLength).join(''),
		duration,
	};
}

/**
 * In-memory sliding-window limiter per user: at most `burst` messages in `windowMs`, and at
 * least `minIntervalMs` between two messages. Per process; with several NodeBB processes each
 * one counts on its own (the limit is then per process, which is still a hard cap).
 */
class RateLimiter {
	constructor(opts) {
		this.configure(opts);
		this.hits = new Map();
	}

	configure({ burst, windowMs, minIntervalMs }) {
		this.burst = burst;
		this.windowMs = windowMs;
		this.minIntervalMs = minIntervalMs;
	}

	/**
	 * Records an attempt. Returns 0 when allowed, otherwise the ms to wait.
	 *
	 * @param {number|string} uid
	 * @param {number} now
	 * @returns {number}
	 */
	hit(uid, now) {
		const key = String(uid);
		const list = (this.hits.get(key) || []).filter(t => now - t < this.windowMs);
		const last = list[list.length - 1];
		if (last !== undefined && now - last < this.minIntervalMs) {
			this.hits.set(key, list);
			return this.minIntervalMs - (now - last);
		}
		if (list.length >= this.burst) {
			this.hits.set(key, list);
			return this.windowMs - (now - list[0]);
		}
		list.push(now);
		this.hits.set(key, list);
		if (this.hits.size > 10000) this.sweep(now);
		return 0;
	}

	sweep(now) {
		for (const [key, list] of this.hits) {
			if (!list.length || now - list[list.length - 1] >= this.windowMs) this.hits.delete(key);
		}
	}
}

/**
 * Whether `actor` may delete a message: moderators any message, others only their own.
 *
 * @param {{uid: number, isModerator: boolean}} actor
 * @param {{uid: number|string}|null} message
 * @returns {boolean}
 */
function canDelete(actor, message) {
	if (!message || !actor || !(parseInt(actor.uid, 10) > 0)) return false;
	return !!actor.isModerator || String(message.uid) === String(actor.uid);
}

/**
 * Whether `actor` may mute `target`: moderators only, never themselves or another moderator.
 *
 * @param {{uid: number, isModerator: boolean}} actor
 * @param {{uid: number, isModerator: boolean}} target
 * @returns {boolean}
 */
function canMute(actor, target) {
	if (!actor || !actor.isModerator || !target || !(parseInt(target.uid, 10) > 0)) return false;
	if (String(actor.uid) === String(target.uid)) return false;
	return !target.isModerator;
}

/**
 * Oldest timestamp to keep (messages older than this are pruned).
 *
 * @param {number} now
 * @returns {number}
 */
function retentionCut(now) {
	return now - LIMITS.retentionDays * DAY;
}

/**
 * How many of the oldest messages to drop so that at most retentionMax remain.
 *
 * @param {number} count
 * @returns {number}
 */
function overflow(count) {
	return Math.max(0, (parseInt(count, 10) || 0) - LIMITS.retentionMax);
}

/**
 * Page size for "load older": clamps a client-supplied count.
 *
 * @param {*} value
 * @returns {number}
 */
function pageCount(value) {
	return toInt(value, LIMITS.pageSize, 1, LIMITS.pageSize);
}

module.exports = {
	LIMITS,
	DEFAULT_SETTINGS,
	MUTE_DURATIONS,
	normalizeSettings,
	isMuteActive,
	writeBlockReason,
	canPostLinks,
	muteInfo,
	buildMute,
	RateLimiter,
	canDelete,
	canMute,
	retentionCut,
	overflow,
	pageCount,
};
