# T3 Connect setup

Deployment and client configuration for T3 Connect (accounts, the relay, managed tunnels). The
[architecture note](../internals/t3-connect.md) explains the trust boundaries; the
[relay README](../../infra/relay/README.md#deployment) covers provisioning. Nothing here is needed
for local development: without it, clients build with cloud features off.

Values below come from [`brand.ts`](../../packages/shared/src/brand.ts): `<scheme>` is
`BRAND.urlScheme`, `<appId>` is `BRAND.appId`, and `<slug>` is `BRAND.slug`; in this repository,
`otterscaffold`, `dev.otterware.scaffold`, and `otter-scaffold`.

## Public application configuration

Copy the repository-root example and fill in your deployment's public identifiers:

```sh
cp .env.example .env
```

```dotenv
T3CODE_CLERK_PUBLISHABLE_KEY=<publishable key>
T3CODE_CLERK_JWT_TEMPLATE=<JWT template name>
T3CODE_CLERK_CLI_OAUTH_CLIENT_ID=<public OAuth application client ID>
T3CODE_RELAY_URL=https://relay.example.com
```

Process variables take precedence over `.env.local`, then `.env`. These are public identifiers;
`CLERK_SECRET_KEY` belongs only to the relay. Client and bundled-server builds embed the values, so
set them before building. Release builds read them from the `production` GitHub environment
([release](./release.md#configuration)); EAS preview and production environments need the
publishable key, JWT template name, and relay URL.

Deploying the relay's `prod` stage writes `T3CODE_RELAY_URL` and the client tracing values back
into the root `.env`, so later source builds use the relay you just deployed.

## CLI OAuth application

In Clerk's OAuth applications settings:

1. Create a public OAuth application for the CLI, using authorization-code exchange with PKCE.
2. Allow the redirect URI `http://127.0.0.1:34338/callback`.
3. Enable the `openid`, `profile`, `email`, and `offline_access` scopes.
4. Enable **Device authorization grant**. Headless and SSH sign-in use it, and Clerk only
   advertises the device endpoint once it is on. Clerk enables the feature per account on request.
5. Set `T3CODE_CLERK_CLI_OAUTH_CLIENT_ID` to the generated client ID for local and release builds.

## JWT template

Create a Clerk JWT template, for example `<slug>-relay`, with an audience claim:

```json
{ "aud": "<slug>-relay" }
```

Set `T3CODE_CLERK_JWT_TEMPLATE` (and the `CLERK_JWT_TEMPLATE` release variable) to the template's
name, and the relay's `CLERK_JWT_AUDIENCE` to its `aud`. The audience stays the same across relay
stages; the relay URL selects the deployment.

## Desktop OAuth redirects

Enable Clerk's Native API and add the desktop redirects to its SSO redirect allowlist:

```text
<scheme>-dev://app/
<scheme>://app/
```

Add the matching origins (`<scheme>-dev://app` for development, `<scheme>://app` for releases) to
the Clerk instance's Backend API `allowed_origins`. Update that array with
`PATCH https://api.clerk.com/v1/instance` and the Clerk secret key, keeping existing entries.

## Mobile native sign-in redirects

Clerk's native Android SDK uses `clerk://<applicationId>.callback`. In the Clerk instance selected
by the app's publishable key, add each variant under **Native applications → Allowlist for mobile
SSO redirect**:

| Variant     | Callback                           |
| ----------- | ---------------------------------- |
| Development | `clerk://<appId>.dev.callback`     |
| Preview     | `clerk://<appId>.preview.callback` |
| Production  | `clerk://<appId>.callback`         |

These callbacks are separate from the app's navigation schemes (`<scheme>-dev`, `<scheme>-preview`,
`<scheme>`). A private development build using the production Clerk key still needs its development
callback allowed on that instance.

## Desktop passkeys

For a release macOS app with bundle ID `<appId>`:

1. Create an explicit macOS App ID in the Apple Developer portal with **Associated Domains**.
2. Create a provisioning profile for that App ID and the Developer ID signing certificate.
3. In Clerk's Native API settings, add an iOS app with the same Apple Team ID and bundle ID. This
   also configures Electron passkeys on macOS.
4. Check `https://<frontend-api>/.well-known/apple-app-site-association`: its
   `webcredentials.apps` must include `<TEAM_ID>.<appId>`.
5. Configure signing as described in the [release runbook](./release.md#configuration).

Local signed builds also read:

```dotenv
T3CODE_APPLE_TEAM_ID=ABC1234567
T3CODE_MACOS_PROVISIONING_PROFILE=/absolute/path/to/app.provisionprofile
# Only when the RP domain differs from the Clerk Frontend API hostname.
T3CODE_CLERK_PASSKEY_RP_DOMAINS=example.clerk.accounts.dev,clerk.example.com
```

Without the override, the build derives the RP domain from the publishable key. After changing
Associated Domains, bump the build version before rebuilding; macOS can otherwise reuse stale
credential metadata for the same app and version.

The `dev:desktop` launcher is unsigned and cannot use passkeys. For renderer hot reload, install a
signed build, start `vp run dev:web`, and launch the installed executable with the web and server
ports, for example with the default ports:

```sh
VITE_DEV_SERVER_URL=http://127.0.0.1:5733 \
T3CODE_PORT=13773 \
  "/Applications/Otter Scaffold.app/Contents/MacOS/Otter Scaffold"
```

Rebuild the signed app after native dependency, main-process, preload, entitlement, provisioning,
or signing changes; renderer edits can reuse it. Check the installed bundle with
`codesign --verify --deep --strict` and `codesign -d --entitlements :-`.

## Restricting sign-ups

Use Clerk's allowlist for permitted email addresses or domains, or Restricted mode for
invitation-only sign-up. An enabled, empty allowlist blocks all new sign-ups. Restrictions do not
revoke existing accounts; ban an account in Clerk to end its sessions and future sign-ins.
