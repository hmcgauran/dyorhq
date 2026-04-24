# DYOR HQ Auto-Pipeline Run — 2026-04-22

**Outcome: BLOCKED — pipeline could not execute**

---

## Why it didn't run

The pipeline requires the `gws` (Google Workspace CLI) binary to read from Google Sheets. `gws` is only installed on your Mac and authenticates via OAuth2 tokens stored in `~/.config/gws/` — a path not accessible from the Cowork sandbox. The scheduled task runs inside the sandbox, not in your Mac's Terminal.

`computer-use` access (which would have opened Terminal on your Mac) was requested but timed out — no user was present to approve it.

---

## State as of this run (2026-04-22T~23:15Z)

| Metric | Value |
|---|---|
| Last successful `detect-new-tickers.js` run | 2026-04-18T08:29Z |
| Sheet rows at that run | 327 |
| Unmatched at that run | 0 |
| Cached sheet snapshot date | 2026-04-20T16:29Z |
| Cached sheet row count | 371 |
| Current `reports/index.json` entries | 335 |
| HTML files on disk in `reports/` | 325 |

---

## Tickers requiring reports (32)

Based on the cached April 20 sheet snapshot compared against the current index, the following tickers appear in the sheet but have no HTML report file on disk:

| Ticker | Company | Expected filename |
|---|---|---|
| MOG.A | Moog Inc Class A | moogincclassa.html |
| GHM | Graham Corp | grahamcorp.html |
| RDW | Redwire Corp | redwirecorp.html |
| RKLB | Rocket Lab Corp | rocketlabcorp.html |
| KTOS | Kratos Defense & Security Solutions Inc | kratosdefensesecuritysolutionsinc.html |
| FLY | Firefly Aerospace Inc | fireflyaerospaceinc.html |
| VOYG | Voyager Technologies Inc | voyagertechnologiesinc.html |
| MDA | MDA Space Ltd | mdaspaceltd.html |
| LUNR | Intuitive Machines Inc | intuitivemachinesinc.html |
| GILT | Gilat Satellite Networks Ltd | gilatsatellitenetworksltd.html |
| VSAT | Viasat Inc | viasatinc.html |
| GSAT | Globalstar, Inc. | globalstarinc.html |
| BKSY | Blacksky Technology Inc | blackskytechnologyinc.html |
| IRDM | Iridium Communications Inc | iridiumcommunicationsinc.html |
| RBC | RBC Bearings Inc | rbcbearingsinc.html |
| KRMN | Karman Holdings Inc | karmanholdingsinc.html |
| TECK | Teck Resources Ltd | teckresourcesltd.html |
| FCX | Freeport-McMoRan Inc | freeportmcmoraninc.html |
| CRS | Carpenter Technology Corp | carpentertechnologycorp.html |
| MTRN | Materion Corp | materioncorp.html |
| HXL | Hexcel Corp | hexcelcorp.html |
| GLW | Corning Inc | corninginc.html |
| PKE | Park Aerospace Corp | parkaerospacecorp.html |
| MCHP | Microchip Technology Inc | microchiptechnologyinc.html |
| QRVO | Qorvo Inc | qorvoinc.html |
| MRCY | Mercury Systems Inc | mercurysystemsinc.html |
| TTMI | TTM Technologies Inc | ttmtechnologiesinc.html |
| COHR | Coherent Corp | coherentcorp.html |
| LITE | Lumentum Holdings Inc | lumentumholdingsinc.html |
| APD | Air Products and Chemicals Inc | airproductsandchemicalsinc.html |
| NEU | Newmarket Corp | newmarketcorp.html |
| APH | Amphenol Corp | amphenolcorp.html |

**Note:** These are derived from the April 20 cache. There may be additional tickers added to the sheet since then that are not reflected here.

---

## HTML on disk but missing from index (2)

These files exist in `reports/` but are not in `reports/index.json` — they may need a `rebuild-report-index.js` pass:

| Ticker | Company | File |
|---|---|---|
| LON:KYGA | Kerry Group PLC | kerrygroupplc.html |
| XPEV | Xpeng Inc - ADR | xpengincadr.html |

---

## Action required

Run the pipeline manually from your Mac Terminal:

```bash
bash /Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4/scripts/run-auto-pipeline.sh
```

Then run universe assignment:

```bash
cd /Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v4 && node scripts/assign-universes.js && npm run build && git add -A && git commit -m "fix: assign universes for new reports $(date +%Y-%m-%d)" && git push origin dyor-v4-work
```

---

## Fix for future automated runs

This scheduled task cannot work reliably from the Cowork sandbox because `gws` is a Mac-local CLI. To fix this permanently, consider one of:

1. **launchd on your Mac** — schedule `run-auto-pipeline.sh` directly via a LaunchAgent `.plist` (runs in your full Mac shell with `gws` on PATH)
2. **Replace `gws` with direct Sheets API calls** — rewrite `fetchSheetData` and `sync-sheet.js` to call `https://sheets.googleapis.com/v4/spreadsheets/...` using a service account key stored in `.openclaw` (accessible from the sandbox)
3. **Cache the sheet before the task runs** — add a pre-step to the Cowork scheduled task that triggers `sync-sheet.js` from your Mac terminal, then the sandbox can use the fresh cache

Option 2 (service account) is the cleanest long-term fix and would make the pipeline fully automatable from any environment.
