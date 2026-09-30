# Brand icons

`otter/app-icon.icon` (an Icon Composer project) is the source of truth for the application icon.
Every channel (development, nightly, production) uses it; the paths live in
`scripts/lib/brand-assets.ts`. A new app replaces the project and the exports below.

Run `vp run icons:export` from the repository root to regenerate the tracked iOS, Linux, Windows, and
web assets in `otter/`. The web exports are also copied to `apps/web/public` for the browser
favicon and splash screen. Run `vp run icons:check` to verify that the generated assets and public
copies match their source without changing files.

Exporting requires Icon Composer 2 or newer on macOS. The script selects the newest compatible
exporter from Xcode or a standalone Icon Composer installation and pins design generation 26. Set
`ICON_COMPOSER_TOOL` to the full path of `Icon Composer.app/Contents/Executables/ictool` to override
automatic discovery.

## macOS export

Icon Composer's command-line exporter does not expose the `macOS pre-Tahoe` preset, so the export
script leaves the macOS PNG unchanged and prints a reminder after every run. After changing the
project, open it in Icon Composer and export with Platform `macOS pre-Tahoe`, Appearance
`Default`, Size `1024pt`, Scale `1×` to `otter/otter-macos-1024.png`.

The result must be a 1024×1024 PNG with the classic macOS safe area: the opaque icon body is
824×824, inset 100 pixels on every side, with only the native Icon Composer shadow extending into
the surrounding transparent canvas.

Do not edit the generated PNG or ICO files directly.

## Android

Android masks adaptive icons and splash screens differently from the Icon Composer exports, so the
Android artwork is kept separately in `apps/mobile/assets/otter/` (`android-icon-foreground.png`,
`android-splash-icon.png`, `android-icon-mark.png`) and referenced from `apps/mobile/app.config.ts`.
Replace those files together with the Icon Composer project.
