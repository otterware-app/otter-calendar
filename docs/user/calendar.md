# Your calendars

Otter Calendar shows the calendars of several Google accounts in one view. Your environment (the
desktop app, or the server you run) keeps them in sync; every device you connect to it shows the
same calendars.

## Add accounts

Choose **Add Google account** in the sidebar or in **Settings → Calendar**. Your browser opens
Google's sign-in; pick the account and allow calendar access. Repeat for each account.

- **Signing in from another machine.** When your browser runs on a different machine than the
  environment (the hosted web app, or a remote environment), Google finishes on a page that
  cannot load (`127.0.0.1`). Copy that page's whole address and paste it into Otter Calendar. The
  desktop app catches it for you.
- **"Google sign-in needs an OAuth client".** Each environment needs a Google OAuth client. Builds can
  include one; otherwise, create a **Desktop app** client in Google Cloud (with the Google
  Calendar API enabled) and enter its client ID and secret under **Settings → Calendar → Google sign-in**.
- **Signed out.** When Google ends a sign-in (you changed your password, or revoked access), the
  account shows **Reconnect**. Clients left in Google's "Testing" mode sign out after seven days.

To look around without an account, choose **Explore with demo data** (or **Settings → Calendar →
Demo data**). Demo accounts behave like real ones and never leave your environment. Remove them
there too.

## Calendars and views

Each account lists its calendars in the sidebar. Click a calendar to show or hide it, and use its
menu to change its color. Colors and visibility are Otter Calendar's own: they apply on every
device and do not change your Google settings.

Switch views with the toolbar or the keyboard: **D** day, **W** week, **X** several days (the
count is in **Settings → Calendar**), **M** month, **A** agenda. **T** goes to today, **J**/**K**
(or the arrow keys) to the next and previous period, **G** to any date. All shortcuts are in
[Keyboard shortcuts](./keybindings.md); **Mod+K** opens the command palette with every action.

Times show in your device's time zone unless you pick one in **Settings → Calendar**. An event
created in another zone shows its own time too when you open it.

## Create and change events

- **Create:** drag across empty time (across days for a multi-day event), click an empty slot, or
  press **C**. Type a title and press **Mod+Enter**. In month view, drag across days for an
  all-day event.
- **Move and resize:** drag an event, or its top or bottom edge. Drag between the all-day row and
  the hours to switch between all-day and timed. Hold **Alt** (**Option**) while dragging to copy
  instead. With an event selected, **Alt+↑/↓** moves it by 15 minutes, **Alt+←/→** by a day, and
  **Alt+Shift+↑/↓** changes its end.
- **Details:** click an event to see it, answer an invitation (**Yes**, **Maybe**, **No**), join
  its video call, or delete it. **E** opens the full editor: time and zone, repeat, calendar,
  location, description, guests, a Google Meet link, busy or free.
- **Repeating events:** a change asks whether it applies to **this event**, **this and following
  events**, or **all events**, like Google Calendar.
- **Undo:** **Mod+Z** undoes the last change, **Mod+Shift+Z** redoes it. Changes show at once; if
  Google refuses one, it is undone and a message says why.

**/** searches every account, including hidden calendars.

## The assistant

The assistant can read and change your calendars across accounts: "what's on Thursday?", "find
an hour with Jordan next week", "move my 1:1 to Friday afternoon", "decline the Monday standup".
It knows which days you are looking at and which event is open. See [The
assistant](./agent.md) and [Permission modes](./permission-modes.md) for when it asks first.

## On your phone

The mobile app shows your agenda and a day view, event details with answers to invitations and
deleting, and the calendar list with visibility switches. Add Google accounts from the desktop or
web app; they appear on your phone automatically.
