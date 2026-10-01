'use strict';

/*
 * Collapsible widget: the state lives in the browser (localStorage) as a class on <html>.
 *
 * The class has to be there before the first paint, otherwise the sidebar column would show
 * for a moment and then disappear. The client bundle is loaded with `defer`, so a tiny inline
 * script goes into <head> instead (through the custom HTML slot every Harmony-based theme
 * prints there). public/shoutbox.js uses the same key and class name.
 */

const STORAGE_KEY = 'sb:widget-collapsed';
const HTML_CLASS = 'sb-collapsed';

// No square brackets: NodeBB runs the translator over the rendered page.
const HEAD_SCRIPT = '<script data-sb-collapse-init>try{if(localStorage.getItem(' +
	JSON.stringify(STORAGE_KEY) + ')==="1")document.documentElement.classList.add(' +
	JSON.stringify(HTML_CLASS) + ')}catch(e){}</script>';

/**
 * Adds the head script to the header template data (filter:middleware.renderHeader), keeping the
 * custom HTML from the ACP when it is enabled. Returns the same object.
 */
function injectHeadScript(templateData) {
	if (!templateData || typeof templateData !== 'object') return templateData;
	const custom = templateData.useCustomHTML && typeof templateData.customHTML === 'string' ? templateData.customHTML : '';
	if (custom.includes('data-sb-collapse-init')) return templateData;
	templateData.customHTML = HEAD_SCRIPT + custom;
	templateData.useCustomHTML = true;
	return templateData;
}

module.exports = { STORAGE_KEY, HTML_CLASS, HEAD_SCRIPT, injectHeadScript };
