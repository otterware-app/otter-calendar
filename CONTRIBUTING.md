# Contributing

Otter Scaffold is the starting point for Otterware apps, and every app built from it merges its
changes. Keep changes here to the platform: fixes, reliability and performance work, and
capabilities every app needs. Features for one app belong in that app's repository.

## Before you start

- Set up a checkout with the [development runbook](docs/operations/development.md#first-checkout).
- Read [AGENTS.md](AGENTS.md) for the conventions, how to verify a change, and the
  [documentation rules](AGENTS.md#documentation).
- Report bugs as issues. Propose features and larger changes in
  [Ideas discussions](https://github.com/otterware-app/otter-scaffold/discussions/categories/ideas)
  first, so we can agree on the approach before you build it.

## Pull requests

- One concern per pull request, as small as the change allows. If the description says "also",
  split it.
- Use a conventional commit title in plain language, such as
  `fix(web): new chats no longer spike CPU`.
- Explain the problem in a sentence or two, then how you fixed it.
- Backend behavior changes come with focused tests. Run the checks for what you changed; CI runs
  the full suite.
- Include before and after images for UI changes, and a short video when motion or timing matters.
- Update user guides when how to use a feature changes.

Much of the platform comes from [T3 Code](https://github.com/pingdotgg/t3code). When a fix also
applies there, consider reporting it upstream. [SCAFFOLD.md](SCAFFOLD.md#keeping-up-with-upstream)
explains how upstream changes are ported.
