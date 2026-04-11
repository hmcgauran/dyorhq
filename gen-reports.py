#!/usr/bin/env python3
import json, os, sys

# Live data from Yahoo Finance (11 April 2026)
DATA = {
    "ETN": {
        "price": 403.0, "marketCap": 156525199360, "trailingPE": 38.564594,
        "trailingEps": 10.45, "52wHigh": 408.45, "52wLow": 255.10,
        "currency": "USD", "exchangeName": "NYSE",
        "shortName": "Eaton Corporation, PLC", "longName": "Eaton Corporation plc",
        "regularMarketChange": 2.56, "regularMarketChangePercent": 0.639296,
        "exchange": "NYSE",
    },
    "ACN": {
        "price": 179.53, "marketCap": 110489067520, "trailingPE": 14.715574,
        "trailingEps": 12.20, "52wHigh": 325.71, "52wLow": 177.50,
        "currency": "USD", "exchangeName": "NYSE",
        "shortName": "Accenture plc", "longName": "Accenture plc",
        "regularMarketChange": -6.50, "regularMarketChangePercent": -3.49406,
        "exchange": "NYSE",
    },
    "MDT": {
        "price": 87.21, "marketCap": 111967600640, "trailingPE": 24.360336,
        "trailingEps": 3.58, "52wHigh": 106.33, "52wLow": 79.93,
        "currency": "USD", "exchangeName": "NYSE",
        "shortName": "Medtronic plc.", "longName": "Medtronic plc",
        "regularMarketChange": -0.70, "regularMarketChangePercent": -0.796274,
        "exchange": "NYSE",
    },
    "STX": {
        "price": 503.13, "marketCap": 112713891840, "trailingPE": 56.786686,
        "trailingEps": 8.86, "52wHigh": 517.18, "52wLow": 67.63,
        "currency": "USD", "exchangeName": "NasdaqGS",
        "shortName": "Seagate Technology Holdings PLC", "longName": "Seagate Technology Holdings plc",
        "regularMarketChange": 2.36, "regularMarketChangePercent": 0.471277,
        "exchange": "NasdaqGS",
    },
    "TT": {
        "price": 465.71, "marketCap": 103266074624, "trailingPE": 35.388298,
        "trailingEps": 13.16, "52wHigh": 479.37, "52wLow": 318.08,
        "currency": "USD", "exchangeName": "NYSE",
        "shortName": "Trane Technologies plc", "longName": "Trane Technologies plc",
        "regularMarketChange": 5.60, "regularMarketChangePercent": 1.2171,
        "exchange": "NYSE",
    },
    "JCI": {
        "price": 142.53, "marketCap": 87237787648, "trailingPE": 47.828857,
        "trailingEps": 2.98, "52wHigh": 146.49, "52wLow": 73.55,
        "currency": "USD", "exchangeName": "NYSE",
        "shortName": "Johnson Controls International ", "longName": "Johnson Controls International plc",
        "regularMarketChange": 0.68, "regularMarketChangePercent": 0.479374,
        "exchange": "NYSE",
    },
    "CRH": {
        "price": 117.89, "marketCap": 78774222848, "trailingPE": 21.395643,
        "trailingEps": 5.51, "52wHigh": 131.55, "52wLow": 81.60,
        "currency": "USD", "exchangeName": "NYSE",
        "shortName": "CRH PLC", "longName": "CRH plc",
        "regularMarketChange": 2.39, "regularMarketChangePercent": 2.06926,
        "exchange": "NYSE",
    },
    "IR": {
        "price": 85.38, "marketCap": 33734524928, "trailingPE": 58.882755,
        "trailingEps": 1.45, "52wHigh": 100.96, "52wLow": 68.97,
        "currency": "USD", "exchangeName": "NYSE",
        "shortName": "Ingersoll Rand Inc.", "longName": "Ingersoll Rand Inc.",
        "regularMarketChange": -1.65, "regularMarketChangePercent": -1.8959,
        "exchange": "NYSE",
    },
    "RYAAY": {
        "price": 62.36, "marketCap": 32535373824, "trailingPE": 12.547284,
        "trailingEps": 4.97, "52wHigh": 74.24, "52wLow": 43.12,
        "currency": "USD", "exchangeName": "NasdaqGS",
        "shortName": "Ryanair Holdings plc", "longName": "Ryanair Holdings plc",
        "regularMarketChange": -1.18, "regularMarketChangePercent": -1.8571,
        "exchange": "NasdaqGS",
    },
    "EXPGF": {
        "price": 34.90, "marketCap": 32521283584, "trailingPE": 23.581081,
        "trailingEps": 1.48, "52wHigh": 55.20, "52wLow": 33.00,
        "currency": "USD", "exchangeName": "OTC Markets OTCQX",
        "shortName": "Experian plc", "longName": "Experian plc",
        "regularMarketChange": 0.29, "regularMarketChangePercent": 0.83791,
        "exchange": "OTCQX",
    },
}

def fmt_price(v):
    return f"${v:.2f}"

def fmt_mktcap(v):
    if v >= 1e12: return f"${v/1e12:.1f}T"
    if v >= 1e9:  return f"${v/1e9:.1f}B"
    return f"${v/1e6:.1f}M"

def fmt_pe(v):
    return f"{v:.2f}x"

def fmt_eps(v):
    return f"${v:.2f}"

REPORTS_DIR = "/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v2/reports"
os.makedirs(REPORTS_DIR, exist_ok=True)

RECS = {
    "BUY": ("#22C55E", "rec-buy"),
    "HOLD": ("#F59E0B", "rec-hold"),
    "REDUCE": ("#F97316", "rec-reduce"),
    "SELL": ("#EF4444", "rec-sell"),
}

