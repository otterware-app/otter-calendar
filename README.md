# Otter Calendar

The starting point for Otterware apps: a local-first server with web, desktop and mobile
clients, accounts and remote access through a relay, and an in-app agent that works with the
user's own Claude Code or Codex subscription and can use the app's tools.

It is [Otter Code](https://github.com/acme-acme-acme/otter-code) (our fork of
[T3 Code](https://github.com/pingdotgg/t3code)) with the coding-agent product removed and the
platform kept:

| Piece           | What you get                                                                                                                                 |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Server          | Effect server with typed WebSocket RPC, SQLite, auth and device pairing, settings, keybindings, themes, CLI, background service, self-update |
| Web             | React/Vite app shell: sidebar, command palette, keyboard shortcuts, themes, settings, pairing and sign-in                                    |
| Desktop         | Electron app that bundles the server; updates from GitHub Releases; SSH and LAN/Tailscale remote access                                      |
| Mobile          | Expo app for iOS and Android that pairs with any environment                                                                                 |
| Relay           | T3 Connect: Clerk accounts, environment linking, managed Cloudflare tunnels                                                                  |
| Agent           | Claude and Codex through T3's provider adapters, conversations persisted by the server, the app's tools served over MCP                      |
| Example feature | Notes, wired through every layer: contract, service, migration, RPC, agent tools, shared client state, web and mobile screens                |
| Releases        | GitHub Actions: signed and notarized macOS arm64 app with auto-update, relay deploy, EAS mobile builds                                       |

## Start a new app

```sh
git clone https://github.com/otterware-app/otter-scaffold.git otter-<name>
cd otter-<name>
node scripts/rebrand.ts --name "Otter <Name>" --slug otter-<name> \
  --app-id dev.otterware.<name> --scheme otter<name> \
  --repo otterware-app/otter-<name> --hosted-url https://<name>.otterware.dev
vp i
vp run dev
```

Then replace the Notes example with your own domain. [SCAFFOLD.md](SCAFFOLD.md) walks through
the rebrand, where each layer of a feature lives, the external setup (Clerk, relay, Apple
signing, EAS), and releases.

## Develop

You need Node 24 and [Vite+](https://viteplus.dev/guide/) (`curl -fsSL https://vite.plus | bash`),
plus Claude Code or Codex installed and signed in if you want to use the agent.

```sh
vp i              # install
vp run dev        # server + web; open the printed URL
vp run dev:desktop
cd apps/mobile && vp run dev:client  # after building a dev client; see apps/mobile/README.md
```

[AGENTS.md](AGENTS.md) has the conventions (read it before changing code, human or agent), and
[docs/](docs) has the architecture notes and runbooks.

## License

MIT, like T3 Code. See [LICENSE](LICENSE).
