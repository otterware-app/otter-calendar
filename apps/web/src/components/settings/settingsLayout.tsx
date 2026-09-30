import { InfoIcon, Undo2Icon } from "lucide-react";
import { type ComponentPropsWithoutRef, type ReactNode, useEffect, useState } from "react";

import { cn } from "../../lib/utils";
import { WorkspacePageContainer, type WorkspacePageWidth } from "../WorkspacePageContainer";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SettingsGroup } from "./SettingsGroup";

/** Info affordance explaining how a setting interacts with the shared background policy. */
export function PolicyTooltip({ children }: { readonly children: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        delay={200}
        render={
          <Button size="icon-micro" variant="ghost-muted" aria-label="Background policy details">
            <InfoIcon className="size-3.5" />
          </Button>
        }
      />
      <TooltipPopup side="top">{children}</TooltipPopup>
    </Tooltip>
  );
}

/** Re-render every `intervalMs`; return a stable timestamp snapshot for render-time relative labels. */
export function useRelativeTimeTick(intervalMs = 1_000) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return nowMs;
}

/** Muted section headings have no descriptions; explanatory copy belongs to individual settings. */
export function SettingsSection({
  title,
  hideTitle = false,
  icon,
  headerAction,
  variant = "grouped",
  children,
  className,
  ...sectionProps
}: ComponentPropsWithoutRef<"section"> & {
  title: string;
  hideTitle?: boolean;
  icon?: ReactNode;
  headerAction?: ReactNode;
  variant?: "grouped" | "plain";
  children: ReactNode;
}) {
  return (
    <section {...sectionProps} className={cn(!hideTitle && "space-y-2.5", className)}>
      {hideTitle ? (
        <h2 className="sr-only">{title}</h2>
      ) : (
        <div className="flex min-h-7 items-start justify-between gap-4 px-3 sm:px-4">
          <div className="min-w-0">
            <h2 className="flex min-h-7 items-center gap-2 text-sm font-normal text-foreground/70">
              {icon}
              {title}
            </h2>
          </div>
          <div className="flex min-h-7 min-w-7 items-center justify-end">{headerAction}</div>
        </div>
      )}
      <SettingsGroup variant={variant}>{children}</SettingsGroup>
    </section>
  );
}

/**
 * One setting. Keep descriptions short enough for one line where possible.
 *
 * Control sizing across settings follows three tiers so rows share a baseline:
 * - `control` slot: `size="sm"` (Button, Select, Input, NumberField) or `icon-sm`.
 * - Section `headerAction`s and buttons inside list items, cards, toolbars: `xs` / `icon-xs`.
 * - Inline affordances (reset arrows, info tooltips, table-cell buttons): `icon-micro`.
 * Dialog footers keep the app-wide default button size.
 */
export function SettingsRow({
  title,
  description,
  status,
  resetAction,
  control,
  children,
  className,
  ...rowProps
}: Omit<ComponentPropsWithoutRef<"div">, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  resetAction?: ReactNode;
  control?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      {...rowProps}
      data-slot="settings-row"
      className={cn(
        "@container/settings-row rounded-xl px-3 sm:px-4 aria-disabled:opacity-64 aria-disabled:[&_*]:text-muted-foreground",
        children ? "pt-3 pb-1" : "py-3",
        className,
      )}
    >
      <div className="flex flex-col gap-3 @min-[32rem]/settings-row:grid @min-[32rem]/settings-row:grid-cols-[minmax(0,1fr)_minmax(10rem,auto)] @min-[32rem]/settings-row:items-center @min-[32rem]/settings-row:gap-8">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex min-h-5 items-center gap-1.5">
            <h3 className="text-sm font-medium text-foreground">{title}</h3>
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
              {resetAction}
            </span>
          </div>
          {description ? (
            <p className="max-w-xl text-xs leading-normal text-muted-foreground/80">
              {description}
            </p>
          ) : null}
          {status ? <div className="pt-0.5 text-xs text-muted-foreground">{status}</div> : null}
        </div>
        {control ? (
          <div className="flex w-full min-w-0 shrink-0 items-center gap-2 @min-[32rem]/settings-row:w-auto @min-[32rem]/settings-row:justify-end">
            {control}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function SettingResetButton({
  label,
  tooltip = "Reset to default",
  disabled = false,
  onClick,
}: {
  label: string;
  tooltip?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-micro"
            variant="ghost-muted"
            aria-label={`Reset ${label} to default`}
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
          >
            <Undo2Icon className="size-3" />
          </Button>
        }
      />
      <TooltipPopup side="top">{tooltip}</TooltipPopup>
    </Tooltip>
  );
}

export function SettingsPageContainer({
  children,
  className,
  width = "readable",
}: {
  children: ReactNode;
  className?: string;
  width?: WorkspacePageWidth;
}) {
  return (
    <div className="topbar-scroll-fade scrollbar-gutter-both flex-1 overflow-y-auto">
      <WorkspacePageContainer width={width} className={cn("gap-8", className)}>
        {children}
      </WorkspacePageContainer>
    </div>
  );
}
