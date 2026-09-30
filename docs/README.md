# Otter Calendar docs

## Using Otter Calendar

- [Install](./user/install.md)
- [The assistant](./user/agent.md)
- [Permission modes](./user/permission-modes.md)
- [Appearance and themes](./user/appearance.md)
- [Keyboard shortcuts](./user/keybindings.md)
- [Remote access](./user/remote-access.md)
- [Running in the background](./user/background-service.md)
- [Updating](./user/updating.md)
- [Product usage data](./user/telemetry.md)
- [Open source licenses](./user/open-source-licenses.md)
- Provider guides: [Claude](./user/providers-claude.md) · [Codex](./user/providers-codex.md)

---

## Working on Otter Calendar

Start with [SCAFFOLD.md](../SCAFFOLD.md) (identity, starting a new app, external setup), the
[development runbook](./operations/development.md), and the
[contribution guide](../CONTRIBUTING.md).

Internal notes preserve architectural decisions, constraints, and implementation traps that the
source alone does not explain. Most code changes do not need an internal documentation update.
Follow the [documentation rules](../AGENTS.md#documentation) before adding one.

- [Architecture overview](./internals/overview.md)
- [Glossary](./internals/glossary.md)
- [The in-app agent](./internals/agent.md)
- [Providers](./internals/providers.md)
- [Model manifest](./internals/model-manifest.md)
- [Connection runtime](./internals/connection-runtime.md)
- [Remote environments](./internals/remote.md)
- [Environment auth](./internals/environment-auth.md)
- [T3 Connect](./internals/t3-connect.md)
- [Server updates](./internals/server-updates.md)
- [Product analytics](./internals/product-analytics.md)
- [Open source license notices](./internals/open-source-licenses.md)
- [Mobile navigation](./internals/mobile-navigation.md)
- [Mobile development lifecycle](./internals/mobile-development.md)

### Runbooks

- [Development and local builds](./operations/development.md)
- [T3 Connect setup](./operations/connect-setup.md)
- [Release](./operations/release.md)
- [Observability](./operations/observability.md)
- [Relay observability](./operations/relay-observability.md)
