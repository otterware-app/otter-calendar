# Claude

The agent can run on Claude Code, using its login and configuration on the environment's machine.
[Install](./install.md#the-assistant) covers installing and signing in. Manage Claude in
**Settings → Agents**; for a remote environment, select it first.

Each Claude instance has these settings:

| Setting                     | Use                                                                               |
| --------------------------- | --------------------------------------------------------------------------------- |
| **Binary path**             | The `claude` executable, if it is not on the server's `PATH`.                     |
| **CLAUDE_CONFIG_DIR path**  | A separate Claude configuration and login. Empty uses Claude Code's default.      |
| **Auto-compact after**      | When Claude summarizes a long conversation, see below.                            |
| **Launch arguments**        | Extra command-line arguments for Claude Code.                                     |
| **Environment → Variables** | Per-instance variables such as API keys and base URLs. Mark secrets as sensitive. |

## Separate accounts or configurations

Give each account its own Claude config directory. Keep your existing account in the default
directory and create the second login on the environment's machine:

```bash
mkdir -p ~/.claude_personal
CLAUDE_CONFIG_DIR=~/.claude_personal claude auth login
```

Then add another Claude instance with **Add provider** in **Settings → Agents**:

| Instance        | Binary path | CLAUDE_CONFIG_DIR path |
| --------------- | ----------- | ---------------------- |
| Claude Work     | `claude`    | Leave empty            |
| Claude Personal | `claude`    | `~/.claude_personal`   |

The config-directory setting changes `CLAUDE_CONFIG_DIR` and leaves `HOME` and the system keychain
alone, so use the same variable when you sign in. Setting `HOME` instead can put credentials where
the app will not find them. Check the account shown on the instance after signing in.

Pick the instance in the agent's model picker. Switching a chat to another instance starts a fresh
conversation with it: earlier messages stay visible, but the new instance does not see them.

## Compact long conversations

Set **Auto-compact after** to a number between `100000` and `1000000`. For example, `300000` asks
Claude to summarize at about 300,000 tokens. This changes when compaction happens, not the model's
context window. Leave it empty for Claude Code's default.

## OpenRouter

Create a Claude instance with its own config directory, such as `~/.claude_openrouter`, and keep
**Binary path** set to `claude`. Add these variables to that instance:

| Variable               | Value                                     |
| ---------------------- | ----------------------------------------- |
| `ANTHROPIC_BASE_URL`   | `https://openrouter.ai/api`               |
| `ANTHROPIC_AUTH_TOKEN` | Your OpenRouter API key, marked sensitive |
| `ANTHROPIC_API_KEY`    | An explicitly empty value                 |

If that config directory has a cached Anthropic login, run `/logout` in a Claude Code session that
uses the directory first; the cached login can conflict with the router token.

For an OpenRouter model outside the built-in list, add its full model ID with **Add custom model**
in the instance's **Models** section, then pick it in the agent's model picker.
`ANTHROPIC_DEFAULT_*_MODEL` variables map Claude Code aliases such as `sonnet`; they do not replace
the model you pick. Custom models can offer fewer effort or context controls than built-in ones.
For current requirements, see the
[OpenRouter Claude Code guide](https://openrouter.ai/docs/cookbook/coding-agents/claude-code-integration).

## Other routers

A local router works the same way: give the instance its own config directory and put the router's
endpoint and credential in its variables. The router must run where the environment can reach it.
See the [Claude Code Router instructions](https://github.com/musistudio/claude-code-router).
