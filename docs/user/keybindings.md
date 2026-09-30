# Keyboard shortcuts

Customize shortcuts in **Settings → Keybindings** on web and desktop. That page lists every
command with its current shortcut. `mod` means Command on macOS and Ctrl elsewhere.

| Command                 | Default           | What it does                                |
| ----------------------- | ----------------- | ------------------------------------------- |
| `commandPalette.toggle` | `mod+k`           | Open the command palette                    |
| `sidebar.toggle`        | `mod+b`           | Show or hide the sidebar                    |
| `navigation.back`       | `mod+[`           | Go back to the previous page                |
| `navigation.forward`    | `mod+]`           | Go forward again                            |
| `agent.toggle`          | `mod+i`           | Show or hide the agent panel                |
| `agent.new`             | `mod+shift+o`     | Start a new agent chat                      |
| `notes.new`             | `mod+n`           | Create a note (not while typing in a field) |
| `theme.select`          | `mod+alt+a`       | Choose a theme                              |
| `appearance.cycle`      | `mod+alt+shift+a` | Cycle between system, light, and dark       |
| `themeEditor.toggle`    | `mod+alt+shift+t` | Open or close the theme editor              |

The command palette searches actions, agent chats, notes, and settings pages.

## Sending messages

**Settings → General → Send messages with** chooses whether Enter sends, `mod+Enter` is required
for multiline prompts, or `mod+Enter` always sends. Shift+Enter inserts a new line.

## Edit the configuration file

Shortcuts live on the environment's machine, in `~/.otter-scaffold/userdata/keybindings.json`
(or `userdata/keybindings.json` under a custom home). You can edit the file directly. It is a JSON
array of rules:

```json
[
  { "key": "mod+j", "command": "agent.toggle" },
  { "key": "mod+shift+n", "command": "notes.new", "when": "!editableFocus" }
]
```

The app creates the file with its defaults and adds new defaults on later starts. A new default is
skipped when one of your rules already uses the same shortcut. Invalid rules are ignored; if the
file cannot be parsed, the defaults apply.

Each rule needs a `key` and a `command`. Join modifiers and a key with `+`, such as `mod+shift+d`.
Modifiers are `mod`, `cmd` / `meta`, `ctrl` / `control`, `alt` / `option`, and `shift`.

## When conditions

An optional `when` expression restricts where a rule runs. The available keys are
`editableFocus` (a text field has the keyboard), `isWeb` (a browser tab), and `isDesktop` (the
desktop app). Unknown keys are false. Combine them with `!`, `&&`, `||`, and parentheses.

When several rules match the same keys, the last one in the file wins, even if it belongs to a
different command. Put a more specific rule after a general one.

## Quitting the desktop app

`Cmd+Q` on macOS or `Ctrl+Q` on Linux quits. In the default **Hold** mode, hold the keys for about a
second or press them twice quickly. **Settings → General → Quit confirmation** also offers
**Direct** (a single press) and **Double press**. **Quit** in the application menu always quits
immediately.
