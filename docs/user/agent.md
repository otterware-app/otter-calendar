# The assistant

The assistant is a chat built into the app. It runs on your own Claude or Codex subscription, on
the environment that holds your data, and works on that data with the app's own actions: the
same actions its buttons perform, so anything it changes shows up everywhere at once.

## Start

Set up a provider first ([install](./install.md#the-assistant)). Then open the assistant panel
with **Mod+I** (or the sidebar), or start a new chat with **Mod+Shift+O**. On the phone, open
**Agent** from the home screen. Chats are saved on the environment, so a chat started on one
device continues on another.

## What it knows

The assistant sees what you are looking at: the app tells it which days are on screen, your time
zone, and the event you opened, so "move this to Friday afternoon" or "what else is on that day?"
works without copying anything. It does not see the rest of your screen.

It can list your accounts and calendars, list and search events across every account, read an
event, create, move, resize, change and delete events (asking which occurrences for repeating
ones), answer invitations, and find free time across all your calendars.

## While it works

Each tool it uses appears as a step, such as "Created event", while it works. When it finishes,
the steps fold behind **Worked for …** and the answer stays visible; open the fold to see what it
did. Send another message while it works to steer it, if the provider supports that, or press
**Stop**.

When it needs your approval, the chat shows the request with **Allow once**, **Allow for
session**, or **Deny**. What needs approval depends on the chat's
[permission mode](./permission-modes.md).

## Model and provider

Choose the model next to the composer. Hidden models and favorites follow **Settings → Agents**.
Moving a chat to another provider starts a fresh conversation with that provider: earlier
messages stay visible, but the new provider does not see them.
