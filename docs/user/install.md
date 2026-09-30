# Install Otter Calendar

Otter Calendar keeps your data and runs its assistant on one computer, the environment, and lets
you use it from the desktop app, a browser, or your phone. Set up the machine that should hold
your data first; for most people that is the Mac running the desktop app.

## Desktop app (macOS)

Download the latest DMG from the repository's
[GitHub Releases](https://github.com/otterware-app/otter-calendar/releases) (Apple silicon). The
app bundles its own server and updates itself from the same page.

## Command line (server only)

On a machine that should run without the desktop app, such as a home server:

```bash
curl -fsSL https://raw.githubusercontent.com/otterware-app/otter-calendar/main/scripts/install.sh | sh
```

This puts `otter-calendar` in `~/.local/bin`. If your shell reports `command not found`, add that
directory to your `PATH`; the installer prints the line. Set `T3CODE_CHANNEL=nightly` for the
nightly train, or `T3CODE_VERSION` to pin a version. Release archives are built for Apple silicon
Macs; on other machines, run from source (see the repository README).

| Task                                             | Command                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| Start the server and open the web app            | `otter-calendar`                                                      |
| Start the server without a browser               | `otter-calendar serve`                                                |
| Keep it running in the background (macOS, Linux) | `otter-calendar service install` ([details](./background-service.md)) |
| Move to the newest release                       | `otter-calendar update`                                               |
| Remove it again                                  | `otter-calendar uninstall`                                            |

## Phone

The mobile app connects to an environment on another machine. Follow
[remote access](./remote-access.md) to link it with an account or a pairing link.

## The assistant

The assistant uses your own Claude or Codex subscription on the environment's machine. Open
**Settings → Agents**, pick the environment, and enable a provider:

| Provider | Install and sign in                                                                                                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude   | Install [Claude Code](https://claude.com/product/claude-code), then run `claude auth login`.                                                              |
| Codex    | [Connect with ChatGPT](./providers-codex.md#connect-with-chatgpt), or install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`. |

Provider CLIs must be on the server's `PATH`. If the app cannot find one, set its **Binary path**
in the provider's settings, especially when you use a version manager. When a CLI is behind its
latest release, its card shows the available version, and **Update now** appears when the app can
tell which installer owns it.

Add another provider instance for a separate account or configuration. Each instance can have
its own environment variables, such as API keys; mark secret values as sensitive.

## Next steps

- [Permission modes](./permission-modes.md): choose when the assistant asks before acting.
- [Remote access](./remote-access.md): connect from another device.
- [Running in the background](./background-service.md): keep a Linux or macOS host available.
- [Updating](./updating.md): update the app and connected servers.
