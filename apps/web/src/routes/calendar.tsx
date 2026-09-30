import { parseDayNumber } from "@t3tools/shared/calendar/time";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { CalendarPage } from "../components/calendar/CalendarPage";
import {
  DEFAULT_CALENDAR_VIEW,
  validateCalendarSearch,
} from "../components/calendar/calendarView.logic";

function CalendarRoute() {
  const { view, date } = Route.useSearch();
  return (
    <CalendarPage
      view={view ?? DEFAULT_CALENDAR_VIEW}
      date={date === undefined ? null : parseDayNumber(date)}
    />
  );
}

export const Route = createFileRoute("/calendar")({
  beforeLoad: ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  validateSearch: validateCalendarSearch,
  component: CalendarRoute,
});
