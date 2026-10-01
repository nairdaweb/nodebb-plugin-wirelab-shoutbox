'use strict';

/*
 * nodebb-plugin-wirelab-shoutbox: server entry point.
 *
 * A small live chat for the whole forum (a dock on every page and a widget), over the
 * NodeBB websocket (socket.io). Data lives in the NodeBB database under shoutbox:* keys
 * (lib/store.js). Rules and rendering are pure modules (lib/rules.js, lib/format.js).
 *
 * Global privileges: shoutbox:read, shoutbox:write, shoutbox:moderate (ACP → Privileges).
 */

const nconf = require.main.require('nconf');
const winston = require.main.require('winston');
const meta = require.main.require('./src/meta');
const db = require.main.require('./src/database');
const user = require.main.require('./src/user');
const privileges = require.main.require('./src/privileges');
const plugins = require.main.require('./src/plugins');
const notifications = require.main.require('./src/notifications');
const translator = require.main.require('./src/translator');
const pubsub = require.main.require('./src/pubsub');
const websockets = require.main.require('./src/socket.io');
const SocketPlugins = require.main.require('./src/socket.io/plugins');
const SocketAdmin = require.main.require('./src/socket.io/admin');
const routeHelpers = require.main.require('./src/routes/helpers');

const rules = require('./lib/rules');
const format = require('./lib/format');
const store = require('./lib/store');
const collapse = require('./lib/collapse');

const SETTINGS_KEY = 'shoutbox';
const ROOM = 'shoutbox';
const PRIVS = ['shoutbox:read', 'shoutbox:write', 'shoutbox:moderate'];
const PRUNE_EVERY = 10 * 60 * 1000;
const CACHE_TTL = 60 * 1000;

const plugin = module.exports;

let settings = rules.normalizeSettings(null);
const limiter = new rules.RateLimiter(limiterOptions(settings));

function limiterOptions(s) {
	return { burst: s.rateBurst, windowMs: s.rateWindowSeconds * 1000, minIntervalMs: s.rateMinIntervalSeconds * 1000 };
}

async function loadSettings() {
	settings = rules.normalizeSettings(await meta.settings.get(SETTINGS_KEY));
	limiter.configure(limiterOptions(settings));
}

// ---------------------------------------------------------------- optional integrations

function optionalRequire(id) {
	try {
		return require.main.require(id);
	} catch {
		return null;
	}
}

/*
 * Rank ladder of nodebb-plugin-rank-badges ("links from rank N"). Returns null when that plugin
 * is not installed or not active; the post-count rule applies then (lib/rules.js canPostLinks).
 */
const rankLib = optionalRequire('nodebb-plugin-rank-badges/lib/ranks');
let rankConfig = { value: null, at: 0 };
let rankActive = { value: false, at: 0 };

async function getRankLevel(fields) {
	if (!rankLib || typeof rankLib.computeLevel !== 'function') return null;
	if (Date.now() - rankActive.at > CACHE_TTL) rankActive = { value: await plugins.isActive('nodebb-plugin-rank-badges'), at: Date.now() };
	if (!rankActive.value) return null;
	if (!rankConfig.value || Date.now() - rankConfig.at > CACHE_TTL) {
		rankConfig = { value: rankLib.normalize(await meta.settings.get('rank-badges')), at: Date.now() };
	}
	const cfg = rankConfig.value;
	return rankLib.computeLevel(cfg, fields, rankLib.effectiveMode(cfg.mode, !!meta.config['reputation:disabled']));
}

const emojiLib = optionalRequire('nodebb-plugin-emoji');
let emojiActive = { value: false, at: 0 };

async function parseEmoji(html) {
	if (!emojiLib || !emojiLib.parse || typeof emojiLib.parse.raw !== 'function') return html;
	if (Date.now() - emojiActive.at > CACHE_TTL) emojiActive = { value: await plugins.isActive('nodebb-plugin-emoji'), at: Date.now() };
	if (!emojiActive.value) return html;
	try {
		return await emojiLib.parse.raw(html);
	} catch {
		return html;
	}
}

// ---------------------------------------------------------------- privileges

plugin.addPrivileges = async function (data) {
	data.privileges.set('shoutbox:read', { label: '[[shoutbox:priv.read]]', type: 'viewing' });
	data.privileges.set('shoutbox:write', { label: '[[shoutbox:priv.write]]', type: 'posting' });
	data.privileges.set('shoutbox:moderate', { label: '[[shoutbox:priv.moderate]]', type: 'moderation' });
	return data;
};