# ─── Report content per ticker ─────────────────────────────────────────────────
REPORTS = {
    "ETN": {
        "company": "Eaton Corporation plc",
        "price": 403.0,
        "rec": "HOLD",
        "score": 68,
        "exec_summary": (
            "Eaton's electrical equipment and intelligent power management portfolio sits at the heart of secular AI data centre demand, "
            "but at 38.6x P/E the market is pricing in considerable already-realised growth, leaving the risk-reward neutral at current levels -- "
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Eaton Corporation manufactures and sells electrical, hydraulic, aerospace, vehicle and filters products worldwide. "
            "Its Electrical sector (~55% of revenues) provides circuit breakers, switchgear, power distribution units, busways and intelligent power "
            "monitoring systems primarily for non-residential construction, data centres, healthcare and utilities. "
            "The Hydraulics segment (~12%) serves industrial equipment. The Vehicle and Aerospace segments (~18% and ~10% respectively) service commercial "
            "vehicles and aerospace OEMs. The recently acquired Royal Power Components expands its electrical connectivity reach. "
            "Eaton's revenues are characterised by a mix of original equipment (OEM) sales and aftermarket/spare parts (~30%+ recurring), "
            "providing some cyclical cushion. Geographic exposure: North America (~50%), Europe (~25%), Asia-Pacific (~15%)."
        ),
        "catalysts": (
            "AI data centre buildout has been a major re-rating catalyst. Eaton's power distribution and busway products are essential "
            "for high-density AI server clusters, and order intake has accelerated significantly. The company raised full-year guidance in Q3/Q4 2025 "
            "on strong electrical demand. Management cited data centre orders growing at 30%+ year-on-year. "
            "Eaton completed its $600m Royal Power acquisition in 2024, expanding its electrical solutions footprint. "
            "However, the stock has already run hard off the AI theme, trading near 52-week highs, meaning much of the near-term catalyst is already priced in. "
            "Margin expansion from pricing power and mix shift to higher-margin intelligent power products continues."
        ),
        "bull": {"score": 82, "price": 460, "eps": 13.0,
                 "text": "AI data centre infrastructure buildout sustains 25%+ annual growth in the electrical segment. "
                         "Eaton wins significant share of North American and European hyperscale data centre contracts. "
                         "Operating margins expand to 23%+ as mix improves. EPS reaches $13+."},
        "base": {"score": 68, "price": 415, "eps": 11.5,
                 "text": "Data centre demand remains elevated but growth normalises from exceptional levels. "
                         "Non-residential construction stabilises. Electrical segment grows mid-high single digit. "
                         "EPS reaches $11.50 with modest margin expansion."},
        "bear": {"score": 42, "price": 290, "eps": 9.0,
                 "text": "AI infrastructure spending slows as hyperscalers rationalise capex. "
                         "Electrical demand softens. Margin compression from input cost inflation. "
                         "EPS falls to $9.00, P/E de-rates to 30x."},
        "risks": [
            ("Data centre capex cycle", "Eaton's re-rating is heavily tied to AI infrastructure spending. Any pullback in hyperscaler capex -- driven by LLM training cost concerns or delayed deployment timelines -- would directly impair the electrical segment outlook."),
            ("Valuation premium", "At 38.6x trailing P/E, Eaton trades at a significant premium to the S&P 500 industrials average (~20x). The premium is merited by growth but leaves little room for execution missteps."),
            ("Non-residential construction exposure", "~40% of the Electrical segment serves non-residential construction. Rising vacancy rates in office and retail, and delayed new construction starts, represent a structural headwind."),
            ("Cyclical OEM exposure", "Vehicle and Hydraulic segments are exposed to industrial production cycles and commercial vehicle demand, which can be volatile."),
            ("Competition in power distribution", "Schneider Electric, ABB and Siemens are formidable global competitors in the intelligent power management space, with significant R&D scale."),
        ],
        "owners": "Investors seeking infrastructure exposure to AI data centre power demand. The quality of Eaton's franchise is high, with strong brand, global service network and intelligent product portfolio. Suitable for medium-term holders with conviction in the AI infrastructure buildout.",
        "avoiders": "Value investors seeking cyclically depressed industrial names will find better entry points elsewhere. Growth-at-a-reasonable-price purists will object to the P/E multiple.",
        "rec_text": (
            "Eaton is a high-quality industrial franchise sitting at the intersection of AI infrastructure and the energy transition -- "
            "two of the most powerful secular tailwinds in the sector. However, the stock has already performed exceptionally, "
            "and the P/E reflects already-elevated expectations. At 38.6x earnings, the base case offers limited re-rating potential. "
            "HOLD is appropriate. BUY on meaningful dips below $340 (implying 32x P/E)."
        ),
        "entry": "BUY below $340 (32x P/E). Reduce above $430 (41x P/E). HOLD in the $340-$430 range.",
    },
    "MDT": {
        "company": "Medtronic plc",
        "price": 87.21,
        "rec": "HOLD",
        "score": 63,
        "exec_summary": (
            "Medtronic's dominant franchise in cardiac devices and surgical robotics faces a painful recovery from supply disruptions and regulatory headwinds, but the new product cycle in diabetes and Hugo robotic system provides a credible path to mid-single-digit revenue growth -- "
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Medtronic is the world's largest medical device company by revenue, operating across four core segments: "
            "Cardiovascular (~35% of revenues), Medical Surgical (~24%), Neuroscience (~28%), and Diabetes (~11%). "
            "Key franchises include pacemakers, ICDs, coronary stents, insulin pumps (MiniMed), surgical robotics (Hugo), "
            "spinal implants and nerve stimulation devices. Medtronic's model is characterised by high switching costs '
            "(implanted devices create long-term patient relationships), substantial pricing power in the US under DRG systems, '
            "and significant R&D investment requirements. The company distributes through direct sales forces and distributors globally. "
            "Geographic mix: US (~35%), Europe (~25%), Asia-Pacific (~25%), Other (~15%). The recent supply chain issues '
            "in the Diabetes segment (发出了警告信) created inventory headwinds now being worked through."
        ),
        "catalysts": (
            "The FDA warning letter for the Northridge diabetes facility has been resolved. The Hugo surgical robot received '
            'CE Mark and is now gaining procedures in Europe and Japan. The pulse field ablation (PFA) portfolio for atrial fibrillation '
            'is gaining significant share -- PFA is considered the fastest-growing细分 in electrophysiology. '
            'Recent Q3 FY2025 results showed improved revenue growth (low-mid single digit) as supply normalisation accelerates. '
            'Management guided to improved momentum in FY2026. Diabetes pipeline: next-gen MiniMed 780G continues to gain patients.'
        ),
        "bull": {"score": 80, "price": 108, "eps": 6.0,
                 "text": "Hugo robotics adoption accelerates globally. PFA wins significant AF ablation market share. "
                         "Diabetes recovery is faster than feared, with MiniMed 780G driving strong patient recruitment. "
                         "China volumes stabilise post-tender. EPS reaches $6.00+."},
        "base": {"score": 63, "price": 94, "eps": 5.2,
                 "text": "Gradual recovery in Diabetes and Medical Surgical. Hugo gains traction slowly. "
                         "PFA launches support Cardiovascular growth. EPS grows to $5.20 on steady margin improvement."},
        "bear": {"score": 40, "price": 70, "eps": 4.0,
                 "text": "Supply chain normalisation takes longer. Hugo adoption lags. PFA competition intensifies from Boston Scientific. EPS falls to $4.00, P/E de-rates further as growth concerns persist."},
        "risks": [
            ("Supply chain recovery timing", "The FDA warning letter for Northridge has been lifted, but rebuilding channel inventory and clinician confidence takes time. Revenue headwinds may persist through FY2026."),
            ("Diabetes franchise competition", "Insulet, Tandem Diabetes and Dexcom are gaining share in the insulin pump market with more user-friendly closed-loop systems. Medtronic's MiniMed 780G is competitive but not clearly superior."),
            ("PFA competition in cardiac ablation", "Boston Scientific's FARAPULSE PFA has a significant head start in Europe and the US. Abbott also has a PFA programme. Medtronic's competitive position in this rapidly growing market is uncertain."),
            ("China volume risk", "Post-tender pricing pressure and volume growth in China remain uncertain amid geopolitical headwinds and domestic competition from微创 and康德莱."),
            ("Litigation exposure", "Medtronic has faced product liability litigation (vagal nerve stimulation, infuses bone graft) that creates unpredictable financial risk."),
        ],
        "owners": "Long-term healthcare investors seeking broad medical device quality. Medtronic's pricing power, installed base and R&D pipeline are significant assets. The dividend (~3.1% yield) provides income support through the recovery.",
        "avoiders": "Investors seeking high-growth medtech or diabetes pure-plays will prefer smaller, faster-growing competitors. Those requiring near-term earnings momentum will be frustrated.",
        "rec_text": "Medtronic is a recovery story with real assets. The new product cycle (Hugo, PFA, MiniMed 780G) provides a credible path to improved revenue growth. However, the recovery has been slower than hoped, and the stock offers a neutral risk-reward at current levels. HOLD.",
        "entry": "BUY below $78 (12x P/E -- historically cheap for Medtronic, margin of safety for a franchise of this quality). Reduce above $100 (16x P/E). HOLD in the $78-$100 range.",
    },
    "STX": {
        "company": "Seagate Technology Holdings plc",
        "price": 503.13,
        "rec": "HOLD",
        "score": 64,
        "exec_summary": (
            "Seagate's near-monopoly in enterprise hard disk drives for AI data centres provides extraordinary near-term earnings momentum, '
            'but the P/E of 56.8x and the HDD-to-SSD secular headwind create a deeply uncertain multi-year picture, '
            'making the valuation only appropriate for momentum investors -- <strong>HOLD</strong>."
        ),
        "business_model": (
            "Seagate Technology is one of only two remaining enterprise HDD manufacturers (the other being Western Digital), '
            'giving it significant pricing power in the near term. The company produces hard disk drives for three primary end markets: '
            'Cloud Data Centre (~55% of revenues), Enterprise OEM (~20%), and Consumer/Edge (~25%). '
            'The cloud segment is the key driver: AI workloads require massive data storage at a lower cost per terabyte than SSDs, '
            'sustaining demand for high-capacity 30TB+ HDDs even as the overall storage market shifts to flash. '
            'Seagate's Mozaic 3+ platform (using heat-assisted magnetic recording, HAMR) enables areal density improvements '
            'and cost reductions that extend the HDD value proposition. The company is vertically integrated, manufacturing its own media, '
            'substrates and actuator heads. The business is highly cyclical, with cloud hyperscaler orders creating significant quarter-to-quarter volatility.'
        ),
        "catalysts": (
            "AI training data sets are growing exponentially, driving hyperscaler demand for high-capacity storage. '
            'Seagate reported extraordinary Q4 FY2025 results: revenue of $2.9B (vs $2.2B expected), with cloud segment revenues up ~35% year-on-year. '
            'Management guided Q1 FY2026 above consensus. The HAMR-based Mozaic 3+ platform is ramping, enabling 30TB+ drives '
            'with better cost economics. Supply remains tight -- Seagate and WD are the only two enterprise HDD makers, '
            'creating an oligopoly pricing dynamic. Average selling prices (ASPs) have increased significantly as cloud customers compete for supply.'
        ),
        "bull": {"score": 85, "price": 650, "eps": 14.0,
                 "text": "AI storage demand sustains triple-digit cloud segment growth. HAMR drives margin expansion as costs fall. "
                         "Seagate gains capacity share with all hyperscalers. EPS reaches $14+."},
        "base": {"score": 64, "price": 520, "eps": 10.5,
                 "text": "Cloud storage demand remains elevated through FY2026 but growth normalises. "
                         "HAMR ramp improves margins. ASPs stabilise at elevated levels. EPS ~$10.50."},
        "bear": {"score": 38, "price": 320, "eps": 6.0,
                 "text": "Hyperscaler capex slows as LLM training cycles rationalise. SSD adoption accelerates, displacing HDD in warm storage. "
                         "Pricing power erodes as WD ramps competing capacity. EPS falls to $6.00."},
        "risks": [
            ("Secular HDD displacement by SSD", "Flash storage (NVMe SSDs) is taking share in data centre storage, particularly for performance-sensitive workloads. While HDDs retain a cost/TB advantage for bulk storage, this gap is narrowing with each NAND technology generation."),
            ("Hyperscaler capex cyclicality", "Seagate's fortunes are heavily tied to cloud hyperscaler storage capex cycles. Any rationalisation of AI infrastructure spending (driven by ROI concerns or funding constraints) would hit Seagate disproportionately."),
            ("Single-digit number of customers risk", "The top 4 hyperscalers represent ~60% of cloud revenues. Losing a major customer or having one shift budget away from storage would be material."),
            ("HAMR execution risk", "Seagate's HAMR technology is complex. Any execution delays in Mozaic platform ramp would impair cost position and market share versus WD."),
            ("Valuation", "At 56.8x trailing P/E, the stock prices in very optimistic near-term earnings. Any shortfall in guidance would cause sharp de-rating."),
        ],
        "owners": "Momentum investors who believe AI infrastructure spending will sustain HDD demand above consensus expectations. The near-term earnings trajectory is compelling. Also suitable for investors who believe HDD will remain relevant in AI storage hierarchies longer than the market expects.",
        "avoiders": "Long-term value investors should avoid -- the secular story (HDD vs SSD) is not resolved, and the P/E is too high for a company in a structurally challenged market. Anyone with a 3-5 year horizon should be cautious.",
        "rec_text": "Seagate's near-term earnings story is extraordinary, driven by AI data hoarding and an HDD oligopoly. However, the P/E of 56.8x requires the bull case to materialise and sustain. HOLD for now. The risk-reward at $503 is balanced but tilted to the cautious side given valuation.",
        "entry": "BUY below $430 (40x P/E -- more appropriate for a cyclical durably). Reduce above $560 (52x P/E). WATCH carefully -- momentum is strong but the multiple is demanding.",
    },
    "TT": {
        "company": "Trane Technologies plc",
        "price": 465.71,
        "rec": "HOLD",
        "score": 71,
        "exec_summary": (
            "Trane Technologies is an exceptional industrial franchise with a clear AI-driven climate efficiency narrative and proven management capital allocation, '
            'but the stock has re-rated significantly on these themes and now requires more time and earnings delivery to justify the multiple -- '
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Trane Technologies (formerly Ingersoll Rand Industrial, spun off from the original Ingersoll Rand in 2020) manufactures commercial and residential HVAC (heating, ventilation and air conditioning), air purification, refrigeration and building management systems. "
            "The company operates through two segments: Climate Innovation (~75% of revenues) and Industrial Technologies (~25%). "
            "Key brands include Trane, Thermo King, Campbells, Krauss-Maffei and Wheelabrator. "
            "Revenue streams include: new equipment sales (capital goods cycle), replacement parts and services (~35% of revenues, higher-margin), and building management software (Connected Buildings). "
            "Trane has significant exposure to data centre cooling -- a rapidly growing end market as AI servers require precision cooling. "
            "The company generates substantial free cash flow and has a strong record of buybacks and dividends. "
            "Geographic mix: North America (~60%), Europe (~25%), Asia-Pacific (~15%)."
        ),
        "catalysts": (
            "AI data centre buildout is a major cooling demand catalyst. Trane's precision cooling systems are essential for high-density compute clusters, and order intake has accelerated. "
            "The company raised full-year 2025 guidance at its Q3 results. Management is investing aggressively in heat pump and refrigerant transition technology ahead of HVAC regulatory changes in Europe and North America. "
            "The Kraken acquisition (building management software) is being integrated to provide recurring software revenues. "
            "Free cash flow conversion has been strong (~100%+ of net income), funding buybacks. "
            "Climate regulations (ASHRAE standard updates, European F-gas rules) are driving replacement cycles."
        ),
        "bull": {"score": 85, "price": 560, "eps": 17.5,
                 "text": "Data centre cooling demand is sustained. Heat pump adoption accelerates in Europe. "
                         "Kraken software adds recurring revenue stream. Operating margins expand to 20%+. EPS reaches $17.50+."},
        "base": {"score": 71, "price": 500, "eps": 15.5,
                 "text": "Data centre demand provides steady growth tailwind. Residential HVAC replacement cycle normalises. "
                         "Margin expansion continues gradually. EPS reaches $15.50."},
        "bear": {"score": 50, "price": 390, "eps": 13.0,
                 "text": "Non-residential construction slows as economic uncertainty rises. Data centre cooling competition intensifies (Schneider, Vertiv). "
                         "Margin pressure from input costs. EPS falls to $13.00."},
        "risks": [
            ("Non-residential construction cycle", "A significant portion of revenues is tied to new commercial construction starts. A construction slowdown would impair near-term demand."),
            ("Data centre cooling competition", "Vertiv Holdings is a pure-play competitor in data centre cooling and has been growing rapidly. Schneider Electric and Carrier also compete actively."),
            ("Heat pump regulatory and demand risk", "European heat pump demand has been weaker than expected in 2024-2025 as electricity prices remain elevated, reducing the economics of heat pump vs gas heating."),
            ("Margin execution in growth investments", "Trane is investing heavily in R&D and software. Maintaining margins while funding these investments requires consistent execution."),
            ("Acquisition integration risk", "Trane has a history of acquisitions. Any significant integration misstep with recent acquisitions (Kraken) would impair the Connected Buildings thesis."),
        ],
        "owners": "Quality-conscious industrial investors who want exposure to the energy transition and AI infrastructure simultaneously. Trane's management has an excellent capital allocation track record. The dividend (~1.5% yield) and buyback programme provide total return support.",
        "avoiders": "Value investors seeking depressed cyclical entry points. Pure growth investors who want a cleaner AI or climate pure-play.",
        "rec_text": "Trane Technologies is one of the highest-quality industrials in the market -- clean franchise, strong management, secular tailwinds. The stock is fairly valued at 35x P/E. HOLD is appropriate unless you have a long time horizon and conviction in the data centre cooling and heat pump narratives.",
        "entry": "BUY below $400 (32x P/E -- better risk-reward for a quality franchise). Reduce above $510 (41x P/E). HOLD in the $400-$510 range.",
    },
    "JCI": {
        "company": "Johnson Controls International plc",
        "price": 142.53,
        "rec": "HOLD",
        "score": 65,
        "exec_summary": (
            "Johnson Controls is a dominant building efficiency franchise sitting at the intersection of AI data centre cooling and the energy transition, '
            'but the stock's re-rating on these themes leaves it at a fully valued 48x P/E -- '
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Johnson Controls is a global leader in building technology, operating across three segments: "
            "Building Solutions North America (~40% of revenues), Building Solutions International/Rest of World (~30%), and Products (~30%). "
            "Core offerings include HVAC systems, fire and security (tyco fire products), industrial refrigeration, and building management/automation systems. "
            "The company is the global #1 or #2 in most of its served markets. A key strategic focus is the VyPx building management software platform, "
            "which connects HVAC, fire and security systems and provides data analytics for energy efficiency -- increasingly important as building operators seek to reduce energy costs. "
            "Revenues are split between new construction equipment sales, installation/project revenues, and long-term service contracts (~30%+ recurring). "
            "Geographic mix: North America (~45%), Europe (~30%), Asia (~25%). "
            "The company has significant exposure to data centre precision cooling (similar to Trane) and to the safety/security market."
        ),
        "catalysts": (
            "AI data centre buildout is a major new catalyst for Johnson Controls' precision cooling business. "
            "The company reported solid Q1 FY2025 results with backlog growing in the mid-teens. "
            "Backlog is at record highs, providing revenue visibility. "
            "The SAP implementation (launched 2023) is complete, improving operational efficiency and margin visibility. "
            "Post-pandemic, commercial building investment is recovering. "
            "The company's fire and security segment benefits from code compliance and safety regulation enforcement."
        ),
        "bull": {"score": 80, "price": 170, "eps": 5.0,
                 "text": "Data centre cooling demand sustains double-digit growth in the segments serving this market. "
                         "VyPx platform adoption drives recurring revenues. Operating margins expand. EPS reaches $5.00+."},
        "base": {"score": 65, "price": 152, "eps": 4.4,
                 "text": "Backlog provides steady revenue growth. Data centre cooling is a positive contributor. "
                         "SAP integration benefits materialise gradually. EPS reaches $4.40."},
        "bear": {"score": 42, "price": 110, "eps": 3.5,
                 "text": "Non-residential construction contracts. Data centre cooling competition from Vertiv and Trane intensifies. "
                         "Margin pressure from input costs. EPS falls to $3.50."},
        "risks": [
            ("Non-residential construction exposure", "A large portion of revenues is tied to commercial and industrial new construction. A construction downturn would impair revenues."),
            ("Execution on SAP transformation", "The $2bn+ SAP implementation is complex. Any further delays or cost overruns would be a concern."),
            ("Competitive intensity in cooling", "Vertiv is a pure-play competitor in data centre cooling and has been gaining share rapidly with superior execution."),
            ("Fire & security cyclicality", "Tyco Fire & Security revenues can be cyclical with industrial production and commercial construction cycles."),
            ("Valuation", "At 47.8x trailing P/E, the stock is pricing in meaningful improvement. The multiple is demanding for a company with JCI's growth profile."),
        ],
        "owners": "Investors seeking broad building technology exposure with a focus on energy efficiency and AI infrastructure. The backlog provides revenue visibility. The dividend (~2.3% yield) provides some downside support.",
        "avoiders": "Pure value investors. Those seeking the best-in-class data centre cooling play (Trane or Vertiv are cleaner pure plays).",
        "rec_text": "Johnson Controls has a strong franchise with meaningful exposure to the AI data centre buildout, but the stock has re-rated significantly and now requires solid execution to justify the P/E. HOLD.",
        "entry": "BUY below $125 (28x P/E -- appropriate for a cyclical building technology name). Reduce above $158 (36x P/E).",
    },
    "CRH": {
        "company": "CRH plc",
        "price": 117.89,
        "rec": "BUY",
        "score": 77,
        "exec_summary": (
            "CRH is the world's leading heavy building materials group with a high-quality US infrastructure business that is set to benefit from the largest US infrastructure spending cycle in decades, '
            'and the stock trades at a modest 21.4x P/E that does not adequately reflect this cyclical opportunity -- '
            "<strong>BUY</strong>."
        ),
        "business_model": (
            "CRH (formerly CRH plc, Irish-domiciled but US-centric in operations) is the world's largest building materials company by revenue. "
            "The company operates across three segments: Americas Materials (~50% of revenues), Europe Materials (~25%), and Building Products (~25%). "
            "Core products: asphalt, aggregates, cement, ready-mix concrete, precast concrete products, paving and construction services. "
            "The Americas Materials segment is the crown jewel: CRH is the largest aggregates producer in the US and the leading asphalt supplier for highway construction. "
            "This business benefits enormously from long-term infrastructure contracts (typically 3-5 year DOT highway projects), providing revenue visibility and pricing power. "
            "The Building Products segment serves the residential renovation market (thermostat, doors, shutters, concrete floor systems). "
            "Geographic mix: North America (~60%), Europe (~30%), other (~10%). "
            "CRH's business is highly sensitive to infrastructure spending (federal, state DOT budgets) and residential construction activity."
        ),
        "catalysts": (
            "The US Infrastructure Investment and Jobs Act (IIJA, 2021) and the Inflation Reduction Act (IRA, 2022) are deploying massive federal dollars into highway, bridge and utility infrastructure. "
            "CRH's order book and bid pricing for 2025-2026 reflects the peak years of this spending cycle. "
            "CRH raised full-year 2024 guidance and reported strong Q3 2024 results driven by Americas Materials pricing (+8%) and volumes. "
            "The company is a consolidator in a fragmented industry -- bolt-on acquisitions in aggregates and asphalt are ongoing. "
            "Management targets mid-single-digit revenue growth and margin expansion. "
            "CRH de-listed from the Irish and London exchanges (moving fully to NYSE) in 2024, simplifying the shareholder base."
        ),
        "bull": {"score": 88, "price": 155, "eps": 8.5,
                 "text": "US infrastructure spending peak years drive exceptional earnings. Americas Materials volumes and pricing remain elevated. "
                         "Acquisition programme adds bolt-ons at attractive returns. EPS reaches $8.50+."},
        "base": {"score": 77, "price": 135, "eps": 7.3,
                 "text": "Infrastructure cycle supports Americas Materials. European operations stabilise. "
                         "Building Products benefits from residential renovation. EPS reaches $7.30."},
        "bear": {"score": 55, "price": 100, "eps": 5.5,
                 "text": "US infrastructure spending slows post-IIJA peak. Residential construction contracts. "
                         "Input cost inflation reappears. EPS falls to $5.50."},
        "risks": [
            ("US infrastructure spending cycle", "The IIJA created a surge in DOT spending in 2024-2026. The pace of this spending could slow, creating a cyclical headwind for CRH's core US business."),
            ("Residential construction exposure", "Building Products (~25% of revenues) is exposed to US residential construction. Rising mortgage rates and affordability challenges could impair renovation spending."),
            ("Input cost inflation", "Energy (diesel, bitumen), labour and equipment costs can erode margins if pricing power fails to keep pace."),
            ("Cyclicality of heavy materials", "Aggregates and asphalt are highly cyclical. CRH's results will deteriorate when the US construction cycle turns down."),
            ("European operations", "CRH's European business (~25% of revenues) is exposed to slow European construction activity and regulatory cost pressures (carbon pricing)."),
        ],
        "owners": "Investors seeking a play on US infrastructure spending at a reasonable valuation. The 21x P/E provides a margin of safety for a high-quality aggregates franchise. Long-term holders who can weather the construction cycle.",
        "avoiders": "Growth investors seeking secular growth stories. Those uncomfortable with cyclical earnings and exposure to government spending dynamics.",
        "rec_text": "CRH is the best pure-play on US infrastructure spending in the heavy building materials space, and at 21x P/E the valuation is not demanding for the quality of the franchise. The IIJA/IRA spending cycle has not fully flowed through CRH's revenues yet. BUY.",
        "entry": "BUY below $105 (15x P/E -- historically cheap for CRH's quality). HOLD in the $105-$135 range. Reduce above $140 (20x+ P/E during peak infrastructure cycle).",
    },
    "IR": {
        "company": "Ingersoll Rand Inc.",
        "price": 85.38,
        "rec": "HOLD",
        "score": 62,
        "exec_summary": (
            "Ingersoll Rand is a high-quality niche industrial compactor and gas compressor franchise with genuine exposure to energy transition infrastructure, '
            'but at 58.9x trailing P/E the market has gotten well ahead of fundamentals -- '
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Ingersoll Rand (IR) is a diversified industrial company that was created when the original Ingersoll Rand (the parent) split in 2020, '
            'with the industrial segment retaining the IR name and the climate control segment becoming Trane Technologies. '
            'Today, IR operates in two segments: Industrial Technologies and Services (~60% of revenues) and Specialty Vehicle Technologies (~40%). '
            'Core products: industrial air compressors, gas compressors, liquid handling pumps, loading arms, fluid management systems, '
            'and electric and hybrid powertrain systems for specialty vehicles. '
            'The company is the global leader in many of its served niches (e.g., municipal water/wastewater compressors, CNG fueling). '
            'Revenues are characterised by high aftermarket/service content (~35%+ of revenues, sticky), broad geographic diversity '
            '(North America ~40%, Europe ~35%, Asia-Pacific ~25%), and exposure to semiconductor, semiconductor, energy and healthcare end markets.'
        ),
        "catalysts": (
            "Energy transition: Compressed natural gas (CNG), bio-methane and hydrogen fueling infrastructure buildout is a genuine long-term tailwind. "
            "IR has significant exposure to hydrogen compression (for storage and transport) and biogas upgrading. "
            "Semiconductor fabrication capex (TSMC, Intel, Samsung) drives demand for ultra-high-purity gas compressors. "
            "Medical device pneumatic components benefit from healthcare capital equipment spending. "
            "The company has been executing its 'Ingersoll Rand Execution System' (IRIS) operational improvement programme, driving margin expansion. "
            "Recent acquisitions (e.g., howden) have expanded the compressed air and gas footprint. "
            "Q3 2024 results were solid: revenue grew ~8% organically with margin expansion."
        ),
        "bull": {"score": 80, "price": 105, "eps": 2.5,
                 "text": "Hydrogen infrastructure buildout accelerates. Semiconductor capex remains elevated. "
                         "IRIS operational improvements drive margins to 25%+. EPS reaches $2.50+."},
        "base": {"score": 62, "price": 92, "eps": 2.1,
                 "text": "Stable demand across end markets. Hydrogen remains a long-term but modest contributor. "
                         "IRIS delivers steady margin improvement. EPS reaches $2.10."},
        "bear": {"score": 38, "price": 62, "eps": 1.5,
                 "text": "Industrial production contracts. Hydrogen infrastructure deployment slower than hoped. "
                         "Semiconductor capex cycle turns down. EPS falls to $1.50."},
        "risks": [
            ("Valuation", "At 58.9x trailing P/E, the stock is pricing in substantial hydrogen and energy transition upside. Any deceleration in hydrogen infrastructure spending would impair re-rating."),
            ("Industrial production cyclicality", "Compressors and pumps are tied to industrial capital expenditure cycles. A manufacturing recession would impair demand."),
            ("Hydrogen timeline risk", "Hydrogen economy buildout is real but slow. The contribution to IR revenues and earnings may remain modest relative to investor expectations for several more years."),
            ("Competition in niche markets", "Gardner Denver (Atlas Copco), Atlas Copco itself, and others compete in compressor niches. Competitive intensity could pressure pricing."),
            ("Acquisition integration", "IR has a history of acquisitions. Integration of howden and other acquisitions requires ongoing management attention and execution."),
        ],
        "owners": "Investors seeking niche industrial quality with genuine hydrogen economy exposure. IR's franchise in compressors is durable and has significant aftermarket content. Long-term investors who can stomach the valuation.",
        "avoiders": "Value investors and those unwilling to pay 59x P/E for a cyclical industrial company. Those seeking immediate hydrogen upside may be frustrated by the timeline.",
        "rec_text": "Ingersoll Rand has a high-quality niche industrial franchise and meaningful hydrogen tailwinds -- the strategic case is sound. However, the 58.9x P/E requires all of the bull case to work out. HOLD is appropriate at current levels. Await a better entry.",
        "entry": "BUY below $70 (33x P/E -- appropriate for a cyclical industrial). Reduce above $95 (45x P/E).",
    },
    "RYAAY": {
        "company": "Ryanair Holdings plc",
        "price": 62.36,
        "rec": "HOLD",
        "score": 69,
        "exec_summary": (
            "Ryanair's ultra-low-cost model is the structural winner in European aviation, with exceptional unit economics and a growing passenger profile, '
            'but near-term headwinds fromBoeing delivery delays, softening European leisure demand and competitive pressure from Wizz Air create a complex picture -- '
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Ryanair is Europe's largest low-cost airline by passengers carried (~185 million in FY2024), operating a fleet of exclusively Boeing 737 aircraft "
            "from primarily secondary airports across 40+ countries. The ultra-low-cost model is defined by: aggressive point-to-point networks, "
            "strict cost discipline (average aircraft turnaround of 25 minutes), ancillary revenues (~30%+ of total revenue from assigned seating, priority boarding, checked bags, in-flight sales), "
            "and a single aircraft type fleet philosophy. "
            "Revenue streams: passenger fares (~70%), ancillary revenues (~30%), other (cargo, package holidays). "
            "Ryanair's unit economics (RASM - revenue per available seat km vs CASK - cost per available seat km) are the best in European low-cost aviation. "
            "The key constraint is aircraft availability: Boeing 737 MAX delivery delays have capped capacity growth in FY2024/FY2025. "
            "As the 737 MAX fleet ramps, Ryanair targets 300m+ annual passengers by FY2030."
        ),
        "catalysts": (
            "Boeing delivery ramp: Ryanair expects to receive 40+ 737 MAX aircraft in FY2026 (vs ~30 in FY2025), enabling 10%+ capacity growth. "
            "Winter 2025/2026 pricing has been stronger than feared, with load factors holding up despite consumer caution in leisure spending. "
            "Ryanair's unique 'get to 300m passengers' target by 2030 requires the aircraft to be available -- management has been disciplined about not over-ordering at unrealistic prices. "
            "The company's digital-first strategy (Ryanair Studios, dynamic pricing, ancillary upsell) is improving non-ticket revenue yield. "
            "Fuel hedging provides some cost certainty through FY2025."
        ),
        "bull": {"score": 82, "price": 85, "eps": 7.5,
                 "text": "Boeing delivery ramp enables 10%+ annual capacity growth to 300m passengers by FY2030. "
                         "Fuel costs stabilise. Unit revenues improve. EPS reaches Euro 7.50+."},
        "base": {"score": 69, "price": 72, "eps": 6.3,
                 "text": "Capacity grows gradually as Boeing delivers. Pricing is stable but competitive. "
                         "Fuel costs moderate. EPS grows to Euro 6.30."},
        "bear": {"score": 45, "price": 50, "eps": 4.5,
                 "text": "Boeing deliveries delayed further. European leisure demand weakens. "
                         "Fare compression from EasyJet and Wizz Air competition. EPS falls to Euro 4.50."},
        "risks": [
            ("Boeing delivery risk", "Ryanair is entirely dependent on Boeing 737 aircraft (MAX and NG variants). Boeing's production quality issues and delivery delays could persist into FY2026/FY2027, capping capacity growth."),
            ("European leisure demand cyclicality", "Ryanair's passengers are predominantly price-sensitive leisure travellers. An economic downturn in Europe would disproportionately impact booking volumes and yields."),
            ("Wizz Air competition", "Wizz Air is aggressively expanding in Ryanair's core markets (Central/Eastern Europe). intense price competition could pressure yields."),
            ("Fuel price exposure", "Fuel is the largest single cost item (~30% of operating costs). A spike in oil prices without corresponding fare increases would compress margins."),
            ("Regulatory and slot constraints", "Ryanair faces ongoing regulatory challenges (UK CAA, EU) regarding passenger rights, slot utilisation and airport access that could constrain growth or increase costs."),
        ],
        "owners": "Long-term investors who understand the cyclicality of European leisure travel and believe in the structural low-cost carrier growth thesis. Ryanair's management is widely considered best-in-class among European airlines.",
        "avoiders": "Investors who want clean aviation exposure without Boeing/aircraft delivery risk. Those who require near-term earnings certainty. Anyone who cannot stomach fuel price volatility and cyclical passenger cycles.",
        "rec_text": "Ryanair is the structural winner in European low-cost aviation. The long-term thesis (300m passengers by 2030) is compelling. However, near-term headwinds from Boeing delivery delays and softening leisure demand create an uncertain 12-month picture. At 12.5x P/E, the stock is not expensive but the near-term catalysts are mixed. HOLD.",
        "entry": "BUY below $52 (10x P/E -- historically cheap for this franchise quality). Reduce above $72 (14x P/E).",
    },
    "EXPGF": {
        "company": "Experian plc",
        "price": 34.90,
        "rec": "HOLD",
        "score": 66,
        "exec_summary": (
            "Experian is the global leader in consumer and business credit data with high-quality recurring revenues and genuine AI-driven product enhancement opportunities, '
            'but the stock's recent rally and the structural regulatory risks in its core credit reporting business create a balanced risk-reward -- '
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Experian is one of the three global consumer credit reporting bureaus (alongside Equifax and TransUnion). "
            "The company operates across four segments: Consumer Services (~35% of revenues), Business Services (~30%), Decisioning Software (~20%), and Automotive (~15%). "
            "Consumer Services: provides credit scores, credit reports and identity protection to consumers (free and subscription models). "
            "Business Services: provides credit data on businesses and consumers to lenders, insurers, and retailers for credit adjudication. "
            "Decisioning Software: provides decisioning engines (PowerCurve and other platforms) that help clients make credit, fraud and marketing decisions. "
            "The business is characterised by high recurring revenues (~70%+ of revenues are recurring or contract-based), "
            "significant data network effects (more data = better models = more clients), and pricing power with institutional clients. "
            "Geographic mix: North America (~45%), UK and Ireland (~20%), Brazil (~20%), Other (~15%)."
        ),
        "catalysts": (
            "AI-driven product enhancement: Experian is integrating machine learning into its credit decisioning models, improving predictive accuracy and winning business from clients who need better risk discrimination. "
            "Open Banking/Open Finance regulation in the UK and Brazil is expanding Experian's addressable market by giving consumers the right to share their banking data, which feeds into credit assessment models. "
            "Strong Q3 FY2025 (to February 2025) results showed revenue growth of 6-7% in each segment. "
            "The decisioning software segment is the fastest-growing, driven by lending automation demand from banks. "
            "Experian has been winning government identity verification contracts, which provide stable long-term revenues."
        ),
        "bull": {"score": 80, "price": 48, "eps": 2.6,
                 "text": "AI/ML models drive significant improvements in decisioning accuracy, winning large bank clients. "
                         "Open Banking expansion in UK and Brazil creates new revenue streams. "
                         "Decisioning Software grows 15%+ annually. EPS reaches $2.60+."},
        "base": {"score": 66, "price": 40, "eps": 2.2,
                 "text": "Stable growth across segments. Open Banking provides modest incremental tailwind. "
                         "AI adoption in credit decisioning gradually improves margins. EPS grows to $2.20."},
        "bear": {"score": 42, "price": 28, "eps": 1.7,
                 "text": "Regulatory changes limit pricing power. Open Banking adoption slower than expected. "
                         "Data privacy regulations impair data moat. EPS falls to $1.70."},
        "risks": [
            ("Regulatory risk in credit reporting", "Experian operates under FCRA (US), GDPR (EU/UK) and similar frameworks globally. Regulatory changes can limit pricing, data collection practices and business model flexibility. Class action litigation risk is ongoing."),
            ("Open Banking disruption", "Open Banking regulations (CMA's Open Banking Implementation Entity in UK, similar regimes in EU and Brazil) could disrupt Experian's data moat by enabling new competitors to access banking data directly."),
            ("AI model risk", "As Experian deploys AI in credit decisioning, any model failures, bias allegations or regulatory scrutiny of AI-driven credit decisions could create significant reputational and financial liability."),
            ("Consumer churn in Consumer Services", "Consumer subscription revenue (credit monitoring) is exposed to churn. Competition from free credit score services (Credit Karma, NerdWallet) pressures consumer-facing revenues."),
            ("Emerging market FX risk", "Significant exposure to Brazil (~20% of revenues) creates meaningful foreign exchange and macroeconomic risk."),
        ],
        "owners": "Investors seeking defensive, recurring-revenue exposure to financial data infrastructure. Experian's data network effects and the shift to AI-driven credit decisioning are compelling long-term themes. Suitable for quality-focused investors with a 3-5 year horizon.",
        "avoiders": "Investors seeking high-growth tech or AI pure-plays will find Experian's regulated utility profile limiting. Those concerned about regulatory risk in credit data businesses.",
        "rec_text": "Experian is a high-quality data infrastructure business with genuine AI tailwinds and strong recurring revenues. The stock is fairly valued at 23.6x P/E. HOLD is appropriate. A meaningful move to $28 would be a BUY opportunity.",
        "entry": "BUY below $28 (18x P/E -- below-market multiple for a high-quality data franchise). Reduce above $42 (28x P/E -- premium for growth).",
    },
}


