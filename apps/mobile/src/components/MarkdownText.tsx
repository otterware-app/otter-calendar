import { useMemo } from "react";
import { Platform } from "react-native";
import { Markdown, type PartialMarkdownTheme } from "react-native-nitro-markdown";

import { useAppearancePreferences } from "../features/settings/appearance/AppearancePreferencesProvider";
import { resolveMarkdownFontSizes } from "../lib/appearancePreferences";
import { tryOpenExternalUrl } from "../lib/openExternalUrl";
import { useFontFamily } from "../lib/useFontFamily";

const MONO_FONT_FAMILY = Platform.select({ ios: "Menlo", default: "monospace" });

/** Agent answers and other Markdown, in the app's theme and at the user's text size. */
export function MarkdownText(props: { readonly children: string }) {
  const { appearance, themeVariables } = useAppearancePreferences();
  const regular = useFontFamily("regular");
  const bold = useFontFamily("bold");
  const theme = useMemo((): PartialMarkdownTheme => {
    const sizes = resolveMarkdownFontSizes(appearance.baseFontSize);
    return {
      colors: {
        text: themeVariables["--color-md-body"],
        textMuted: themeVariables["--color-foreground-muted"],
        heading: themeVariables["--color-md-strong"],
        link: themeVariables["--color-md-link"],
        code: themeVariables["--color-md-code-text"],
        codeBackground: themeVariables["--color-md-code-bg"],
        codeLanguage: themeVariables["--color-foreground-muted"],
        blockquote: themeVariables["--color-md-blockquote-border"],
        border: themeVariables["--color-md-hr"],
        surface: themeVariables["--color-card"],
        surfaceLight: themeVariables["--color-md-blockquote-bg"],
        accent: themeVariables["--color-md-link"],
        tableBorder: themeVariables["--color-border"],
        tableHeader: themeVariables["--color-subtle"],
        tableHeaderText: themeVariables["--color-foreground"],
        tableRowEven: "transparent",
        tableRowOdd: themeVariables["--color-subtle"],
      },
      fontSizes: {
        s: sizes.s,
        m: sizes.m,
        h1: sizes.h1,
        h2: sizes.h2,
        h3: sizes.h3,
        h4: sizes.h4,
        h5: sizes.h5,
        h6: sizes.h6,
      },
      fontFamilies: { regular, heading: bold, mono: MONO_FONT_FAMILY },
    };
  }, [appearance.baseFontSize, bold, regular, themeVariables]);

  return (
    <Markdown
      options={{ gfm: true }}
      theme={theme}
      onLinkPress={(url) => {
        void tryOpenExternalUrl(url, "markdown-link");
        return false;
      }}
    >
      {props.children}
    </Markdown>
  );
}
