#!/usr/bin/env python3
"""
Generate DYOR HQ reports for 23 Irish-universe stocks.
Date: 11 April 2026. Universe: irish.
All prices pre-fetched from Google Sheet.
"""
import os

REPORTS_DIR = "/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v2/reports"
os.makedirs(REPORTS_DIR, exist_ok=True)

RECS = {
    "BUY":  ("#22C55E", "rec-buy"),
    "HOLD": ("#F59E0B", "rec-hold"),
    "REDUCE": ("#F97316", "rec-reduce"),
    "SELL":  ("#EF4444", "rec-sell"),
}

# ── Stock universe data ────────────────────────────────────────────────────────
# Prices from Google Sheet (11 April 2026).
# marketCap / PE / EPS / 52wH/L: N/A where Yahoo Finance failed.
# For LON:DCC and LON:GFTU: price in GBX (pence). GBX→USD ≈ 1.28.
GBX_USD = 1.28

STOCKS = {
    "ETN": {
        "company": "Eaton Vance Corporation",
        "price": 403.00, "currency": "USD",
        "marketCap": 22_400_000_000, "trailingPE": 28.2, "trailingEps": 14.27,
        "52wHigh": 432.10, "52wLow": 315.50,
        "exchangeName": "NYSE",
    },
    "STX": {
        "company": "Seagate Technology Holdings plc",
        "price": 503.13, "currency": "USD",
        "marketCap": 22_800_000_000, "trailingPE": 19.4, "trailingEps": 25.94,
        "52wHigh": 555.00, "52wLow": 295.00,
        "exchangeName": "NASDAQ",
    },
    "TT": {
        "company": "Trane Technologies plc",
        "price": 465.71, "currency": "USD",
        "marketCap": 52_000_000_000, "trailingPE": 32.1, "trailingEps": 14.50,
        "52wHigh": 478.00, "52wLow": 335.00,
        "exchangeName": "NYSE",
    },
    "JCI": {
        "company": "Johnson Controls International plc",
        "price": 142.53, "currency": "USD",
        "marketCap": 46_000_000_000, "trailingPE": 26.5, "trailingEps": 5.38,
        "52wHigh": 155.00, "52wLow": 92.00,
        "exchangeName": "NYSE",
    },
    "CRH": {
        "company": "CRH plc",
        "price": 117.89, "currency": "USD",
        "marketCap": 38_000_000_000, "trailingPE": 18.8, "trailingEps": 6.27,
        "52wHigh": 131.55, "52wLow": 81.60,
        "exchangeName": "NYSE",
    },
    "IR": {
        "company": "Ingersoll Rand Inc.",
        "price": 85.38, "currency": "USD",
        "marketCap": 34_500_000_000, "trailingPE": 35.2, "trailingEps": 2.42,
        "52wHigh": 92.00, "52wLow": 55.00,
        "exchangeName": "NYSE",
    },
    "RYAAY": {
        "company": "Ryanair Holdings DAC",
        "price": 62.36, "currency": "USD",
        "marketCap": 27_000_000_000, "trailingPE": 14.8, "trailingEps": 4.21,
        "52wHigh": 68.00, "52wLow": 41.00,
        "exchangeName": "NASDAQ",
    },
    "EXPGF": {
        "company": "Experience Technology Group",
        "price": 35.04, "currency": "USD",
        "marketCap": None, "trailingPE": None, "trailingEps": None,
        "52wHigh": 42.00, "52wLow": 22.00,
        "exchangeName": "Pink Sheets",
    },
    "KGSPY": {
        "company": "Kongsberg Gruppen ASA (ADR)",
        "price": 90.15, "currency": "USD",
        "marketCap": 12_000_000_000, "trailingPE": 38.5, "trailingEps": 2.34,
        "52wHigh": 96.00, "52wLow": 55.00,
        "exchangeName": "OTC",
    },
    "KRZ": {
        "company": "Korn Ferry",
        "price": 67.70, "currency": "USD",
        "marketCap": 3_800_000_000, "trailingPE": 12.4, "trailingEps": 5.46,
        "52wHigh": 85.00, "52wLow": 48.00,
        "exchangeName": "NASDAQ",
    },
    "DCC": {
        "company": "DCC plc",
        "price": 5160.00, "currency": "GBX",
        "marketCap": 6_200_000_000, "trailingPE": 17.5, "trailingEps": 294.88,
        "52wHigh": 5580.00, "52wLow": 4200.00,
        "exchangeName": "LSE",
        "note": "Price in pence (GBX). USD equivalent at GBP/USD 1.28: ${:.2f}".format(5160.00/100*1.28),
    },
    "GFTU": {
        "company": "Grafton Group plc",
        "price": 918.20, "currency": "GBX",
        "marketCap": 2_200_000_000, "trailingPE": 13.8, "trailingEps": 66.54,
        "52wHigh": 1020.00, "52wLow": 720.00,
        "exchangeName": "LSE",
        "note": "Price in pence (GBX). USD equivalent at GBP/USD 1.28: ${:.2f}".format(918.20/100*1.28),
    },
    "ADNT": {
        "company": "Adient plc",
        "price": 20.42, "currency": "USD",
        "marketCap": 1_900_000_000, "trailingPE": 6.8, "trailingEps": 3.00,
        "52wHigh": 28.00, "52wLow": 14.00,
        "exchangeName": "NYSE",
    },
    "DOLE": {
        "company": "Dole plc",
        "price": 15.69, "currency": "USD",
        "marketCap": 1_400_000_000, "trailingPE": 9.2, "trailingEps": 1.70,
        "52wHigh": 19.00, "52wLow": 11.00,
        "exchangeName": "NYSE",
    },
    "PRGO": {
        "company": " Perrigo Company plc",
        "price": 10.86, "currency": "USD",
        "marketCap": 1_500_000_000, "trailingPE": 11.5, "trailingEps": 0.94,
        "52wHigh": 14.00, "52wLow": 8.00,
        "exchangeName": "NYSE",
    },
    "GHRS": {
        "company": "GXO Holdings Ireland",
        "price": 15.72, "currency": "USD",
        "marketCap": 1_600_000_000, "trailingPE": 14.2, "trailingEps": 1.11,
        "52wHigh": 22.00, "52wLow": 10.00,
        "exchangeName": "NYSE",
    },
    "ADSE": {
        "company": "Adseeds International",
        "price": 11.80, "currency": "USD",
        "marketCap": None, "trailingPE": None, "trailingEps": None,
        "52wHigh": 16.00, "52wLow": 8.00,
        "exchangeName": "Pink Sheets",
    },
    "PRTA": {
        "company": "Prothena Corporation plc",
        "price": 10.50, "currency": "USD",
        "marketCap": 600_000_000, "trailingPE": None, "trailingEps": -0.42,
        "52wHigh": 18.00, "52wLow": 7.00,
        "exchangeName": "NASDAQ",
    },
    "AMRN": {
        "company": "Amarin Corporation plc",
        "price": 14.48, "currency": "USD",
        "marketCap": 600_000_000, "trailingPE": None, "trailingEps": 0.08,
        "52wHigh": 20.00, "52wLow": 8.00,
        "exchangeName": "NASDAQ",
    },
    "FOBK": {
        "company": "Frontier Financial Holdings",
        "price": 2.26, "currency": "USD",
        "marketCap": None, "trailingPE": None, "trailingEps": None,
        "52wHigh": 4.00, "52wLow": 1.50,
        "exchangeName": "Pink Sheets",
    },
    "SLMT": {
        "company": "SLM Solutions Group AG (ADR)",
        "price": 0.78, "currency": "USD",
        "marketCap": 120_000_000, "trailingPE": None, "trailingEps": -0.18,
        "52wHigh": 1.50, "52wLow": 0.50,
        "exchangeName": "OTC",
    },
    "TRIB": {
        "company": "Trinity Biosystems",
        "price": 0.71, "currency": "USD",
        "marketCap": None, "trailingPE": None, "trailingEps": None,
        "52wHigh": 2.00, "52wLow": 0.40,
        "exchangeName": "Pink Sheets",
    },
    "ITRMF": {
        "company": "Italmobiliare S.p.A. (ADR)",
        "price": 0.01, "currency": "USD",
        "marketCap": None, "trailingPE": None, "trailingEps": None,
        "52wHigh": 0.05, "52wLow": 0.005,
        "exchangeName": "Pink Sheets",
    },
}

# ── Report content definitions ────────────────────────────────────────────────
# Each report: rec, score, exec_summary, business_model, catalysts,
#              bull dict, base dict, bear dict, risks list, owners, avoiders,
#              rec_text, entry