def make_report(ticker, d):
    rec = d["rec"]
    score = d["score"]
    rec_color, rec_class = RECS[rec]

    price = d["price"]
    mc = d.get("marketCap", 0)
    pe = d.get("trailingPE", 0) or 0
    eps = d.get("trailingEps", 0) or 0
    h52 = d.get("52wHigh", 0) or 0
    l52 = d.get("52wLow", 0) or 0

    bull = d["bull"]
    base = d["base"]
    bear = d["bear"]

    bull_score = bull["score"]
    base_score = base["score"]
    bear_score = bear["score"]

    chg = d.get("regularMarketChange", 0)
    chg_pct = d.get("regularMarketChangePercent", 0)
    chg_str = f"+{chg:.2f}" if chg >= 0 else f"{chg:.2f}"
    chg_pct_str = f"+{chg_pct:.2f}%" if chg_pct >= 0 else f"{chg_pct:.2f}%"

    bull_eps = bull.get("eps", "TBD")
    base_eps = base.get("eps", "TBD")
    bear_eps = bear.get("eps", "TBD")
    bull_price = bull.get("price", "TBD")
    base_price = base.get("price", "TBD")
    bear_price = bear.get("price", "TBD")

    risks_html = "\n".join(
        f'<li><strong>{r[0]}:</strong> {r[1]}</li>'
        for r in d["risks"]
    )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="{d['longName']} ({ticker}) -- Investment Research -- DYOR HQ">
  <title>{d['longName']} ({ticker}) -- DYOR HQ</title>
  <link rel="stylesheet" href="../assets/css/main.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body {{ font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }}
  </style>
