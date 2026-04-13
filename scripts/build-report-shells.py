#!/usr/bin/env python3
"""
build-report-shells.py
Generates thin-shell HTML pages for each report JSON.
Each page is a valid HTML shell that loads the report data from JSON client-side.
"""
import os

TEMPLATE_PATH = 'reports/report-template.html'
DATA_DIR = 'reports/data'
OUTPUT_DIR = 'public/reports'

def get_thin_shell_body():
    """Return the thin-shell <body> with absolute paths for all assets."""
    return '''  <body>
  <header>
    <div class="header-inner">
      <a href="/index.html" class="logo">
        <span class="logo-wordmark">DYOR <span>HQ</span></span>
        <span class="logo-badge">AI Research</span>
      </a>
      <nav>
        <ul class="nav-links">
          <li><a href="/index.html">← All Reports</a></li>
        </ul>
      </nav>
    </div>
  </header>
  <main>
    <div class="container">
      <div class="report-loading" style="padding:60px;text-align:center;color:#888;">Loading report...</div>
    </div>
  </main>
  <script src="/assets/js/main.js"></script>
  <script>
    // Extract ticker from URL — handles /CRH-report.html, /crh-report, /CRH-report
    const ticker = window.location.pathname.split('/').pop().replace(/-report(\.html)?$/, '').toUpperCase();
    document.addEventListener('DOMContentLoaded', () => {
      if (typeof loadReport === 'function') {
        loadReport(ticker);
      } else {
        setTimeout(() => { if (typeof loadReport === 'function') loadReport(ticker); }, 100);
      }
    });
  </script>
</body>
'''

def extract_head(template_content):
    """Extract the <head> block from the template."""
    head_start = template_content.find('<head>')
    head_end = template_content.find('</head>')
    if head_start != -1 and head_end != -1:
        head = template_content[head_start:head_end + 7]
        # Use absolute paths for CSS in <head>
        head = head.replace('href="assets/css/main.css"', 'href="/assets/css/main.css"')
        head = head.replace("href='assets/css/main.css'", 'href="/assets/css/main.css"')
        return head.rstrip('\n')
    return ''

def build_shell(template_head):
    """Build a complete thin-shell HTML page."""
    body_content = get_thin_shell_body()
    return f'<!DOCTYPE html>\n<html lang="en">\n{template_head}\n{body_content}\n</html>\n'

def main():
    # Read template
    with open(TEMPLATE_PATH, 'r', encoding='utf-8') as f:
        template = f.read()

    template_head = extract_head(template)
    shell_html = build_shell(template_head)

    # Ensure output dir exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Get all JSON files
    json_files = [f for f in os.listdir(DATA_DIR) if f.endswith('.json')]
    json_files.sort()

    count = 0
    for json_file in json_files:
        ticker = json_file.replace('.json', '')
        output_path = os.path.join(OUTPUT_DIR, f'{ticker}-report.html')

        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(shell_html)

        count += 1

    print(f'{count}/{count} shells generated')
    output_files = [f for f in os.listdir(OUTPUT_DIR) if f.endswith('-report.html')]
    print(f'Output dir: {len(output_files)} -report.html files found')

if __name__ == '__main__':
    main()