# Running in the background

On macOS and Linux, Otter Calendar can run as a service for your user, so the environment stays
available without an open terminal.

## Manage the service

Install the command-line app first ([Install](./install.md#command-line-server-only)), then run
these commands on the machine that should host the environment:

| Task                            | Command                            |
| ------------------------------- | ---------------------------------- |
| Install and start               | `otter-calendar service install`   |
| Inspect status and log location | `otter-calendar service status`    |
| Move to a newer release         | `otter-calendar update`            |
| Restart                         | `otter-calendar service restart`   |
| Stop and remove from startup    | `otter-calendar service uninstall` |

Uninstalling the service keeps your data and settings. Running `service install` again repairs a
service that `service status` reports as broken.

`otter-calendar update` downloads the newest release on your channel and switches the command and
the service to it. Restarting interrupts running agent turns and connected clients, so it asks
first; answer no and the service keeps running the old version until `service restart`. Pass
`--yes` from a script. A server you started by hand keeps running; stop and start it again to pick
up the new version.

Pass an exact version (`otter-calendar update 0.0.45`) to pin one, `--channel nightly` to switch
trains, or `--allow-downgrade` to move backwards. `preview` is a maintainers' test train: its
builds can be broken and are never offered as updates, so installing one asks for confirmation.

`otter-calendar uninstall` removes the service, the command, and the downloaded versions after
listing them and asking once. Your data under `~/.otter-calendar/userdata` is kept. Pass `--yes`
from a script.

## Platform support

Linux needs systemd user services. Setup enables lingering so the service starts at boot and keeps
running after you log out. If that needs administrator permission, setup prints the command to run.

macOS starts the service when you log in and stops it when you log out. Keep the Mac logged in and
awake for unattended remote access. Installing over SSH while nobody is logged in at the Mac can
fail at the final start step; the service is still installed and starts at the next login.

[T3 Connect](./remote-access.md#t3-connect) can offer to install the service during setup, but the
two are managed separately. Signing out of T3 Connect does not stop or remove the service.

## Troubleshooting

Start with `otter-calendar service status` on the host. It prints the log path and, on Linux,
checks whether the service is running, enabled, and allowed to survive logout.

If the service stops when your SSH session closes, look for `linger-disabled`. An administrator can
enable lingering with:

```sh
sudo loginctl enable-linger "$(id -un)"
```

Over SSH, let sudo prompt:

```sh
ssh -t your-server 'sudo loginctl enable-linger "$(id -un)"'
```

Then retry the service command as your normal user. Run only the `loginctl` command with sudo;
running the app as root creates a separate installation with its own data. Without administrator
access, run `otter-calendar serve` in a terminal and keep that session open.

| Status                                  | Next step                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `linger-unavailable`                    | Run `loginctl show-user "$(id -un)" --property=Linger` and check that systemd-logind is available.                             |
| `user-manager-unavailable`              | Run `systemctl --user status` in a login session for the service user; check your distribution's systemd user-session support. |
| `service-disabled` or `service-stopped` | Read the log and `systemctl --user status otter-calendar.service`, then run the repair command the status output prints.       |
| `restart-pending`                       | A newer version is installed but the service still runs the previous one. Run `otter-calendar service restart`.                |

On macOS, check **System Settings → General → Login Items** if the service no longer starts at
login. The service is defined in `~/Library/LaunchAgents/dev.otterware.calendar.service.plist`.

For problems after signing in to T3 Connect, see
[T3 Connect troubleshooting](./remote-access.md#t3-connect-troubleshooting).
