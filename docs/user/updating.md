# Updating

The app you use and the environment it connects to can run on different machines and update
separately.

## The desktop app

The desktop app checks for updates in the background. When one is available, the update button in
the sidebar downloads it; press it again to restart into the new version. Running agent turns are
interrupted by the restart. **Settings → General → Update track** switches between **Stable** and
**Nightly**.

## Environments

When an environment runs an older version than your web or desktop app, **Settings → Connections**
offers to update it: on the **Version** row for this machine, on the environment's row, or with
**Update all**. What the action does depends on how the server runs:

| How the server runs  | What happens                                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Background service   | It downloads the matching version, restarts, and reconnects. A failed update rolls back to the previous version. |
| Inside a desktop app | There is no remote update; update the desktop app on that machine.                                               |
| Started by hand      | **Copy update command** copies a command to relaunch that version; stop the server and run it on the host.       |

On the host itself, run:

```sh
otter-calendar update <version>
```

It asks before restarting the background service; if you decline, run
`otter-calendar service restart` when you are ready. A server you started by hand keeps running;
stop it and start it again with your usual options, such as `--host` or `--tailscale-serve`.

Updating restarts the server. Chats, notes, and settings are kept, but turns the agent was working
on stop and show as interrupted. Send a new message to continue.

If a client and server are too far apart to talk to each other, the connection shows **Client not
supported** instead of connecting. Update the side the message names, then reconnect.

## Mobile

To update an environment from your phone, open **Settings → Environments** and select it. **Check
for updates** looks for the latest release on the environment's current channel, and **Update to**
installs it. Keep the app open while the environment restarts and reconnects. The same screen
refreshes provider status and updates providers that are behind. Both need a connected environment
and permission to manage it.

The mobile app itself updates from the App Store or Google Play. It can also download smaller
updates in the background and apply them the next time you leave the app. If it stays open for a
long time with an update waiting, it asks to install; **Later** keeps the update for the next time
you leave.
