# Remote access

Use Otter Scaffold from a phone, a browser, or another computer while your data and the agent stay
on one machine, the environment. That machine must stay running and reachable while you work.

## T3 Connect

T3 Connect makes an environment reachable from your other devices through your account, without
router setup. The app shows it under the product's name, for example **Otter Scaffold Connect**.
It is available when the app was built with an account service configured.

In the desktop app on the host, open **Settings → Connections**, sign in, and switch on T3 Connect
for this machine. On a command-line host, run:

```bash
otter-scaffold connect
```

and follow the sign-in instructions. Over SSH, the CLI prints a link and a short code: open the
link on any device, check that the code matches, and approve. Setup then offers the
[background service](./background-service.md); if you decline, start the server with
`otter-scaffold serve`. Saving the sign-in alone does not make the machine reachable.

On your other devices, sign in to the same account and choose the environment. On mobile, sign in
under **Settings → Otter Scaffold Account**.

## Pair over a LAN or private network

Use direct pairing when the other device can reach the host's network address.

On a desktop host, open **Settings → Connections**, switch on **Network access** (the app restarts),
and choose **Create link** under **Authorized clients**. Pick an address the other device can
reach. A loopback address such as `127.0.0.1` only works on the host itself.

On a command-line host, start the server on its LAN or tailnet address:

```bash
otter-scaffold serve --host <private-ip>
```

For a server that is already running, print a fresh pairing link and QR code with:

```bash
otter-scaffold pair
```

On the other device, scan the QR code or open the link. To add it by hand, use **Settings →
Connections → Add environment** on web and desktop, or the **+** button in **Settings →
Environments** on mobile. Each link works once and expires (the CLI's after five minutes unless
you pass `--ttl`); the device stays paired afterwards. Links created in Settings can only be copied from the client that created them
while its Connections page stays open.

### Tailscale HTTPS

Join both devices to the same tailnet. In the desktop app, switch on **Tailscale HTTPS** in
**Settings → Connections**, and switch it off there to remove the route. On a command-line host,
start the server with `otter-scaffold serve --tailscale-serve`, or run
`otter-scaffold pair --tailscale` for a server that is already running. The link then uses an
address such as `https://machine.tailnet.ts.net/`.

The mapping created by `pair --tailscale` survives restarts. Remove it with
`tailscale serve --https=443 off`. If port 443 is taken, choose another with
`--tailscale-serve-port`.

### Hosted web app

The hosted web app at [scaffold.otterware.dev](https://scaffold.otterware.dev) connects directly to
your environment, so it needs an HTTPS address such as T3 Connect or Tailscale HTTPS. A plain HTTP
LAN address works from the pairing link the host prints, from the desktop app, or from the mobile
app. On mobile, an address typed without a scheme uses HTTP, so include `https://` for an HTTPS
server.

## Desktop-managed SSH

In the desktop app, open **Settings → Connections → Add environment**, choose **SSH**, and enter a
host or SSH alias such as `user@example.com`. The app starts or reuses a server there and forwards
its port. Your data, provider credentials, and agent work stay on the remote machine.

The remote host must be an Apple silicon Mac, the platform releases are built for, with `curl` or
`wget`, `tar`, and `shasum`, plus [a provider](./install.md#the-assistant). The first launch
downloads the matching server into `~/.otter-scaffold/runtime` on the host, so it takes longer than
later ones. Provider CLIs must be on the `PATH` of a non-interactive login shell there; check with:

```bash
ssh user@example.com 'sh -lc "command -v claude codex"'
```

Removing the connection stops a server the app launched; a server that was already running is left
alone.

## Manage or revoke access

On the host, the **Authorized clients** list in **Settings → Connections** shows pairing links and
paired devices. **Revoke** an unused link to stop new pairings, or a device to remove its access;
**Revoke others** removes every device but the one you are using. On a command-line host, see
`otter-scaffold auth --help`. A device with an open connection stays listed after its access
credential expires.

To remove an environment from your account, open the T3 Connect page in the account menu (on
mobile, in **Settings → Otter Scaffold Account**) and choose **Deregister**. This revokes its cloud
access and frees its slot even when the environment is offline or wiped. Removing an environment
from a device's connection list only forgets it on that device.

A linked environment's tunnel can be removed after it stays offline for several minutes. The
environment stays linked and keeps its address, and the host creates a replacement tunnel when it
starts or wakes again, so you do not need to pair again.

On a command-line host, `otter-scaffold connect unlink` turns off T3 Connect but keeps your sign-in;
`otter-scaffold connect logout` also clears the sign-in. The background service is managed
separately.

Treat pairing links and codes as passwords. Keep them out of screenshots, logs, and bug reports.

## T3 Connect troubleshooting

Run `otter-scaffold connect status` on the host to see the saved sign-in and link. It does not check
whether the host is reachable. If the environment shows as offline, run
`otter-scaffold service status` and read its log. If it disappears when SSH closes, see
[background service troubleshooting](./background-service.md#troubleshooting).

| Error                                                     | Recovery                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `environment_link_limit_exceeded` or managed tunnel limit | Deregister an unused environment, then restart the server on the host.                                                                      |
| `auth_invalid` or `invalid_bearer`                        | Run `otter-scaffold connect login`. If access was revoked, run `connect logout`, then `connect` again. Restart the server after signing in. |
| Expired or invalid link proof                             | Check the host's date and time, update the app, then restart it.                                                                            |
| HTTP 403 without a recognized error                       | Check proxies and firewall rules. Keep any Cloudflare Ray ID for a bug report.                                                              |
| HTTP 408, 429, or 5xx                                     | Check the network and the relay. Startup retries temporary failures for up to ten minutes.                                                  |

To restart the background service on Linux, run `otter-scaffold service restart`. For a server you
started by hand, stop it and run `otter-scaffold serve` again with your usual options. Include the
error message and trace ID when you report a persistent failure.

If a connection still fails after linking, check the date and time on both devices. For version
warnings, see [Updating](./updating.md).

## Use the desktop app only as a remote

If a computer should only work with environments elsewhere, open **Settings → Connections** in the
desktop app and switch off **Local environment**. The app restarts without a local server: no agent
runs on this computer and other devices can no longer connect to it. Your saved connections are
kept. Switch it back on in the same place to restart with your previous local settings.