/** First start only: guests and members read, members write, global moderators moderate. */
async function ensureDefaultPrivileges() {
	if (await db.getObjectField('global', 'shoutboxPrivilegesSet')) return;
	await privileges.global.give(['groups:shoutbox:read'], 'guests');
	await privileges.global.give(['groups:shoutbox:read', 'groups:shoutbox:write'], 'registered-users');
	await privileges.global.give(['groups:shoutbox:read', 'groups:shoutbox:write', 'groups:shoutbox:moderate'], 'Global Moderators');
	await db.setObjectField('global', 'shoutboxPrivilegesSet', 1);
	winston.info('[shoutbox] default privileges granted (read: guests, members; write: members; moderate: Global Moderators)');
}

/**
 * Everything the rules need about one user.
 *
 * @param {number} uid
 */
async function getActor(uid) {
	uid = parseInt(uid, 10) || 0;
	const [privs, isStaff, fields, mute] = await Promise.all([
		privileges.global.can(PRIVS, uid),
		uid > 0 ? user.isAdminOrGlobalMod(uid) : false,
		uid > 0 ? user.getUserFields(uid, ['uid', 'username', 'userslug', 'displayname', 'email', 'email:confirmed', 'joindate', 'postcount', 'reputation']) : {},
		uid > 0 ? store.getMute(uid) : null,
	]);
	const [canRead, canWrite, canModerate] = privs;
	const isModerator = uid > 0 && (canModerate || isStaff);
	return {
		uid,
		username: fields.username,
		displayname: fields.displayname || fields.username,
		canRead: canRead || isModerator,
		canWrite,
		isModerator,
		emailConfirmed: !!fields.email && parseInt(fields['email:confirmed'], 10) === 1,
		joindate: parseInt(fields.joindate, 10) || 0,
		postcount: parseInt(fields.postcount, 10) || 0,
		rankLevel: uid > 0 ? await getRankLevel(fields) : 0,
		mute,
	};
}

// ---------------------------------------------------------------- messages for the client

async function resolveMentions(texts) {
	const slugs = [...new Set(texts.flatMap(t => format.extractMentions(t)))];
	const map = new Map();
	if (!slugs.length) return map;
	const uids = await db.sortedSetScores('userslug:uid', slugs);
	const found = slugs.map((s, i) => [s, uids[i]]).filter(([, uid]) => uid);
	const users = await user.getUsersFields(found.map(([, uid]) => uid), ['uid', 'username', 'userslug']);
	users.forEach((u, i) => {
		if (u && u.userslug) map.set(found[i][0], { uid: u.uid, username: u.username, userslug: u.userslug });
	});
	return map;
}

/**
 * Stored messages → objects sent to browsers (HTML rendered here, never in the browser).
 */
async function serialize(msgs, viewerUid) {
	if (!msgs.length) return [];
	const uids = [...new Set(msgs.map(m => parseInt(m.uid, 10)))];
	let users = await user.getUsersFields(uids, ['uid', 'username', 'userslug', 'displayname', 'picture', 'postcount', 'reputation', 'icon:text', 'icon:bgColor']);
	try {
		({ users } = await plugins.hooks.fire('filter:posts.getUserInfoForPosts', { users: users.map(u => Object.assign({}, u)), uid: viewerUid }));
	} catch (err) {
		winston.warn(`[shoutbox] rank badges: ${err.message}`);
	}
	const byUid = new Map(users.map(u => [String(u.uid), u]));
	const mentions = await resolveMentions(msgs.filter(m => parseInt(m.deleted, 10) !== 1).map(m => m.content));
	const rp = nconf.get('relative_path') || '';
	return Promise.all(msgs.map(async (m) => {
		const u = byUid.get(String(m.uid)) || {};
		const deleted = parseInt(m.deleted, 10) === 1;
		const mentioned = deleted ? [] : format.extractMentions(m.content).map(s => mentions.get(s)).filter(Boolean).map(x => parseInt(x.uid, 10));
		const badge = u.rankBadge && u.rankBadge.image ? { image: u.rankBadge.image, name: u.rankBadge.name } : null;
		const ts = parseInt(m.timestamp, 10);
		return {
			mid: parseInt(m.mid, 10),
			uid: parseInt(m.uid, 10),
			user: {
				username: u.username,
				userslug: u.userslug,
				displayname: u.displayname || u.username,
				picture: u.picture || '',
				'icon:text': u['icon:text'],
				'icon:bgColor': u['icon:bgColor'],
				badge,
			},
			html: deleted ? '' : await parseEmoji(format.render(m.content, { mentions, relativePath: rp })),
			deleted,
			deletedByModerator: deleted && String(m.deletedBy) !== String(m.uid),
			mentions: mentioned,
			timestamp: ts,
			timestampISO: new Date(ts).toISOString(),
		};
	}));
}

