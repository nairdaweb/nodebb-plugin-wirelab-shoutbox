'use strict';

/*
 * Shoutbox client: the dock (every page), the bottom sheet on phones and the widget.
 *
 * Talks to the server only over the NodeBB websocket (plugins.shoutbox.*). Messages arrive
 * as HTML already rendered and sanitised by the server (lib/format.js); this file never turns
 * user text into HTML itself (typed text goes to the server as plain text).
 *
 * Accessibility: the list is a role="log" live region, the dock is a dialog (modal only as a
 * bottom sheet on phones), Esc closes it and focus returns to the button that opened it,
 * the mention list is a listbox driven by the arrow keys.
 */
(function () {
	const PHONE = window.matchMedia('(max-width: 575.98px)');
	const GROUP_MS = 5 * 60 * 1000;
	const PAGE_SIZE = 50;
	const KEEP = 500;

	const S = {
		booted: false,
		state: null,
		messages: [],
		open: false,
		unread: 0,
		mentioned: false,
		opener: null,
		sending: false,
		loadingMore: false,
		mention: { items: [], index: -1, start: -1, timer: 0, seq: 0 },
	};
	let els = null;

	function emit(event, data) {
		return new Promise(function (resolve, reject) {
			window.socket.emit('plugins.shoutbox.' + event, data || {}, function (err, result) {
				if (err) reject(err); else resolve(result);
			});
		});
	}

	function rp() {
		return (window.config && config.relative_path) || '';
	}

	/** Translated HTML; arguments are HTML-escaped first. */
	function tr(key, args) {
		return new Promise(function (resolve) {
			require(['translator'], function (translator) {
				const safe = (args || []).map(function (a) { return translator.escapeHTML(String(a)); });
				translator.translate(translator.compile.apply(null, ['shoutbox:' + key].concat(safe)), function (text) {
					resolve(text);
				});
			});
		});
	}

	/** Translated plain text (for textContent and attributes). */
	function trText(key, args) {
		return tr(key, args).then(function (html) {
			return new DOMParser().parseFromString(html, 'text/html').body.textContent;
		});
	}

	/** Renders a template and translates it ([[shoutbox:…]] tokens), as a jQuery object. */
	function renderTpl(name, data) {
		return new Promise(function (resolve, reject) {
			require(['benchpress', 'translator'], function (Benchpress, translator) {
				Benchpress.render(name, data).then(function (html) {
					translator.translate(html, function (translated) {
						resolve($('<div>').html(translated).contents());
					});
				}).catch(reject);
			});
		});
	}

	/** NodeBB sends usernames HTML-escaped; this gives the plain text back (for textContent). */
	function decodeHtml(s) {
		return new DOMParser().parseFromString(String(s || ''), 'text/html').body.textContent;
	}

	function alertError(err) {
		require(['alerts'], function (alerts) { alerts.error(err); });
	}

	function myUid() {
		return (window.app && app.user && parseInt(app.user.uid, 10)) || 0;
	}

	// ------------------------------------------------------------ rendering

	function decorate(msg) {
		const st = S.state || {};
		const own = msg.uid === myUid();
		msg.mentionsMe = (msg.mentions || []).indexOf(myUid()) !== -1;
		msg.canReply = !!st.canWrite && !msg.deleted && !own;
		msg.canDelete = !msg.deleted && myUid() > 0 && (own || !!st.isModerator);
		msg.canMute = !!st.isModerator && !own && msg.uid > 0;
		msg.hasActions = msg.canReply || msg.canDelete || msg.canMute;
		return msg;
	}

	function renderMessages(messages) {
		return renderTpl('shoutbox/messages', { messages: messages.map(decorate), config: window.config });
	}

	function formatTime(ts) {
		try {
			return new Date(ts).toLocaleTimeString(config.userLang || undefined, { hour: '2-digit', minute: '2-digit' });
		} catch {
			return new Date(ts).toTimeString().slice(0, 5);
		}
	}

	function dayKey(ts) {
		const d = new Date(ts);
		return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
	}

	async function dayLabel(ts) {
		const today = dayKey(Date.now());
		const y = new Date();
		y.setDate(y.getDate() - 1);
		const yesterday = dayKey(y.getTime());
		const key = dayKey(ts);
		if (key === today) return trText('today');
		if (key === yesterday) return trText('yesterday');
		try {
			return new Date(ts).toLocaleDateString(config.userLang || undefined, { day: 'numeric', month: 'long' });
		} catch {
			return new Date(ts).toDateString();
		}
	}

	function fillTimes(root) {
		root.querySelectorAll('time.sb-msg__time').forEach(function (el) {
			const ts = Date.parse(el.getAttribute('datetime'));
			if (!isNaN(ts)) {
				el.textContent = formatTime(ts);
				el.title = new Date(ts).toLocaleString(config.userLang || undefined);
			}
		});
	}

	/** Day separators and "continued" messages (same author within 5 min, no separator between). */
	async function layoutList() {
		const list = els.list;
		// Labels are resolved first; the DOM is then rebuilt without awaiting, so two calls
		// running at once (two messages in a row) cannot interleave and double the separators.
		const labels = {};
		await Promise.all(Array.prototype.map.call(list.querySelectorAll('.sb-msg'), function (li) {
			const ts = parseInt(li.getAttribute('data-ts'), 10);
			const key = dayKey(ts);
			if (!labels[key]) labels[key] = dayLabel(ts).then(function (text) { labels[key] = text; });
			return labels[key];
		}));
		list.querySelectorAll('.sb-day').forEach(function (el) { el.remove(); });
		let prev = null;
		const items = Array.prototype.slice.call(list.querySelectorAll('.sb-msg'));
		for (const li of items) {
			const ts = parseInt(li.getAttribute('data-ts'), 10);
			const newDay = !prev || dayKey(ts) !== dayKey(parseInt(prev.getAttribute('data-ts'), 10));
			if (newDay) {
				const sep = document.createElement('li');
				sep.className = 'sb-day';
				sep.setAttribute('aria-hidden', 'true');
				sep.textContent = typeof labels[dayKey(ts)] === 'string' ? labels[dayKey(ts)] : '';
				li.parentNode.insertBefore(sep, li);
			}
			const cont = !newDay && prev && prev.classList.contains('sb-msg') &&
				prev.getAttribute('data-uid') === li.getAttribute('data-uid') &&
				ts - parseInt(prev.getAttribute('data-ts'), 10) < GROUP_MS;
			li.classList.toggle('sb-msg--cont', !!cont);
			prev = li;
		}
		els.empty.hidden = items.length > 0;
		fillTimes(list);
	}

	function nearBottom() {
		const sc = els.scroll;
		return sc.scrollHeight - sc.scrollTop - sc.clientHeight < 80;
	}

	function scrollToBottom() {
		els.scroll.scrollTop = els.scroll.scrollHeight;
		els.newpill.hidden = true;
	}

	/** Rendered messages minus those already in the list (an event racing a reload or a page). */
	function withoutShown($nodes) {
		return $nodes.filter(function () {
			return !this.matches || !this.matches('.sb-msg') ||
				!els.list.querySelector('.sb-msg[data-mid="' + this.getAttribute('data-mid') + '"]');
		});
	}

	async function appendMessages(messages, opts) {
		if (!messages.length) return;
		const stick = (opts && opts.forceBottom) || nearBottom();
		const html = await renderMessages(messages);
		$(els.list).append(withoutShown(html));
		await layoutList();
		if (stick) scrollToBottom(); else els.newpill.hidden = false;
	}

	async function prependMessages(messages) {
		if (!messages.length) return;
		const sc = els.scroll;
		const before = sc.scrollHeight;
		const html = await renderMessages(messages);
		$(els.list).prepend(withoutShown(html));
		await layoutList();
		sc.scrollTop += sc.scrollHeight - before;
	}

	function addSystemLine(text) {
		const li = document.createElement('li');
		li.className = 'sb-system';
		li.textContent = text;
		const stick = nearBottom();
		els.list.appendChild(li);
		if (stick) scrollToBottom();
	}

	// ------------------------------------------------------------ state

	async function applyState(st) {
		S.state = st;
		if (!els) return;
		// Custom name from the ACP (plain text), or the translated default from the template.
		els.title.textContent = st.title || els.defaultTitle;
		els.launcher.title = st.title || els.defaultTitle;
		els.form.hidden = !st.canWrite;
		els.blocked.hidden = !!st.canWrite;
		if (!st.canWrite) {
			let text;
			const r = st.blockReason;
			if (r === 'guest') text = await tr('block.guest', [rp()]);
			else if (r === 'muted' && st.mute && st.mute.permanent) text = await tr('block.muted-perm', [st.mute.reason]);
			else if (r === 'muted' && st.mute) text = await tr('block.muted', [new Date(st.mute.until).toLocaleString(config.userLang || undefined), st.mute.reason]);
			else if (r === 'age') text = await tr('block.age', [st.requirements.minAccountAgeHours]);
			else if (r === 'posts') text = await tr('block.posts', [st.requirements.minPosts]);
			else text = await tr('block.' + (r || 'no-privilege'));
			// Translations are ours; arguments were HTML-escaped in tr().
			els.blocked.innerHTML = text;
		}
		updateCounter();
	}

	function setOnline(n) {
		trText('online', [n]).then(function (text) {
			document.querySelectorAll('[data-sb-online]').forEach(function (el) {
				el.textContent = n ? text : '';
			});
		});
	}

	async function refreshState() {
		try {
			const data = await emit('init');
			await applyState(data.state);
			setOnline(data.online);
		} catch { /* offline: keep the old state */ }
	}

	// ------------------------------------------------------------ launcher badge

	async function updateBadge() {
		if (!els) return;
		const badge = els.unread;
		if (S.open || !S.unread) {
			badge.hidden = true;
			els.launcher.classList.remove('has-mention');
			els.launcher.setAttribute('aria-label', await trText('open'));
			return;
		}
		badge.hidden = false;
		badge.textContent = S.unread > 99 ? '99+' : String(S.unread);
		els.launcher.classList.toggle('has-mention', S.mentioned);
		const label = S.mentioned ? await trText('unread-mention') : await trText('unread', [S.unread]);
		els.launcher.setAttribute('aria-label', (await trText('open')) + '. ' + label);
	}

	// ------------------------------------------------------------ open / close

	function isSheet() {
		return PHONE.matches;
	}

	function openDock(opener) {
		if (!els || S.open) {
			if (els && S.open) focusComposer();
			return;
		}
		S.open = true;
		S.opener = opener || document.activeElement;
		els.dock.hidden = false;
		els.dock.classList.toggle('sb-dock--sheet', isSheet());
		els.dock.setAttribute('aria-modal', isSheet() ? 'true' : 'false');
		els.backdrop.hidden = !isSheet();
		document.documentElement.classList.toggle('sb-sheet-open', isSheet());
		els.launcher.setAttribute('aria-expanded', 'true');
		els.launcher.querySelector('i').className = 'fa-solid fa-xmark';
		document.querySelectorAll('[data-sb-open]').forEach(function (b) { b.setAttribute('aria-expanded', 'true'); });
		requestAnimationFrame(function () {
			els.dock.classList.add('is-open');
			scrollToBottom();
			focusComposer();
		});
		S.unread = 0;
		S.mentioned = false;
		updateBadge();
	}

	function focusComposer() {
		if (!els.form.hidden) els.input.focus({ preventScroll: true });
		else els.close.focus({ preventScroll: true });
	}

	function closeDock() {
		if (!S.open) return;
		S.open = false;
		closeMentions();
		els.dock.classList.remove('is-open');
		els.dock.hidden = true;
		els.backdrop.hidden = true;
		document.documentElement.classList.remove('sb-sheet-open');
		els.launcher.setAttribute('aria-expanded', 'false');
		els.launcher.querySelector('i').className = 'fa-regular fa-comments';
		document.querySelectorAll('[data-sb-open]').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
		const back = S.opener && document.body.contains(S.opener) ? S.opener : els.launcher;
		back.focus({ preventScroll: true });
		S.opener = null;
	}

	/** Keeps Tab inside the bottom sheet (modal on phones). */
	function trapFocus(ev) {
		if (ev.key !== 'Tab' || !isSheet()) return;
		const f = Array.prototype.filter.call(
			els.dock.querySelectorAll('button, [href], textarea, input, [tabindex]:not([tabindex="-1"])'),
			function (el) { return !el.disabled && el.offsetParent !== null; }
		);
		if (!f.length) return;
		const first = f[0];
		const last = f[f.length - 1];
		if (ev.shiftKey && document.activeElement === first) { last.focus(); ev.preventDefault(); }
		else if (!ev.shiftKey && document.activeElement === last) { first.focus(); ev.preventDefault(); }
	}

	// ------------------------------------------------------------ composer

	function charCount(text) {
		return Array.from(text).length;
	}

	function updateCounter() {
		if (!els || !S.state) return;
		const n = charCount(els.input.value);
		const max = S.state.maxLength;
		els.count.textContent = n + '/' + max;
		els.count.classList.toggle('is-over', n > max);
		els.send.disabled = !els.input.value.trim() || n > max || S.sending;
	}

	function autosize() {
		const ta = els.input;
		ta.style.height = 'auto';
		ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
	}

	async function send() {
		const text = els.input.value;
		if (!text.trim() || S.sending) return;
		S.sending = true;
		updateCounter();
		try {
			await emit('send', { content: text });
			els.input.value = '';
			autosize();
		} catch (err) {
			alertError(err);
		} finally {
			S.sending = false;
			updateCounter();
			els.input.focus({ preventScroll: true });
		}
	}

	function insertText(text) {
		const ta = els.input;
		const start = ta.selectionStart;
		const end = ta.selectionEnd;
		ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
		const pos = start + text.length;
		ta.setSelectionRange(pos, pos);
		ta.focus();
		autosize();
		updateCounter();
	}

	// ------------------------------------------------------------ @mentions

	function mentionQuery() {
		const ta = els.input;
		const before = ta.value.slice(0, ta.selectionStart);
		const m = before.match(/(^|[\s(])@([\p{L}\p{N}_.-]{1,30})$/u);
		if (!m) return null;
		return { query: m[2], start: ta.selectionStart - m[2].length - 1 };
	}

	function closeMentions() {
		if (!els) return;
		els.mentions.hidden = true;
		els.mentions.innerHTML = '';
		els.input.removeAttribute('aria-activedescendant');
		S.mention.items = [];
		S.mention.index = -1;
	}

	function highlightMention(i) {
		const opts = els.mentions.querySelectorAll('[role="option"]');
		if (!opts.length) return;
		S.mention.index = (i + opts.length) % opts.length;
		opts.forEach(function (o, k) {
			o.setAttribute('aria-selected', k === S.mention.index ? 'true' : 'false');
		});
		els.input.setAttribute('aria-activedescendant', opts[S.mention.index].id);
	}

	function pickMention(i) {
		const u = S.mention.items[i];
		if (!u) return;
		const ta = els.input;
		const end = ta.selectionStart;
		ta.setSelectionRange(S.mention.start, end);
		insertText('@' + u.userslug + ' ');
		closeMentions();
	}

	async function showMentions(users) {
		S.mention.items = users;
		if (!users.length) { closeMentions(); return; }
		const title = await trText('mention-title');
		const ul = els.mentions;
		ul.innerHTML = '';
		const head = document.createElement('li');
		head.className = 'sb-mentions__head';
		head.setAttribute('role', 'presentation');
		head.textContent = title;
		ul.appendChild(head);
		users.forEach(function (u, i) {
			const li = document.createElement('li');
			li.id = 'sb-mention-' + i;
			li.setAttribute('role', 'option');
			li.setAttribute('aria-selected', 'false');
			li.className = 'sb-mentions__opt';
			const name = document.createElement('span');
			name.className = 'sb-mentions__name';
			name.textContent = decodeHtml(u.displayname || u.username);
			const slug = document.createElement('span');
			slug.className = 'sb-mentions__slug';
			slug.textContent = '@' + u.userslug;
			li.appendChild(name);
			li.appendChild(slug);
			li.addEventListener('mousedown', function (ev) { ev.preventDefault(); pickMention(i); });
			ul.appendChild(li);
		});
		ul.hidden = false;
		highlightMention(0);
	}

	function onMentionInput() {
		clearTimeout(S.mention.timer);
		const q = mentionQuery();
		if (!q) {
			S.mention.seq += 1; // drop a search still in flight
			closeMentions();
			return;
		}
		S.mention.start = q.start;
		const seq = ++S.mention.seq;
		S.mention.timer = setTimeout(function () {
			emit('searchUsers', { query: q.query }).then(function (users) {
				if (seq === S.mention.seq) showMentions(users || []);
			}).catch(closeMentions);
		}, 180);
	}

	// ------------------------------------------------------------ actions

	function messageOf(el) {
		const li = el.closest('.sb-msg');
		if (!li) return null;
		return { li: li, mid: parseInt(li.getAttribute('data-mid'), 10), uid: parseInt(li.getAttribute('data-uid'), 10), username: li.getAttribute('data-username') };
	}

	async function onAction(btn) {
		const m = messageOf(btn);
		if (!m) return;
		const act = btn.getAttribute('data-sb-act');
		if (act === 'reply') {
			insertText('@' + (m.li.getAttribute('data-userslug') || m.username) + ' ');
		} else if (act === 'delete') {
			const question = await tr('delete-confirm');
			require(['bootbox'], function (bootbox) {
				bootbox.confirm(question, function (ok) {
					if (ok) emit('delete', { mid: m.mid }).catch(alertError);
				});
			});
		} else if (act === 'mute') {
			muteDialog(m);
		}
	}

	async function muteDialog(m) {
		const t = await Promise.all([
			trText('mute-title', [m.username]), trText('mute-duration'), trText('mute-reason'), trText('mute-reason-placeholder'),
			trText('duration.15m'), trText('duration.1h'), trText('duration.24h'), trText('duration.perm'), trText('mute'), trText('cancel'),
		]);
		const wrap = document.createElement('div');
		const fs = document.createElement('fieldset');
		fs.className = 'mb-3';
		const legend = document.createElement('legend');
		legend.className = 'form-label fs-6';
		legend.textContent = t[1];
		fs.appendChild(legend);
		[['15m', t[4]], ['1h', t[5]], ['24h', t[6]], ['perm', t[7]]].forEach(function (d, i) {
			const div = document.createElement('div');
			div.className = 'form-check form-check-inline';
			const input = document.createElement('input');
			input.type = 'radio';
			input.name = 'sb-duration';
			input.id = 'sb-duration-' + d[0];
			input.value = d[0];
			input.className = 'form-check-input';
			if (i === 1) input.checked = true;
			const label = document.createElement('label');
			label.className = 'form-check-label';
			label.htmlFor = input.id;
			label.textContent = d[1];
			div.appendChild(input);
			div.appendChild(label);
			fs.appendChild(div);
		});
		wrap.appendChild(fs);
		const lab = document.createElement('label');
		lab.className = 'form-label';
		lab.htmlFor = 'sb-mute-reason';
		lab.textContent = t[2];
		const reason = document.createElement('input');
		reason.type = 'text';
		reason.id = 'sb-mute-reason';
		reason.className = 'form-control';
		reason.maxLength = 200;
		reason.required = true;
		reason.placeholder = t[3];
		wrap.appendChild(lab);
		wrap.appendChild(reason);

		const title = document.createElement('span');
		title.textContent = t[0];
		require(['bootbox'], function (bootbox) {
			const dialog = bootbox.dialog({
				title: title.outerHTML,
				message: wrap,
				onEscape: true,
				buttons: {
					cancel: { label: t[9], className: 'btn-light' },
					ok: {
						label: t[8],
						className: 'btn-danger',
						callback: function () {
							const checked = wrap.querySelector('input[name="sb-duration"]:checked');
							if (!reason.value.trim()) {
								reason.classList.add('is-invalid');
								reason.focus();
								return false;
							}
							emit('mute', { uid: m.uid, duration: checked ? checked.value : '1h', reason: reason.value })
								.catch(alertError);
						},
					},
				},
			});
			dialog.on('shown.bs.modal', function () { reason.focus(); });
		});
	}

	// ------------------------------------------------------------ widget

	async function renderWidgets() {
		const lists = document.querySelectorAll('[data-sb-widget-list]');
		if (!lists.length) return;
		const last = S.messages.slice(-3);
		const html = await renderTpl('shoutbox/widget-items', { messages: last, config: window.config });
		lists.forEach(function (ul) {
			$(ul).empty().append(html.clone());
			fillTimes(ul);
			const empty = ul.parentNode.querySelector('[data-sb-widget-empty]');
			if (empty) empty.hidden = last.length > 0;
		});
	}

	// ------------------------------------------------------------ socket events

	/** Keeps at most KEEP messages in memory and in the list; older ones can be loaded again. */
	function trimOld() {
		if (S.messages.length <= KEEP) return;
		const dropped = S.messages.splice(0, S.messages.length - KEEP);
		if (!els) return;
		dropped.forEach(function (x) {
			const li = els.list.querySelector('.sb-msg[data-mid="' + x.mid + '"]');
			if (li) li.remove();
		});
		els.more.hidden = false;
		els.nomore.hidden = true;
	}

	function onMessage(msg) {
		S.messages.push(msg);
		trimOld();
		appendMessages([msg], { forceBottom: msg.uid === myUid() });
		renderWidgets();
		if (!S.open && msg.uid !== myUid()) {
			S.unread += 1;
			if ((msg.mentions || []).indexOf(myUid()) !== -1) S.mentioned = true;
			updateBadge();
		}
	}

	async function onDeleted(data) {
		const m = S.messages.find(function (x) { return x.mid === data.mid; });
		if (m) {
			m.deleted = true;
			m.deletedByModerator = data.byModerator;
			m.html = '';
		}
		const li = els && els.list.querySelector('.sb-msg[data-mid="' + data.mid + '"]');
		if (li && m) {
			const html = await renderMessages([m]);
			$(li).replaceWith(html);
			await layoutList();
		}
		renderWidgets();
	}

	async function onMuted(data) {
		addSystemLine(await trText('muted-event', [decodeHtml(data.username), await trText('duration.' + data.duration), data.reason]));
	}

	async function onUnmuted(data) {
		addSystemLine(await trText('unmuted-event', [decodeHtml(data.username)]));
	}

	// ------------------------------------------------------------ boot

	async function buildDock() {
		const html = await renderTpl('shoutbox/dock', {});
		const holder = document.createElement('div');
		holder.className = 'sb-root';
		$(holder).append(html);
		document.body.appendChild(holder);
		const q = function (sel) { return holder.querySelector(sel); };
		els = {
			root: holder,
			launcher: q('[data-sb-launcher]'),
			unread: q('[data-sb-unread]'),
			backdrop: q('[data-sb-backdrop]'),
			dock: q('.sb-dock'),
			close: q('[data-sb-close]'),
			scroll: q('[data-sb-scroll]'),
			list: q('[data-sb-list]'),
			empty: q('[data-sb-empty]'),
			more: q('[data-sb-more]'),
			nomore: q('[data-sb-nomore]'),
			newpill: q('[data-sb-newpill]'),
			blocked: q('[data-sb-blocked]'),
			form: q('[data-sb-form]'),
			input: q('[data-sb-input]'),
			send: q('[data-sb-send]'),
			count: q('[data-sb-count]'),
			mentions: q('[data-sb-mentions]'),
			emoji: q('[data-sb-emoji]'),
			title: q('#sb-title'),
		};
		els.defaultTitle = els.title.textContent;

		els.launcher.addEventListener('click', function () {
			if (S.open) closeDock(); else openDock(els.launcher);
		});
		els.close.addEventListener('click', closeDock);
		els.backdrop.addEventListener('click', closeDock);
		els.newpill.addEventListener('click', scrollToBottom);
		els.scroll.addEventListener('scroll', function () {
			if (nearBottom()) els.newpill.hidden = true;
		}, { passive: true });
		els.more.addEventListener('click', loadMore);
		els.dock.addEventListener('keydown', function (ev) {
			if (ev.key === 'Escape') {
				if (!els.mentions.hidden) { closeMentions(); ev.stopPropagation(); return; }
				ev.stopPropagation();
				closeDock();
				return;
			}
			trapFocus(ev);
		});
		els.list.addEventListener('click', function (ev) {
			const btn = ev.target.closest('[data-sb-act]');
			if (btn) { onAction(btn); return; }
			// Touch: tap a message to show its actions.
			const li = ev.target.closest('.sb-msg');
			if (li && !ev.target.closest('a')) {
				els.list.querySelectorAll('.sb-msg.is-active').forEach(function (x) { if (x !== li) x.classList.remove('is-active'); });
				li.classList.toggle('is-active');
			}
		});

		els.form.addEventListener('submit', function (ev) { ev.preventDefault(); send(); });
		els.input.addEventListener('input', function () { autosize(); updateCounter(); onMentionInput(); });
		els.input.addEventListener('keydown', function (ev) {
			if (!els.mentions.hidden && S.mention.items.length) {
				if (ev.key === 'ArrowDown') { highlightMention(S.mention.index + 1); ev.preventDefault(); return; }
				if (ev.key === 'ArrowUp') { highlightMention(S.mention.index - 1); ev.preventDefault(); return; }
				if (ev.key === 'Enter' || ev.key === 'Tab') { pickMention(S.mention.index); ev.preventDefault(); return; }
			}
			if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
				ev.preventDefault();
				send();
			}
		});
		els.input.addEventListener('blur', function () { setTimeout(closeMentions, 150); });

		els.emoji.addEventListener('click', function () {
			require(['emoji-dialog'], function (dialog) {
				dialog.toggle(els.emoji, function (_, name) { insertText(':' + name + ': '); });
			}, function () { els.emoji.hidden = true; });
		});

		window.addEventListener('resize', function () {
			clearTimeout(S.resizeTimer);
			S.resizeTimer = setTimeout(syncOffset, 150);
		}, { passive: true });
		window.addEventListener('scroll', function () {
			clearTimeout(S.scrollTimer);
			S.scrollTimer = setTimeout(syncOffset, 200);
		}, { passive: true });

		PHONE.addEventListener('change', function () {
			if (!S.open) return;
			els.dock.classList.toggle('sb-dock--sheet', isSheet());
			els.dock.setAttribute('aria-modal', isSheet() ? 'true' : 'false');
			els.backdrop.hidden = !isSheet();
			document.documentElement.classList.toggle('sb-sheet-open', isSheet());
		});
	}

	async function loadMore() {
		if (S.loadingMore || !S.messages.length) return;
		S.loadingMore = true;
		try {
			const older = await emit('loadMore', { before: S.messages[0].mid });
			S.messages = older.concat(S.messages);
			await prependMessages(older);
			if (older.length < PAGE_SIZE) {
				els.more.hidden = true;
				els.nomore.hidden = false;
			}
		} catch (err) {
			alertError(err);
		} finally {
			S.loadingMore = false;
		}
	}

	async function load() {
		const data = await emit('init');
		if (!data.state.canRead) {
			if (els) els.root.hidden = true;
			return;
		}
		if (!els) await buildDock();
		els.root.hidden = false;
		S.messages = data.messages;
		$(els.list).empty();
		await applyState(data.state);
		await appendMessages(data.messages, { forceBottom: true });
		els.empty.hidden = data.messages.length > 0;
		els.more.hidden = data.messages.length < PAGE_SIZE;
		els.nomore.hidden = true;
		setOnline(data.online);
		renderWidgets();
	}

	/**
	 * Keeps the launcher and the dock above a bottom bar fixed by the theme (e.g. the Harmony
	 * mobile navigation bar), measured instead of hard-coded.
	 */
	function syncOffset() {
		if (!els) return;
		let offset = 0;
		document.querySelectorAll('[component="bottombar"], .navigator-mobile').forEach(function (bar) {
			if (!bar.offsetParent && getComputedStyle(bar).position !== 'fixed') return;
			const r = bar.getBoundingClientRect();
			if (r.height && r.bottom >= window.innerHeight - 2 && r.top < window.innerHeight) {
				offset = Math.max(offset, window.innerHeight - r.top);
			}
		});
		els.root.style.setProperty('--sb-offset', Math.round(offset) + 'px');
	}

	function checkOpenParam() {
		if (/[?&]shoutbox=open\b/.test(window.location.search)) openDock();
	}

	async function boot() {
		if (S.booted || !window.socket || !window.app) return;
		S.booted = true;
		try {
			await load();
		} catch {
			S.booted = false;
			return;
		}
		window.socket.on('event:shoutbox.message', onMessage);
		window.socket.on('event:shoutbox.deleted', onDeleted);
		window.socket.on('event:shoutbox.muted', onMuted);
		window.socket.on('event:shoutbox.unmuted', onUnmuted);
		window.socket.on('event:shoutbox.refresh', refreshState);
		checkOpenParam();
	}

	document.addEventListener('click', function (ev) {
		const btn = ev.target.closest && ev.target.closest('[data-sb-open]');
		if (!btn) return;
		ev.preventDefault();
		openDock(btn);
	});

	require(['hooks'], function (hooks) {
		hooks.on('action:app.load', boot);
		hooks.on('action:ajaxify.end', function () {
			if (!S.booted) { boot(); return; }
			renderWidgets();
			checkOpenParam();
			setTimeout(syncOffset, 300);
		});
		// After a reconnect the server forgot our room: join again and reload the list.
		hooks.on('action:reconnected', function () {
			if (S.booted) load().catch(function () {});
		});
	});
}());
