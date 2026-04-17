# DYOR remediation priority, 13 April 2026

- Placeholder-content suspect batch count: 30

## Placeholder batch filenames
- ADSE-2026-04-11.html
- AER-2026-04-11.html
- AIB-2026-04-11.html
- ALKS-2026-04-11.html
- ALLE-2026-04-11.html
- APTV-2026-04-11.html
- BIRG-2026-04-11.html
- C43-2026-04-11.html
- CMPR-2026-04-11.html
- ETN-2026-04-11.html
- EXPGF-2026-04-11.html
- FLUT-2026-04-11.html
- FOBK-2026-04-11.html
- FRA:KRZ-2026-04-11.html
- GHRS-2026-04-11.html
- GL9-2026-04-11.html
- ICLR-2026-04-11.html
- ITRMF-2026-04-11.html
- JAZZ-2026-04-11.html
- JHX-2026-04-11.html
- KGSPY-2026-04-11.html
- KRX-2026-04-11.html
- LIN-2026-04-11.html
- LON:DCC-2026-04-11.html
- LON:GFTU-2026-04-11.html
- NVTS-2026-04-11.html
- SLMT-2026-04-11.html
- STE-2026-04-11.html
- SW-2026-04-11.html
- TRIB-2026-04-11.html

## Slug collisions
- `dccplc.html`: DCC-2026-04-11.html vs LON:DCC-2026-04-11.html
- `graftongroupplc.html`: GFTU-2026-04-11.html vs LON:GFTU-2026-04-11.html
- `kerrygroupplc.html`: FRA:KRZ-2026-04-11.html vs kyga-2026-04-07.html

## Recommended keep vs remove
- `dccplc.html`: Keep DCC-2026-04-11.html, remove LON:DCC-2026-04-11.html as the smaller duplicate.
- `graftongroupplc.html`: Keep GFTU-2026-04-11.html, remove LON:GFTU-2026-04-11.html as the smaller duplicate.
- `kerrygroupplc.html`: Keep kyga-2026-04-07.html, remove FRA:KRZ-2026-04-11.html as the clearly broken placeholder duplicate.

Recommendations are based on the current audit JSON and a quick comparison of the collided report files, favouring the fuller non-placeholder page where one is clearly a broken duplicate.
