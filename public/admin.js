'use strict';

/*
 * ACP page script (ACP → Plugins → Shoutbox): settings form and "unmute" buttons.
 */
define('admin/plugins/shoutbox', ['settings', 'alerts'], function (Settings, alerts) {
	const ACP = {};

	ACP.init = function () {
		const form = $('.shoutbox-settings');
		Settings.load('shoutbox', form);
		$('#save').on('click', function () {
			Settings.save('shoutbox', form);
		});

		$('[data-sb-unmute]').on('click', function () {
			const btn = $(this);
			socket.emit('admin.plugins.shoutbox.unmute', { uid: btn.attr('data-sb-unmute') }, function (err) {
				if (err) {
					return alerts.error(err);
				}
				btn.closest('tr').remove();
				alerts.success('[[shoutbox:acp.unmuted]]');
			});
		});
	};

	return ACP;
});
