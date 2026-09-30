# Product usage data

Otter Calendar sends no usage data unless the environment is configured to. Product analytics are
off until `T3CODE_POSTHOG_KEY` is set in the server's environment; `T3CODE_POSTHOG_HOST` selects
the PostHog instance (the US cloud by default).

When a key is set, the server sends a small set of events: a startup heartbeat, client
connections (which app, version, and operating system connected, and how), and ChatGPT sign-in
attempts and their outcome. Events carry the app version and the server's platform, and are tied
to a hashed identifier: the connected Codex or Claude account ID when available, otherwise a random
ID stored with the environment's data. Events never include prompts, responses, note contents,
tokens, or conversation IDs. The clients send nothing themselves.

To turn collection off while a key is set, start the server with `T3CODE_TELEMETRY_ENABLED=false`.
