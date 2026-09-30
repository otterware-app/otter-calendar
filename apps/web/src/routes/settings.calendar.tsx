import { createFileRoute } from "@tanstack/react-router";

import { CalendarSettings } from "../components/calendar/CalendarSettings";

export const Route = createFileRoute("/settings/calendar")({
  component: CalendarSettings,
});
