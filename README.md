# nodebb-plugin-wirelab-shoutbox

A small live chat ("shoutbox") for **NodeBB 4**. It runs over the NodeBB websocket, keeps its data
in the NodeBB database and ships with two views:

- a **dock** on every page: a button in the bottom-right corner opens a chat panel; on phones the
  panel is a bottom sheet;
- a **widget** with the three latest messages and a button that opens the dock (put it in any
  widget area, e.g. the sidebar of the categories page).

The interface name is "Live" (Polish: "Na żywo"). English (en-GB) and Polish translations are included.

## Install

```sh
npm install nodebb-plugin-wirelab-shoutbox
./nodebb activate nodebb-plugin-wirelab-shoutbox
./nodebb build
```

On first start the plugin grants its default privileges once (see below). Settings, active mutes and
the moderation log are under **ACP → Plugins → Shoutbox**.

## Privileges

Three global privileges (ACP → Privileges → Global):

| Privilege | Default |
|---|---|
| `shoutbox:read` | guests, registered users, Global Moderators |
| `shoutbox:write` | registered users, Global Moderators |
| `shoutbox:moderate` | Global Moderators |

Administrators and global moderators can always moderate.

## Rules

- 300 characters and 6 lines per message; 50 messages on open, older ones on demand.
- Messages are kept for 7 days or up to 2000 messages, whichever is reached first.
- Writing also requires (configurable in the ACP): a confirmed email address, an account at least
  24 hours old and at least 1 forum post. Moderators skip these checks.
- Links are allowed from rank level 2 of
  [nodebb-plugin-rank-badges](https://github.com/nairdaweb/nodebb-plugin-rank-badges)
  ("Apprentice" in the default ladder). Without that plugin, from 5 posts. Bare domains such as
  `example.com` count as links.
- Rate limit per user: 5 messages per 20 seconds and at least 2 seconds between messages
  (configurable). The counter is kept in memory, per NodeBB process.
- Moderators can delete any message and mute a user for 15 minutes, 1 hour, 24 hours or permanently.
  A reason is required; it is shown in the chat and kept in the moderation log. Users can delete
  their own messages.

## Content

Messages are stored as plain text and rendered to HTML on the server. Everything is escaped; the
only markup added is inline Markdown (`**bold**`, `*italic*` / `_italic_`, `~~strike~~`,
`` `code` ``), http(s) autolinks (`rel="nofollow ugc noopener noreferrer"`), `@mentions` of existing
users and line breaks. No HTML from users reaches the page. Emoji (`:smile:`) are rendered by
nodebb-plugin-emoji when it is active; its picker is used in the composer.

A mention sends a regular NodeBB "mention" notification to users who can read the shoutbox.

## Accessibility

The message list is a `role="log"` live region. The dock is a dialog: `Esc` closes it and returns
focus to the button that opened it; on phones the bottom sheet is modal and keeps focus inside.
`Enter` sends, `Shift+Enter` adds a line; the mention list works with the arrow keys, `Enter` and
`Tab`. Reduced motion is respected.

## Data

Keys in the NodeBB database (Redis, PostgreSQL or MongoDB):

| Key | Content |
|---|---|
| `shoutbox:messages` | sorted set of message ids by time |
| `shoutbox:message:<mid>` | message (`uid`, `content`, `timestamp`, `deleted`) |
| `shoutbox:mutes`, `shoutbox:mute:<uid>` | active mutes |
| `shoutbox:log`, `shoutbox:log:<id>` | moderation log (last 5000 entries) |

## Socket API

`plugins.shoutbox.init`, `.send`, `.loadMore`, `.delete`, `.mute`, `.unmute`, `.searchUsers`.
Events sent to clients: `event:shoutbox.message`, `.deleted`, `.muted`, `.unmuted`, `.refresh`.

## Development

```sh
npm install
npm test     # node --test: limits, privileges, mutes, rate limit, sanitising
npm run lint
```

## License

MIT © nairda
