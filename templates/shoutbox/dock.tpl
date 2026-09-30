<button type="button" class="sb-launcher" data-sb-launcher aria-controls="sb-dock" aria-expanded="false" aria-label="[[shoutbox:open]]" title="[[shoutbox:title]]">
	<i class="fa-regular fa-comments" aria-hidden="true"></i>
	<span class="sb-launcher__badge" data-sb-unread hidden></span>
</button>
<div class="sb-backdrop" data-sb-backdrop hidden></div>
<section class="sb-dock" id="sb-dock" role="dialog" aria-labelledby="sb-title" hidden>
	<div class="sb-dock__grip" aria-hidden="true"></div>
	<header class="sb-dock__head">
		<i class="fa-regular fa-comment sb-dock__icon" aria-hidden="true"></i>
		<h2 class="sb-dock__title" id="sb-title">[[shoutbox:title]]</h2>
		<span class="sb-dock__online" data-sb-online></span>
		<button type="button" class="sb-icon-btn" data-sb-close aria-label="[[shoutbox:close]]" title="[[shoutbox:close]]"><i class="fa fa-xmark" aria-hidden="true"></i></button>
	</header>
	<div class="sb-dock__scroll" data-sb-scroll>
		<button type="button" class="sb-more" data-sb-more hidden>[[shoutbox:load-more]]</button>
		<p class="sb-nomore" data-sb-nomore hidden>[[shoutbox:no-more]]</p>
		<ol class="sb-list" data-sb-list role="log" aria-live="polite" aria-relevant="additions" aria-label="[[shoutbox:messages]]"></ol>
		<p class="sb-empty" data-sb-empty hidden>[[shoutbox:empty]]</p>
	</div>
	<button type="button" class="sb-newpill" data-sb-newpill hidden>[[shoutbox:new-messages]] <i class="fa fa-arrow-down" aria-hidden="true"></i></button>
	<footer class="sb-dock__foot">
		<p class="sb-blocked" data-sb-blocked hidden></p>
		<form class="sb-form" data-sb-form hidden>
			<ul class="sb-mentions" id="sb-mentions" role="listbox" aria-label="[[shoutbox:mention-title]]" data-sb-mentions hidden></ul>
			<div class="sb-compose">
				<button type="button" class="sb-icon-btn" data-sb-emoji aria-label="[[shoutbox:emoji]]" title="[[shoutbox:emoji]]"><i class="fa-regular fa-face-smile" aria-hidden="true"></i></button>
				<label class="visually-hidden" for="sb-input">[[shoutbox:placeholder]]</label>
				<textarea id="sb-input" class="sb-input" data-sb-input rows="1" placeholder="[[shoutbox:placeholder]]" aria-describedby="sb-hint sb-count" aria-autocomplete="list" aria-controls="sb-mentions" autocomplete="off" spellcheck="true" enterkeyhint="send"></textarea>
				<button type="submit" class="sb-send" data-sb-send aria-label="[[shoutbox:send]]" title="[[shoutbox:send]]"><i class="fa fa-paper-plane" aria-hidden="true"></i></button>
			</div>
			<div class="sb-meta"><span id="sb-hint">[[shoutbox:hint]]</span><span id="sb-count" data-sb-count></span></div>
		</form>
	</footer>
</section>
