# Codex

The agent can run on Codex with your ChatGPT plan or an existing Codex CLI login. Manage Codex in
**Settings → Agents**; for a remote environment, select it first.

## Connect with ChatGPT

Choose **Continue with ChatGPT** on the Codex provider, or add a Codex instance with **Add
provider**. The app installs Codex if needed; sign in on OpenAI's page and allow sharing of your
ChatGPT plan. Once connected, the **ChatGPT account** row offers **Change account** and
**Disconnect**. Disconnecting keeps your chats, and you can reconnect later.

When reconnecting, choose the same account in the app and on OpenAI's sign-in page. If sign-in on a
remote environment does not return to the app, paste the full URL of the final localhost page into
the sign-in panel, even if that page did not load.

## Use an existing Codex login

The app can use an installed Codex and its login. Run `codex login` on the environment's machine.
If Codex is not on the server's `PATH`, set the instance's **Binary path**.

## Use several accounts

Add another ChatGPT account with **Add provider → Codex → Continue with ChatGPT**. Each account gets
its own Codex instance and sign-in; connecting accounts in the app leaves your CLI login unchanged.
Pick the instance in the agent's model picker. Switching a chat to another instance starts a fresh
conversation with it: earlier messages stay visible, but the new instance does not see them.

For several CLI logins, sign the second account into its own directory on the environment's
machine:

```bash
mkdir -p ~/.codex_personal
CODEX_HOME=~/.codex_personal codex login
```

Then add a second Codex instance. Either point its **CODEX_HOME path** at the new directory for a
fully separate setup, or keep **CODEX_HOME path** at `~/.codex` and set **Shadow home path** to
`~/.codex_personal` so both accounts share one Codex configuration while keeping their own login.
The shadow directory needs its own `auth.json`; if Codex uses an OS credential store, switch it to
file storage (see [OpenAI's credential storage guide](https://learn.chatgpt.com/docs/auth#credential-storage)).
Do not fill the shadow directory by copying your whole Codex home.

## Approvals

When the agent needs your approval, Codex's request appears in the chat on web, desktop, and
mobile. Some requests offer access for one request or for the rest of the session. See
[permission modes](./permission-modes.md).
