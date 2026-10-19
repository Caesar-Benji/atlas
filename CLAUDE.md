# Atlas — working notes for Claude

Atlas is Benji's personal life dashboard: one file, `index.html` (vanilla JS + CSS, no build step), deployed by GitHub Pages from `main`. Live at https://caesar-benji.github.io/atlas/. Backend is Supabase (project `gsyrqhoutpshtbzastyq`): email+password auth, every table has owner-only RLS with `user_id` defaulting to `auth.uid()`. Sections: Schedule (incl. the creatine/protein intake program), Gym, Money, Rent, Goals, Chores, House (floor planner + 3D view). Design history and decisions live in the claude.ai Project "Personal App - Atlas" (docs `claude/atlas-v*.md`); keep a short note there or here when you change something structural.

## Conventions that matter

- **Bump the version on every deploy**: `<span id="ver">vN</span>` in the hub footer and `console.log('Atlas vN')` near the top of the script. GitHub Pages sometimes fails silently and the CDN caches ~10 min — check `#ver` on the live site after pushing.
- **No emojis in the UI.** One SVG icon set (`ICO`), no text ✕ / ✓.
- **No browser dialogs.** `confirm()`/`prompt()` are banned; use `ask({title, body, ok, cancel, danger})` (Promise-returning sheet) and the `.sheet` pattern. Native `prompt()` still exists only in the House plan rename — replace it if you touch it.
- **Palette** is a paper-white e-book look: tokens on `:root` (`--bg`, `--surface`, `--accent`, muted red/amber/green). Motion tokens too: `--ease-out`, `--ease-in-out`, `--ease-drawer`, `--t-*`. Name transition properties; never `transition: all`; hover motion behind `@media(hover:hover) and (pointer:fine)`; reduced-motion block at the end of the stylesheet.
- **Async views**: every view takes `const seq = renderStart();` and does `if(stale(seq)) return;` right after its await (the router replaces `#main` without notice). Tickers self-clear by checking their element still exists.
- **Form fields** have uppercase mini-labels (`.lbl`); submit buttons are guarded by `submitGuard()`; all lists use `fetchAll()` past PostgREST's 1000-row cap.
- **Hebrew** text goes through `bidi()` when next to Latin/dates.

## Gym

- Live session draft in `localStorage['atlas_gym_draft']`; one batched Supabase write on Finish (`finishSession`). Items: `{ex, sets, reps, kg, done, keep}`; cardio stores minutes/km in reps/weight_kg with sets=1 and is excluded from volume/PRs.
- Flow: Start → picker sheet → Start opens the **live room** (`liveOpen()`, full-screen `.live`, z 50; picker sheet is z 60, `ask`/finish sheets z 70). Set dots + "Set N done" auto-start the rest timer (`restStart`, wall-clock end stored in the draft). Minimise keeps it running; `views.gym()` reopens it unless `_liveMin`. Finish review (`finishSheet`) saves ticked sets, skips untouched exercises unless kept; if nothing was ticked, planned numbers save. `workouts.duration_min` is written (column exists).
- **Exercise pictograms** are inline SVG in `EX_SVG` (`[svg, restsOnEnd]`), generated — do not hand-edit them. Source: `Claude outputs/pictograms/` next to the repo (`gen.js` rig + `catalogue.js` poses; `node catalogue.js` → `all-svg.json`, then splice into `EX_SVG`). Grammar: 64 box, 3px round-cap strokes, filled r4.2 head, 5px pads/plates, 2.5px cables; barbell = level bar with end plates, dumbbell = bar + two plates. Motion is the exercise's own range of motion, one `exMv` keyframe driven by `--r/--tx/--ty/--sx` on nested `.mv` groups, paused except on the live-room card you're on / an open card / a hovered pick. `EX_CAT` (name, group) and `EX_ALIAS` (typed names → catalogue) define the library; `exCanon()` folds names. `ex/*.png` are legacy and unused.

## Money

Apple Pay taps arrive via the `apple-pay` Edge Function (`supabase/functions/apple-pay/`, bearer token hashed in `webhook_tokens`); `merchantKey()` is duplicated in `index.html` and the function — change both. Categories are learned (`merchant_rules`), edits backfill sibling taps. PDF statement importer (pdf.js) dedupes on date+amount.

## Testing

`?fixture=demo|worst|empty|one|huge` loads `dev-fixtures.js`, an in-memory Supabase stand-in with a toggle bar — use it for any UI work instead of the live database. Headless-Chromium harnesses in past sessions stubbed the CDN scripts (`supabase-js`, `chart.js`, `pdf.js`) via `page.route`; Chart.js needs a `Chart.defaults` stub or the script dies before the router's `const`s initialise.

## Git

Commit messages: `Section vN: what changed`. Push after bumping the version. If `.git/*.lock` files exist from a sandboxed session, `rm -f .git/*.lock .git/stale-*` first.
