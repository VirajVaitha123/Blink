# Roadmap

A one-page index of where Blink is headed. Each row links to a GitHub issue
where the actual discussion / spec / progress lives — this file should stay
short and skimmable. If something here grows into a paragraph, that's a
signal to move it into the issue body.

## Now

The only enforced "now" — open PRs and the most recent merges:

- **Live**: deployed to Vercel from `main`. Auto-deploys on every push.
- **CI**: GitHub Actions runs `eslint` + `next build` on every push and PR
  ([workflow](.github/workflows/frontend-ci.yml)). Branch protection update
  to require it: [#22](https://github.com/VirajVaitha123/Blink/issues/22).

## Next up (priority: high)

User-facing features that materially change the experience for the cousin.

| Issue | What |
| --- | --- |
| [#7](https://github.com/VirajVaitha123/Blink/issues/7) | Audio cues — tones (clicks, chimes, "begin" beep) |
| [#8](https://github.com/VirajVaitha123/Blink/issues/8) | Audio cues — voice announcements ("A", "Resume", "Space") |
| [#9](https://github.com/VirajVaitha123/Blink/issues/9) | Speech output: "Speak" command reads transcript aloud |
| [#11](https://github.com/VirajVaitha123/Blink/issues/11) | Calibration wizard for blink + look-up thresholds |
| [#12](https://github.com/VirajVaitha123/Blink/issues/12) | Settings page (group + letter cycle speeds, thresholds, toggles) |
| [#16](https://github.com/VirajVaitha123/Blink/issues/16) | Emergency button: one-step "I need help" |

## Soon (priority: medium)

| Issue | What |
| --- | --- |
| [#13](https://github.com/VirajVaitha123/Blink/issues/13) | Presets: saved phrases reachable from command menu |
| [#14](https://github.com/VirajVaitha123/Blink/issues/14) | Command-menu UX: stay open after backspace |
| [#15](https://github.com/VirajVaitha123/Blink/issues/15) | Two-person session: observer view via `/session/[code]/observe` |
| [#17](https://github.com/VirajVaitha123/Blink/issues/17) | Word autocomplete (dictionary + n-gram, all in-browser) |
| [#18](https://github.com/VirajVaitha123/Blink/issues/18) | Auth: anonymous (cousin) + Google (family) via Supabase |
| [#19](https://github.com/VirajVaitha123/Blink/issues/19) | PWA: installable on home screen, works offline |

## Later (priority: low)

| Issue | What |
| --- | --- |
| [#10](https://github.com/VirajVaitha123/Blink/issues/10) | Premium voice via Azure Speech Neural |
| [#20](https://github.com/VirajVaitha123/Blink/issues/20) | Family inbox: timestamped message history |
| [#21](https://github.com/VirajVaitha123/Blink/issues/21) | Alternate keyboard layouts (frequency-ordered, multilingual) |

## Suggested first slice

If picking the next PR purely for impact-per-effort:

1. **#7 Audio cues — tones** — tiny patch, removes the "did it actually start?" doubt
2. **#9 Speech output** — turns a typing tool into a *speaking* tool (browser TTS, no backend)
3. **#11 Calibration wizard** — fixes "the threshold doesn't match my face" problem permanently
4. **#12 Settings page** — exposes everything the wizard sets so it's tunable

That sequence is mostly pure-frontend additive work — no schema, no auth,
no observer-mode plumbing — so each PR is small and independently shippable.

## Ground rules

- Issues are the source of truth. This file just indexes them.
- Reorder rows here when priorities shift; close issues when shipped (don't
  delete rows — keeps a history of what we built).
- New ideas → new issue first, then add a row here.
