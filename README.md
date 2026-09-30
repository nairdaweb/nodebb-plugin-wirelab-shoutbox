# nodebb-plugin-wirelab-shoutbox

[![npm](https://img.shields.io/npm/v/nodebb-plugin-wirelab-shoutbox.svg)](https://www.npmjs.com/package/nodebb-plugin-wirelab-shoutbox)
[![NodeBB](https://img.shields.io/badge/NodeBB-4.15%2B-1e4fd8.svg)](https://nodebb.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-e89350.svg)](LICENSE)

A small live chat ("shoutbox") for **NodeBB 4**: a dock on every page (a bottom sheet on phones) and
a widget, running over the NodeBB websocket, with global privileges, writing rules, mutes with a
moderation log and mentions with notifications.

![The shoutbox dock with message actions and a mute notice](https://raw.githubusercontent.com/nairdaweb/nodebb-plugin-wirelab-shoutbox/main/docs/screenshot-dock.png)
![The widget with the latest messages](https://raw.githubusercontent.com/nairdaweb/nodebb-plugin-wirelab-shoutbox/main/docs/screenshot-widget.png)
![The bottom sheet on a phone, dark theme](https://raw.githubusercontent.com/nairdaweb/nodebb-plugin-wirelab-shoutbox/main/docs/screenshot-mobile-dark.png)

*Screenshots in Polish, with a custom theme; the chat is called "Na żywo", the Polish default name.*

- **Author:** [nairda](https://wirelab.pl) · **Licence:** MIT
- **Source and issues:** [github.com/nairdaweb/nodebb-plugin-wirelab-shoutbox](https://github.com/nairdaweb/nodebb-plugin-wirelab-shoutbox)

## Features

- **Dock on every page:** a button in the bottom-right corner opens the chat panel; on phones the
  panel is a modal bottom sheet. The button shows the number of unread messages and marks mentions;
  it stays above a fixed bottom bar of the theme (e.g. Harmony's mobile navigation). Opening
  `/?shoutbox=open` opens the dock (used by mention notifications).
- **Widget** with the three latest messages and a button that opens the dock. Put it in any widget
  area (ACP → Extend → Widgets → *Shoutbox*), e.g. the sidebar of the categories page.
- **Live** over the NodeBB websocket: new messages, deletions, mutes and the number of users online
  arrive without reloading. 50 messages on open, older ones on demand.
- **Plain text with light formatting:** inline Markdown (`**bold**`, `*italic*` / `_italic_`,
  `~~strike~~`, `` `code` ``), http(s) autolinks, `@mentions` with a suggestion list and emoji
  (`:smile:` and a picker, through nodebb-plugin-emoji when it is active). No HTML from users
  reaches the page.
- **Mentions** send a regular NodeBB "mention" notification to users who can read the shoutbox.
- **Writing rules:** confirmed email address, account age and forum posts; links only from a rank
  level of [nodebb-plugin-rank-badges](https://github.com/nairdaweb/nodebb-plugin-rank-badges) or from
  a number of posts; rate limit. See [Writing rules](#writing-rules).
- **Moderation:** delete any message, mute a user for 15 minutes, 1 hour, 24 hours or permanently
  with a reason shown in the chat; active mutes and a moderation log in the ACP. Users can delete
  their own messages.
- **Rank badges (optional):** with nodebb-plugin-rank-badges active, badge images are shown next to
  names and its rank ladder can gate links. Nothing breaks without it.
- **Accessible:** the message list is a `role="log"` live region; the dock is a dialog (`Esc` closes it
  and returns focus to the button that opened it; the bottom sheet keeps focus inside); `Enter` sends,
  `Shift+Enter` adds a line; the mention list works with the arrow keys, `Enter` and `Tab`; reduced
  motion is respected.
- **Themeable:** colours come from Bootstrap variables, so light and dark mode follow the theme; every
  colour is a `--sb-*` CSS custom property.
- **No tables of its own:** messages, mutes and the log are kept in the NodeBB database (Redis,
  PostgreSQL or MongoDB); old messages are pruned automatically.
- **Translated:** en-GB and pl (other languages fall back to en-GB).

## Compatibility

- NodeBB `^4.15.0` (the ACP page uses the `{{tx()}}` template helper that core switched its admin
  templates to in 4.15), tested with NodeBB 4.16. NodeBB 3.x and older are not supported.
- Node.js 22 or newer.
- Optional: nodebb-plugin-emoji (emoji and picker), nodebb-plugin-rank-badges (badges and the link
  rule by rank).

## Installation

Install and activate it in **ACP → Extend → Plugins** (search for *wirelab-shoutbox*), or from the
command line:

```sh
cd /path/to/nodebb
npm install nodebb-plugin-wirelab-shoutbox
./nodebb activate nodebb-plugin-wirelab-shoutbox
./nodebb build
./nodebb restart
```

On first start the plugin grants its default privileges once (see [Privileges](#privileges)). Then
open **ACP → Plugins → Shoutbox**.

Uninstalling leaves the `shoutbox:*` keys and the `settings:shoutbox` hash in the database; they are
not used by anything else.

## Configuration

**ACP → Plugins → Shoutbox**

- *Chat name* — shown in the dock header, on the launcher button and in the widget. Empty (the
  default) uses the translated name: "Live" in English, "Na żywo" in Polish. A name typed here is
  plain text (at most 40 characters) and the same in every language.
- *Who can write* — require a confirmed email address (default on), minimum account age in hours
  (default 24), minimum forum posts (default 1).
- *Links* — minimum rank level when nodebb-plugin-rank-badges is active (default 2, the second rank
  of its ladder), minimum forum posts otherwise (default 5). `0` allows links for everyone.
- *Rate limit* — messages per window (default 5), window in seconds (default 20), minimum gap between
  two messages in seconds (default 2).
- *Active mutes* — with an "Unmute" button, also for deleted accounts.
- *Moderation log* — the latest 100 of up to 5000 entries: mutes, unmutes and messages deleted by a
  moderator (with an excerpt of the message).

Fixed limits: 300 characters and 6 lines per message; messages are kept for 7 days or up to 2000
messages, whichever is reached first; a mute reason has at most 200 characters.

### Writing rules

A user can write when all of these hold (checked on the server for every message):

1. they are signed in and have the `shoutbox:write` privilege;
2. they are not muted;
3. their email address is confirmed (if required);
4. their account is old enough and they have written enough forum posts.

Moderators (see below) skip rules 2–4 but still need the privilege. The dock tells a user who cannot
write why, e.g. "You can write 24 hours after signing up".

**Links** (including bare domains such as `example.com`, a common spam trick) are refused until the
user reaches the rank level set in the ACP when nodebb-plugin-rank-badges is active, or the number of
forum posts set in the ACP when it is not installed or not active. Moderators can always post links.

**Rate limit:** at most *N* messages per window and a minimum gap between two messages, per user. The
counter is kept in memory, per NodeBB process.

### Mutes

Moderators can mute a user from the message menu for 15 minutes, 1 hour, 24 hours or permanently. A
reason is required; it is shown to everyone in the chat and kept in the log. A muted user sees until
when and why. Moderators cannot mute themselves or another moderator. Expired mutes are removed
automatically; any mute can be lifted early in the ACP (*Active mutes*).

### Widget

ACP → Extend → Widgets → *Shoutbox*. It shows the three latest messages (live) and a button that
opens the dock, and renders nothing for users who cannot read the shoutbox.

## Privileges

Three global privileges (**ACP → Privileges → Global**):

| Privilege | Label | Granted on first start to |
|---|---|---|
| `shoutbox:read` | Shoutbox: read | guests, registered users, Global Moderators |
| `shoutbox:write` | Shoutbox: write | registered users, Global Moderators |
| `shoutbox:moderate` | Shoutbox: moderate | Global Moderators |

The defaults are granted once; after that the plugin never changes privileges, so you can take them
away (e.g. hide the shoutbox from guests). Administrators and global moderators can always read and
moderate. Users without `shoutbox:read` do not see the dock or the widget.

## Security notes

- Messages are stored as plain text and rendered to HTML on the server. Everything is escaped; the
  only markup added is inline formatting, line breaks, links to existing users for `@mentions` and
  http(s) links with `rel="nofollow ugc noopener noreferrer"`. Control characters, bidi overrides and
  zero-width characters are removed. The browser never turns typed text into HTML.
- Every socket call checks the privileges and rules again on the server; the client only hides
  controls. Mutes, deletions and the ACP unmute are logged with the moderator.
- The user search for mentions requires the forum's "search users" privilege and returns at most 6
  users.
- Mention notifications go only to users who can read the shoutbox.
- Mute reasons and log entries are escaped in the ACP.
- Badge images from nodebb-plugin-rank-badges are shown with `referrerpolicy="no-referrer"`.

## Translations

en-GB and pl are included; other languages fall back to en-GB. Strings live in
`languages/<code>/shoutbox.json`; pull requests with new languages are welcome. The default chat name
is the `title` / `widget.title` key; to change it in every language at once, use *Chat name* in the
ACP.

## For theme authors

Colours are CSS custom properties on `.sb-root` (dock) and `.sb-widget`:

```css
.sb-root, .sb-widget {
  --sb-bg: …; --sb-surface: …; --sb-ink: …; --sb-muted: …; --sb-line: …; --sb-tint: …;
  --sb-primary: …; --sb-on-primary: …; --sb-accent: …; --sb-accent-soft: …;
  --sb-launcher-bg: …; --sb-launcher-ink: …; --sb-shadow: …; --sb-radius: 16px;
}
```

By default they follow Bootstrap's variables (`--bs-body-bg`, `--bs-primary`, …), so light and dark
mode work with Harmony and other Bootstrap themes. The author's own theme defines `--wl-*` tokens,
which are read first when present; other themes can ignore them.

### Data

| Key | Content |
|---|---|
| `shoutbox:messages` | sorted set of message ids by time |
| `shoutbox:message:<mid>` | message (`uid`, `content`, `timestamp`, `deleted`, `deletedBy`) |
| `shoutbox:mutes`, `shoutbox:mute:<uid>` | active mutes |
| `shoutbox:log`, `shoutbox:log:<id>` | moderation log (last 5000 entries) |
| `settings:shoutbox` | ACP settings |

### Socket API

`plugins.shoutbox.init`, `.send`, `.loadMore`, `.delete`, `.mute`, `.unmute`, `.searchUsers`;
`admin.plugins.shoutbox.unmute`. Events sent to clients: `event:shoutbox.message`, `.deleted`,
`.muted`, `.unmuted`, `.refresh`.

## Development

```sh
npm install
npm test      # node:test — limits, writing rules, links, mutes, rate limit, sanitising, rendering
npm run lint  # eslint
```

`lib/rules.js` and `lib/format.js` hold the rules and rendering without NodeBB dependencies;
`lib/store.js` is the storage; `library.js` wires them into NodeBB hooks and the socket API.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT © [nairda](https://wirelab.pl), see [LICENSE](LICENSE).
