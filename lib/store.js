'use strict';

/*
 * Storage in the NodeBB database (works on Redis, PostgreSQL and MongoDB through the generic
 * db API). Keys:
 *   shoutbox:messages        sorted set, value = mid, score = timestamp
 *   shoutbox:message:<mid>   hash { mid, uid, content, timestamp, deleted, deletedBy }
 *   shoutbox:mutes           sorted set, value = uid, score = until (permanent = far future)
 *   shoutbox:mute:<uid>      hash { uid, until, reason, by, at, duration }
 *   shoutbox:log             sorted set, value = log id, score = timestamp
 *   shoutbox:log:<id>        hash { id, action, uid, by, reason, duration, until, mid, at }
 *   global.nextShoutboxMid / global.nextShoutboxLogId   counters
 */

const db = require.main.require('./src/database');

const rules = require('./rules');

const MSGS = 'shoutbox:messages';
const MUTES = 'shoutbox:mutes';
const LOG = 'shoutbox:log';
const LOG_MAX = 5000;
/** Score used for permanent mutes in the shoutbox:mutes sorted set (year 2286). */
const PERMANENT_SCORE = 9999999999999;

const msgKey = mid => `shoutbox:message:${mid}`;
const muteKey = uid => `shoutbox:mute:${uid}`;
const logKey = id => `shoutbox:log:${id}`;

async function addMessage({ uid, content, timestamp }) {
	const mid = await db.incrObjectField('global', 'nextShoutboxMid');
	const msg = { mid, uid, content, timestamp, deleted: 0 };
	await db.setObject(msgKey(mid), msg);
	await db.sortedSetAdd(MSGS, timestamp, mid);
	return msg;
}

async function getMessage(mid) {
	if (!(parseInt(mid, 10) > 0)) return null;
	const msg = await db.getObject(msgKey(parseInt(mid, 10)));
	return msg && msg.mid ? msg : null;
}

async function getMessagesByMids(mids) {
	if (!mids.length) return [];
	const list = await db.getObjects(mids.map(msgKey));
	return list.filter(m => m && m.mid);
}

/**
 * Newest `count` messages, oldest first. With `beforeMid`, the page before that message.
 */
async function getRecent(count, beforeMid) {
	let max = '+inf';
	if (beforeMid) {
		const score = await db.sortedSetScore(MSGS, beforeMid);
		if (score === null || score === undefined) return [];
		max = score;
	}
	let mids = await db.getSortedSetRevRangeByScore(MSGS, 0, count + 1, max, '-inf');
	if (beforeMid) mids = mids.filter(m => String(m) !== String(beforeMid));
	mids = mids.slice(0, count).reverse();
	return getMessagesByMids(mids);
}

async function markDeleted(mid, by) {
	await db.setObject(msgKey(mid), { deleted: 1, deletedBy: by });
}

/**
 * Drops messages older than the retention window and the oldest ones above the count limit.
 *
 * @returns {Promise<number>} number of messages removed
 */
async function prune(now) {
	const old = await db.getSortedSetRangeByScore(MSGS, 0, -1, '-inf', rules.retentionCut(now));
	const count = await db.sortedSetCard(MSGS);
	const extra = rules.overflow(count - old.length);
	const over = extra ? await db.getSortedSetRange(MSGS, old.length, old.length + extra - 1) : [];
	const mids = old.concat(over);
	if (!mids.length) return 0;
	await db.deleteAll(mids.map(msgKey));
	await db.sortedSetRemove(MSGS, mids);
	return mids.length;
}

async function getMute(uid) {
	const mute = await db.getObject(muteKey(uid));
	return mute && mute.uid ? mute : null;
}

async function getMutes(uids) {
	if (!uids.length) return [];
	return db.getObjects(uids.map(muteKey));
}

async function setMute(uid, mute) {
	await db.setObject(muteKey(uid), Object.assign({ uid }, mute));
	await db.sortedSetAdd(MUTES, mute.until === 0 ? PERMANENT_SCORE : mute.until, uid);
}

async function removeMute(uid) {
	await db.delete(muteKey(uid));
	await db.sortedSetRemove(MUTES, uid);
}

/** Mutes in force now, newest expiry last. */
async function getActiveMutes(now) {
	const uids = await db.getSortedSetRangeByScore(MUTES, 0, 200, now + 1, '+inf');
	const list = await getMutes(uids);
	return list.filter(m => m && rules.isMuteActive(m, now));
}

/** Removes expired mutes from the index. */
async function pruneMutes(now) {
	const expired = await db.getSortedSetRangeByScore(MUTES, 0, 500, '-inf', now);
	if (!expired.length) return;
	await db.deleteAll(expired.map(muteKey));
	await db.sortedSetRemove(MUTES, expired);
}

async function log(entry) {
	const id = await db.incrObjectField('global', 'nextShoutboxLogId');
	const at = entry.at || Date.now();
	await db.setObject(logKey(id), Object.assign({ id, at }, entry));
	await db.sortedSetAdd(LOG, at, id);
	const count = await db.sortedSetCard(LOG);
	if (count > LOG_MAX) {
		const drop = await db.getSortedSetRange(LOG, 0, count - LOG_MAX - 1);
		await db.deleteAll(drop.map(logKey));
		await db.sortedSetRemove(LOG, drop);
	}
	return id;
}

async function getLog(start, stop) {
	const ids = await db.getSortedSetRevRange(LOG, start, stop);
	const list = await db.getObjects(ids.map(logKey));
	return list.filter(Boolean);
}

async function countLog() {
	return db.sortedSetCard(LOG);
}

module.exports = {
	addMessage,
	getMessage,
	getRecent,
	markDeleted,
	prune,
	getMute,
	setMute,
	removeMute,
	getActiveMutes,
	pruneMutes,
	log,
	getLog,
	countLog,
};
