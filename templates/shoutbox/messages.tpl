{{{ each messages }}}
<li class="sb-msg{{{ if ./deleted }}} sb-msg--deleted{{{ end }}}{{{ if ./mentionsMe }}} sb-msg--me{{{ end }}}" data-mid="{./mid}" data-uid="{./uid}" data-ts="{./timestamp}" data-username="{./user.username}">
	<a class="sb-msg__avatar" href="{config.relative_path}/user/{./user.userslug}" tabindex="-1" aria-hidden="true">{{buildAvatar(./user, "28px", true)}}</a>
	<div class="sb-msg__body">
		<div class="sb-msg__head">
			<a class="sb-msg__name" href="{config.relative_path}/user/{./user.userslug}">{./user.displayname}</a>
			{{{ if ./user.badge }}}<img class="sb-msg__rank" src="{./user.badge.image}" alt="" width="16" height="16" loading="lazy" decoding="async" referrerpolicy="no-referrer">{{{ end }}}
			<time class="sb-msg__time" datetime="{./timestampISO}"></time>
		</div>
		{{{ if ./deleted }}}
		<p class="sb-msg__text sb-msg__text--deleted">{{{ if ./deletedByModerator }}}[[shoutbox:deleted-mod]]{{{ else }}}[[shoutbox:deleted]]{{{ end }}}</p>
		{{{ else }}}
		<div class="sb-msg__text">{{./html}}</div>
		{{{ end }}}
	</div>
	{{{ if ./hasActions }}}
	<div class="sb-msg__actions" role="group" aria-label="[[shoutbox:actions]]">
		{{{ if ./canReply }}}<button type="button" class="sb-act" data-sb-act="reply" title="[[shoutbox:reply]]" aria-label="[[shoutbox:reply]]: {./user.username}"><i class="fa fa-reply" aria-hidden="true"></i></button>{{{ end }}}
		{{{ if ./canMute }}}<button type="button" class="sb-act" data-sb-act="mute" title="[[shoutbox:mute]]" aria-label="[[shoutbox:mute]]: {./user.username}"><i class="fa fa-volume-xmark" aria-hidden="true"></i></button>{{{ end }}}
		{{{ if ./canDelete }}}<button type="button" class="sb-act sb-act--danger" data-sb-act="delete" title="[[shoutbox:delete]]" aria-label="[[shoutbox:delete]]"><i class="fa fa-trash-can" aria-hidden="true"></i></button>{{{ end }}}
	</div>
	{{{ end }}}
</li>
{{{ end }}}
