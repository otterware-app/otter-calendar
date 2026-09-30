import type { CalendarAttendee } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  eventTone,
  plainDescription,
  readableTextColor,
  responseSummary,
  sortedGuests,
  withAlpha,
} from "./eventPresentation";

describe("readableTextColor", () => {
  it("keeps white text on mid-tone calendar colors and switches to dark on pale ones", () => {
    expect(readableTextColor("#039be5")).toBe("#ffffff");
    expect(readableTextColor("#0b8043")).toBe("#ffffff");
    expect(readableTextColor("#fbd75b")).toBe("#1d1d1f");
    expect(readableTextColor("#f6bf26")).toBe("#1d1d1f");
  });
});

describe("withAlpha", () => {
  it("appends the alpha byte", () => {
    expect(withAlpha("#039be5", 0.2)).toBe("#039be533");
    expect(withAlpha("#039be5", 1)).toBe("#039be5ff");
  });
});

describe("eventTone", () => {
  it("follows the user's answer", () => {
    expect(eventTone({})).toBe("solid");
    expect(eventTone({ response: "accepted" })).toBe("solid");
    expect(eventTone({ response: "needsAction" })).toBe("unanswered");
    expect(eventTone({ response: "tentative" })).toBe("tentative");
    expect(eventTone({ tentative: true })).toBe("tentative");
    expect(eventTone({ response: "declined", tentative: true })).toBe("declined");
  });
});

describe("plainDescription", () => {
  it("leaves plain text alone", () => {
    expect(plainDescription("  Agenda:\n1. Numbers < targets  ")).toBe(
      "Agenda:\n1. Numbers < targets",
    );
  });

  it("turns Google's HTML into readable text", () => {
    expect(
      plainDescription(
        'Join us<br>Notes: <a href="https://docs.example.com/x">the doc</a><br><br><br>' +
          "<ul><li>One</li><li>Two &amp; three</li></ul>&nbsp;&#8212;",
      ),
    ).toBe("Join us\nNotes: the doc (https://docs.example.com/x)\n\n• One\n• Two & three\n —");
  });

  it("shows a bare link once", () => {
    expect(plainDescription('<a href="https://x.dev">https://x.dev</a>')).toBe("https://x.dev");
  });
});

describe("guests", () => {
  const guests: CalendarAttendee[] = [
    { email: "zoe@example.com", responseStatus: "declined" },
    { email: "room@example.com", responseStatus: "accepted", resource: true },
    { email: "bo@example.com", displayName: "Bo", responseStatus: "needsAction" },
    { email: "al@example.com", displayName: "Al", responseStatus: "accepted" },
    { email: "org@example.com", responseStatus: "accepted", organizer: true },
    { email: "cy@example.com", responseStatus: "tentative" },
  ];

  it("puts the organizer first, then by answer, and leaves out rooms", () => {
    expect(sortedGuests(guests).map((guest) => guest.email)).toEqual([
      "org@example.com",
      "al@example.com",
      "cy@example.com",
      "bo@example.com",
      "zoe@example.com",
    ]);
  });

  it("summarizes the answers", () => {
    expect(responseSummary(sortedGuests(guests))).toBe("2 yes, 1 maybe, 1 no, 1 awaiting");
  });
});
