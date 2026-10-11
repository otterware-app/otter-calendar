# Brand icons

The app icon is the Otterware Calendar symbol on a tile, from the Otterware brand kit (October
2026). Each release channel has its own Icon Composer project, the source of truth for its icon:

- `otter/app-icon.icon`: production (stable releases). The kit's ivory tile (`#f8f5ec`, the
  project fill) with the charcoal symbol (`#2c2f31`); dark appearance swaps them, tinted is a white
  symbol on black.
- `otter-nightly/app-icon.icon`: nightly and mobile preview builds ("night sky": indigo to
  violet, stars and clouds, ivory symbol).
- `otter-dev/app-icon.icon`: development runs ("blueprint": blue gradient, grid, crop marks,
  white symbol).

Each project has a `symbol.svg` layer and, for the variants, a `background.svg` layer, all on a
1024 canvas. The paths every build uses live in `scripts/lib/brand-assets.ts`; the in-app symbol
(the sidebar's home link, the mobile header) is `packages/shared/src/brandSymbol.ts`.

Run `vp run icons:export` from the repository root to regenerate the tracked iOS, Linux, Windows, and
web assets in each directory. The development web exports are also copied to `apps/web/public`
for the browser favicon and splash screen; release builds copy their channel's over them
(`scripts/apply-web-brand-assets.ts`). Run `vp run icons:check` to verify that the generated assets
and public copies match their source without changing files.

The adaptive `*-web-favicon.svg` files (production follows `prefers-color-scheme`) are kept by
hand from the kit; Icon Composer doesn't export them.

Exporting requires Icon Composer 2 or newer on macOS. The script selects the newest compatible
exporter from Xcode or a standalone Icon Composer installation and pins design generation 26. Set
`ICON_COMPOSER_TOOL` to the full path of `Icon Composer.app/Contents/Executables/ictool` to override
automatic discovery.

The tracked exports were last written from the brand kit's own renders rather than by Icon
Composer (favicons and ICOs use the kit's rounded tile; iOS, Linux and apple-touch PNGs are
full-bleed and opaque), so a first `icons:check` on a Mac will report them as stale until they are
re-exported.

## macOS export

Icon Composer's command-line exporter does not expose the `macOS pre-Tahoe` preset, so the export
script leaves the macOS PNGs unchanged and prints a reminder after every run. After changing a
project, open it in Icon Composer and export with Platform `macOS pre-Tahoe`, Appearance
`Default`, Size `1024pt`, Scale `1×` to:

- `otter/app-icon.icon` -> `otter/otter-macos-1024.png`
- `otter-nightly/app-icon.icon` -> `otter-nightly/otter-nightly-macos-1024.png`
- `otter-dev/app-icon.icon` -> `otter-dev/otter-dev-macos-1024.png`

The result must be a 1024×1024 PNG with the classic macOS safe area: the opaque icon body is
824×824, inset 100 pixels on every side, with only the native Icon Composer shadow extending into
the surrounding transparent canvas.

Do not edit the generated PNG or ICO files directly.

## Android

Android masks adaptive icons and splash screens differently from the Icon Composer exports, so the
Android artwork is kept separately in `apps/mobile/assets/otter/` and referenced from
`apps/mobile/app.config.ts`:

- `android-icon-foreground{,-dev,-nightly}.png`: the symbol alone on a 108dp canvas (432px), the
  1024 artwork scaled into the central 72dp that launchers show.
- `android-icon-background-{dev,nightly}.png`: the variant's background art, the same framing.
  Production uses the ivory background color instead.
- `android-splash-icon{,-dev,-nightly}.png`: the composed icon on the 288dp splash canvas
  (1152px), whose central two thirds Android 12+ shows.
- `android-icon-mark.png`: the white symbol for themed (monochrome) icons.

Replace those files together with the Icon Composer projects. Launcher and App Store PNGs must be
opaque RGB (no alpha channel).
