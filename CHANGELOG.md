# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [1.1.2] - 2026-10-01

### Security
- Use express-rate-limit for the request limits. The ACP page limit is unchanged (60 loads per
  minute per user) and now comes from `express-rate-limit` (new dependency), which replaces
  `lib/ratelimit.js`.

## [1.1.1] - 2026-10-01

### Security
- The ACP page (active mutes and moderation log) is limited to 60 loads per minute per user,
  counted in memory without new dependencies (`lib/ratelimit.js`); above that the answer is `429`
  with `Retry-After`. Finding reported by Snyk Code (CWE-770).

## [1.1.0] - 2026-10-01

### Added
- The widget can be collapsed (*Collapse chat* / *Show chat*). When it is the only widget in the
  sidebar, the sidebar column disappears on large screens and the page takes the full width, with a
  narrow tab to bring it back; next to other widgets and on phones it folds to one line.
- The state is remembered in `localStorage` and applied before the first paint by a small inline
  script in `<head>` (no layout jump); `aria-expanded` / `aria-controls`, reduced motion respected.
- en-GB and pl strings `widget.collapse`, `widget.expand`.

## [1.0.0] - 2026-10-01

First release. Requires NodeBB 4.15 or newer and Node.js 22 or newer.

### Added
- Dock on every page (a modal bottom sheet on phones) with unread counter, mention marker, "new
  messages" pill, older messages on demand and the number of users online; `/?shoutbox=open` opens it.
- Widget with the three latest messages and a button that opens the dock.
- Messages over the NodeBB websocket, stored in the NodeBB database (Redis, PostgreSQL, MongoDB);
  kept for 7 days or up to 2000 messages.
- Plain text with inline Markdown, http(s) autolinks, `@mentions` with suggestions and notifications,
  emoji through nodebb-plugin-emoji; everything rendered and escaped on the server.
- Global privileges `shoutbox:read`, `shoutbox:write`, `shoutbox:moderate`, granted once on first
  start to guests / registered users / Global Moderators.
- Writing rules configurable in the ACP: confirmed email, minimum account age, minimum forum posts,
  links from a rank level of nodebb-plugin-rank-badges or from a number of posts, rate limit.
- Moderation: delete messages, mute for 15 min, 1 h, 24 h or permanently with a reason; active mutes
  and a moderation log in the ACP.
- Configurable chat name (default: "Live" / "Na żywo" from the language files).
- Optional rank badge images next to names (nodebb-plugin-rank-badges).
- Accessible dock and mention list; reduced motion respected; colours as `--sb-*` custom properties.
- en-GB and pl translations.

[1.1.1]: https://github.com/nairdaweb/nodebb-plugin-wirelab-shoutbox/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/nairdaweb/nodebb-plugin-wirelab-shoutbox/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/nairdaweb/nodebb-plugin-wirelab-shoutbox/releases/tag/v1.0.0