function emit(event, data) {
	if (websockets.server) websockets.server.in(ROOM).emit(event, data);
}

/** Tells every tab of one user to reload its state (after a mute or unmute). */
function refresh(uid) {
	if (websockets.server) websockets.server.in(`uid_${uid}`).emit('event:shoutbox.refresh');
}

async function onlineCount() {
	const cutoff = (parseInt(meta.config.onlineCutoff, 10) || 30) * 60 * 1000;
	return db.sortedSetCount('users:online', Date.now() - cutoff, '+inf');
}

function state(actor, now) {
	const block = rules.writeBlockReason(Object.assign({}, actor, { now }), settings);
	return {
		uid: actor.uid,
		canRead: actor.canRead,
		canWrite: !block,
		blockReason: block,
		isModerator: actor.isModerator,
		canPostLinks: rules.canPostLinks(actor, settings),
		mute: rules.muteInfo(actor.mute, now),
		maxLength: rules.LIMITS.maxLength,
		requirements: { minAccountAgeHours: settings.minAccountAgeHours, minPosts: settings.minPosts },
		title: settings.title,
	};
}

// ---------------------------------------------------------------- socket API

async function mentionNotify(msg, actor, text) {
	const map = await resolveMentions([text]);
	let uids = [...map.values()].map(u => parseInt(u.uid, 10)).filter(uid => uid !== actor.uid);
	if (!uids.length) return;
	const can = await Promise.all(uids.map(uid => privileges.global.can('shoutbox:read', uid)));
	uids = uids.filter((uid, i) => can[i]);
	if (!uids.length) return;
	const notif = await notifications.create({
		type: 'mention',
		bodyShort: translator.compile('shoutbox:notif.mention', actor.displayname || actor.username),
		bodyLong: format.escapeHtml(format.excerpt(text)),
		nid: `shoutbox:mid:${msg.mid}:uid:${actor.uid}`,
		from: actor.uid,
		path: '/?shoutbox=open',
	});
	await notifications.push(notif, uids);
}

const api = {};

api.init = async function (socket) {
	const now = Date.now();
	const actor = await getActor(socket.uid);
	const st = state(actor, now);
	if (!actor.canRead) {
		socket.leave(ROOM);
		return { state: st, messages: [], online: 0 };
	}
	socket.join(ROOM);
	const [msgs, online] = await Promise.all([store.getRecent(rules.LIMITS.initialCount), onlineCount()]);
	return { state: st, messages: await serialize(msgs, actor.uid), online };
};

api.loadMore = async function (socket, data) {
	const actor = await getActor(socket.uid);
	if (!actor.canRead) throw new Error('[[error:no-privileges]]');
	const before = parseInt(data && data.before, 10);
	if (!(before > 0)) throw new Error('[[error:invalid-data]]');
	const msgs = await store.getRecent(rules.pageCount(data.count), before);
	return serialize(msgs, actor.uid);
};

api.send = async function (socket, data) {
	const now = Date.now();
	const actor = await getActor(socket.uid);
	const block = rules.writeBlockReason(Object.assign({}, actor, { now }), settings);
	if (block) throw new Error(`[[shoutbox:error.${block}]]`);
	const text = format.normalize(data && data.content);
	const invalid = format.validate(text, { canLinks: rules.canPostLinks(actor, settings) });
	if (invalid === 'links') {
		throw new Error(actor.rankLevel === null ?
			`[[shoutbox:error.links-posts, ${settings.linkMinPosts}]]` :
			`[[shoutbox:error.links-rank, ${settings.linkMinRankLevel}]]`);
	}
	if (invalid) throw new Error(`[[shoutbox:error.${invalid}, ${rules.LIMITS.maxLength}]]`);
	const wait = limiter.hit(actor.uid, now);
	if (wait) throw new Error(`[[shoutbox:error.rate-limit, ${Math.ceil(wait / 1000)}]]`);

	const msg = await store.addMessage({ uid: actor.uid, content: text, timestamp: now });
	const [out] = await serialize([msg], actor.uid);
	emit('event:shoutbox.message', out);
	mentionNotify(msg, actor, text).catch(err => winston.warn(`[shoutbox] mention notification: ${err.message}`));
	if (msg.mid % 50 === 0) store.prune(now).catch(err => winston.warn(`[shoutbox] prune: ${err.message}`));
	return out;
};

