# 2026 World Cup Draft League — Live Tracker

Live results, league standings, and a "which game do I watch next" banner for an
8-manager World Cup team draft league.

**Live page:** https://dustinfox-code.github.io/wc-draft-tracker/

## What's here

- `index.html` — the live tracker. Fetches results client-side from the
  public-domain [openfootball worldcup.json feed](https://github.com/openfootball/worldcup.json)
  (no API key, auto-refreshes every 10 minutes), scores them under league rules,
  and renders standings, group tables, schedule, and a next-match countdown for
  whichever manager's teams (plus any extra teams) the viewer follows.

  Standings also show a **live projected final total** per manager: Silver
  Bulletin republishes his Datawrapper charts nightly after each matchday, and
  their data is served from a public CDN (chart ids `1oPAd`/`EodNy`/`ArtIj`
  for group expectations, `JRO90` for the knockout ladder). The page fetches
  those CSVs at view time and runs them through the league scoring formula —
  same arithmetic as the draft board's EV, fresher inputs. Fallback chain:
  live fetch → last good fetch (localStorage) → pre-tournament numbers; the
  header shows which is in use. If Silver replaces those charts with new ones
  mid-tournament, update the ids in `DW_GROUP_CHARTS` / `DW_KO_CHART`.
- `draft.html` — the original pre-tournament draft board / simulator
  (Silver Bulletin EVs, draft-night pick tracking). Preserved as-is.
- `data/worldcup.json` — bundled snapshot of the feed, used as a fallback if
  raw.githubusercontent.com is unreachable.

## League scoring

| Milestone | Points |
|---|---|
| Group-stage win / draw | 3 / 1 |
| Advance to knockouts | +4 |
| Each knockout-stage win (R32, R16, QF, SF) | +5 |
| Winning the final | +10 (5 win + 5 champion bonus) |

Third-place match is not scored. Advancement (+4) is detected when a team
appears in a resolved Round-of-32 fixture in the feed.

## Rosters

Draft happened 2026-06-10; rosters were pulled from the league's shared Google
Sheet and are hardcoded in `index.html` (`ROSTERS`). If a trade ever happens,
edit that object and push.

## Updating the fallback snapshot (optional)

```sh
curl -sL https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json \
  -o data/worldcup.json
```
