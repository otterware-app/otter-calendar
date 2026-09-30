import {
  CheckIcon,
  CopyIcon,
  InfoIcon,
  LightbulbIcon,
  MessageSquareWarningIcon,
  OctagonAlertIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, {
  type Components,
  type Options as ReactMarkdownOptions,
} from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { ensureLocalApi } from "../localApi";
import { cn } from "../lib/utils";
import { remarkGithubAlerts } from "../markdown-github-alerts";
import { createIncrementalMarkdownPlugin } from "../markdown-incremental";
import { remarkNormalizeListItemIndentation } from "../markdown-list-indentation";
import { Button } from "./ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const SANITIZE_SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    blockquote: [...(defaultSchema.attributes?.blockquote ?? []), "dataAlert"],
  },
} satisfies Parameters<typeof rehypeSanitize>[0];

const REMARK_PLUGINS = [
  remarkGfm,
  remarkGithubAlerts,
  remarkNormalizeListItemIndentation,
] satisfies NonNullable<ReactMarkdownOptions["remarkPlugins"]>;
const REMARK_PLUGINS_WITH_BREAKS = [...REMARK_PLUGINS, remarkBreaks];
const REHYPE_PLUGINS = [[rehypeSanitize, SANITIZE_SCHEMA]] satisfies NonNullable<
  ReactMarkdownOptions["rehypePlugins"]
>;

/** GitHub's five alert kinds, in its colors: the glyph names the urgency, the title says it. */
const GITHUB_ALERTS: Record<
  string,
  { label: string; Icon: typeof InfoIcon; borderClassName: string; titleClassName: string }
> = {
  note: {
    label: "Note",
    Icon: InfoIcon,
    borderClassName: "border-blue-500/70",
    titleClassName: "text-blue-600 dark:text-blue-400",
  },
  tip: {
    label: "Tip",
    Icon: LightbulbIcon,
    borderClassName: "border-emerald-500/70",
    titleClassName: "text-emerald-600 dark:text-emerald-400",
  },
  important: {
    label: "Important",
    Icon: MessageSquareWarningIcon,
    borderClassName: "border-purple-500/70",
    titleClassName: "text-purple-600 dark:text-purple-400",
  },
  warning: {
    label: "Warning",
    Icon: TriangleAlertIcon,
    borderClassName: "border-amber-500/70",
    titleClassName: "text-amber-600 dark:text-amber-500",
  },
  caution: {
    label: "Caution",
    Icon: OctagonAlertIcon,
    borderClassName: "border-red-500/70",
    titleClassName: "text-red-600 dark:text-red-400",
  },
};

function plainText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(plainText).join("");
  if (node !== null && typeof node === "object" && "props" in node) {
    return plainText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

function CodeBlock({ language, children }: { language: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(plainText(children).replace(/\n$/, "")).then(() => {
      setCopied(true);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1200);
    });
  }, [children]);
  const copyLabel = copied ? "Copied" : "Copy code";
  return (
    <div
      className="chat-markdown-codeblock my-[0.65rem] overflow-hidden rounded-lg border border-border/70 bg-secondary leading-snug dark:border-transparent dark:bg-input/32"
      data-language={language}
    >
      <div className="chat-markdown-codeblock-header flex items-center justify-between gap-2 pt-1.5 pr-1.5 pb-0 pl-3 select-none">
        <span className="font-mono text-2xs text-muted-foreground">{language}</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost-muted"
                size="icon-xs"
                onClick={copy}
                aria-label={copyLabel}
              />
            }
          >
            {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
          </TooltipTrigger>
          <TooltipPopup side="top">{copyLabel}</TooltipPopup>
        </Tooltip>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

function isExternalHref(href: string): boolean {
  return /^(?:https?:|mailto:)/i.test(href);
}

const COMPONENTS: Components = {
  pre: function MarkdownPre({ node: _node, children }) {
    const code = Array.isArray(children) ? children[0] : children;
    const className =
      code !== null && typeof code === "object" && "props" in code
        ? String((code.props as { className?: string }).className ?? "")
        : "";
    const language = className.match(/(?:^|\s)language-([^\s]+)/)?.[1] ?? "text";
    return <CodeBlock language={language}>{children}</CodeBlock>;
  },
  blockquote: function MarkdownBlockquote({ node: _node, children, ...props }) {
    const alert = GITHUB_ALERTS[String((props as Record<string, unknown>)["data-alert"] ?? "")];
    if (!alert) return <blockquote {...props}>{children}</blockquote>;
    return (
      <div role="note" className={cn("my-1 border-l-2 pl-3", alert.borderClassName)}>
        <p className={cn("flex items-center gap-1.5 font-medium", alert.titleClassName)}>
          <alert.Icon aria-hidden className="size-3.5 shrink-0" />
          {alert.label}
        </p>
        {children}
      </div>
    );
  },
  a: function MarkdownAnchor({ node: _node, href, children, ...props }) {
    if (!href || !isExternalHref(href)) {
      return (
        <a {...props} href={href}>
          {children}
        </a>
      );
    }
    return (
      <a
        {...props}
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => {
          if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.button !== 0) {
            return;
          }
          event.preventDefault();
          void ensureLocalApi().shell.openExternal(href);
        }}
      >
        {children}
      </a>
    );
  },
  table: function MarkdownTable({ node: _node, children, ...props }) {
    return (
      <div className="chat-markdown-table-container overflow-x-auto">
        <table {...props}>{children}</table>
      </div>
    );
  },
};

interface ChatMarkdownProps {
  readonly text: string;
  readonly className?: string | undefined;
  /** Treat single newlines as line breaks, as users type them. */
  readonly lineBreaks?: boolean | undefined;
  /** While the text still grows, unfinished code fences parse incrementally. */
  readonly isStreaming?: boolean | undefined;
}

/** Markdown the agent (or a user) wrote, rendered with the app's typography. */
function ChatMarkdown({
  text,
  className,
  lineBreaks = false,
  isStreaming = false,
}: ChatMarkdownProps) {
  const incrementalParsing = isStreaming && /(?:^|\n) {0,3}(?:`{3}|~{3})/.test(text);
  const remarkPlugins = useMemo(
    () => [
      ...(lineBreaks ? REMARK_PLUGINS_WITH_BREAKS : REMARK_PLUGINS),
      ...(incrementalParsing ? [createIncrementalMarkdownPlugin()] : []),
    ],
    [incrementalParsing, lineBreaks],
  );
  return (
    <div
      className={cn(
        "chat-markdown w-full min-w-0 text-sm leading-relaxed text-foreground/[calc(80%+var(--appearance-contrast-boost)/5)] [overflow-wrap:anywhere] [word-break:break-word]",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={REHYPE_PLUGINS}
        components={COMPONENTS}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default memo(ChatMarkdown);
