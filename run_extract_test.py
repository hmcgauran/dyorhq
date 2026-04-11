#!/usr/bin/env python3
"""Quick extraction test for KGSPY, AIG, A5G."""
import sys, os, re, json
sys.path.insert(0, '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v2/scripts')
import extract_reports as er

REPORTS_DIR = '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v2/reports'

samples = ['KGSPY-2026-04-11.html', 'AIG-2026-04-11.html', 'A5G-2026-04-11.html']

for fn in samples:
    html = open(os.path.join(REPORTS_DIR, fn)).read()
    fmt  = er._detect_format(html)
    meta = er.extract_meta(html)
    kr_block = er._find_section_block(html, 'Key Risks', fmt)
    risks = er.extract_risks(kr_block) if kr_block else []
    ee   = er.extract_entry_exit(html, fmt)
    wso  = er.extract_who_should_own(html, fmt)

    print(f'\n--- {fn} ---')
    print(f'  format:      {fmt}')
    print(f'  conviction:  {meta["conviction"]}')
    print(f'  keyRisks:    {len(risks)} items -> {risks[:2]}')
    print(f'  entryExit:   {repr(ee[:100]) if ee else "(empty)"}')
    print(f'  whoShouldOwn:{repr(wso[:100]) if wso else "(empty)"}')

# Full extraction run
print('\n\n=== Full extraction ===')
er.main()
