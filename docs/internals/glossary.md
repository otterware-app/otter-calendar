# Glossary

Terms whose meaning matters across the app. Architecture and lifecycle constraints belong in the
[overview](./overview.md), not in these definitions.

## Environments and clients

| Term        | Meaning                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| Environment | One running server and the machine, credentials, data, and agent processes it owns.                    |
| Client      | A web, desktop, or mobile UI connected to one or more environments. The desktop can also host one.     |
| Home        | The base data directory (`~/<BRAND.homeDirName>`). Runtime state lives under its `userdata` directory. |
| Pairing     | Granting a client access to an environment with a one-time credential (link or QR code).               |
| T3 Connect  | Account-based remote access: Clerk identity, the relay, and a managed tunnel per linked environment.   |
| Relay       | The hosted control plane in `infra/relay`. It brokers credentials; it never proxies app traffic.       |

## Features

| Term     | Meaning                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------ |
| Feature  | A server service that owns a slice of data, with its RPC methods, stream, app tools and screens. |
| Snapshot | The first event of a subscription: the full state the client asked for.                          |
| App tool | A feature operation exposed to the agent over MCP, calling the same service as the RPC handler.  |

## Agent

| Term              | Meaning                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| Provider          | The agent runtime the app drives with the user's subscription: Claude (Agent SDK) or Codex (app-server).          |
| Driver            | The integration for a provider kind.                                                                              |
| Provider instance | One configured provider, with its own settings and account. Several instances can use the same driver.            |
| Adapter           | The boundary translating a provider's native protocol into turn items and runtime requests.                       |
| Session           | The provider process attached to an active thread. It can be released and resumed without losing the thread.      |
| Thread            | One agent conversation, persisted by the environment.                                                             |
| Turn              | One user-to-agent cycle within a thread.                                                                          |
| Turn item         | One element of a turn: the user's message, assistant text, reasoning, a tool call, an approval request, an error. |
| Runtime request   | An approval or question the provider is waiting on.                                                               |
| Runtime mode      | The thread's permission policy. See [permission modes](../user/permission-modes.md).                              |
| Step              | How clients present a tool-call item: one line with a title and a source, folded once the turn ends.              |
