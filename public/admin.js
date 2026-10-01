'use strict';

/*
 * ACP page script (ACP → Plugins → Shoutbox): settings form and "unmute" buttons.
 */
define('admin/plugins/shoutbox', ['settings', 'alerts'], function (Settings, alerts) {
	const ACP = {};

	/**
	 * "Check for updates" switch (lib/update-check.js): its own settings hash, saved when changed,
	 * independent of the main form and its Save button.
	 */
	function initUpdateCheck() {
		const updateForm = $('.wl-update-check');
		const updateHash = updateForm.attr('data-hash');
		if (!updateHash) {
			return;
		}
		Settings.load(updateHash, updateForm, function (err, values) {
			// deserialize() never unchecks a box, so apply a saved "off" here
			if (!err && values) {
				updateForm.find('[name="checkUpdates"]').prop('checked', !['off', 'false', '0'].includes(String(values.checkUpdates)));
			}
		});
		updateForm.on('change', 'input', function () {
			Settings.save(updateHash, updateForm, function (err) {
				if (err) {
					alerts.error(err);
				} else {
					alerts.success('[[shoutbox:update.saved]]');
				}
			});
		});
	}

	ACP.init = function () {
		initUpdateCheck();
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
