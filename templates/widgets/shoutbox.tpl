<section class="sb-widget card" data-sb-widget aria-labelledby="sb-widget-title">
	<header class="sb-widget__head">
		<i class="fa-regular fa-comment sb-widget__icon" aria-hidden="true"></i>
		<h2 class="sb-widget__title" id="sb-widget-title">{{{ if titleHtml }}}{{titleHtml}}{{{ else }}}[[shoutbox:widget.title]]{{{ end }}}</h2>
		<span class="sb-widget__online" data-sb-online></span>
		<button type="button" class="sb-widget__toggle" data-sb-collapse aria-expanded="true" aria-controls="sb-widget-body" data-label-collapse="[[shoutbox:widget.collapse]]" data-label-expand="[[shoutbox:widget.expand]]" title="[[shoutbox:widget.collapse]]">
			<span class="visually-hidden sb-widget__when-open">[[shoutbox:widget.collapse]]</span>
			<span class="visually-hidden sb-widget__when-closed">[[shoutbox:widget.expand]]</span>
			<i class="fa-solid fa-chevron-up sb-widget__chevron" aria-hidden="true"></i>
		</button>
	</header>
	<div class="sb-widget__body" id="sb-widget-body">
		<div class="sb-widget__inner">
			<ol class="sb-widget__list" data-sb-widget-list>
				<!-- IMPORT shoutbox/widget-items.tpl -->
			</ol>
			<p class="sb-widget__empty" data-sb-widget-empty{{{ if messages.length }}} hidden{{{ end }}}>[[shoutbox:widget.empty]]</p>
			<button type="button" class="btn btn-sm btn-primary sb-widget__open" data-sb-open aria-controls="sb-dock">[[shoutbox:open-short]] <i class="fa fa-arrow-right" aria-hidden="true"></i></button>
		</div>
	</div>
</section>
