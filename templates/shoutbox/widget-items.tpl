{{{ each messages }}}
<li class="sb-wmsg" data-mid="{./mid}">
	<span class="sb-wmsg__avatar" aria-hidden="true">{{buildAvatar(./user, "24px", true)}}</span>
	<div class="sb-wmsg__body">
		<div class="sb-wmsg__head"><a href="{config.relative_path}/user/{./user.userslug}">{./user.displayname}</a> <time class="sb-msg__time" datetime="{./timestampISO}"></time></div>
		{{{ if ./deleted }}}<p class="sb-wmsg__text sb-msg__text--deleted">[[shoutbox:deleted]]</p>{{{ else }}}<div class="sb-wmsg__text">{{./html}}</div>{{{ end }}}
	</div>
</li>
{{{ end }}}