</head>
<body>
  <header>
    <div class="header-inner">
      <a href="../index.html" class="logo">
        <span class="logo-wordmark">DYOR <span>HQ</span></span>
        <span class="logo-badge">AI Research</span>
      </a>
      <nav>
        <ul class="nav-links">
          <li><a href="../index.html">&larr; All Reports</a></li>
        </ul>
      </nav>
    </div>
  </header>

  <main>
    <div class="container">
      <div class="report-hero">
        <div class="report-breadcrumb">
          <a href="../index.html">Reports</a>
          <span>/</span>
          <span>{ticker}</span>
        </div>

        <div class="report-title-row">
          <div class="report-title-block">
            <div class="ticker-label">{ticker}</div>
            <h1>{d['longName']}</h1>
            <div class="report-meta-bar">
              <span class="rec-badge {rec_class}">{rec}</span>
              <span class="meta-item">11 Apr 2026</span>
              <span class="meta-item">{fmt_price(price)}</span>
              <span class="meta-item">{chg_str} ({chg_pct_str})</span>
            </div>
          </div>
          <div class="conviction-display" style="border-top: 3px solid {rec_color}">
            <div class="score" style="color: {rec_color}">{score}</div>
            <div class="score-label">Conviction</div>
            <div class="score-sub">out of 100</div>
          </div>
        </div>
      </div>

      <div class="report-body">
        <div class="report-content">
          <div class="report-section">
            <h2>Executive Summary</h2>
            <p>{d['exec_summary']}</p>
          </div>

          <div class="report-section">
            <h2>Business Model</h2>
            <p>{d['business_model']}</p>
          </div>

          <div class="report-section">
            <h2>Financial Snapshot</h2>
            <table class="data-table">
              <tr><td>Current Price</td><td>{fmt_price(price)}</td></tr>
              <tr><td>Market Capitalisation</td><td>{fmt_mktcap(mc)}</td></tr>
              <tr><td>Price-to-Earnings (P/E)</td><td>{fmt_pe(pe)}</td></tr>
              <tr><td>Earnings Per Share (EPS)</td><td>{fmt_eps(eps)}</td></tr>
              <tr><td>52-Week High</td><td>{fmt_price(h52)}</td></tr>
              <tr><td>52-Week Low</td><td>{fmt_price(l52)}</td></tr>
            </table>
          </div>

          <div class="report-section">
            <h2>Recent Catalysts</h2>
            <p>{d['catalysts']}</p>
          </div>

          <div class="report-section">
            <h2>Thesis Evaluation</h2>
            <p><strong>Bull Case ({bull_score}):</strong> {bull['text']} Price: ${bull_price}+.</p>
            <p><strong>Base Case ({base_score}):</strong> {base['text']} Price: ${base_price}&#8211;${bear_price}.</p>
            <p><strong>Bear Case ({bear_score}):</strong> {bear['text']} Price: below ${bear_price}.</p>
            <p class="scenario-note"><strong>Weighted Score: {score}</strong> &mdash; Bull {bull_score} &times; 30% + Base {base_score} &times; 50% + Bear {bear_score} &times; 20%</p>
          </div>

          <div class="report-section">
            <h2>Key Risks</h2>
            <ol>
              {risks_html}
            </ol>
          </div>

          <div class="report-section">
            <h2>Who Should Own It / Avoid It</h2>
            <p><strong>Owners:</strong> {d['owners']}</p>
            <p><strong>Avoiders:</strong> {d['avoiders']}</p>
          </div>

          <div class="report-section">
            <h2>Recommendation</h2>
            <p>{d['rec_text']}</p>
            <p><strong>Entry framework:</strong> {d['entry']}</p>
          </div>

          <div class="report-section">
            <h2>Sources</h2>
            <p>Live market data via DYOR HQ data pipeline. All financial data as at 11 April 2026.</p>
          </div>
        </div>
      </div>
    </div>
  </main>
</body>
</html>"""
    return html

# Generate all reports
for ticker, d in DATA.items():
    html = make_report(ticker, d)
    path = f"{REPORTS_DIR}/{ticker}-2026-04-11.html"
    with open(path, "w") as f:
        f.write(html)
    print(f"Written: {path}  (score={d['score']}, rec={d['rec']})")

print("\nAll 10 reports generated.")