api.delete = async function (socket, data) {
	const actor = await getActor(socket.uid);
	const msg = await store.getMessage(data && data.mid);
	if (!msg || parseInt(msg.deleted, 10) === 1) throw new Error('[[shoutbox:error.not-found]]');
	if (!rules.canDelete(actor, msg)) throw new Error('[[error:no-privileges]]');
	await store.markDeleted(msg.mid, actor.uid);
	const byModerator = String(msg.uid) !== String(actor.uid);
	if (byModerator) {
		await store.log({ action: 'delete', uid: msg.uid, by: actor.uid, mid: msg.mid, reason: format.excerpt(msg.content, 200) });
	}
	emit('event:shoutbox.deleted', { mid: parseInt(msg.mid, 10), byModerator });
};

async function targetOf(uid) {
	uid = parseInt(uid, 10) || 0;
	if (!(uid > 0) || !(await user.exists(uid))) throw new Error('[[error:no-user]]');
	const [isStaff, canModerate, fields] = await Promise.all([
		user.isAdminOrGlobalMod(uid),
		privileges.global.can('shoutbox:moderate', uid),
		user.getUserFields(uid, ['uid', 'username', 'displayname']),
	]);
	return { uid, isModerator: isStaff || canModerate, username: fields.username, displayname: fields.displayname || fields.username };
}

api.mute = async function (socket, data) {
	data = data || {};
	const now = Date.now();
	const actor = await getActor(socket.uid);
	const target = await targetOf(data.uid);
	if (!rules.canMute(actor, target)) throw new Error('[[error:no-privileges]]');
	const mute = rules.buildMute(String(data.duration || ''), data.reason, now);
	await store.setMute(target.uid, Object.assign({ by: actor.uid, at: now }, mute));
	await store.log({ action: 'mute', uid: target.uid, by: actor.uid, duration: mute.duration, until: mute.until, reason: mute.reason, at: now });
	emit('event:shoutbox.muted', { uid: target.uid, username: target.displayname, duration: mute.duration, reason: mute.reason });
	refresh(target.uid);
};

/** Works for deleted accounts too, so their permanent mutes can still be cleared in the ACP. */
async function unmute(actorUid, targetUid) {
	const uid = parseInt(targetUid, 10) || 0;
	if (!(uid > 0)) throw new Error('[[error:invalid-data]]');
	const fields = await user.getUserFields(uid, ['username', 'displayname']);
	await store.removeMute(uid);
	await store.log({ action: 'unmute', uid, by: actorUid });
	emit('event:shoutbox.unmuted', { uid, username: fields.displayname || fields.username || '?' });
	refresh(uid);
}

api.unmute = async function (socket, data) {
	const actor = await getActor(socket.uid);
	if (!actor.isModerator) throw new Error('[[error:no-privileges]]');
	await unmute(actor.uid, data && data.uid);
};

api.searchUsers = async function (socket, data) {
	const actor = await getActor(socket.uid);
	if (!actor.canRead || !(actor.uid > 0)) throw new Error('[[error:no-privileges]]');
	const query = String((data && data.query) || '').replace(/^@/, '').slice(0, 40);
	if (!query) return [];
	if (!(await privileges.global.can('search:users', actor.uid))) return [];
	const result = await user.search({ query, searchBy: 'username', paginate: false, hardCap: 6, uid: actor.uid });
	return (result.users || []).slice(0, 6).map(u => ({
		username: u.username,
		userslug: u.userslug,
		displayname: u.displayname || u.username,
		picture: u.picture || '',
		'icon:text': u['icon:text'],
		'icon:bgColor': u['icon:bgColor'],
		status: u.status,
	}));
};

