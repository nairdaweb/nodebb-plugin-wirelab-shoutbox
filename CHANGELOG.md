# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

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

[1.0.0]: https://github.com/nairdaweb/nodebb-plugin-wirelab-shoutbox/releases/tag/v1.0.0
