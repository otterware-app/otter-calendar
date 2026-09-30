# Appearance and themes

On web and desktop, open **Settings → Appearance** to choose a theme and to follow the system
appearance or stay in light or dark mode. To use different themes for light and dark mode, select
the matching preview within each theme. The same page adjusts contrast, fonts, and text sizes.
Appearance preferences are saved separately on each device or browser.

**Change theme** in the command palette switches themes without leaving what you are doing
(`mod+alt+a` opens it directly). **Change appearance** picks System, Light, or Dark, and
`mod+alt+shift+a` cycles through them. See [keyboard shortcuts](./keybindings.md).

On mobile, open **Settings → Appearance** to choose the color scheme, a theme, and the text size.
Mobile has its own themes and does not follow environment themes. On Android 12 or newer, the
**Material You** theme uses colors from your wallpaper.

## Motion

Panels open and close immediately by default. Move the **Panel animations** slider in
**Settings → Appearance** above 0 ms to add motion, up to 400 ms, unless reduced motion is on in
your operating system.

## Custom themes

On web and desktop, choose **Create theme** to adjust a palette, or import an Otter Calendar or
VS Code theme file. The theme editor's color picker lets you click an area of the app to find the
color to change. Download a theme as JSON to share it.

## Environment themes

An environment can publish themes and a default theme for its clients. They apply to the web app
served by that environment and to the desktop app's own local environment; the hosted web app and
additional connections do not use them.

Select a published theme in **Settings → Appearance** to follow its palette as the environment
updates it. **Duplicate** makes an independent copy you can edit. A saved custom theme with the same
ID takes precedence. If the environment stops publishing the selected theme, the app falls back to
its standard theme.

Run this on the environment's machine to set a default and switch connected clients to it:

```bash
otter-calendar theme set nightfall
```

Clients that are offline apply it when they reconnect. Each client applies the default once;
choosing another theme afterwards sticks until the next `theme set`. Run the command again to
reapply it, even with the same name. `otter-calendar theme clear` removes the default without
changing anyone's current theme, and `otter-calendar theme show` lists the default and the
published themes.

### Publish a theme

Save a theme downloaded from the app into `~/.otter-calendar/userdata/themes/` on the environment's
machine, or the `userdata/themes` directory under a custom home. The filename is the theme's ID:
`nightfall.json` is selected with `theme set nightfall`. Keep the filename stable when you update
its colors. Do not use `system`, `light`, `dark`, or a built-in theme's ID.

An integration that generates palettes can write this shorter format instead:

```json
{
  "name": "Nightfall",
  "appearance": "dark",
  "canvas": "#1a1b26",
  "accent": "#7aa2f7",
  "colors": {
    "sidebar": "#16161e",
    "error": "#f7768e"
  }
}
```

Set `appearance` to `light` or `dark` and give hex colors for `canvas` and `accent`; the app
generates the rest. The optional `colors` overrides use the names in the theme editor's advanced
view. Write updates to a temporary file and rename it into place, so clients never read a partial
theme. Invalid files are not published.