// ---------------------------------------------------------------- ACP

async function renderAdmin(req, res) {
	const now = Date.now();
	const [mutes, log, logCount] = await Promise.all([store.getActiveMutes(now), store.getLog(0, 99), store.countLog()]);
	const uids = [...new Set(mutes.flatMap(m => [m.uid, m.by]).concat(log.flatMap(l => [l.uid, l.by])).filter(Boolean))];
	const users = await user.getUsersFields(uids, ['uid', 'username', 'userslug']);
	const byUid = new Map(users.map(u => [String(u.uid), u]));
	const who = uid => byUid.get(String(uid)) || { username: '?', userslug: '' };
	res.render('admin/plugins/shoutbox', {
		title: 'Shoutbox',
		limits: rules.LIMITS,
		mutes: mutes.map(m => ({
			uid: m.uid,
			user: who(m.uid),
			by: who(m.by),
			reason: format.escapeHtml(m.reason || ''),
			permanent: parseInt(m.until, 10) === 0,
			untilISO: parseInt(m.until, 10) ? new Date(parseInt(m.until, 10)).toISOString() : '',
			duration: m.duration,
		})),
		log: log.map(l => ({
			action: l.action,
			isMute: l.action === 'mute',
			isUnmute: l.action === 'unmute',
			isDelete: l.action === 'delete',
			user: who(l.uid),
			by: who(l.by),
			reason: format.escapeHtml(l.reason || ''),
			duration: format.escapeHtml(l.duration || ''),
			atISO: new Date(parseInt(l.at, 10)).toISOString(),
		})),
		logCount,
	});
}

plugin.addAdminNavigation = async function (header) {
	header.plugins.push({ route: '/plugins/shoutbox', icon: 'fa-comments', name: 'Shoutbox' });
	return header;
};

// ---------------------------------------------------------------- widget

plugin.defineWidgets = async function (widgets) {
	widgets.push({
		widget: 'shoutbox',
		name: 'Shoutbox',
		description: 'Latest shoutbox messages; opens the live dock.',
		content: '<p class="form-text">[[shoutbox:widget.acp-help]]</p>',
	});
	return widgets;
};

plugin.renderWidget = async function (widget) {
	const uid = parseInt(widget.uid, 10) || 0;
	const actor = await getActor(uid);
	if (!actor.canRead) {
		widget.html = '';
		return widget;
	}
	const msgs = await store.getRecent(3);
	const messages = await serialize(msgs, uid);
	const html = await widget.req.app.renderAsync('widgets/shoutbox', {
		messages,
		titleHtml: settings.title ? format.escapeHtml(settings.title).replace(/\[/g, '&lsqb;').replace(/\]/g, '&rsqb;') : '',
		config: { relative_path: nconf.get('relative_path') || '' },
	});
	const locals = (widget.res && widget.res.locals && widget.res.locals.config) || {};
	widget.html = await translator.translate(html, locals.userLang || meta.config.defaultLang || 'en-GB');
	return widget;
};

/** Puts the collapsed state of the widget on <html> before the first paint (lib/collapse.js). */
plugin.addHeadScript = async function (data) {
	collapse.injectHeadScript(data.templateData);
	return data;
};

// ---------------------------------------------------------------- start

plugin.init = async function ({ router }) {
	routeHelpers.setupAdminPageRoute(router, '/admin/plugins/shoutbox', [], renderAdmin);
	await loadSettings();
	pubsub.on(`action:settings.set.${SETTINGS_KEY}`, () => loadSettings().catch(err => winston.warn(`[shoutbox] settings: ${err.message}`)));
	await ensureDefaultPrivileges();

	SocketPlugins.shoutbox = api;
	SocketAdmin.plugins = SocketAdmin.plugins || {};
	SocketAdmin.plugins.shoutbox = {
		unmute: async (socket, data) => unmute(socket.uid, data && data.uid),
	};

	const tick = () => {
		const now = Date.now();
		Promise.all([store.prune(now), store.pruneMutes(now)]).catch(err => winston.warn(`[shoutbox] prune: ${err.message}`));
	};
	if (nconf.get('isPrimary')) {
		setTimeout(tick, 30 * 1000).unref();
		setInterval(tick, PRUNE_EVERY).unref();
	}
};

/** Internal functions exposed for tests only; not a public API. */
plugin._test = { state, getSettings: () => settings };
