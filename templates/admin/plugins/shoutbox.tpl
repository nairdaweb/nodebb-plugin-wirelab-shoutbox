<!--
	ACP page of the shoutbox plugin (route in library.js). Settings are saved by
	NodeBB's settings module under the "shoutbox" hash (public/admin.js).
-->
<div class="acp-page-container">
	<!-- IMPORT admin/partials/settings/header.tpl -->

	{{{ if updateAvailable }}}
	<div class="alert alert-info" role="status">
		<span>{{tx("shoutbox:update.available", updateVersion)}}</span>
		{{{ if updateIsPrivate }}}
		<span>— {{tx("shoutbox:update.private")}}</span>
		{{{ else }}}{{{ if updateNotesUrl }}}
		<span>— <a href="{updateNotesUrl}" target="_blank" rel="noopener noreferrer">{{tx("shoutbox:update.notes")}}</a></span>
		{{{ end }}}{{{ end }}}
	</div>
	{{{ end }}}

	<div class="row m-0">
		<div id="spy-container" class="col-12 px-0 mb-4 d-flex flex-column gap-4" tabindex="0">
			<p class="text-muted mb-0">{{tx("shoutbox:acp.fixed", limits.maxLength, limits.initialCount, limits.retentionDays, limits.retentionMax)}}</p>
			<p class="text-muted mb-0">{{tx("shoutbox:acp.privileges")}}</p>

			<form role="form" class="shoutbox-settings">
				<h5 class="fw-bold">{{tx("shoutbox:acp.display")}}</h5>
				<div class="mb-4">
					<label class="form-label" for="sb-title">{{tx("shoutbox:acp.title")}}</label>
					<input type="text" maxlength="{limits.titleMaxLength}" class="form-control" id="sb-title" name="title" placeholder="{{tx("shoutbox:title")}}" aria-describedby="sb-title-help">
					<p class="form-text" id="sb-title-help">{{tx("shoutbox:acp.title-help")}}</p>
				</div>
				<h5 class="fw-bold">{{tx("shoutbox:acp.settings")}}</h5>
				<div class="form-check form-switch mb-3">
					<input type="checkbox" class="form-check-input" id="sb-require-email" name="requireEmail" checked>
					<label for="sb-require-email" class="form-check-label">{{tx("shoutbox:acp.require-email")}}</label>
				</div>
				<div class="row g-3 mb-3">
					<div class="col-12 col-md-6">
						<label class="form-label" for="sb-min-age">{{tx("shoutbox:acp.min-age")}}</label>
						<input type="number" min="0" step="1" class="form-control" id="sb-min-age" name="minAccountAgeHours" placeholder="24">
					</div>
					<div class="col-12 col-md-6">
						<label class="form-label" for="sb-min-posts">{{tx("shoutbox:acp.min-posts")}}</label>
						<input type="number" min="0" step="1" class="form-control" id="sb-min-posts" name="minPosts" placeholder="1">
					</div>
				</div>
				<h5 class="fw-bold">{{tx("shoutbox:acp.links")}}</h5>
				<div class="row g-3 mb-3">
					<div class="col-12 col-md-6">
						<label class="form-label" for="sb-link-rank">{{tx("shoutbox:acp.link-rank")}}</label>
						<input type="number" min="0" step="1" class="form-control" id="sb-link-rank" name="linkMinRankLevel" placeholder="2">
					</div>
					<div class="col-12 col-md-6">
						<label class="form-label" for="sb-link-posts">{{tx("shoutbox:acp.link-posts")}}</label>
						<input type="number" min="0" step="1" class="form-control" id="sb-link-posts" name="linkMinPosts" placeholder="5">
					</div>
				</div>
				<h5 class="fw-bold">{{tx("shoutbox:acp.rate")}}</h5>
				<div class="row g-3">
					<div class="col-12 col-md-4">
						<label class="form-label" for="sb-rate-burst">{{tx("shoutbox:acp.rate-burst")}}</label>
						<input type="number" min="1" step="1" class="form-control" id="sb-rate-burst" name="rateBurst" placeholder="5">
					</div>
					<div class="col-12 col-md-4">
						<label class="form-label" for="sb-rate-window">{{tx("shoutbox:acp.rate-window")}}</label>
						<input type="number" min="1" step="1" class="form-control" id="sb-rate-window" name="rateWindowSeconds" placeholder="20">
					</div>
					<div class="col-12 col-md-4">
						<label class="form-label" for="sb-rate-interval">{{tx("shoutbox:acp.rate-interval")}}</label>
						<input type="number" min="0" step="1" class="form-control" id="sb-rate-interval" name="rateMinIntervalSeconds" placeholder="2">
					</div>
				</div>
			</form>

			<section>
				<h5 class="fw-bold">{{tx("shoutbox:acp.mutes")}}</h5>
				{{{ if mutes.length }}}
				<div class="table-responsive">
					<table class="table table-sm align-middle">
						<thead><tr><th>{{tx("shoutbox:acp.user")}}</th><th>{{tx("shoutbox:acp.until")}}</th><th>{{tx("shoutbox:acp.reason")}}</th><th>{{tx("shoutbox:acp.by")}}</th><th></th></tr></thead>
						<tbody>
							{{{ each mutes }}}
							<tr data-uid="{./uid}">
								<td><a href="{config.relative_path}/user/{./user.userslug}" target="_blank">{./user.username}</a></td>
								<td>{{{ if ./permanent }}}{{tx("shoutbox:acp.permanent")}}{{{ else }}}<span class="timeago" title="{./untilISO}"></span> <small class="text-muted">{./untilISO}</small>{{{ end }}}</td>
								<td class="text-break">{./reason}</td>
								<td>{./by.username}</td>
								<td class="text-end"><button type="button" class="btn btn-sm btn-light" data-sb-unmute="{./uid}">{{tx("shoutbox:unmute")}}</button></td>
							</tr>
							{{{ end }}}
						</tbody>
					</table>
				</div>
				{{{ else }}}
				<p class="text-muted">{{tx("shoutbox:acp.no-mutes")}}</p>
				{{{ end }}}
			</section>

			<section>
				<h5 class="fw-bold">{{tx("shoutbox:acp.log")}}</h5>
				{{{ if log.length }}}
				<p class="text-muted small">{{tx("shoutbox:acp.log-count", logCount)}}</p>
				<div class="table-responsive">
					<table class="table table-sm align-middle">
						<thead><tr><th>{{tx("shoutbox:acp.when")}}</th><th>{{tx("shoutbox:acp.action")}}</th><th>{{tx("shoutbox:acp.user")}}</th><th>{{tx("shoutbox:acp.reason")}}</th><th>{{tx("shoutbox:acp.by")}}</th></tr></thead>
						<tbody>
							{{{ each log }}}
							<tr>
								<td class="text-nowrap"><small>{./atISO}</small></td>
								<td>{{{ if ./isMute }}}{{tx("shoutbox:acp.action.mute")}} <small class="text-muted">({./duration})</small>{{{ end }}}{{{ if ./isUnmute }}}{{tx("shoutbox:acp.action.unmute")}}{{{ end }}}{{{ if ./isDelete }}}{{tx("shoutbox:acp.action.delete")}}{{{ end }}}</td>
								<td><a href="{config.relative_path}/user/{./user.userslug}" target="_blank">{./user.username}</a></td>
								<td class="text-break">{./reason}</td>
								<td>{./by.username}</td>
							</tr>
							{{{ end }}}
						</tbody>
					</table>
				</div>
				{{{ else }}}
				<p class="text-muted">{{tx("shoutbox:acp.no-log")}}</p>
				{{{ end }}}
			</section>
		</div>
	</div>
	<!-- "Check for updates" (lib/update-check.js), own settings hash, saved on change by public/admin.js -->
	<div class="row m-0">
		<form role="form" class="wl-update-check col-12 px-0 mb-4 pt-3 border-top" data-hash="{updateSettingsHash}">
			<div class="form-check form-switch mb-1">
				<input type="checkbox" class="form-check-input" id="sb-check-updates" name="checkUpdates" checked aria-describedby="sb-check-updates-help">
				<label for="sb-check-updates" class="form-check-label">{{tx("shoutbox:update.check")}}</label>
			</div>
			<p class="form-text" id="sb-check-updates-help">{{tx("shoutbox:update.check-help")}}</p>
		</form>
	</div>
</div>
