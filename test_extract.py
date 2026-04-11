#!/usr/bin/env python3
import sys
sys.path.insert(0, '/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v2/scripts')
import extract_reports as er
import json

files = er.find_report_files()
print(f"Found {len(files)} files")
print("Testing 5 sample files...")

for ticker, fn in files[:5]:
    html = open(f'/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v2/reports/{fn}').read()
    fmt = er._detect_format(html)
    meta = er.extract_meta(html)
    kr_block = er._find_section_block(html, 'Key Risks', fmt)
    ee = er.extract_entry_exit(html, fmt)
    wso = er.extract_who_should_own(html, fmt)
    print(f"\n{ticker} ({fn})")
    print(f"  format: {fmt}")
    print(f"  conviction: {meta['conviction']}")
    print(f"  keyRisks block: {repr(kr_block[:100]) if kr_block else '(empty)'}")
    print(f"  entryExit: {repr(ee[:80]) if ee else '(empty)'}")
    print(f"  whoShouldOwn: {repr(wso[:80]) if wso else '(empty)'}")
