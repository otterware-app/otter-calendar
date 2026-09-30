# Permission modes

A permission mode decides when the agent needs your approval to act. On web and desktop, choose it
in the agent composer, next to the model; it applies to that chat and can be changed at any time.
New chats start in **Full access**. Mobile has no mode picker: chats started there use Full access,
and a mode chosen on web or desktop still applies when you continue the chat on your phone.

| Mode                  | Behavior                                                                          |
| --------------------- | --------------------------------------------------------------------------------- |
| **Supervised**        | Asks before commands, file changes, and app actions that change your data.        |
| **Auto-accept edits** | Approves file edits automatically; other commands can still ask.                  |
| **Auto**              | The provider's automatic review approves routine actions and asks about the rest. |
| **Full access**       | Runs commands, edits, and app actions without asking.                             |

When the agent waits for you, the chat shows the request with **Allow once**, **Allow for
session**, or **Deny**, depending on what the provider offers. A mode never stops the agent from
asking you a question about the task.

## App actions

The agent works on the app's data through the app's own tools, the same actions you take in the
app. Tools that only read, such as listing or searching notes, run without asking in every mode.
Tools that change data, such as creating, editing, or deleting a note, ask first in
**Supervised** and run freely in the other modes.

## Provider differences

Claude and Codex enforce these modes with their own permission systems, so the exact set of
actions that ask can differ between them. Both support all four modes. Codex in **Supervised** also
runs its commands in a read-only sandbox.

See the provider guides for [Claude](./providers-claude.md) and [Codex](./providers-codex.md).