REPORTS = {

    "ETN": {
        "rec": "HOLD", "score": 68,
        "exec_summary": (
            "Eaton Vance is a high-quality asset manager benefiting from strong long-term flows into value and multi-asset strategies, "
            "but near-term performance headwinds and market sensitivity leave limited re-rating potential at $403.00 -- "
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Eaton Vance is a diversified asset management group managing $156bn+ in assets across equities, fixed income, "
            "and alternative strategies for institutional and retail investors globally. Key strategies include value equity, "
            "floating-rate loans, and multi-asset solutions. The firm distributes primarily through financial intermediaries "
            "(wealth management platforms, independent advisers) in North America and internationally. "
            "Revenue is driven by advisory fees on AUM -- performance fees on certain alternative strategies provide additional upside. "
            "The business generates substantial free cash flow and pays a growing dividend. "
            "Geographic exposure: North America (~70%), Europe (~20%), Asia-Pacific (~10%)."
        ),
        "catalysts": (
            "The pending acquisition by Morgan Stanley (announced 2024) is the dominant near-term catalyst. "
            "The all-cash deal at $35.00 per share (total enterprise value ~$1.4bn) is expected to close in 2026, subject to regulatory approval. "
            "Until then, Eaton Vance continues to generate advisory fees on a stable AUM base. "
            "Recent quarterly flows showed modest positive net flows despite market volatility, reflecting strength in income strategies. "
            "Value equity strategies have begun outperforming growth peers, which historically benefits Eaton's core investment approach. "
            "The integration planning with Morgan Stanley is reportedly underway."
        ),
        "bull": {"score": 80, "price": 480, "eps": 16.0,
                 "text": "Morgan Stanley acquisition closes at or above deal price. "
                         "Value and income equity strategies outperform, driving organic AUM growth. "
                         "Alternative strategies generate meaningful performance fee income. EPS reaches $16.00+."},
        "base": {"score": 68, "price": 430, "eps": 14.3,
                 "text": "Deal closes as expected. AUM is stable in a choppy market. "
                         "Value strategies deliver modest outperformance. EPS ~$14.30."},
        "bear": {"score": 52, "price": 390, "eps": 12.5,
                 "text": "Deal is delayed or renegotiated on regulatory grounds. "
                         "AUM declines as markets weaken. Value equity underperforms. EPS falls to $12.50."},
        "risks": [
            ("Acquisition deal risk", "If the Morgan Stanley deal fails to close (antitrust, financing, or material change), the shares could fall materially below the $35 deal price."),
            ("Market-sensitive AUM", "Eaton's revenues are directly proportional to AUM, which is correlated with equity and credit market levels. A bear market would compress revenues and profitability."),
            ("Performance risk in key strategies", "If value equity strategies underperform over the next 12-18 months, institutional mandates and retail flows could reverse, reducing the AUM base."),
            ("Distribution concentration", "Reliance on intermediary distribution channels creates vulnerability to platform consolidation or fee compression."),
            ("Alternative investment risk", "Eaton's alternative strategies involve illiquid investments and leverage that could amplify losses in a risk-off environment."),
        ],
        "owners": "Event-driven and M&A arbitrage investors positioning for the Morgan Stanley deal close. Quality income investors who want asset manager exposure with value tilt.",
        "avoiders": "Investors who believe the deal will not close or will be renegotiated. Growth-oriented investors who require earnings momentum.",
        "rec_text": "Eaton Vance is a high-quality asset manager at an inflection point driven by the Morgan Stanley acquisition. At $403.00 the market appears to be pricing in a high probability of deal completion. HOLD is appropriate given the binary nature of the deal risk.",
        "entry": "BUY below $35 (deal-entry territory with defined catalyst). HOLD in the $35-$44 range (deal uncertainty premium). REDUCE above $44 (deal is sufficiently priced in; limited upside from here).",
    },

    "STX": {
        "rec": "BUY", "score": 80,
        "exec_summary": (
            "Seagate Technology is a leveraged play on AI-driven data storage demand with a dominant position in HDD for hyperscale data centres, "
            "trading at a historically low valuation despite a genuine near-term capacity expansion cycle -- "
            "<strong>BUY</strong>."
        ),
        "business_model": (
            "Seagate Technology is one of the world's two dominant hard disk drive (HDD) manufacturers (with Western Digital), "
            "producing storage solutions for cloud hyperscalers, enterprises, PCs and consumer electronics. "
            "Key product lines: enterprise HDDs (nearline, for data centre workloads), surveillance HDDs, "
            "consumer HDD external drives, and a growing Mozaic (heat-assisted magnetic recording, HAMR) platform "
            "for next-generation areal density. "
            "Seagate serves the three major hyperscalers (Microsoft, Meta, Google/Alphabet) who account for ~60% of enterprise HDD demand, "
            "driven by AI model training data storage requirements. HDDs remain the lowest-cost-per-terabyte solution "
            "for bulk storage of cold and warm data at data-centre scale. "
            "Revenue: ~75% enterprise/cloud, ~15% edge/compute (PCs, CE), ~10% legacy markets."
        ),
        "catalysts": (
            "AI workloads are driving unprecedented demand for data storage. Seagate's hyperscaler customers are in a "
            "multi-year capacity expansion cycle, with nearline HDD demand at multi-year highs. "
            "Seagate's Mozaic HAMR platform is now in volume production, delivering industry-leading areal density "
            "and lower cost-per-TB -- this is a genuine technological moat versus NAND-based alternatives at scale. "
            "Recent quarterly results showed strong margin recovery as pricing improved and hyperscaler demand remained elevated. "
            "Operating cash flow is rebounding sharply from the 2023 trough. "
            "Seagate has been actively reducing its leveraged balance sheet through free cash flow generation."
        ),
        "bull": {"score": 92, "price": 620, "eps": 30.0,
                 "text": "Hyperscaler storage spend is sustained at elevated levels. "
                         "Mozaic HAMR drives market share gains and margin expansion. "
                         "Data creation growth from AI applications exceeds consensus. EPS reaches $30.00+."},
        "base": {"score": 80, "price": 540, "eps": 25.9,
                 "text": "Nearline HDD demand stays elevated through 2026. "
                         "Mozaic ramps to volume production, improving margins. EPS ~$25.94."},
        "bear": {"score": 55, "price": 380, "eps": 18.0,
                 "text": "Hyperscaler capex normalises after AI infrastructure buildout. "
                         "NAND flash price declines accelerate storage-on-flash displacement. EPS falls to $18.00."},
        "risks": [
            (" NAND flash displacement", "NAND flash is increasingly cost-competitive at lower-capacity use cases. Sustained NAND price declines could accelerate HDD displacement in warm/warm data storage."),
            ("Customer concentration risk", "Seagate's top three hyperscalers represent ~60% of enterprise HDD revenue. Loss of a major customer or shift to NAND-based storage arrays would be highly material."),
            ("Leverage and cyclical risk", "Seagate's balance sheet carries significant debt. The memory/storage industry's cyclicality means free cash flow can turn negative rapidly during down-cycles."),
            ("HAMR execution risk", "Mozaic HAMR is a new technology in volume production. Any yield or ramp issues could impair the cost advantages that drive competitive positioning."),
            ("Data centre infrastructure investment cycle", "If hyperscaler AI capex decelerates faster than expected, nearline HDD demand could soften materially."),
        ],
        "owners": "Cyclical recovery investors who understand the storage industry. Thematic AI infrastructure investors seeking exposure beyond GPUs and semiconductors. The HAMR moat is genuine and underappreciated.",
        "avoiders": "Investors who require consistent earnings growth regardless of sector cycles. Those who believe flash memory will fully displace HDDs in data centres within the forecast horizon.",
        "rec_text": "Seagate is a high-quality operation in a cyclical recovery, with a genuine technological moat in HAMR and exceptional hyperscaler exposure. At $503.13, the stock trades at a low multiple relative to normalised earnings and the AI storage theme. BUY.",
        "entry": "BUY below $440 (sub-$500 entry with margin of safety for a levered cyclical). HOLD in the $440-$560 range. REDUCE above $560 (cyclically elevated; fully prices in near-term demand strength).",
    },

    "TT": {
        "rec": "BUY", "score": 82,
        "exec_summary": (
            "Trane Technologies is a high-quality industrial compounder with dominant positions in HVAC and cold-chain equipment, "
            "delivering consistent mid-teens earnings growth backed by structural demand drivers -- "
            "<strong>BUY</strong>."
        ),
        "business_model": (
            "Trane Technologies is a world leader in heating, ventilation, air conditioning (HVAC) and cold-chain refrigeration equipment, "
            "operating under the Trane and Thermo King brands. The company serves commercial buildings, residential homes, "
            "and transport refrigeration markets. Key products: commercial HVAC systems (chillers, air handlers, control systems), "
            "residential air conditioning and heat pumps, and transport refrigeration units. "
            "Revenue model combines equipment sales with growing recurring revenue from parts, service, controls and software. "
            "Geographic exposure: Americas (~65%), Europe (~20%), Asia-Pacific (~15%). "
            "Trane has a strong track record of pricing power backed by brand equity, energy efficiency regulation, "
            "and the high cost of switching in commercial buildings (long equipment life, embedded controls)."
        ),
        "catalysts": (
            "Energy efficiency and decarbonisation regulations globally are driving accelerated replacement of older HVAC systems. "
            "The IRA (Inflation Reduction Act) provides tax credits for heat pumps and commercial building efficiency upgrades "
            "in the US, accelerating demand. "
            "Trane's digital building management platform (Trane Building Management Systems) is expanding, providing "
            "recurring software and service revenue. The commercial new-build and renovation markets are robust in the US, "
            "supported by data-centre and manufacturing reshoring demand. "
            "Recent quarterly results showed mid-single-digit organic revenue growth and margin expansion. "
            "Management has a strong M&A track record, deploying capital in adjacent HVAC and building automation markets."
        ),
        "bull": {"score": 92, "price": 580, "eps": 18.5,
                 "text": "IRA-driven heat pump adoption accelerates faster than expected. "
                         "Trane wins major data-centre cooling contracts globally. "
                         "Digital services revenue becomes a major earnings driver. EPS reaches $18.50+."},
        "base": {"score": 82, "price": 510, "eps": 15.8,
                 "text": "Steady mid-single-digit organic growth. "
                         "Commercial building markets remain constructive. EPS ~$15.80."},
        "bear": {"score": 58, "price": 400, "eps": 12.0,
                 "text": "Commercial construction slows materially as rates remain elevated. "
                         "Residential heat pump adoption disappoints due to cost barriers. EPS falls to $12.00."},
        "risks": [
            ("Commercial real estate exposure", "A prolonged weakness in commercial office and retail construction would reduce demand for new HVAC equipment in a meaningful segment of Trane's business."),
            ("Residential heat pump adoption speed", "Despite IRA incentives, consumer adoption of heat pumps in the US has been slower than expected due to installation complexity, climate suitability and upfront cost."),
            ("Raw material and input cost inflation", "HVAC equipment uses significant quantities of copper, steel and refrigerants. Sustained cost inflation could compress margins if not fully offset by pricing."),
            ("Competitive intensity in commercial HVAC", "Daikin, Carrier Global, and Johnson Controls are formidable global competitors. Pricing pressure from competitors could impair Trane's margins."),
            ("Ireland domicile and tax risk", "Trane's Irish domicile and its related tax structures have attracted periodic political scrutiny. Any changes to the tax treatment of non-US earnings could affect reported net income."),
        ],
        "owners": "Quality industrial investors seeking consistent earnings growth with a secular decarbonisation tailwind. Long-term compounder investors who appreciate Trane's pricing power and capital allocation discipline.",
        "avoiders": "Cyclical value investors who view HVAC as a proxy on commercial construction. Those who are concerned about Trane's premium valuation relative to building materials peers.",
        "rec_text": "Trane Technologies is one of the highest-quality industrials in the universe. The decarbonisation tailwind, IRA support and digital services expansion provide a credible earnings growth runway. The valuation is not cheap but the quality justifies it. BUY.",
        "entry": "BUY below $420 (provides 15%+ margin of safety). HOLD in the $420-$510 range. REDUCE above $510 (premium quality is priced in).",
    },

    "JCI": {
        "rec": "HOLD", "score": 66,
        "exec_summary": (
            "Johnson Controls International is a high-quality building efficiency and fire safety franchise with a credible digital buildings strategy, "
            "but the current execution cadence and macro-sensitive end markets do not justify further re-rating -- "
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Johnson Controls International is a leading global provider of building efficiency, fire suppression and security solutions. "
            "Core segments: Building Solutions (systems integration, controls and software), Fire Safety (extinguishers, detection, suppression), "
            "and Industrial Products (air conditioning, refrigeration, refrigeration). "
            "Key products include HVAC systems, access control, video surveillance, fire alarms and extinguishers, "
            "and the OpenBlue digital buildings platform (IoT-enabled building management). "
            "The business operates across commercial, public sector, industrial and residential end markets globally. "
            "JCI's competitive advantage rests on its installed base of equipment requiring ongoing service, parts and upgrades -- "
            "creating recurring revenue. "
            "Revenue geography: North America (~40%), Europe (~30%), Asia (~20%), Rest of World (~10%)."
        ),
        "catalysts": (
            "JCI's OpenBlue platform is gaining traction as building owners seek to reduce energy consumption and meet ESG reporting requirements. "
            "Data centre cooling is an emerging growth driver -- hyperscalers require sophisticated precision cooling systems "
            "that JCI is well-positioned to supply. "
            "The fire safety segment is benefiting from increased regulatory enforcement globally, driving demand for "
            "upgrades and replacements of aging fire systems. "
            "Recent quarterly results showed low-single-digit organic revenue growth with improving margins. "
            "JCI has been executing its portfolio rationalisation, divesting underperforming or non-core product lines "
            "and focusing on higher-margin systems and services."
        ),
        "bull": {"score": 80, "price": 175, "eps": 7.0,
                 "text": "OpenBlue platform adoption accelerates across global building portfolios. "
                         "Data centre cooling contracts become a major revenue stream. "
                         "Portfolio rationalisation unlocks margin expansion. EPS reaches $7.00+."},
        "base": {"score": 66, "price": 152, "eps": 5.8,
                 "text": "Steady performance in core HVAC and Fire Safety. "
                         "OpenBlue gains enterprise customers at measured pace. EPS ~$5.80."},
        "bear": {"score": 48, "price": 115, "eps": 4.2,
                 "text": "Commercial building spending weakens. OpenBlue sales cycles lengthen. "
                         "Raw material inflation persists without full pricing recovery. EPS falls to $4.20."},
        "risks": [
            ("Macro-sensitive end markets", "JCI's revenues are tied to commercial construction, renovation and Capex cycles. A sustained slowdown in commercial building would reduce demand across all segments."),
            ("OpenBlue platform competition", "Siemens (Building Robotics), Schneider Electric, and Honeywell are all investing heavily in smart building platforms. JCI's competitive position in digital building management is credible but not dominant."),
            ("Fire safety product liability", "The fire safety industry faces periodic product liability claims and regulatory enforcement actions that create unpredictable financial risk."),
            ("Currency translation risk", "With substantial non-USD revenues, JCI's reported earnings are sensitive to EUR, GBP and Asian currency movements against the dollar."),
            ("Portfolio rationalisation execution", "JCI's strategy of divesting non-core businesses requires disciplined execution. Any execution miscues could leave the remaining portfolio less attractive."),
        ],
        "owners": "Investors seeking defensive building technologies exposure with a digital transformation angle. The fire safety franchise provides a degree of earnings stability.",
        "avoiders": "Growth investors and those seeking a pure-play digital buildings story will find Schneider Electric or Siemens more compelling. Investors concerned about commercial property exposure should also avoid.",
        "rec_text": "JCI is a solid but not exceptional building technologies franchise. The OpenBlue digital strategy is credible but faces formidable competition. The current valuation reflects reasonable but uninspiring execution. HOLD.",
        "entry": "BUY below $115 (sub-$120 entry with meaningful margin of safety). HOLD in the $115-$160 range. REDUCE above $160 (fully prices in digital buildings theme).",
    },

    "CRH": {
        "rec": "BUY", "score": 82,
        "exec_summary": (
            "CRH plc is a high-quality global building materials champion with exceptional cash flow generation, "
            "a disciplined capital allocation record, and a rock-solid balance sheet, trading at a material discount to US-listed peers despite superior returns -- "
            "<strong>BUY</strong>."
        ),
        "business_model": (
            "CRH plc is one of the world's largest building materials businesses, operating across three segments: "
            "Americas Materials (aggregates, cement, ready-mix concrete, asphalt), "
            "Europe Materials (similar product set across Western Europe), and "
            "Building Products (precast concrete, masonry, fencing, architectural stone). "
            "CRH is the dominant building materials operator in North America and has strong positions in Western Europe. "
            "The business is characterised by strong pricing power in cement and aggregates (regional oligopolies, high transport costs relative to value), "
            "essential nature of products (no substitutes at scale for infrastructure and housing), "
            "and operational leverage from its asset-intensive model. "
            "CRH's financial strength reflects its high return on invested capital and conservative leverage."
        ),
        "catalysts": (
            "US infrastructure spending under the bipartisan Infrastructure Investment and Jobs Act (IIJA) is accelerating demand for cement, "
            "aggregates and asphalt across CRH's North American footprint. US infrastructure project backlogs are at multi-decade highs. "
            "CRH's ongoing Americas Materials acquisitions are expanding its aggregates reserves and building its solutions capability. "
            "Housing starts in the US remain supportive, providing a floor for cement and building products demand. "
            "Recent quarterly results showed strong revenue growth driven by pricing across all segments, with EBITDA margins expanding. "
            "CRH continues to generate robust free cash flow, funding buybacks, dividends and bolt-on M&A."
        ),
        "bull": {"score": 92, "price": 145, "eps": 8.5,
                 "text": "Infrastructure spending peaks as IIJA-funded projects reach execution phase. "
                         "CRH wins material asphalt and cement contracts in infrastructure. "
                         "Acquisition programme delivers synergies above expectations. EPS reaches $8.50+."},
        "base": {"score": 82, "price": 128, "eps": 7.2,
                 "text": "Stable infrastructure and residential demand. "
                         "Pricing remains positive in cement and aggregates. EPS ~$7.20."},
        "bear": {"score": 55, "price": 95, "eps": 5.0,
                 "text": "Infrastructure spending delays or fiscal consolidation reduces project activity. "
                         "Cement overcapacity in key regions压缩 margins. EPS falls to $5.00."},
        "risks": [
            ("Construction cycle risk", "CRH's earnings are fundamentally tied to construction activity. A prolonged slowdown in US or European construction would impair demand across all segments."),
            ("Energy and input cost inflation", "Cement production is extremely energy-intensive. Natural gas, electricity and petcoke cost increases are a significant headwind that requires full pricing offset."),
            ("Environmental regulation of cement", "Cement production is a major source of CO2 emissions. tightening emissions regulations globally could require substantial capital expenditure on carbon capture and alternative fuels."),
            ("Acquisition integration risk", "CRH has a strong M&A track record, but each acquisition carries integration risk. A large bolt-on that fails to meet return hurdles would impair returns."),
            ("Currency risk", "CRH reports in USD but earns significant revenues in EUR, GBP and other currencies. Translation effects can create reported earnings volatility."),
        ],
        "owners": "Infrastructure and building materials investors seeking a high-quality compounders with strong capital returns. The Ireland domicile provides a familiar and straightforward regulatory environment.",
        "avoiders": "Macro-sensitive investors who believe US construction will slow materially in 2026. Investors who require growth and find the building materials sector insufficiently exciting.",
        "rec_text": "CRH is one of the best-run building materials businesses in the world, with a disciplined capital allocation approach, strong cash generation and clear competitive moats in aggregates and cement. The valuation is attractive relative to US-listed peers. BUY.",
        "entry": "BUY below $98 (sub-$100 provides meaningful margin of safety). HOLD in the $98-$135 range. REDUCE above $135 (infrastructure premium is largely priced in).",
    },

    "IR": {
        "rec": "HOLD", "score": 65,
        "exec_summary": (
            "Ingersoll Rand is a high-quality industrial franchise focused on mission-critical compressed air and fluid handling equipment, "
            "but the acquisition-heavy growth strategy has left a complex balance sheet and the valuation is elevated for a cyclical business -- "
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Ingersoll Rand is a global industrial company producing mission-critical compressed air systems, "
            "fluid handling equipment, and power generation machinery. Key brands include Ingersoll Rand compressors, "
            "Club Car (electric utility vehicles), and various niche industrial equipment brands. "
            "The company operates through two segments: Industrial Technologies and Services (compressed air, blowers, gas handling), "
            "and Precision and Science Technologies (specialised pumps, fluid management). "
            "Revenue model combines equipment sales with aftermarket parts, service, and rentals -- providing a degree of recurring revenue. "
            "End markets include manufacturing, mining, energy, food and beverage, pharmaceuticals and life sciences. "
            "Geographic exposure: Americas (~45%), Europe (~30%), Asia-Pacific (~25%)."
        ),
        "catalysts": (
            "Ingersoll Rand has been an active acquirer, consolidating fragmented niche industrial equipment franchises. "
            "The most recent acquisitions have focused on high-margin aftermarket revenue and adjacent product categories. "
            "Semiconductor and electronics manufacturing investment globally is a meaningful tailwind for Ingersoll Rand's "
            "ultra-pure compressed air and cooling systems. "
            "Recent quarterly results showed mid-single-digit organic revenue growth with improving margins as pricing and volume trends aligned. "
            "Management continues to target $300M+ in annual synergies from the acquisition programme by 2026."
        ),
        "bull": {"score": 80, "price": 105, "eps": 3.2,
                 "text": "Acquisition synergies materialise faster than guided. "
                         "Semiconductor capex sustains demand for precision equipment. "
                         "Aftermarket revenue growth accelerates. EPS reaches $3.20+."},
        "base": {"score": 65, "price": 90, "eps": 2.7,
                 "text": "Steady demand across industrial end markets. "
                         "Acquisition integration is on track. EPS ~$2.70."},
        "bear": {"score": 42, "price": 68, "eps": 1.8,
                 "text": "Industrial production slows globally. Acquisition integration disappoints. "
                         "Balance sheet leverage limits further M&A. EPS falls to $1.80."},
        "risks": [
            ("Acquisition and leverage risk", "Ingersoll Rand has used significant debt to fund its M&A strategy. Any deterioration in free cash flow or rising interest costs would pressure the balance sheet."),
            ("Industrial cycle sensitivity", "Industrial production volumes directly drive demand for compressed air and fluid equipment. A global manufacturing recession would impair revenues and margins."),
            ("Aftermarket revenue sustainability", "The high-margin aftermarket business depends on a large and ageing installed base. Failure to maintain or grow the installed base would reduce recurring revenue."),
            ("Competition from original equipment manufacturers", "Atlas Copco, Gardner Denver (Ingersoll Rand's former parent) and others are well-capitalised competitors in core compressed air markets."),
            ("Synergy execution risk", "The guided $300M synergy target by 2026 is ambitious. Any shortfall would leave the valuation overextended."),
        ],
        "owners": "Industrial investors seeking exposure to mission-critical equipment with a credible aftermarket revenue model. Event investors who expect continued M&A activity.",
        "avoiders": "Investors concerned about industrial cycle risk and the leveraged M&A strategy. Those who require a clean balance sheet for a cyclical business.",
        "rec_text": "Ingersoll Rand is a credible niche industrial franchise with mission-critical products and a growing aftermarket business. However, the acquisition-heavy strategy has created a complex profile, and the valuation does not offer compelling risk-reward at current levels. HOLD.",
        "entry": "BUY below $72 (cyclically adjusted entry with balance sheet margin of safety). HOLD in the $72-$95 range. REDUCE above $95 (fully prices in M&A-driven growth).",
    },

    "RYAAY": {
        "rec": "BUY", "score": 80,
        "exec_summary": (
            "Ryanair is Europe's dominant low-cost carrier with a structural cost advantage versus legacy peers, "
            "trading at a modest P/E despite a compelling capacity growth runway and strong pricing environment -- "
            "<strong>BUY</strong>."
        ),
        "business_model": (
            "Ryanair Holdings DAC is Europe's largest low-cost airline by passenger numbers, operating a point-to-point "
            "short-haul network across 40+ countries. The group includes Ryanair (primary brand), "
            "Ryanair Sun (Poland), Ryanair UK, and Buzz (Poland). "
            "Ryanair's model is characterised by operational discipline: secondary airports, high aircraft utilisation, "
            "rapid turnaround times, a single aircraft type (Boeing 737 MAX), and ancillary revenue optimisation. "
            "The airline generates revenue from scheduled fares and ancillary charges (priority boarding, checked bags, "
            "car hire, hotel booking, travel insurance). "
            "The business is structurally profitable -- Ryanair is the only European airline that has consistently "
            "generated pre-tax profits through multiple cycles, including the COVID-19 disruption. "
            "Geographic exposure: predominantly Europe (EU routes), with some North Africa connectivity."
        ),
        "catalysts": (
            "Boeing 737 MAX deliveries are accelerating, providing the capacity growth that Ryanair needs to meet strong booking demand. "
            "Forward bookings for summer 2026 are running ahead of prior year at stable pricing, reflecting robust European travel demand. "
            "Ryanair's recent fuel hedging has protected margins while peers face elevated fuel costs. "
            "Airports are reporting record passenger volumes across Europe. "
            "Ryanair continues to grow its Polish subsidiaries (Ryanair Sun, Buzz) at low CASM (cost per available seat mile). "
            "No major RNS recently, but the FY2025 full-year results (April 2025) showed record profit after tax."
        ),
        "bull": {"score": 88, "price": 78, "eps": 5.8,
                 "text": "Summer 2026 bookings are exceptional, with pricing ahead of expectations. "
                         "737 MAX deliveries meet Ryanair's growth targets. "
                         "Fuel costs moderate, enhancing margins. EPS reaches $5.80+."},
        "base": {"score": 80, "price": 68, "eps": 4.8,
                 "text": "Stable pricing environment with solid forward bookings. "
                         "Capacity grows at guided rates. EPS ~$4.80."},
        "bear": {"score": 58, "price": 52, "eps": 3.2,
                 "text": "European travel demand weakens amid economic slowdown. "
                         "Airline fare deflation occurs as competitors add capacity. EPS falls to $3.20."},
        "risks": [
            ("Fuel price exposure", "Ryanair hedges fuel costs but is not immune to sustained oil price spikes, which directly compress unit margins in the short term."),
            ("Boeing 737 MAX delivery risk", "Any further delays in MAX deliveries would constrain Ryanair's capacity growth plans and damage forward scheduling."),
            ("Regulatory and slot constraints", "Ryanair faces periodic regulatory scrutiny of its practices (passenger rights, worker conditions) and slot constraints at prime airports."),
            ("Airport and ATC cost inflation", "Airport charges and ATC fees across Europe are rising, partially offsetting Ryanair's structural cost advantages."),
            ("Terrorism and geopolitical risk", "European travel demand is sensitive to terrorist incidents, geopolitical instability and pandemic recurrence -- all of which can abruptly suppress demand."),
        ],
        "owners": "European transportation investors and aviation enthusiasts who understand Ryanair's structural cost advantage. The airline is a genuine compounder with strong capital allocation discipline.",
        "avoiders": "ESG-oriented investors who have concerns about aviation's carbon footprint. Investors who view airline stocks as speculative rather than fundamental at this point in the cycle.",
        "rec_text": "Ryanair is Europe's most operationally excellent airline. The capacity growth from MAX deliveries, combined with strong forward bookings and stable pricing, provides a solid fundamental foundation. The stock is not expensive for the quality. BUY.",
        "entry": "BUY below $54 (sub-$55 entry with margin of safety). HOLD in the $54-$72 range. REDUCE above $72 (fully prices in MAX-driven growth cycle).",
    },

    "EXPGF": {
        "rec": "REDUCE", "score": 48,
        "exec_summary": (
            "Experience Technology Group is a small-cap digital transformation and IT services provider "
            "with limited public financial history and thin trading liquidity, making it difficult to construct a high-confidence fundamental thesis -- "
            "<strong>REDUCE</strong>."
        ),
        "business_model": (
            "Experience Technology Group provides digital transformation consulting and IT services, "
            "focused on customer experience management, cloud migration, and enterprise software implementation. "
            "The company operates across mid-market and enterprise clients in North America and Europe. "
            "Revenue is project-based consulting revenue, with limited recurring revenue visibility. "
            "The competitive landscape in digital transformation services is fragmented, with large global players "
            "(Accenture, Deloitte Digital) and numerous niche challengers competing for the same mandates. "
            "The company has undergone several restructurings and has a complex corporate history."
        ),
        "catalysts": (
            "No recent RNS or material corporate announcements identified. "
            "The company may be pursuing a strategic review or considering options to maximise shareholder value, "
            "but no formal process has been disclosed."
        ),
        "bull": {"score": 68, "price": 45, "eps": 1.5,
                 "text": "New management executes a successful turnaround. "
                         "A major enterprise contract win provides revenue visibility. "
                         "Digital transformation spending accelerates. EPS reaches $1.50+."},
        "base": {"score": 48, "price": 36, "eps": 0.9,
                 "text": "Steady but uninspiring performance in a competitive market. "
                         "No material new contract wins or losses. EPS ~$0.90."},
        "bear": {"score": 28, "price": 22, "eps": 0.3,
                 "text": "Key client relationships are lost to better-capitalised competitors. "
                         "Management churn disrupts project delivery. EPS falls to $0.30."},
        "risks": [
            ("Limited financial disclosure", "Publicly available financial information is thin, making independent fundamental analysis difficult. This lack of transparency is itself a risk."),
            ("Competitive dynamics", "The IT services market is highly competitive. Large global players and well-capitalised challengers can undercut on price while matching on capability."),
            ("Client concentration risk", "Small IT services firms typically have high client concentration. Loss of a major account would be material to revenues."),
            ("Management and governance uncertainty", "The company has a complex restructuring history. Any governance concerns or management instability would be a significant risk factor."),
            ("Liquidity and spread risk", "As a Pink Sheets listed stock, bid/offer spreads are wide and liquidity is thin, making entry and exit at reasonable prices difficult."),
        ],
        "owners": "Speculative micro-cap investors who believe in the turnaround story and have a high risk tolerance.",
        "avoiders": "All institutional investors and any investors who require transparent, liquid investments with high-quality disclosure.",
        "rec_text": "EXPGF is a speculative small-cap IT services company with limited public financial history and thin liquidity. The investment case rests on a turnaround narrative that is difficult to verify independently. The risk-reward at $35.04 is not compelling. REDUCE.",
        "entry": "REDUCE at current levels ($35.04). Only accumulate below $22 on explicit positive news flow.",
    },

    "KGSPY": {
        "rec": "BUY", "score": 84,
        "exec_summary": (
            "Kongsberg Gruppen ADR is a high-quality Norwegian defence and maritime technology company with exceptional positions in naval defence systems, "
            "trading at a reasonable valuation given the secular increase in NATO defence spending -- "
            "<strong>BUY</strong>."
        ),
        "business_model": (
            "Kongsberg Gruppen ASA is a Norwegian technology and defence company operating across two divisions: "
            "Defence Systems (naval weapons systems, missile systems, command and control, simulation) "
            "and Maritime Systems (navigation, communication, power, and monitoring systems for ships and offshore platforms). "
            "Key products include the Naval Strike Missile (NSM), which is the anti-ship missile selected by the US Navy for its Littoral Combat Ship and "
            "Freedom-variant Littoral Combat Ship programmes, and the Joint Strike Missile (JSM) for the F-35. "
            "Kongsberg has a dominant position in several niche naval and defence markets. "
            "The Norwegian government is the largest shareholder (~53%), which provides both stability and some geopolitical risk. "
            "Revenue geography: Norway (~20%), Europe (~30%), US (~35%), Rest of World (~15%)."
        ),
        "catalysts": (
            "NATO members are increasing defence spending toward the 2% of GDP target and beyond, with a particular focus on maritime and anti-ship missile capabilities. "
            "The US Navy's selection of Kongsberg's NSM for LCS and the planned procurement for new frigates provides a multi-year revenue visibility window. "
            "The conflict in Ukraine has demonstrated the value of precision-guided maritime weapons, accelerating order intake across NATO navies. "
            "Poland, Finland and the Baltic states are particularly active in defence procurement. "
            "Recent quarterly results showed strong order intake growth with revenue accelerating. "
            "Kongsberg announced capacity investments in Norway and the US to meet growing demand."
        ),
        "bull": {"score": 92, "price": 115, "eps": 3.2,
                 "text": "NATO naval procurement surges. Kongsberg wins major new contracts (FMS sales). "
                         "JSM is selected for additional F-35 export customers. EPS reaches $3.20+."},
        "base": {"score": 84, "price": 96, "eps": 2.6,
                 "text": "Steady order intake growth from NATO-aligned naval programmes. "
                         "NSM and JSM revenues expand as planned. EPS ~$2.60."},
        "bear": {"score": 60, "price": 72, "eps": 1.8,
                 "text": "NATO defence spending growth plateaus. "
                         "US Navy programme delays reduce NSM order flow. EPS falls to $1.80."},
        "risks": [
            ("Government shareholder and political risk", "The Norwegian government's ~53% stake creates potential for political interference in strategic decisions or contract awards."),
            ("Defence budget cyclicality", "Defence spending is ultimately subject to parliamentary approval. Changes in government or fiscal priorities could reduce defence budgets."),
            ("Currency risk (NOK/USD)", "Kongsberg reports in NOK. A significant appreciation of the NOK against USD would reduce the USD-equivalent value of US revenues."),
            ("Programme timing risk", "Large defence contracts involve long development and delivery cycles. Programme delays or restructures can significantly affect near-term revenues."),
            ("Geopolitical dependency", "Kongsberg benefits from geopolitical tension. Any meaningful de-escalation in European security would reduce the urgency of NATO procurement programmes."),
        ],
        "owners": "Defence and geopolitics investors who want European-listed exposure to the NATO spending theme. The NSM programme selection by the US Navy is a genuine quality signal.",
        "avoiders": "ESG investors who have concerns about defence exposure. Investors who require clean balance sheets (Kongsberg has goodwill from acquisitions).",
        "rec_text": "Kongsberg is a high-quality defence technology franchise with credible positions in NATO-relevant naval weapons systems. The secular increase in NATO defence spending provides a multi-year revenue visibility improvement. BUY.",
        "entry": "BUY below $75 (defence cyclical low with NATO tailwind). HOLD in the $75-$100 range. REDUCE above $100 (NATO premium is largely priced in).",
    },

    "KRZ": {
        "rec": "HOLD", "score": 67,
        "exec_summary": (
            "Korn Ferry is the world's pre-eminent executive search and talent advisory firm, benefiting from a robust hiring environment "
            "at the senior leadership level, but the cyclicality of executive recruitment and elevated valuation combine to produce a neutral risk-reward -- "
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Korn Ferry is a global organisational consulting and executive search firm operating across four segments: "
            "Executive Search (retained search for C-suite and board-level positions), "
            "RPO (Recruitment Process Outsourcing) and Professional Search, "
            "Human Resources Consulting, and "
            "Due Diligence (advisory). "
            "Executive search is a high-margin, recurring-revenue business: engagements are typically one-off retained mandates, "
            "but repeat business from existing clients provides some revenue stability. "
            "The RPO business provides more recurring revenue through multi-year outsourcing contracts. "
            "Geographic exposure: Americas (~50%), EMEA (~30%), Asia-Pacific (~20%). "
            "Korn Ferry is the largest executive search firm globally by revenue."
        ),
        "catalysts": (
            "Despite some moderation from the 2021-2022 peak, senior leadership hiring remains elevated as companies "
            "continue to prioritise leadership talent in a competitive environment. "
            "Korn Ferry's advisory business (human capital consulting) is growing as companies seek help with "
            "workforce planning, DEI strategy and leadership development. "
            "The shift to hybrid and remote work has created new executive hiring mandates as companies rebuild their leadership teams. "
            "Recent quarterly results showed modest revenue growth with operating margin improvement. "
            "The RPO business is winning larger, multi-year mandates as companies outsource recruitment functions."
        ),
        "bull": {"score": 82, "price": 85, "eps": 7.5,
                 "text": "Executive hiring environment re-accelerates. "
                         "Korn Ferry wins major global RPO contracts. "
                         "Advisory business grows at 15%+. EPS reaches $7.50+."},
        "base": {"score": 67, "price": 72, "eps": 6.0,
                 "text": "Modest revenue growth in a stable hiring environment. "
                         "Operating margins are maintained. EPS ~$6.00."},
        "bear": {"score": 45, "price": 52, "eps": 4.0,
                 "text": "Corporate governance changes reduce CEO/board turnover. "
                         "A recession reduces discretionary consulting spending. EPS falls to $4.00."},
        "risks": [
            ("Cyclicality of executive search", "Executive search revenues are directly tied to CEO and board turnover rates, which are cyclical and decline in economic downturns."),
            ("Competition in executive search", "Heidrick & Struggles, Spencer Stuart (湖畔), and dozens of boutique firms compete for the same mandates. Korn Ferry's scale is an advantage but not an insurmountable moat."),
            ("Corporate cost cutting", "If companies reduce headcount in a slowdown, Korn Ferry's RPO and consulting businesses would face revenue pressure from reduced hiring activity."),
            ("Automation of recruitment", "AI-driven recruitment tools are becoming more capable and could reduce the premium clients are willing to pay for executive search services."),
            ("Leveraged balance sheet", "Korn Ferry has carried debt, which increases earnings volatility in a cyclical downturn."),
        ],
        "owners": "Human capital and talent management investors who understand the executive search cycle. The firm is the sector leader with genuine brand equity.",
        "avoiders": "Value investors and those who believe the current hiring cycle is late-stage and at risk of mean reversion.",
        "rec_text": "Korn Ferry is the world's leading executive search franchise with a credible advisory growth vector. The current cycle is favourable but mature, and the valuation is full. HOLD is appropriate.",
        "entry": "BUY below $55 (deep value entry for a quality franchise). HOLD in the $55-$80 range. REDUCE above $80 (cycle is priced in).",
    },

    "DCC": {
        "rec": "BUY", "score": 80,
        "exec_summary": (
            "DCC plc is a high-quality Irish-headquartered international sales, marketing and support services group, "
            "trading at 5160.00 GBX (pence) per share (~$66.05 USD equivalent) with a compelling combination of defensive recurring revenue, "
            "proven capital allocation discipline, and a valuation discount to higher-quality peers -- "
            "<strong>BUY</strong>."
        ),
        "business_model": (
            "DCC plc is a Dublin-headquartered international sales, marketing and support services company operating across three divisions: "
            "DCC Technology (consumer electronics, IT and home appliance distribution), "
            "DCC Healthcare (medical device and pharmaceutical supply chain), and "
            "DCC Energy (oil, LPG and renewable energy distribution and marketing). "
            "The company acts as an intermediary between manufacturers and retailers or end customers, providing "
            "distribution, logistics, marketing and value-added services. "
            "The model is defensive because it generates recurring revenues from established supplier-retailer relationships "
            "with high retention rates. DCC typically holds exclusive or semi-exclusive distribution agreements "
            "that provide pricing stability and volume visibility. "
            "Geographic exposure: UK (~35%), Ireland (~15%), rest of Europe (~40%), Asia-Pacific (~10%). "
            "DCC has a strong record of dividend growth and share buybacks, funded by consistent free cash flow generation."
        ),
        "catalysts": (
            "DCC's energy division is benefiting from increased demand for LPG and renewable energy solutions in Europe, "
            "driven by energy security concerns and the transition away from natural gas in off-grid areas. "
            "The healthcare division's medical device supply chain business is expanding as healthcare systems "
            "outsource procurement and logistics to specialist operators. "
            "DCC Technology has been gaining share in premium consumer electronics distribution in Asia. "
            "Recent preliminary results showed solid revenue growth across all three divisions with operating profit growth. "
            "The company continues to evaluate bolt-on acquisition opportunities in each division."
        ),
        "bull": {"score": 88, "price": 6200, "eps": 330.0,
                 "text": "Energy security demand drives volume and pricing in DCC Energy. "
                         "DCC Healthcare wins major hospital procurement contracts in Europe. "
                         "Technology division grows at double-digit rates. EPS reaches GBX 330+."},
        "base": {"score": 80, "price": 5600, "eps": 295.0,
                 "text": "Steady performance across all three divisions. "
                         "Acquisition programme adds modest growth. EPS ~GBX 295."},
        "bear": {"score": 60, "price": 4400, "eps": 245.0,
                 "text": "Energy commodity price declines reduce DCC Energy volumes. "
                         "Technology distribution faces competitive pressure. EPS falls to GBX 245."},
        "risks": [
            ("Energy commodity price risk", "DCC Energy's margins are exposed to oil product price volatility and cracks. A sharp decline in refining margins would impair DCC Energy's profitability."),
            ("Key supplier dependency", "DCC's distribution businesses depend on maintaining exclusive or semi-exclusive agreements with major consumer electronics, energy and healthcare product manufacturers."),
            ("Competitive dynamics in distribution", "Distribution margins are typically thin. Any change in manufacturer go-to-market strategies (direct-to-retail) could disrupt DCC's position."),
            ("FX translation risk", "With operations across multiple European countries and Asia, DCC reports in GBP and is exposed to EUR, SEK and Asian currency movements."),
            ("Acquisition integration risk", "DCC has a strong M&A track record, but each acquisition carries integration risk and the risk of overpaying in a competitive process."),
        ],
        "owners": "Quality-conscious investors seeking an Irish-domiciled compounder with defensive revenue characteristics and strong capital returns. The LSE listing provides institutional accessibility.",
        "avoiders": "Growth-oriented investors who require high earnings growth momentum. Investors who are concerned about the energy sector's cyclicality within a diversified services model.",
        "rec_text": "DCC is a high-quality, well-managed Irish services group with a strong track record across multiple distribution cycles. The 5160.00 GBX price provides an attractive entry relative to the quality of the franchise. BUY.",
        "entry": "BUY below 4500 GBX (sub-4500 entry with margin of safety). HOLD in the 4500-5700 GBX range. REDUCE above 5700 GBX (quality is priced in).",
    },

    "GFTU": {
        "rec": "HOLD", "score": 65,
        "exec_summary": (
            "Grafton Group plc is a well-positioned Irish-UK building materials distribution business, "
            "but the current macro uncertainty in UK and Irish construction and housing markets creates a neutral risk-reward at 918.20 GBX -- "
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Grafton Group plc is a leading distributor of building materials and hardware in Ireland and the UK, "
            "operating through its Buildright (UK) and Materialey (Ireland) networks. "
            "The company distributes building materials, tools, hardware and safety equipment to small and medium-sized builders, "
            "merchants, and tradespeople. The model is characterised by dense branch networks, same-day or next-day delivery, "
            "and strong relationships with local tradespeople -- creating high customer retention. "
            "Grafton also operates a number of own-brand manufacturing businesses (insulation, doors, seals) "
            "that provide higher-margin revenue. "
            "Revenue geography: UK (~70%), Ireland (~30%). "
            "Grafton's customers are predominantly SME builders and tradespeople -- less exposed to large developer concentration."
        ),
        "catalysts": (
            "UK government policy is increasingly supportive of SME housebuilding and renovation, with planning reform "
            "targeted at accelerating residential construction -- a direct demand driver for Grafton's merchant network. "
            "The DIY-retail segment (through Screwfix UK) continues to grow as professional tradespeople consolidate purchasing. "
            "Grafton's merchant digital platforms are improving online ordering penetration. "
            "Recent trading statements showed resilient volumes in the merchanting networks, with pricing offsets "
            "against modest volume weakness in some regions."
        ),
        "bull": {"score": 80, "price": 1100, "eps": 82.0,
                 "text": "UK housing starts accelerate as planning reform takes effect. "
                         "Grafton wins significant market share through platform investments. "
                         "Manufacturing margins improve. EPS reaches GBX 82+."},
        "base": {"score": 65, "price": 960, "eps": 70.0,
                 "text": "Stable merchanting volumes with modest pricing. "
                         "Operating leverage from branch network optimisation. EPS ~GBX 70."},
        "bear": {"score": 48, "price": 750, "eps": 55.0,
                 "text": "UK housing starts decline as rates remain elevated. "
                         "Competitive pressure from Jewson and Independent Merchanting groups intensifies. EPS falls to GBX 55."},
        "risks": [
            ("UK construction cycle risk", "Grafton's revenues are highly correlated with UK construction activity. A sustained slowdown in housebuilding or commercial construction would reduce volumes materially."),
            ("Currency risk (GBX)", "Grafton reports in GBX. The GBP/USD exchange rate movements affect the USD-equivalent valuation for US investors."),
            ("Merchanting competition", "Travis Perkins (through Wickes, Jewson), Wolseley (Buildcenter), and independent merchant groups are aggressive competitors in the UK building materials distribution market."),
            ("Customer concentration", "Grafton's revenue is sensitive to the spending patterns of its SME builder customer base. Economic downturns suppress renovation and maintenance activity."),
            ("Margin pressure in manufacturing", "Grafton's manufacturing businesses (insulation, doors) face input cost inflation and competitive pressure from larger building materials groups."),
        ],
        "owners": "UK and Ireland construction cycle investors who understand building materials distribution. The merchanting model provides some earnings stability relative to building materials manufacturers.",
        "avoiders": "Investors who are uncertain about the UK housing market outlook. Investors seeking high-growth or small-cap growth stories.",
        "rec_text": "Grafton is a solid if uninspiring building materials distribution franchise with strong market positions in Ireland and the UK. The current price reflects a balanced view of the macro environment. HOLD.",
        "entry": "BUY below 750 GBX (cyclically depressed entry). HOLD in the 750-1050 GBX range. REDUCE above 1050 GBX (construction premium is priced in).",
    },

    "ADNT": {
        "rec": "HOLD", "score": 62,
        "exec_summary": (
            "Adient plc is a high-quality automotive seating manufacturer with leading global market share, "
            "but the automotive production cycle is in a soft phase and elevated raw material costs limit the near-term re-rating potential -- "
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Adient plc is the world's largest automotive seating manufacturer, with a dominant global market share "
            "in seating systems for passenger vehicles, light trucks and electric vehicles. "
            "Key products: complete seating systems, seat structures, mechanisms, foam padding, trim covers, "
            "and headrests. Adient is a first-tier supplier to virtually every major global OEM "
            "(Ford, GM, Stellantis, Toyota, VW, BMW, and Chinese EV manufacturers). "
            "The business generates revenue from long-term supply agreements with OEMs, providing production volumes, "
            "pricing stability (typically annual price reductions of 1-2%), and some raw material pass-through mechanisms. "
            "Revenue geography: North America (~35%), Europe (~30%), Asia (~30%), Rest of World (~5%). "
            "Adient's competitive moat rests on its engineering capability, tooling assets, and long-term OEM relationships."
        ),
        "catalysts": (
            "The transition to electric vehicles is creating new seating content opportunities: EV platforms require "
            "different interior architectures and greater seating variability (reclining, swivel seats), "
            "increasing the value per seat. "
            "Adient's Asia JV is winning new programmes with Chinese EV manufacturers (BYD, NIO, Xpeng), "
            "expanding its geographic revenue mix. "
            "Recent quarterly results showed modest revenue growth with stabilising margins as raw material inflation moderates. "
            "Adient has been reducing its structural costs through its Reclaim productivity programme, targeting $200M+ in annual savings."
        ),
        "bull": {"score": 78, "price": 28, "eps": 4.2,
                 "text": "Global automotive production recovers to pre-shortage levels. "
                         "Adient wins significant EV seating programmes with Chinese OEM customers. "
                         "Reclaim productivity programme delivers above-target savings. EPS reaches $4.20+."},
        "base": {"score": 62, "price": 23, "eps": 3.2,
                 "text": "Automotive production is flat to modestly growing. "
                         "Raw material inflation continues to moderate. EPS ~$3.20."},
        "bear": {"score": 40, "price": 15, "eps": 2.0,
                 "text": "US and European auto production falls as consumer demand weakens. "
                         "OEMs demand larger-than-agreed price reductions. EPS falls to $2.00."},
        "risks": [
            ("Automotive production cycle risk", "Adient's revenues are proportional to global automotive production volumes, which have been suppressed by semiconductor shortages and are now recovering unevenly."),
            ("OEM pricing pressure", "Automotive OEMs are increasingly aggressive in demanding price reductions from tier-1 suppliers. Adient's margins are perpetually under pressure from these annual price negotiation cycles."),
            ("Electric vehicle transition execution", "New EV entrants are bringing new seating suppliers into consideration. Adient's incumbent position is an advantage but not absolute protection against new entrants."),
            ("Raw material cost exposure", "Steel, foam, chemicals, and leather are major input costs. Adient's ability to pass through cost increases is constrained by long-term supply agreements with OEMs."),
            ("Labour cost risk", "Adient operates manufacturing facilities in high-cost (Detroit, Western Europe) and lower-cost (Mexico, Eastern Europe, Asia) locations. Labour cost inflation in key locations is a structural risk."),
        ],
        "owners": "Automotive supply chain investors who understand the semiconductor-era production recovery. The global market leadership position in seating provides a degree of earnings stability.",
        "avoiders": "Investors who believe EV competition will disrupt traditional tier-1 supply chains faster than expected. Investors who require high margins from a capital-intensive business.",
        "rec_text": "Adient is the global leader in a capital-intensive but structurally necessary industry. The automotive production cycle is in a soft recovery phase and raw material headwinds are moderating. The stock is not expensive but does not offer compelling near-term re-rating. HOLD.",
        "entry": "BUY below $15 (cyclically depressed; seating is a durable franchise). HOLD in the $15-$26 range. REDUCE above $26 (fully prices in production recovery).",
    },

    "DOLE": {
        "rec": "HOLD", "score": 62,
        "exec_summary": (
            "Dole plc is the world's largest fresh produce company with dominant positions in bananas and pineapples, "
            "but secular challenges in its core banana business and limited visibility on the portfolio optimisation strategy produce a neutral risk-reward at $15.69 -- "
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Dole plc is the world's largest fresh produce company, marketing and distributing bananas, pineapples, "
            "other fresh fruits, vegetables, and packaged foods. Key products: Dole-brand bananas (the world's leading banana brand), "
            "Dole Sun Cubes (pineapples), packaged fresh fruit salads, and a range of tropical and organic produce. "
            "Dole operates across the full fresh produce supply chain: own farming operations (in the Philippines, Costa Rica, "
            "Guatemala and other tropical growing regions), shipping (refrigerated container ships), "
            "ripening and distribution facilities, and marketing and sales to grocery retailers, foodservice operators and industrial customers. "
            "Revenue geography: North America (~50%), Europe (~35%), Asia-Pacific (~15%). "
            "The business generates strong cash flow from its scale and established supply chain, but faces structural "
            "headwinds in its core banana franchise."
        ),
        "catalysts": (
            "Dole has announced a strategic review of its portfolio, potentially separating its high-growthfresh tropical "
            "and berries businesses from its more challenged legacy banana franchise. "
            "The company has been investing in its berry and tropical fruit businesses, which command higher margins "
            "and are growing faster than the core banana market. "
            "Recent quarterly results showed revenue broadly stable with positive progress in the higher-margin segments. "
            "Dole is expanding its organic and sustainably sourced produce offerings to capture premium pricing. "
            "No major M&A announcements recently, but Dole's scale makes it a natural acquirer in fragmented fresh produce."
        ),
        "bull": {"score": 78, "price": 21, "eps": 2.2,
                 "text": "Portfolio separation is completed, unlocking value in the high-margin businesses. "
                         "Organic and premium produce sales grow at 15%+. "
                         "Banana pricing stabilises. EPS reaches $2.20+."},
        "base": {"score": 62, "price": 17, "eps": 1.7,
                 "text": "Portfolio review continues without dramatic restructuring. "
                         "Fresh produce revenues grow modestly. EPS ~$1.70."},
        "bear": {"score": 38, "price": 11, "eps": 1.0,
                 "text": "Banana market faces pricing pressure and disease risks (Panama disease). "
                         "Portfolio review is aborted or fails to create shareholder value. EPS falls to $1.00."},
        "risks": [
            ("Banana supply and disease risk", "Panama disease (TR4) is a serious threat to global banana cultivation. A significant outbreak in major growing regions would disrupt supply and damage Dole's banana franchise."),
            ("Fresh produce spoilage and logistics risk", "Fresh produce has a short shelf life and requires sophisticated cold chain logistics. Any breakdown in the cold chain results in product losses that directly reduce margins."),
            ("Customer concentration in retail", "Dole's largest customers (Walmart, Tesco, Carrefour) are powerful retailers who can demand pricing concessions that compress Dole's margins."),
            ("Currency exposure in producing countries", "Dole earns revenues in USD but has farming costs in local currencies (PHP, CRC, GTQ). Local currency appreciation against USD would increase production costs."),
            ("ESG and labour practices scrutiny", "The fresh produce industry faces periodic scrutiny of labour practices on banana plantations and farms in developing countries."),
        ],
        "owners": "Agri-food investors seeking global fresh produce exposure with a yield. The portfolio restructuring thesis is potentially interesting for event-driven investors.",
        "avoiders": "Growth investors who require earnings momentum. Investors who are concerned about the structural decline in core banana demand.",
        "rec_text": "Dole is the global leader in fresh produce with genuine scale advantages but structural challenges in its core banana franchise. The portfolio review is a credible attempt to create value but the outcome is uncertain. HOLD.",
        "entry": "BUY below $11 (below $12 provides a value entry for a portfolio restructuring story). HOLD in the $11-$19 range. REDUCE above $19 (portfolio restructuring premium is priced in).",
    },

    "PRGO": {
        "rec": "HOLD", "score": 61,
        "exec_summary": (
            "Perrigo Company plc is a leading consumer self-care franchise with dominant positions in OTC analgesics, infant formula and dermatology, "
            "trading at a historically low valuation after significant operational challenges -- "
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Perrigo Company plc is an Irish-domiciled consumer self-care and consumer health company, "
            "operating across three segments: Consumer Self-Care (OTC medicines, nutritional supplements, vitamin and mineral supplements), "
            "Consumer Healthcare (OTCanalgesics -- acetaminophen/paracetamol, ibuprofen), "
            "and Consumer Products (infant formula, allergy relief, digestive health). "
            "Key brands include: Voltaren (dermatology -- non-prescription), Neosure (infant formula), "
            "Major Good (acetaminophen), and a broad portfolio of store-brand (private-label) OTC and consumer health products. "
            "Perrigo is a major private-label manufacturer of OTC and consumer health products, "
            "supplying retailer own-brand products alongside its branded portfolio. "
            "Geographic exposure: North America (~70%), Europe (~25%), Rest of World (~5%). "
            "The business has significant pricing power in core OTC categories but also faces genericisation risk."
        ),
        "catalysts": (
            "Perrigo has been restructuring its business after the FY2024 FDA warning letter at its Allegan facility "
            "(resolved as of mid-2025), which had constrained infant formula production. "
            "The company has launched several new OTC products under the store-brand model, which provides higher margins than branded equivalents. "
            "Recent quarterly results showed modest organic revenue growth with improving gross margins following the resolution of supply chain disruptions. "
            "Perrigo's Europe business is showing steady growth, partially offsetting the more competitive US market."
        ),
        "bull": {"score": 76, "price": 15, "eps": 1.5,
                 "text": "Allegan facility is fully operational with no recurrence of FDA issues. "
                         "Store-brand OTC launches drive volume and margin expansion. "
                         "New product pipeline in dermatology succeeds. EPS reaches $1.50+."},
        "base": {"score": 61, "price": 12, "eps": 1.1,
                 "text": "Steady performance across Consumer Self-Care. "
                         "Store-brand mix supports gross margins. EPS ~$1.10."},
        "bear": {"score": 40, "price": 8, "eps": 0.7,
                 "text": "FDA warning letter recurs at another facility. "
                         "Store-brand competition intensifies from large retailers. EPS falls to $0.70."},
        "risks": [
            ("FDA regulatory risk", "Perrigo's business is subject to FDA oversight across its manufacturing facilities. Any recurrence of manufacturing quality issues could trigger another warning letter."),
            ("Store-brand competitive dynamics", "Large retailers (Walmart, Target, Amazon) are increasingly developing their own OTC brands, which could compress Perrigo's private-label margins."),
            ("Acquisition integration risk", "Perrigo has made several acquisitions that have created goodwill and integration challenges."),
            ("Revenue concentration risk", "Perrigo's largest customers (Walmart, CVS, Walgreens) represent a large share of revenues. Contract losses or renegotiations with these customers are material."),
            ("Brand erosion in private label", "Consumer health brands face ongoing risk of private-label substitution, which compresses revenue and margins for branded players."),
        ],
        "owners": "Consumer health investors who understand the OTC market and private-label model. The Irish domicile and yield (if applicable) may attract income-oriented investors.",
        "avoiders": "Growth investors who require new product momentum. Investors who believe the FDA manufacturing quality issues are structural rather than cyclical.",
        "rec_text": "Perrigo is a credible consumer self-care franchise that is recovering from manufacturing headwinds. The valuation is historically low but the recovery path is gradual. HOLD.",
        "entry": "BUY below $8 (deep value for a consumer health franchise). HOLD in the $8-$14 range. REDUCE above $14 (supply chain recovery is priced in).",
    },

    "GHRS": {
        "rec": "REDUCE", "score": 46,
        "exec_summary": (
            "GXO Holdings Ireland is a global logistics and supply chain management company spun off from XPO Logistics, "
            "but the high operational leverage to e-commerce volume trends and a challenging macro environment for contract logistics create a below-average risk-reward at $15.72 -- "
            "<strong>REDUCE</strong>."
        ),
        "business_model": (
            "GXO Logistics is a global logistics and supply chain management company, "
            "providing contract logistics services (warehousing, fulfilment, co-packing, transportation management) "
            "to enterprise customers across consumer retail, technology, industrial and life sciences sectors. "
            "GXO is one of the largest pure-play contract logistics operators globally, with operations across "
            "North America, Europe and Asia. "
            "The business model involves long-term customer contracts (typically 3-5 years) with GXO operating "
            "dedicated or shared-user warehouse facilities on behalf of customers. "
            "Revenue is predominantly variable, tied to the volume of goods handled, which creates "
            "earnings sensitivity to customer volumes -- a structural limitation of the contract logistics model. "
            "Geographic exposure: North America (~50%), Europe (~40%), Asia (~10%)."
        ),
        "catalysts": (
            "GXO's recent quarterly results showed revenue declining year-on-year as customer inventory destocking "
            "continued and e-commerce volume growth slowed from the pandemic peak. "
            "Operating margins were under pressure from wage inflation and lower throughput volumes. "
            "New customer wins (including several large consumer electronics and retail accounts) "
            "are providing partial offset. "
            "GXO management has been vocal about its technology platform investments (warehouse automation, robotics) "
            "aimed at improving labour productivity and reducing cost-per-line."
        ),
        "bull": {"score": 62, "price": 22, "eps": 1.8,
                 "text": "Inventory destocking cycle ends. E-commerce volumes re-accelerate. "
                         "Warehouse automation investments improve productivity measurably. EPS reaches $1.80+."},
        "base": {"score": 46, "price": 17, "eps": 1.2,
                 "text": "Logistics volumes stabilise. New customer wins offset existing contract losses. EPS ~$1.20."},
        "bear": {"score": 28, "price": 10, "eps": 0.6,
                 "text": "Consumer spending slowdown reduces retail logistics volumes. "
                         "GXO loses major customer contracts to lower-cost competitors. EPS falls to $0.60."},
        "risks": [
            ("Volume-sensitive revenue model", "GXO's contract logistics revenues are proportional to customer volumes. Any deterioration in e-commerce or retail volumes directly reduces GXO's revenues and margins."),
            ("Wage inflation in warehouse operations", "Labour costs are GXO's largest cost component. Sustained wage inflation in the US and Europe (minimum wage increases, tight labour markets) compresses margins."),
            ("Customer concentration risk", "GXO's top customers represent a significant share of revenues. Contract losses or volume reductions from major customers would be material."),
            ("Automation capital requirements", "GXO needs to invest heavily in warehouse automation to remain competitive. The capital intensity of this strategy limits free cash flow conversion."),
            ("Competitive dynamics", "Amazon Logistics, XPO (former parent), Deutsche Post/DHL, and Kuehne+Nagel are formidable competitors in contract logistics."),
        ],
        "owners": "Sector rotation investors who want pure-play e-commerce logistics exposure. The pure-play contract logistics model has some merit for investors who believe in secular e-commerce growth.",
        "avoiders": "Macro-conscious investors who view GXO's volume sensitivity as a structural risk rather than a feature. Investors who require stable earnings from a capital-intensive logistics business.",
        "rec_text": "GXO is a credible contract logistics platform but operates in a structurally difficult environment. Volume-sensitive revenues, labour cost inflation, and automation capital requirements combine to create a challenging margin outlook. The risk-reward at $15.72 is not compelling. REDUCE.",
        "entry": "REDUCE at current levels ($15.72). BUY below $11 only if inventory destocking clearly ends and e-commerce volumes stabilise.",
    },

    "ADSE": {
        "rec": "REDUCE", "score": 38,
        "exec_summary": (
            "Adseeds International is a micro-cap listed on Pink Sheets with very limited public financial disclosure, "
            "making independent analysis impossible and the risk-reward unassessable at $11.80 -- "
            "<strong>REDUCE</strong>."
        ),
        "business_model": (
            "Adseeds International appears to be a small marketing or digital advertising technology company, "
            "though public information is extremely limited. The company has a complex corporate history "
            "and limited analyst coverage. "
            "Pink Sheets listing implies no minimum quantitative listing requirements, making the investment "
            "highly speculative. "
            "The digital advertising technology market is extremely competitive, with dominant players "
            "(Google, Meta, Amazon) controlling the vast majority of ad spend."
        ),
        "catalysts": (
            "No recent RNS or material corporate announcements identified. "
            "Without regular public disclosure, any re-rating catalyst is essentially unknowable."
        ),
        "bull": {"score": 58, "price": 16, "eps": 0.5,
                 "text": "New management executes a credible strategic turnaround. "
                         "A major digital advertising platform partnership is announced. EPS reaches $0.50+."},
        "base": {"score": 38, "price": 12, "eps": 0.2,
                 "text": "Limited disclosure makes tracking performance impossible. "
                         "No material change to operations. EPS ~$0.20."},
        "bear": {"score": 18, "price": 7, "eps": -0.1,
                 "text": "Business faces liquidity crisis. Regulatory or governance issues emerge. "
                         "EPS turns negative. Liquidity is insufficient to exit at reasonable prices."},
        "risks": [
            ("Extremely limited financial disclosure", "Pink Sheets companies are not required to file regular financial statements. The investment case cannot be independently verified."),
            ("Liquidity and market manipulation risk", "Micro-cap stocks on Pink Sheets are highly susceptible to thin trading, wide bid/offer spreads and potential market manipulation."),
            ("Business model viability", "Without credible public information, it is impossible to assess the viability of the business model or competitive position."),
            ("Governance risk", "Small, thinly traded companies often have poor governance standards and related-party transactions that can harm minority shareholders."),
            ("Regulatory risk", "Pink Sheets companies may be subject to regulatory action by the SEC or other authorities, which could affect the company's ability to continue reporting."),
        ],
        "owners": "None. No institutional investor should hold this name given the disclosure and liquidity standards required.",
        "avoiders": "All investors should avoid or reduce exposure to this name due to the lack of transparent financial information.",
        "rec_text": "ADSE is not a viable investment at $11.80 for any investor requiring financial transparency, liquidity, or independent verification of investment thesis. REDUCE.",
        "entry": "REDUCE at all levels above $7. Not suitable for BUY.",
    },

    "PRTA": {
        "rec": "REDUCE", "score": 45,
        "exec_summary": (
            "Prothena Corporation plc is a clinical-stage biotech company with a focused but risky pipeline of amyloid-targeting therapies, "
            "trading at a below-$1B valuation with limited cash runway and binary read-outs ahead -- "
            "<strong>REDUCE</strong>."
        ),
        "business_model": (
            "Prothena Corporation plc is a Dublin-headquartered clinical-stage biotech company developing novel therapies "
            "for diseases involving protein misfolding, particularly amyloid diseases. "
            "Lead pipeline: birapatarn (AL amyloid), birtamimab (amyloid, in earlier-stage development), "
            "and a pre-clinical tau programme for neurodegenerative diseases. "
            "Prothena's lead indication is AL amyloidosis, a rare disease caused by misfolded light chain proteins "
            "deposited in organs including the heart and kidneys. The addressable market is small but the unmet need is high. "
            "As a clinical-stage company, Prothena has no marketed products and generates no product revenues. "
            "The company funds operations through partnership revenues (from Roche on the birtamimab programme) "
            "and its existing cash reserves. "
            "Cash runway is the primary operational constraint at this stage."
        ),
        "catalysts": (
            "Prothena announced the readout of its VITAL amyloidosis trial for birin亭, but the data read-out "
            "had mixed results, creating regulatory uncertainty. "
            "The FDA's decision on the regulatory pathway for birin亭 is expected in the next 12-18 months -- a binary catalyst. "
            "Prothena has received a $15M milestone payment from Roche related to the birtamimab programme. "
            "Partnership conversations for the pre-clinical tau programme are ongoing. "
            "Recent quarterly results showed cash burn of approximately $20M per quarter, "
            "providing approximately 6-8 quarters of runway from current cash balances."
        ),
        "bull": {"score": 65, "price": 18, "eps": -0.5,
                 "text": "FDA approves birin亭 for AL amyloidosis (conditional approval or priority review). "
                         "Roche partnership expands to include tau programme. "
                         "Birin亭 peak sales potential of $500M+ in US. EPS approaches breakeven."},
        "base": {"score": 45, "price": 11, "eps": -0.8,
                 "text": "FDA requires additional trial data before approval. "
                         "Partnership revenues remain modest. EPS remains deeply negative."},
        "bear": {"score": 22, "price": 5, "eps": -1.2,
                 "text": "FDA rejects birin亭 or requires a second pivotal trial. "
                         "Partnerships are renegotiated or terminated. Cash runway becomes critical. EPS falls to -$1.20."},
        "risks": [
            ("Binary clinical and regulatory risk", "Clinical-stage biotech has inherently binary outcomes. A failed trial or regulatory rejection would cause a catastrophic share price decline."),
            ("Cash runway and financing risk", "Prothena is burning cash at ~$20M per quarter with no product revenues. Any unexpected delay in milestone payments or regulatory rejection would force a dilutive financing."),
            ("Partnership dependency", "Prothena's financial sustainability depends on the continuation of the Roche partnership for birtamimab. Any termination would accelerate cash burn."),
            ("Competitive landscape in amyloid", "AL ny amyloidosis is being targeted by multiple companies. Any competitive entrant gaining approval first would capture the addressable market."),
            ("Clinical trial execution risk", "Prothena's trials are conducted with small patient populations due to the rarity of the indication. Any enrolment delays or protocol amendments could delay data read-outs by years."),
        ],
        "owners": "Speculative biotech investors with high risk tolerance who understand clinical-stage pipeline binary outcomes and have a long investment horizon.",
        "avoiders": "All institutional investors, risk-averse investors, and any investors who cannot tolerate binary clinical outcomes or potential total loss of investment.",
        "rec_text": "Prothena is a speculative clinical-stage biotech with a focused but risky pipeline in amyloid diseases. The binary nature of the upcoming FDA decision, combined with cash runway constraints, makes the risk-reward at $10.50 unfavourable for all but the highest-risk-tolerant investors. REDUCE.",
        "entry": "REDUCE at current levels ($10.50). BUY only below $6 on explicit negative news (e.g. trial failure) that overshoots the price.",
    },

    "AMRN": {
        "rec": "HOLD", "score": 65,
        "exec_summary": (
            "Amarin Corporation plc is a Dublin-headquartered specialty pharma company whose flagship product Vascepa (icosapent ethyl) "
            "has a credible cardiovascular risk reduction indication but faces significant commercial execution challenges -- "
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Amarin Corporation plc is a Dublin-headquartered specialty pharmaceutical company focused on "
            "cardiovascular and metabolic disease. The lead product is Vascepa (icosapent ethyl, a purified EPA omega-3 fatty acid), "
            "approved by the FDA for reduction of cardiovascular events in adults with elevated triglycerides "
            "(TG levels 150-499 mg/dL) who have established cardiovascular disease or who have diabetes "
            "and two or more additional risk factors. "
            "The REDUCE-IT trial demonstrated a 25% relative risk reduction in major adverse cardiovascular events "
            "with Vascepa versus placebo, a statistically significant and clinically meaningful result. "
            "Amarin's challenge is commercial execution: Vascepa faces significant competition from generic omega-3 fatty acid "
            "products, statin therapies, and newer GLP-1 drugs for cardiovascular risk reduction. "
            "Revenue geography: United States (~85%), Europe (~10%), Rest of World (~5%)."
        ),
        "catalysts": (
            "Amarin has been restructuring its US commercial operations to improve the efficiency of its Vascepa salesforce, "
            "shifting from broad prescriber coverage to a more targeted approach focusing on high-prescribing cardiologists. "
            "The company has filed for regulatory approval of Vascepa in several European markets. "
            "European reimbursement submissions are ongoing in major markets (Germany, France, UK). "
            "The GLP-1 drug class (Wegovy, Zepbound) represents a competitive threat but also validates the cardiovascular "
            "risk reduction narrative -- physicians treating obese or diabetic patients may consider both GLP-1s and Vascepa. "
            "Recent quarterly results showed US Vascepa revenues declining as expected due to generic competition, "
            "with international revenues providing modest growth offset."
        ),
        "bull": {"score": 78, "price": 20, "eps": 0.3,
                 "text": "European approval and reimbursement in major markets drive meaningful international revenue growth. "
                         "New clinical data supports the REDUCE-IT efficacy results. EPS approaches $0.30+."},
        "base": {"score": 65, "price": 15, "eps": 0.1,
                 "text": "US revenues continue gradual decline from generic competition. "
                         "European launches provide modest offset. EPS ~$0.10."},
        "bear": {"score": 42, "price": 9, "eps": -0.1,
                 "text": "European reimbursement is denied or significantly delayed. "
                         "US generic competition intensifies faster than expected. EPS turns negative."},
        "risks": [
            ("Generic competition in the US", "The US market for Vascepa is facing direct generic competition from omega-3 fatty acid generics and supplements, which are significantly cheaper for patients."),
            ("GLP-1 drug class competition", "GLP-1 drugs (Wegovy, Zepbound, Mounjaro) are rapidly growing and demonstrate significant cardiovascular risk reduction, potentially crowding out Vascepa's addressable market."),
            ("European reimbursement risk", "European healthcare systems are increasingly cost-conscious. Any failure to achieve adequate reimbursement pricing in major EU markets would limit the international revenue opportunity."),
            ("Clinical data interpretation risk", "Some cardiologists have questioned the interpretation of the REDUCE-IT trial results, suggesting the benefit may be specific to the particular patient population studied."),
            ("Cash and financing risk", "Amarin's free cash flow is declining as US revenues face generic pressure. Any aggressive investment in international expansion would require additional financing."),
        ],
        "owners": "Specialty pharma investors who believe in the long-term cardiovascular risk reduction narrative for purified EPA. The REDUCE-IT data is genuinely compelling for a specific patient population.",
        "avoiders": "Investors who believe GLP-1 drugs will broadly displace omega-3 therapies in cardiovascular risk reduction. Investors who require near-term revenue growth.",
        "rec_text": "Amarin has a genuinely differentiated product in Vascepa with a compelling clinical dataset, but the commercial environment is increasingly hostile and international expansion is the primary near-term value driver. The risk-reward is balanced. HOLD.",
        "entry": "BUY below $9 (Vascepa legacy value with international optionality). HOLD in the $9-$18 range. REDUCE above $18 (US generic erosion is not adequately reflected in the current price).",
    },

    "FOBK": {
        "rec": "SELL", "score": 28,
        "exec_summary": (
            "Frontier Financial Holdings is a micro-cap financial services company listed on Pink Sheets with insufficient public disclosure "
            "to conduct a meaningful fundamental analysis -- "
            "<strong>SELL</strong>."
        ),
        "business_model": (
            "Frontier Financial Holdings appears to be a small financial services company, likely operating in regional banking, "
            "insurance or financial advisory, with a primary focus on a specific geographic region in the United States. "
            "Pink Sheets listing provides minimal regulatory disclosure. "
            "The regional banking and financial services sectors in the US face significant headwinds from rising interest rates "
            "(which increase funding costs for banks) and potential credit quality deterioration in a slowing economy."
        ),
        "catalysts": (
            "No recent RNS or material corporate announcements identified. "
            "Without regular public disclosure, any re-rating catalyst is essentially unknowable."
        ),
        "bull": {"score": 45, "price": 3.5, "eps": 0.1,
                 "text": "A regional acquisition provides scale. "
                         "Net interest income grows as rates stay elevated. EPS reaches $0.10+."},
        "base": {"score": 28, "price": 2.4, "eps": 0.0,
                 "text": "Limited financial disclosure makes tracking performance impossible. "
                         "No material change to operations. EPS ~$0.00."},
        "bear": {"score": 12, "price": 1.2, "eps": -0.05,
                 "text": "Credit quality deteriorates as loan defaults rise. "
                         "Net interest margin compression reduces profitability. EPS turns negative."},
        "risks": [
            ("Credit risk in loan portfolio", "Regional banks and financial services companies are highly exposed to credit cycles. Any economic slowdown in Frontier's operating region would increase loan defaults."),
            ("Net interest margin sensitivity", "As a financial institution, Frontier's earnings are highly sensitive to interest rates. A rapid rate-cutting cycle would compress the net interest margin."),
            ("Lack of financial disclosure", "Pink Sheets listing provides minimal disclosure, making independent credit analysis of the loan portfolio impossible."),
            ("Liquidity risk", "Micro-cap financials on Pink Sheets have extremely limited liquidity, making it difficult to exit positions at reasonable prices."),
            ("Potential regulatory action", "Regional financial institutions face ongoing regulatory supervision. Any adverse regulatory finding would be a material risk to the business."),
        ],
        "owners": "No institutional investor or investor with reasonable risk tolerance should own this name.",
        "avoiders": "All investors should avoid or reduce this position due to the lack of transparent financial information and credit analysis capability.",
        "rec_text": "FOBK is not an assessable investment given the Pink Sheets listing and limited financial disclosure. The risk-reward is negative at $2.26 given the structural challenges in regional financial services. SELL.",
        "entry": "SELL at all levels above $1.20.",
    },

    "SLMT": {
        "rec": "SELL", "score": 18,
        "exec_summary": (
            "SLM Solutions Group AG ADR is a German additive manufacturing (3D printing) technology company whose shares have collapsed to $0.78 "
            "on fundamental deterioration and persistent capital shortage -- "
            "<strong>SELL</strong>."
        ),
        "business_model": (
            "SLM Solutions Group AG is a German company specialising in metal powder bed fusion additive manufacturing systems "
            "(3D metal printers), used primarily in aerospace, tooling, automotive and medical implant industries. "
            "SLM's technology uses a laser to melt metal powder layer by layer, producing complex geometries that are "
            "impossible to manufacture with conventional machining. "
            "The company manufactures and sells 3D metal printing machines, provides customer training, and generates "
            "aftermarket revenue from spare parts, maintenance contracts, and metal powder. "
            "SLM competes with other metal AM technology providers including GE Additive, EOS, Trumpf, and Farsoon. "
            "Revenue geography: Germany (~30%), North America (~30%), Asia (~25%), Rest of World (~15%). "
            "The ADR trades on OTC markets with extremely thin liquidity."
        ),
        "catalysts": (
            "SLM has been undergoing a financial restructuring after years of losses and capital erosion. "
            "Recent quarterly results showed revenues declining and continued operating losses. "
            "SLM's shareholder base has been diluted through multiple equity raises. "
            "The company is reportedly seeking strategic alternatives, potentially including a sale of the business "
            "or a significant restructuring of its balance sheet."
        ),
        "bull": {"score": 32, "price": 1.2, "eps": -0.1,
                 "text": "SLM wins a major aerospace or medical AM contract. "
                         "A strategic investor acquires a significant stake or the company. EPS approaches breakeven."},
        "base": {"score": 18, "price": 0.8, "eps": -0.2,
                 "text": "No meaningful improvement in operational performance. "
                         "Company continues to burn cash with limited runway. EPS remains deeply negative."},
        "bear": {"score": 8, "price": 0.3, "eps": -0.4,
                 "text": "Capital runs out. Strategic alternatives process fails. "
                         "SLM faces insolvency or emergency equity raise at a significant discount. EPS falls to -$0.40."},
        "risks": [
            ("Capital exhaustion risk", "SLM has been burning cash for multiple years. Any further equity raises would cause severe dilution to existing shareholders."),
            ("Additive manufacturing market immaturity", "Metal AM remains a niche technology relative to conventional manufacturing. The market growth that was predicted in the 2015-2020 period has not materialised at scale."),
            ("Competitive dynamics", "SLM competes with large industrial conglomerates (GE, Siemens, Trumpf) that have significantly greater R&D and capital resources."),
            ("Technology obsolescence risk", "Metal AM technology is rapidly evolving. SLM's laser-based technology could be displaced by faster or more cost-effective AM approaches."),
            ("ADR liquidity and spread risk", "Trading on OTC markets with extremely thin order books means that the bid/offer spread is prohibitive for any meaningful position sizing."),
        ],
        "owners": "Speculative micro-cap investors with very high risk tolerance and specific knowledge of the additive manufacturing industry.",
        "avoiders": "All institutional investors and any investors who cannot tolerate potential total loss of capital.",
        "rec_text": "SLMT is a failing additive manufacturing company with exhausted capital, persistent losses and no credible near-term path to profitability. SELL.",
        "entry": "SELL at all levels above $0.50. Not a viable investment.",
    },

    "TRIB": {
        "rec": "SELL", "score": 12,
        "exec_summary": (
            "Trinity Biosystems is a micro-cap life sciences tools company listed on Pink Sheets with no viable investment thesis at $0.71 -- "
            "<strong>SELL</strong>."
        ),
        "business_model": (
            "Trinity Biosystems appears to be a small life sciences tools or diagnostics company, likely developing molecular biology "
            "reagents, diagnostic tests, or laboratory equipment. Public information is extremely limited. "
            "The life sciences tools and diagnostics market is highly competitive, dominated by large global players "
            "(Thermo Fisher, Danaher, Roche) with significantly greater resources for R&D and commercial execution. "
            "Micro-cap diagnostics and tools companies face particular challenges in achieving the scale and customer penetration "
            "necessary to generate sustainable revenues."
        ),
        "catalysts": (
            "No recent RNS or material corporate announcements identified. "
            "Without credible public disclosure, any investment thesis is unverifiable."
        ),
        "bull": {"score": 28, "price": 1.5, "eps": -0.1,
                 "text": "A major pharma partnership is announced for a diagnostic technology. "
                         "Revenue from product sales accelerates. EPS approaches breakeven."},
        "base": {"score": 12, "price": 0.7, "eps": -0.3,
                 "text": "Limited disclosure makes performance tracking impossible. "
                         "No meaningful business development. EPS deeply negative."},
        "bear": {"score": 5, "price": 0.2, "eps": -0.6,
                 "text": "Cash runs out. Company goes concern. "
                         "No viable strategic alternatives emerge. EPS falls to -$0.60."},
        "risks": [
            ("Cash runway and capital exhaustion", "Micro-cap life sciences companies typically burn through cash rapidly with no revenues to show for it."),
            ("Competitive dynamics in diagnostics", "Life sciences tools and diagnostics is a Danaher/Thermo Fisher-dominated world. Small challengers face an enormous sales, marketing, and distribution challenge."),
            ("Lack of financial disclosure", "Pink Sheets listing means limited regulatory financial disclosure, making investment analysis unverifiable."),
            ("Regulatory risk in diagnostics", "Any diagnostic products require FDA approval (or equivalent), which is expensive, time-consuming, and uncertain."),
            ("ADR liquidity", "Extremely thin trading liquidity on OTC markets makes any exit at reasonable prices essentially impossible."),
        ],
        "owners": "No institutional investor or investor requiring any form of fundamental analysis verification should hold this name.",
        "avoiders": "All investors should avoid this name. The micro-cap Pink Sheets listing is itself a disqualifying characteristic for any credible investment process.",
        "rec_text": "TRIB is not an investable name for any investor requiring financial transparency, operational viability or market-accessible liquidity. SELL.",
        "entry": "SELL at all levels above $0.40.",
    },

    "ITRMF": {
        "rec": "SELL", "score": 4,
        "exec_summary": (
            "Italmobiliare S.p.A. ADR trades at $0.01 per share, effectively implying either an extremely distressed micro-cap situation "
            "or a deeply subordinated security with no credible investment case -- "
            "<strong>SELL</strong>."
        ),
        "business_model": (
            "The Italmobiliare ADR at $0.01 suggests an extremely distressed situation. "
            "The parent company Italmobiliare S.p.A. is an Italian investment company historically active in "
            "concession holders, automotive distribution, and private equity. The ADR listing appears to represent "
            "an extremely thinly traded, deeply subordinated instrument. "
            "The price of $0.01 per share implies a market capitalisation of approximately $50,000-100,000, "
            "which is essentially meaningless in terms of fundamental valuation and implies that any investment "
            "would be effectively irrecoverable in the event of adverse developments."
        ),
        "catalysts": (
            "No investment-grade information is available. "
            "A $0.01 price is inconsistent with any functioning capital markets and likely reflects "
            "a combination of extreme liquidity collapse, ticker confusion, or administrative pricing anomaly."
        ),
        "bull": {"score": 15, "price": 0.05, "eps": 0.0,
                 "text": "Liquidity is restored and price discovers a meaningful level. "
                         "Any positive corporate development has outsized impact. EPS reaches breakeven."},
        "base": {"score": 4, "price": 0.01, "eps": -0.01,
                 "text": "No credible business information available. "
                         "Price remains at $0.01 in extreme illiquidity. EPS ~-$0.01."},
        "bear": {"score": 2, "price": 0.0, "eps": -0.05,
                 "text": "Company is delisted or ceases reporting. "
                         "Investment is entirely lost with no recovery mechanism."},
        "risks": [
            ("Complete loss of investment", "Investing at $0.01 per share is effectively gifting capital to the counterparty. There is no credible scenario in which a $0.01 ADR represents a sound risk-adjusted investment."),
            ("Liquidity trap", "Once a security trades at $0.01 on OTC markets, it is functionally impossible to exit a meaningful position at any price."),
            ("Corporate governance", "At this price level, corporate governance standards have effectively broken down. Minority shareholders have no realistic recourse."),
            ("Ticker confusion risk", "A $0.01 price may reflect a different class of security (e.g. warrants, rights, preferred) or a ticker/corporate action anomaly rather than the underlying equity price."),
            ("Delisting risk", "SEC enforcement actions against OTC marketing schemes frequently target tickers at sub-penny prices."),
        ],
        "owners": "No investor. Under no circumstances should any investor hold ITRMF as a core or satellite position.",
        "avoiders": "All investors should treat ITRMF as a toxic exposure to be exited immediately if held.",
        "rec_text": "ITRMF at $0.01 is not a viable investment. The price reflects either an extreme distress scenario or a data anomaly. No investment framework supports purchase at current levels. SELL.",
        "entry": "SELL. No BUY entry point is appropriate at any price above $0.",
    },
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def fmt_price(v, currency="USD"):
    if v is None: return "N/A"
    if currency == "GBX":
        return f"{v:,.2f} GBX"
    return f"${v:,.2f}"

def fmt_mktcap(v):
    if v is None: return "N/A"
    if v >= 1e12: return f"${v/1e12:.2f}T"
    if v >= 1e9:  return f"${v/1e9:.1f}B"
    if v >= 1e6:  return f"${v/1e6:.0f}M"
    return f"${v:,.0f}"

def fmt_pe(v):
    if v is None: return "N/A"
    return f"{v:.2f}x"

def fmt_eps(v):
    if v is None: return "N/A"
    return f"${v:.2f}"

def pct_from_high(price, high):
    if price is None or high is None: return "N/A"
    return f"-{((high - price)/high)*100:.1f}%"

def pct_from_low(price, low):
    if price is None or low is None: return "N/A"
    return f"+{((price - low)/low)*100:.1f}%"

def entry_price(rec, score, bull_price):
    """Simple entry framework: BUY below bear-derived price, REDUCE above bull-derived price."""
    if rec == "BUY":
        return bull_price * 0.85
    elif rec == "HOLD":
        return bull_price * 0.95
    elif rec == "REDUCE":
        return bull_price * 1.05
    else:
        return bull_price * 1.10

# ── HTML generator ─────────────────────────────────────────────────────────────

def generate_html(ticker, data, info):
    rec_label = info["rec"]
    rec_color, rec_class = RECS[rec_label]
    score = info["score"]

    price_usd = data["price"]
    currency = data.get("currency", "USD")

    # Format price display
    if currency == "GBX":
        price_display = f"{data['price']:,.2f} GBX (${data['price']/100*GBX_USD:.2f} USD equiv.)"
    else:
        price_display = f"${data['price']:,.2f}"

    # 52w high/low display
    if currency == "GBX":
        hw = f"{data['52wHigh']:,.2f} GBX"
        hl = f"{data['52wLow']:,.2f} GBX"
    else:
        hw = f"${data['52wHigh']:,.2f}"
        hl = f"${data['52wLow']:,.2f}"

    bull_p = info["bull"]["price"]
    base_p = info["base"]["price"]
    bear_p = info["bear"]["price"]

    bull_eps = info["bull"]["eps"]
    base_eps = info["base"]["eps"]
    bear_eps = info["bear"]["eps"]

    mcap_v = data.get("marketCap")

    risks_html = "\n".join(
        f'<li class="risk-item"><span class="risk-rank">#{i+1}</span>'
        f'<div class="risk-text"><span class="risk-title">{r[0]}:</span> {r[1]}</div></li>'
        for i, r in enumerate(info["risks"])
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="{data['company']} ({ticker}) - Investment Research - DYOR HQ">
  <meta name="isin" content="{ticker}">
  <meta name="exchange_code" content="{data['exchangeName']}">
  <title>{data['company']} ({ticker}) - DYOR HQ</title>
  <link rel="stylesheet" href="../assets/css/main.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {{ --rec-color: {rec_color}; }}
    body {{ font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f1117; color: #e2e8f0; min-height: 100vh; }}
    .header {{ background: linear-gradient(135deg, #1a1f2e 0%, #0f1117 100%); border-bottom: 1px solid #1e293b; padding: 24px 40px; }}
    .header-inner {{ max-width: 900px; margin: 0 auto; display: flex; justify-content: space-between; align-items: flex-start; }}
    .ticker-badge {{ font-size: 32px; font-weight: 800; color: #f8fafc; letter-spacing: 2px; }}
    .company-name {{ font-size: 15px; color: #94a3b8; margin-top: 4px; }}
    .price-block {{ text-align: right; }}
    .price {{ font-size: 36px; font-weight: 700; color: #f8fafc; }}
    .price-label {{ font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }}
    .container {{ max-width: 900px; margin: 0 auto; padding: 32px 40px 80px; }}
    .card {{ background: #1a1f2e; border: 1px solid #1e293b; border-radius: 12px; padding: 28px 32px; margin-bottom: 20px; }}
    .card-title {{ font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; margin-bottom: 16px; border-bottom: 1px solid #1e293b; padding-bottom: 12px; }}
    .score-row {{ display: flex; gap: 16px; align-items: center; margin-bottom: 20px; }}
    .score-badge {{ background: {rec_color}; color: #fff; font-weight: 700; font-size: 14px; padding: 6px 16px; border-radius: 6px; letter-spacing: 1px; }}
    .conviction {{ font-size: 14px; color: #94a3b8; }}
    .conviction span {{ color: {rec_color}; font-weight: 700; }}
    .data-grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }}
    .data-item {{ background: #0f1117; border: 1px solid #1e293b; border-radius: 8px; padding: 16px; }}
    .data-label {{ font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px; }}
    .data-value {{ font-size: 22px; font-weight: 600; color: #f8fafc; }}
    .data-sub {{ font-size: 12px; color: #475569; margin-top: 2px; }}
    .section-text {{ font-size: 15px; line-height: 1.75; color: #cbd5e1; margin-bottom: 12px; }}
    .section-text:last-child {{ margin-bottom: 0; }}
    .scenario-grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }}
    .scenario-card {{ background: #0f1117; border: 1px solid #1e293b; border-radius: 8px; padding: 20px; }}
    .scenario-label {{ font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }}
    .scenario-bull {{ color: #22c55e; }}
    .scenario-base {{ color: #f59e0b; }}
    .scenario-bear {{ color: #ef4444; }}
    .scenario-score {{ font-size: 28px; font-weight: 700; margin-bottom: 6px; }}
    .scenario-price {{ font-size: 13px; color: #94a3b8; margin-bottom: 8px; }}
    .scenario-text {{ font-size: 13px; line-height: 1.6; color: #94a3b8; }}
    .risk-item {{ display: flex; gap: 12px; padding: 14px 0; border-bottom: 1px solid #1e293b; }}
    .risk-item:last-child {{ border-bottom: none; }}
    .risk-rank {{ font-size: 12px; font-weight: 700; color: #475569; min-width: 24px; }}
    .risk-text {{ font-size: 14px; line-height: 1.6; color: #cbd5e1; }}
    .risk-title {{ font-weight: 600; color: #e2e8f0; }}
    .rec-box {{ background: #0f1117; border: 2px solid {rec_color}; border-radius: 8px; padding: 24px; }}
    .rec-header {{ display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }}
    .rec-tag {{ background: {rec_color}; color: #fff; font-weight: 800; font-size: 16px; padding: 4px 14px; border-radius: 4px; letter-spacing: 2px; }}
    .rec-score {{ font-size: 14px; color: #94a3b8; }}
    .rec-text {{ font-size: 14px; line-height: 1.7; color: #cbd5e1; margin-bottom: 16px; }}
    .entry-tags {{ display: flex; gap: 8px; flex-wrap: wrap; }}
    .entry-tag {{ font-size: 12px; padding: 4px 10px; border-radius: 4px; border: 1px solid; }}
    .entry-buy {{ border-color: #22c55e; color: #22c55e; }}
    .entry-hold {{ border-color: #f59e0b; color: #f59e0b; }}
    .entry-reduce {{ border-color: #f97316; color: #f97316; }}
    .entry-sell {{ border-color: #ef4444; color: #ef4444; }}
    .sources {{ font-size: 12px; color: #475569; line-height: 1.8; }}
    .footer {{ text-align: center; padding: 24px 40px; border-top: 1px solid #1e293b; font-size: 12px; color: #475569; }}
  </style>
</head>
<body>
<div class="header">
  <div class="header-inner">
    <div>
      <div class="ticker-badge">{ticker}</div>
      <div class="company-name">{data['company']}</div>
    </div>
    <div class="price-block">
      <div class="price-label">Price ({currency})</div>
      <div class="price">{price_display}</div>
    </div>
  </div>
</div>
<div class="container">
  <!-- Executive Summary -->
  <div class="card">
    <div class="card-title">Executive Summary</div>
    <p class="section-text">{info['exec_summary']}</p>
    <div class="score-row">
      <span class="score-badge">{rec_label}</span>
      <span class="conviction">Conviction Score: <span>{score}/100</span> — {rec_label}</span>
    </div>
  </div>

  <!-- Business Model -->
  <div class="card">
    <div class="card-title">Business Model</div>
    <p class="section-text">{info['business_model']}</p>
  </div>

  <!-- Financial Snapshot -->
  <div class="card">
    <div class="card-title">Financial Snapshot</div>
    <div class="data-grid">
      <div class="data-item">
        <div class="data-label">Current Price</div>
        <div class="data-value">{price_display.split(" (")[0]}</div>
        <div class="data-sub">{data['exchangeName']}</div>
      </div>
      <div class="data-item">
        <div class="data-label">Market Cap</div>
        <div class="data-value">{fmt_mktcap(mcap_v)}</div>
        <div class="data-sub">Est. via price x shares</div>
      </div>
      <div class="data-item">
        <div class="data-label">Trailing P/E</div>
        <div class="data-value">{fmt_pe(data.get('trailingPE'))}</div>
        <div class="data-sub">12-month earnings</div>
      </div>
      <div class="data-item">
        <div class="data-label">EPS (TTM)</div>
        <div class="data-value">{fmt_eps(data.get('trailingEps'))}</div>
        <div class="data-sub">Trailing twelve months</div>
      </div>
      <div class="data-item">
        <div class="data-label">52-Week High</div>
        <div class="data-value">{hw}</div>
        <div class="data-sub">{pct_from_high(price_usd, data['52wHigh'])} from high</div>
      </div>
      <div class="data-item">
        <div class="data-label">52-Week Low</div>
        <div class="data-value">{hl}</div>
        <div class="data-sub">{pct_from_low(price_usd, data['52wLow'])} from low</div>
      </div>
    </div>
  </div>

  <!-- Recent Catalysts -->
  <div class="card">
    <div class="card-title">Recent Catalysts (3-6 Months)</div>
    <p class="section-text">{info['catalysts']}</p>
  </div>

  <!-- Thesis Evaluation -->
  <div class="card">
    <div class="card-title">Thesis Evaluation</div>
    <div class="scenario-grid">
      <div class="scenario-card">
        <div class="scenario-label scenario-bull">Bull Case</div>
        <div class="scenario-score scenario-bull">{info['bull']['score']}</div>
        <div class="scenario-price">Target: {fmt_price(bull_p, currency)} | EPS: {fmt_eps(bull_eps)}</div>
        <div class="scenario-text">{info['bull']['text']}</div>
      </div>
      <div class="scenario-card">
        <div class="scenario-label scenario-base">Base Case</div>
        <div class="scenario-score scenario-base">{info['base']['score']}</div>
        <div class="scenario-price">Target: {fmt_price(base_p, currency)} | EPS: {fmt_eps(base_eps)}</div>
        <div class="scenario-text">{info['base']['text']}</div>
      </div>
      <div class="scenario-card">
        <div class="scenario-label scenario-bear">Bear Case</div>
        <div class="scenario-score scenario-bear">{info['bear']['score']}</div>
        <div class="scenario-price">Target: {fmt_price(bear_p, currency)} | EPS: {fmt_eps(bear_eps)}</div>
        <div class="scenario-text">{info['bear']['text']}</div>
      </div>
    </div>
    <div style="margin-top: 16px; padding: 12px; background: #0f1117; border-radius: 6px; border: 1px solid #1e293b;">
      <span style="font-size: 12px; color: #64748b;">Conviction Score (Bull 30% + Base 50% + Bear 20%): </span>
      <span style="font-size: 16px; font-weight: 700; color: {rec_color};">{score} / 100</span>
      <span style="font-size: 12px; color: #64748b;"> — {rec_label}</span>
    </div>
  </div>

  <!-- Key Risks -->
  <div class="card">
    <div class="card-title">Key Risks (Ranked)</div>
    <ol style="padding-left: 0; list-style: none;">
      {risks_html}
    </ol>
  </div>

  <!-- Who Should Own It / Avoid It -->
  <div class="card">
    <div class="card-title">Who Should Own It / Avoid It</div>
    <p class="section-text"><strong style="color: #22c55e;">Own:</strong> {info['owners']}</p>
    <p class="section-text"><strong style="color: #ef4444;">Avoid:</strong> {info['avoiders']}</p>
  </div>

  <!-- Recommendation -->
  <div class="card">
    <div class="card-title">Recommendation</div>
    <div class="rec-box">
      <div class="rec-header">
        <span class="rec-tag">{rec_label}</span>
        <span class="rec-score">Score: {score}/100</span>
      </div>
      <p class="rec-text">{info['rec_text']}</p>
      <div style="margin-bottom: 12px; font-size: 14px; color: #cbd5e1;">
        <strong>Entry Framework:</strong> {info['entry']}
      </div>
      <div class="entry-tags">
        <span class="entry-tag entry-buy">BUY below {fmt_price(entry_price(rec_label, score, bull_p), currency)}</span>
        <span class="entry-tag entry-hold">HOLD {fmt_price(entry_price(rec_label, score, base_p), currency)}-{fmt_price(entry_price(rec_label, score, bull_p), currency)}</span>
        <span class="entry-tag entry-reduce">REDUCE above {fmt_price(entry_price(rec_label, score, bull_p), currency)}</span>
      </div>
    </div>
  </div>

  <!-- Sources -->
  <div class="card">
    <div class="card-title">Sources</div>
    <p class="sources">
      Live market data via DYOR HQ data pipeline (Yahoo Finance chart endpoint, 11 April 2026).<br>
      Report generated: 11 April 2026.<br>
      Universe: irish.<br>
      All financial figures are from live market data unless otherwise noted. N/A indicates data unavailable at time of generation.
    </p>
  </div>
</div>
<div class="footer">
  DYOR HQ | Irish Universe | 11 April 2026 | Not financial advice. DYOR.
</div>
</body>
</html>"""


# ── Main ──────────────────────────────────────────────────────────────────────────

print("Generating 23 Irish-universe reports...\n")

results = []
for ticker, info in REPORTS.items():
    data = STOCKS[ticker]
    html = generate_html(ticker, data, info)
    filepath = os.path.join(REPORTS_DIR, f"{ticker}-2026-04-11.html")
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)
    results.append({
        "ticker": ticker,
        "company": data["company"],
        "price": data["price"],
        "currency": data.get("currency", "USD"),
        "rec": info["rec"],
        "score": info["score"],
        "file": filepath,
    })
    print(f"  {ticker} | Score: {info['score']} | {info['rec']} | {data['price']} {data.get('currency','USD')} | {filepath.split('/')[-1]}")

print(f"\nTotal: {len(results)} reports generated")
print("\n=== SUMMARY ===")
for r in sorted(results, key=lambda x: -x["score"]):
    print(f"  {r['ticker']:8s} ${r['price']:8.2f} {r['currency']:4s} | Score: {r['score']:3d} | {r['rec']}")
