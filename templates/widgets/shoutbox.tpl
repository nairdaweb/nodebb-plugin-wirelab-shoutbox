<section class="sb-widget card" aria-labelledby="sb-widget-title">
	<header class="sb-widget__head">
		<i class="fa-regular fa-comment sb-widget__icon" aria-hidden="true"></i>
		<h2 class="sb-widget__title" id="sb-widget-title">[[shoutbox:widget.title]]</h2>
		<span class="sb-widget__online" data-sb-online></span>
	</header>
	<ol class="sb-widget__list" data-sb-widget-list>
		<!-- IMPORT shoutbox/widget-items.tpl -->
	</ol>
	<p class="sb-widget__empty" data-sb-widget-empty{{{ if messages.length }}} hidden{{{ end }}}>[[shoutbox:widget.empty]]</p>
	<button type="button" class="btn btn-sm btn-primary sb-widget__open" data-sb-open aria-controls="sb-dock">[[shoutbox:open-short]] <i class="fa fa-arrow-right" aria-hidden="true"></i></button>
</section>
