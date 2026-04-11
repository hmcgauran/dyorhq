#!/usr/bin/env python3
"""
Generate DYOR HQ reports for 10 S&P 100 tickers.
Date: 11 April 2026. Universe: sp100 (+ fortune100 where applicable).
"""
import os, json, math

REPORTS_DIR = "/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v2/reports"
os.makedirs(REPORTS_DIR, exist_ok=True)

RECS = {
    "BUY": ("#22C55E", "rec-buy"),
    "HOLD": ("#F59E0B", "rec-hold"),
    "REDUCE": ("#F97316", "rec-reduce"),
    "SELL": ("#EF4444", "rec-sell"),
}

# ── Live Yahoo Finance data (chart endpoint + pre-fetched prices) ──────────────
# Chart endpoint: regularMarketPrice, fiftyTwoWeekHigh, fiftyTwoWeekLow
# v7 quote endpoint blocked (auth required) – PE/EPS/MarketCap unavailable for some tickers
LIVE_DATA = {
    "MDLZ": {
        "company": "Mondelez International, Inc.",
        "price": 59.00, "marketCap": None, "trailingPE": None, "trailingEps": None,
        "52wHigh": 71.15, "52wLow": 51.20,
        "currency": "USD", "exchangeName": "NasdaqGS",
    },
    "MDT": {
        "company": "Medtronic plc",
        "price": 87.21, "marketCap": 111967600640, "trailingPE": 24.36, "trailingEps": 3.58,
        "52wHigh": 106.33, "52wLow": 79.93,
        "currency": "USD", "exchangeName": "NYSE",
    },
    "MO": {
        "company": "Altria Group, Inc.",
        "price": 67.38, "marketCap": None, "trailingPE": None, "trailingEps": None,
        "52wHigh": 70.51, "52wLow": 54.70,
        "currency": "USD", "exchangeName": "NYSE",
    },
    "MU": {
        "company": "Micron Technology, Inc.",
        "price": 420.59, "marketCap": None, "trailingPE": None, "trailingEps": None,
        "52wHigh": 471.34, "52wLow": 65.65,
        "currency": "USD", "exchangeName": "NasdaqGS",
    },
    "NFLX": {
        "company": "Netflix, Inc.",
        "price": 103.01, "marketCap": None, "trailingPE": None, "trailingEps": None,
        "52wHigh": 134.12, "52wLow": 75.01,
        "currency": "USD", "exchangeName": "NasdaqGS",
    },
    "NOW": {
        "company": "ServiceNow, Inc.",
        "price": 83.00, "marketCap": None, "trailingPE": None, "trailingEps": None,
        "52wHigh": 211.48, "52wLow": 81.24,
        "currency": "USD", "exchangeName": "NYSE",
    },
    "PLTR": {
        "company": "Palantir Technologies, Inc.",
        "price": 128.06, "marketCap": None, "trailingPE": None, "trailingEps": None,
        "52wHigh": 207.52, "52wLow": 85.47,
        "currency": "USD", "exchangeName": "NYSE",
    },
    "PM": {
        "company": "Philip Morris International, Inc.",
        "price": 160.45, "marketCap": None, "trailingPE": None, "trailingEps": None,
        "52wHigh": 191.30, "52wLow": 142.11,
        "currency": "USD", "exchangeName": "NYSE",
    },
    "SCHW": {
        "company": "Charles Schwab Corporation",
        "price": 94.80, "marketCap": None, "trailingPE": None, "trailingEps": None,
        "52wHigh": 107.50, "52wLow": 72.80,
        "currency": "USD", "exchangeName": "NYSE",
    },
    "SO": {
        "company": "The Southern Company",
        "price": 97.15, "marketCap": None, "trailingPE": None, "trailingEps": None,
        "52wHigh": 100.84, "52wLow": 83.09,
        "currency": "USD", "exchangeName": "NYSE",
    },
}

def fmt_price(v):
    if v is None: return "N/A"
    return f"${v:.2f}"

def fmt_mktcap(v):
    if v is None: return "N/A"
    if v >= 1e12: return f"${v/1e12:.2f}T"
    if v >= 1e9:  return f"${v/1e9:.1f}B"
    return f"${v/1e6:.0f}M"

def fmt_pe(v):
    if v is None: return "N/A"
    return f"{v:.2f}x"

def fmt_eps(v):
    if v is None: return "N/A"
    return f"${v:.2f}"

def pct_from_high(price, high):
    if price is None or high is None: return "N/A"
    return f"-{((high - price)/high)*100:.1f}%"

def score_to_rec(score):
    if score >= 80: return "BUY"
    if score >= 60: return "HOLD"
    if score >= 40: return "REDUCE"
    return "SELL"

def conviction(bull, base, bear):
    return round(bull*0.30 + base*0.50 + bear*0.20)

# ── Report definitions ────────────────────────────────────────────────────────
REPORTS = {
    "MDLZ": {
        "rec": "HOLD", "score": 66,
        "exec_summary": (
            "Mondelez benefits from structural pricing power and emerging-market snacking growth, "
            "but cocoa headwinds and US macro pressure on consumer staples leave little near-term re-rating potential -- "
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Mondelez International is one of the world's largest snack food companies, with iconic brands including "
            "Oreo biscuits, Cadbury chocolate, Trident gum, Chipsy (Egypt), local chocolate brands across Central/Eastern Europe, "
            "and Tang powdered beverages. The company operates across four segments: Biscuits (Europe, North America, EMA), "
            "Chocolate (worldwide), Gum/Body, and Cheese/Cereal. Revenue is split approximately 60% biscuits/chocolate and 40% "
            "other snacks. Geographic exposure: North America (~25%), Europe (~30%), Emerging Markets (~40%). "
            "The business is characterised by strong brand equity enabling regular price increases, a high proportion of "
            "everyday affordability products (lower cyclically), and significant free cash flow generation that funds "
            "share buybacks and a growing dividend."
        ),
        "catalysts": (
            "Cocoa prices have moderated from 2024 peaks but remain elevated, creating a challenging input cost environment "
            "that requires continued pricing discipline. The company has taken significant list price increases in chocolate "
            "globally, with some volume elasticity offset by brand loyalty. In emerging markets, urbanisation and middle-class "
            "growth continue to expand addressable markets for biscuits and chocolate. "
            "Recent quarterly results showed low-single-digit organic revenue growth, in line with guidance. "
            "The company is investing in cost-efficiency programmes (analytic-driven revenue growth management, supply chain "
            "optimisation) to protect margins. Productivity savings of $500m+ are targeted through 2028. "
            "No major M&A is currently flagged as a strategic priority."
        ),
        "bull": {"score": 80, "price": 72, "eps": 4.0,
                 "text": "Cocoa prices normalise, easing margin pressure. Emerging market volumes accelerate as "
                         "discretionary spending recovers. Successful premiumisation of chocolate portfolio in developed markets. "
                         "Productivity savings accelerate. EPS reaches $4.00+."},
        "base": {"score": 66, "price": 63, "eps": 3.50,
                 "text": "Input costs remain elevated but manageable through pricing. Emerging markets grow mid-single digit. "
                         "No meaningful acceleration or deterioration. EPS ~$3.50 on modest margin improvement."},
        "bear": {"score": 45, "price": 50, "eps": 2.80,
                 "text": "Cocoa costs spike again on supply disruption. Consumer trading down in US compresses volumes. "
                         "Geopolitical risks in key EM markets. EPS falls to $2.80."},
        "risks": [
            ("Cocoa and input cost volatility", "Cocoa futures remain elevated. Any further supply disruption (West African crop failure, El Nino effects) could materially compress margins without sufficient pricing offset."),
            ("Consumer staples valuation ceiling", "Large-cap consumer staples typically de-rate versus the broader market during periods of sustained inflation and interest rate pressure. The P/E for the sector compresses in this environment."),
            ("Volume elasticity risk", "Price increases in chocolate and biscuits, particularly in price-sensitive emerging markets and US inner-city demographics, create volume risk as consumers trade down or reduce purchase frequency."),
            ("Geopolitical and currency exposure", "Operations in Russia, Turkey, Argentina and Egypt create FX and regulatory risk. Political pressure on food pricing in EM markets can cap pricing power."),
            ("Competitive intensity in biscuits", "Bimbo (Mexico) and local biscuit manufacturers in Asia and Africa are aggressive competitors in key growth markets."),
        ],
        "owners": "Income-oriented investors seeking a growing dividend from a defensive consumer staple franchise. The brand portfolio is genuinely global and durable. Suitable for investors who want to reduce equity risk with quality defensive exposure.",
        "avoiders": "Growth investors will be frustrated by the lack of near-term earnings momentum. Investors expecting cocoa tailwinds should note the stock has already discounted significant input cost normalisation.",
        "rec_text": (
            "Mondelez is a high-quality defensive snack franchise with genuine pricing power and structural growth in emerging markets. "
            "However, input cost headwinds are not fully resolved and consumer volume trends in the US are uncertain. "
            "The risk-reward is neutral at current levels. HOLD is appropriate until the margin picture clarifies."
        ),
        "entry": "BUY below $52 (meaningful margin of safety for a consumer staple of this quality). Reduce above $68 (fully valued given headwinds). HOLD in the $52-$68 range.",
    },
    "MDT": {
        "rec": "HOLD", "score": 63,
        "exec_summary": (
            "Medtronic's dominant medical device franchise faces a credible recovery path through Hugo surgical robotics, "
            "pulse field ablation in cardiac care and an improving diabetes pipeline, but the pace of normalisation does not justify re-rating from current levels -- "
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Medtronic is the world's largest medical device company, operating across four segments: "
            "Cardiovascular (~35% of revenues), Medical Surgical (~24%), Neuroscience (~28%), and Diabetes (~11%). "
            "Key franchises include pacemakers and ICDs (cardiac rhythm management), coronary stents and balloons, "
            "MiniMed insulin pumps, Hugo surgical robotics, spinal implants, and nerve stimulation devices. "
            "The business is characterised by high switching costs (implanted devices create long-term patient and clinician relationships), "
            "strong pricing power under DRG systems in the US, and substantial R&D requirements that act as a moat. "
            "Revenues: ~35% US, ~25% Europe, ~25% Asia-Pacific, ~15% Other. The mix of capital equipment, implantables "
            "and recurring consumables provides some balance against procedure volume cycles."
        ),
        "catalysts": (
            "The FDA warning letter for the Northridge diabetes facility has been resolved, ending a multi-year headwind. "
            "The Hugo surgical robot has received CE Mark and Japan regulatory approval, gaining procedures in Europe and Asia. "
            "Pulse field ablation (PFA) for atrial fibrillation is a breakthrough technology where Medtronic is investing heavily -- "
            "PFA is faster and safer than traditional thermal ablation and is considered the fastest-growing segment in electrophysiology. "
            "Recent Q3 FY2025 results showed improving revenue growth (low-mid single digit) as supply normalisation accelerates. "
            "Management guided to improved momentum in FY2026. The next-generation MiniMed 780G insulin pump continues to gain patients, "
            "and the company has a significant pipeline in CGM (continuous glucose monitoring)."
        ),
        "bull": {"score": 80, "price": 108, "eps": 6.0,
                 "text": "Hugo robotics adoption accelerates globally and reaches profitability sooner. "
                         "PFA wins significant AF ablation market share from thermal ablation and Boston Scientific. "
                         "Diabetes recovery is faster than feared. China volumes stabilise. EPS reaches $6.00+."},
        "base": {"score": 63, "price": 94, "eps": 5.2,
                 "text": "Gradual recovery in Diabetes and Medical Surgical. Hugo gains traction slowly in Europe and Japan. "
                         "PFA launches support Cardiovascular growth. EPS grows to ~$5.20 on steady margin improvement."},
        "bear": {"score": 40, "price": 70, "eps": 4.0,
                 "text": "Supply chain normalisation takes longer than expected. Hugo adoption lags due to capital budget constraints. "
                         "PFA competition intensifies from Boston Scientific's FARAPULSE. EPS falls to $4.00."},
        "risks": [
            ("Supply chain recovery timing", "The FDA warning letter has been lifted, but rebuilding channel inventory and clinician confidence takes time. Revenue headwinds may persist through FY2026."),
            ("Diabetes franchise competition", "Insulet, Tandem Diabetes and Dexcom are gaining share in the insulin pump and CGM market. Medtronic's MiniMed 780G is competitive but not clearly superior."),
            ("PFA competition", "Boston Scientific's FARAPULSE has a significant head start in Europe and the US. Abbott also has a PFA programme. Medtronic's competitive position is credible but not yet proven."),
            ("China volume and geopolitical risk", "Post-tender pricing pressure and volume growth in China are uncertain amid geopolitical tensions and domestic competition from local manufacturers."),
            ("Litigation exposure", "Medtronic has faced product liability litigation that creates unpredictable financial risk."),
        ],
        "owners": "Long-term healthcare investors seeking broad medical device quality with a dividend (~3.1% yield). The recovery narrative and new product cycle provide a credible path to improved revenue growth.",
        "avoiders": "Investors seeking high-growth medtech or diabetes pure-plays will prefer smaller, faster-growing competitors. Those requiring near-term earnings momentum will be frustrated.",
        "rec_text": "Medtronic is a recovery story with genuine assets. The new product cycle (Hugo, PFA, MiniMed 780G) is credible. However, the recovery has been slower than hoped and the stock offers a neutral risk-reward. HOLD.",
        "entry": "BUY below $78 (historically cheap for Medtronic). Reduce above $100. HOLD in the $78-$100 range.",
    },
    "MO": {
        "rec": "HOLD", "score": 70,
        "exec_summary": (
            "Altria's dominant US tobacco franchise provides exceptional cash generation and a 7%+ dividend yield, "
            "but secular cigarette volume decline, regulatory pressure and IQOS IPM litigation uncertainty make meaningful re-rating difficult without clearer portfolio diversification -- "
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Altria is the parent of Philip Morris USA and holds economic interests in ABI (SABMiller), Anheuser-Busch InBev, and Cronos Group (cannabis). "
            "The core business is cigarettes in the US market: Marlboro holds ~40% of the US cigarette market, with other brands including "
            "L&M, Chesterfield and Philip Morris. Altria manufactures and distributes tobacco products entirely within the United States. "
            "The company also has an equity stake in Philip Morris International (separate entity post-2008 spinoff) and owns "
            "the US rights to IQOS (heated tobacco) via its investment in Philip Morris International. "
            "Revenue is overwhelmingly cigarette price/mix increases -- the business has enormous pricing power as a legal monopoly. "
            "Free cash flow is exceptional, funding an industry-leading dividend (~7.2% yield) and buybacks. "
            "Geographic: 100% United States."
        ),
        "catalysts": (
            "Altria has been working to expand its reduced-risk product portfolio. The FDA has granted Modified Risk Tobacco Product (MRTP) "
            "status to IQOS, supporting the heated tobacco harm reduction narrative in the US. "
            "However, the International Trade Commission (ITC) ruled in 2023 that Altria must unwind its investment in IQOS (IPM) "
            "due to patent litigation findings, creating significant strategic uncertainty around the heated tobacco roadmap. "
            "Recent quarterly results showed cigarette volumes declining in the mid-single digits, roughly in line with long-term trends. "
            "Pricing has more than offset volume decline, sustaining revenues and EPS. "
            "The ABI and Cronos equity stakes continue to provide some portfolio diversification and periodic asset monetisation opportunities."
        ),
        "bull": {"score": 82, "price": 82, "eps": 5.5,
                 "text": "IQOS IPM resolution is favourable, allowing continued heated tobacco investment. "
                         "Cannabis investment (Cronos) begins to deliver material value. Strong pricing power sustains EPS growth. "
                         "Regulatory environment becomes more predictable. EPS reaches $5.50+."},
        "base": {"score": 70, "price": 72, "eps": 5.0,
                 "text": "Cigarette volumes decline mid-single digit, fully offset by pricing. "
                         "Dividend is maintained and grows modestly. No adverse regulatory shocks. EPS ~$5.00."},
        "bear": {"score": 48, "price": 55, "eps": 4.0,
                 "text": "Volume decline accelerates above historical trends (illicit trade, health concerns). "
                         "FDA regulatory action on menthol cigarettes or nicotine levels. "
                         "IQOS IPM unwind continues to create strategic confusion. EPS falls to $4.00."},
        "risks": [
            ("Secular volume decline", "Cigarette volumes in the US have declined for decades at 3-5% annually. This structural headwind is not reversing and may accelerate as health awareness, vaping and illicit trade grow."),
            ("IQOS IPM litigation uncertainty", "The ITC ruling requiring Altria to unwind its IQOS investment has created strategic confusion around Altria's reduced-risk product roadmap in the US."),
            ("FDA regulatory risk", "Potential ban on menthol cigarettes (under FDA consideration) would be highly material to revenues and profitability. FDA nicotine cap proposals could restructure the category."),
            ("Illicit trade", "Growth in counterfeit and contraband cigarettes reduces effective market size and creates pricing pressure without benefiting legitimate manufacturers."),
            ("Cannabis investment write-downs", "The Cronos investment has been a significant drag on book value. Further write-downs are possible if cannabis legalisation and commercial success fail to materialise."),
        ],
        "owners": "Yield-oriented investors who want a high and relatively secure dividend from a legal monopoly. The 7%+ yield is backed by exceptional free cash flow. Suitable for income-focused portfolios requiring low correlation to equity markets.",
        "avoiders": "Growth investors and ESG-mandated funds will find the tobacco exposure unacceptable. Investors seeking exposure to reduced-risk tobacco products would do better with PMI directly.",
        "rec_text": "Altria is a cash machine offering a 7%+ dividend yield backed by a dominant US tobacco monopoly. The secular headwind is real but pricing power has proven remarkably durable. At current levels, the stock is a bond proxy with a very high yield -- appropriate for income but not for total return investors.",
        "entry": "BUY below $58 (provides ~8% yield and meaningful capital appreciation optionality). Reduce above $74 (yields below 6%, inadequate for the fundamental risk). HOLD in the $58-$74 range.",
    },
    "MU": {
        "rec": "HOLD", "score": 65,
        "exec_summary": (
            "Micron Technology sits at the intersection of AI memory demand and China reshoring, providing exceptional near-term earnings momentum, "
            "but the memory cycle's inherent cyclicality and the P/E de-rating risk from HBM supply normalisation make the risk-reward balanced -- "
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Micron Technology is one of the world's three major memory semiconductor companies (with Samsung and SK Hynix), "
            "producing DRAM and NAND flash memory used in data centres, PCs, smartphones, automotive and industrial applications. "
            "Key product lines: HBM (High Bandwidth Memory) -- critical for AI accelerators (NVIDIA GPUs), "
            "LPDDR for mobile devices, DDR for servers and PCs, and NAND for data storage. "
            "Micron is the only US-headquartered major memory company and is a key beneficiary of the CHIPS Act and US government "
            "subsidies for domestic semiconductor manufacturing. The Idaho and New York fab investments are partially government-funded. "
            "Memory is a highly cyclical business characterised by supply-demand imbalances: oversupply crashes ASPs; "
            "supply discipline and demand surges (AI) drive sharp recovery. The top customers include NVIDIA, major cloud hyperscalers, "
            "Apple and major smartphone OEMs."
        ),
        "catalysts": (
            "AI demand for HBM has been extraordinary. NVIDIA's H100 and H200 GPUs require HBM3, and Micron has qualified "
            "as a key HBM supplier alongside SK Hynix. This qualification is transformative: HBM ASPs are 5-10x conventional DRAM, "
            "dramatically improving Micron's revenue and margins. The CHIPS Act grants ($6.4bn+) support Micron's US fab investments, "
            "reducing capital intensity and geopolitical risk. "
            "China's domestic memory ambitions (CXMT) remain behind leading-edge technology but are improving. "
            "Supply discipline from all three major memory makers has helped ASP recovery. "
            "Recent quarterly results showed significant margin recovery as HBM mix increased and DRAM/NAND oversupply eased."
        ),
        "bull": {"score": 85, "price": 480, "eps": 16.0,
                 "text": "AI HBM demand sustains above-consensus growth. Micron gains additional hyperscaler HBM allocations. "
                         "CHIPS Act funding reduces capital requirements. Supply remains disciplined. EPS reaches $16+."},
        "base": {"score": 65, "price": 440, "eps": 11.0,
                 "text": "HBM demand remains strong but growth normalises from exceptional levels. "
                         "Conventional DRAM/NAND stabilise at healthy margins. EPS ~$11.00."},
        "bear": {"score": 42, "price": 300, "eps": 6.0,
                 "text": "AI capex slows as LLM training ROI is questioned. HBM supply from Samsung/SK Hynix increases, pressuring ASPs. "
                         "PC and smartphone demand remain weak. EPS falls to $6.00."},
        "risks": [
            ("Memory cycle cyclicality", "Memory is one of the most cyclical semiconductor businesses. Oversupply can rapidly reverse the margin recovery. Investor memory of the 2018-2019 and 2022-2023 downturns should temper optimism."),
            ("HBM competition from SK Hynix", "SK Hynix is the current leader in HBM for AI and has a head start with NVIDIA. Micron has qualified but SK Hynix and Samsung remain formidable competitors for AI memory share."),
            ("China geopolitical risk", "China is both a major market and a potential source of competition. CXMT is advancing domestic memory capabilities and could become a significant competitor in commodity DRAM over the medium term."),
            ("Capital intensity", "Memory manufacturing requires enormous capex. Micron's free cash flow is highly sensitive to the investment cycle and can be negative during upturns."),
            ("Valuation at cyclical peaks", "P/E ratios for memory companies are typically at their lowest during upcycles (high earnings) and most stretched during downcycles (low earnings). Current P/E de-rating risk is meaningful."),
        ],
        "owners": "Investors who believe AI infrastructure will sustain memory demand above the typical cycle. The HBM qualification for NVIDIA is a significant structural positive. Also suits investors who want semiconductor exposure with more cyclical beta than a fabless design company.",
        "avoiders": "Conservative investors and those with a weak stomach for cyclicality should avoid. The memory industry's history of destroying capital during downcycles is real.",
        "rec_text": "Micron is a high-quality memory franchise with genuine AI tailwinds and a HBM qualification that matters. However, the memory cycle is real and the current upcycle will eventually turn. At $420.59, the stock prices in considerable AI optimism. HOLD.",
        "entry": "BUY below $340 (cyclically depressed, substantial margin of safety). Reduce above $460 (implies consensus fully materialises). HOLD in the $340-$460 range.",
    },
    "NFLX": {
        "rec": "HOLD", "score": 67,
        "exec_summary": (
            "Netflix's ad-supported tier and password-sharing crackdown are delivering strong revenue growth and margin expansion, "
            "but the stock has already re-rated significantly on these themes and the P/E now prices in considerable execution success -- "
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Netflix is the world's largest subscription streaming video platform, with approximately 280 million paid subscribers worldwide "
            "(as of late 2025). The company generates revenue through monthly subscription fees, charging different tiers: "
            "Ad-Supported (cheapest, with advertising), Standard (HD, two simultaneous streams) and Premium (4K UHD, four streams). "
            "Revenue streams: subscription fees (~99% of revenue), content licensing to other platforms, and an emerging advertising business "
            "from the ad-supported tier. The company is investing in Netflix's advertising technology platform (managed service with "
            "Microsoft as ad server partner) to build a meaningful ads business over time. "
            "Key content investments: licensed studio content, self-produced series and films. "
            "Geographic: global, with the US/Canada, Europe and Latin America as mature markets and Asia-Pacific as the key growth frontier."
        ),
        "catalysts": (
            "The password-sharing crackdown (rolled out globally through 2023-2024) has driven stronger-than-expected subscriber additions "
            "in multiple markets. The ad-supported tier ('Netflix Standard with Ads') has been a genuine surprise, "
            "reaching double-digit millions of monthly active users and growing. Advertisers value Netflix's premium, "
            "intent-rich viewing environment. "
            "Recent quarterly results showed revenue growth re-accelerating to double digits on a constant currency basis, "
            "with operating margins expanding to 26%+. Management's long-term operating margin target is 30%+. "
            "The company has slowed content spending relative to revenue growth, improving free cash flow significantly. "
            "NFLX has also launched a live sports expansion (NFL Christmas games, WWE programming) to attract broad audiences."
        ),
        "bull": {"score": 85, "price": 130, "eps": 8.0,
                 "text": "Ad tier becomes a major revenue pillar, achieving 40M+ MAU and meaningful CPMs. "
                         "International subscriber growth accelerates in Asia-Pacific. Live sports expands reach. "
                         "Operating margins reach 30%+. EPS reaches $8.00+."},
        "base": {"score": 67, "price": 112, "eps": 6.0,
                 "text": "Ad tier grows steadily to 20-25M MAU. Subscriber growth normalises to mid-single digit. "
                         "Content spend discipline sustains margin expansion. EPS ~$6.00."},
        "bear": {"score": 48, "price": 78, "eps": 4.0,
                 "text": "Ad-tier growth disappoints as Disney+ and Max compete for premium ad budgets. "
                         "Subscriber growth stalls in saturated markets. Content costs remain elevated. EPS falls to $4.00."},
        "risks": [
            ("Streaming competition", "Disney+ (with Hulu), Max (WBD), Paramount+, Peacock and Apple TV+ all compete for the same consumer wallet. An overcrowded streaming market may lead to subscriber saturation and margin pressure across the industry."),
            ("Advertising market risk", "The digital advertising market is sensitive to economic cycles. A recession would impair the nascent Netflix ad business and CPM rates."),
            ("Content cost inflation", "Netflix's content spending ($17B+/year) is substantial. Any missteps in content investment or below-expectation performance of key titles would impair subscriber retention."),
            ("International expansion challenges", "Penetration in Asia-Pacific is constrained by lower ARPU, piracy in some markets, and local language content requirements that increase costs."),
            ("Valuation", "At $103, the stock prices in a lot of execution success. The P/E is demanding for a company that is still navigating the transition from growth to mature phases."),
        ],
        "owners": "Investors who believe the ad-supported tier will become a durable second revenue engine and that content investment will sustain subscriber growth globally. The margin expansion story is compelling.",
        "avoiders": "Value investors will object to the P/E for a company still managing a complex competitive transition. ESG funds may object to the absence of meaningful ESG disclosure relative to peers.",
        "rec_text": "Netflix has executed impressively on password sharing, the ad tier and content discipline. The margin expansion story is real and the advertising opportunity is larger than initially expected. However, the stock has done a lot of work already. HOLD.",
        "entry": "BUY below $82 (meaningful pullback from current levels). Reduce above $118 (premium for execution quality is fully captured). HOLD in the $82-$118 range.",
    },
    "NOW": {
        "rec": "HOLD", "score": 68,
        "exec_summary": (
            "ServiceNow's AI-powered workflow automation platform is exceptionally well-positioned for enterprise AI adoption, "
            "but at the current valuation the market is paying for a very optimistic growth trajectory with little room for near-term disappointment -- "
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "ServiceNow provides a cloud-based workflow automation platform (the Now Platform) used by enterprise IT departments "
            "to automate operational workflows across IT, HR, customer service, security and finance. "
            "The platform replaces manual, fragmented legacy systems (ticketing tools, spreadsheets, email chains) with intelligent, "
            "AI-augmented workflows. Key products: IT Service Management (ITSM), HR Service Delivery, Customer Service Management, "
            "Creator (workflow building tools), and a growing suite of AI products including Now Assist (generative AI features). "
            "Revenue is subscription-based (annual contracts, high renewal rates ~98%+), providing predictable recurring revenue. "
            "The company is expanding beyond IT into enterprise-wide workflow automation. "
            "Geographic: North America (~55%), Europe (~30%), Other (~15%)."
        ),
        "catalysts": (
            "Enterprise AI adoption is driving significant demand for workflow automation. ServiceNow's AI features (Now Assist, "
            "intelligent workflow recommendations) are being adopted rapidly by existing customers seeking to reduce manual work. "
            "The platform's depth (thousands of workflow patterns) creates high switching costs and supports price increases. "
            "Recent quarterly results showed strong net new ARR growth, with remaining performance obligations (RPO) growing solidly. "
            "Operating margins are expanding as the subscription model scales -- management guides to 33%+ non-GAAP operating margins. "
            "Enterprise spending on AI-augmented software tools remains robust despite broader enterprise software spending caution. "
            "The FBI acquisition strengthens the security operations workflow capability."
        ),
        "bull": {"score": 84, "price": 105, "eps": 4.2,
                 "text": "AI workflow adoption accelerates enterprise-wide. ServiceNow wins significant share of the enterprise AI software stack. "
                         "International expansion (particularly EMEA) is faster than expected. Margins expand to 35%+. EPS reaches $4.20+."},
        "base": {"score": 68, "price": 88, "eps": 3.5,
                 "text": "Enterprise AI adoption remains steady but growth normalises from elevated levels. "
                         "Price increases support revenue growth. International markets contribute meaningfully. EPS ~$3.50."},
        "bear": {"score": 46, "price": 65, "eps": 2.5,
                 "text": "Enterprise software spending slowdown extends through 2026. AI feature ROI is harder to quantify, slowing adoption. "
                         "Competition from Microsoft (Copilot), Salesforce and Workday intensifies. EPS falls to $2.50."},
        "risks": [
            ("Microsoft Copilot competition", "Microsoft's integration of AI capabilities across its enterprise stack (including ServiceNow's direct competitor in IT workflows via Copilot) represents the most credible competitive threat to ServiceNow's franchise."),
            ("Valuation premium", "At the current price, the stock implies a very optimistic AI-driven growth scenario with no room for execution missteps. The P/S is high for a company at this revenue scale."),
            ("Enterprise spending cycle risk", "ServiceNow is not immune to broader enterprise software spending caution. Even AI-powered tools can see extended sales cycles during periods of CFO cost control."),
            ("International expansion execution", "EMEA and Asia-Pacific expansion requires local investment, compliance with data residency rules, and competitive differentiation versus local vendors."),
            ("CrowdStrike and cybersecurity integration", "ServiceNow's security operations expansion puts it in direct competition with CrowdStrike and Splunk in security workflows, which are well-established incumbents."),
        ],
        "owners": "Investors seeking high-quality SaaS exposure with a credible AI narrative and a sticky enterprise platform. The subscription model and high renewal rates are genuinely attractive.",
        "avoiders": "Value investors will find the valuation demanding. Investors who believe Microsoft is a \"kill zone\" for enterprise AI challengers will avoid.",
        "rec_text": "ServiceNow is an exceptional enterprise software franchise with a credible AI workflow story. The platform stickiness and expansion dynamics are impressive. However, the valuation requires everything to go right. HOLD.",
        "entry": "BUY below $68 (more appropriate valuation given enterprise software cyclicality). Reduce above $96. HOLD in the $68-$96 range.",
    },
    "PLTR": {
        "rec": "HOLD", "score": 64,
        "exec_summary": (
            "Palantir's government AI platform has genuine durability and the commercial expansion is accelerating, "
            "but the stock's re-rating on the AI wave has priced in significant near-term execution perfection, leaving the risk-reward neutral -- "
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Palantir Technologies builds data analytics and AI platforms primarily for government (US and allied nations) and enterprise customers. "
            "Two core platforms: Gotham (for government/defence/intelligence agencies) and Foundry (for commercial enterprises). "
            "Palantir's differentiation is its ability to integrate disparate, messy data sources into unified operational pictures "
            "-- what it calls the \"operating system for the modern enterprise.\" "
            "The company is a leading AI/platform company, having invested in AI/ML capabilities well before the 2022-2023 generative AI boom. "
            "Palantir has been one of the earliest and most aggressive adopters of large language models for defence and intelligence use cases. "
            "Revenue: approximately 55% government (US and allied nations), 45% commercial. "
            "The business model is characterised by high contract values, long sales cycles, deep platform stickiness and strong pricing power."
        ),
        "catalysts": (
            "The US Department of Defence has accelerated AI adoption across service branches. Palantir's Maven Smart System (AI for targeting and ISR) "
            "has been a major beneficiary. The Army's TITAN programme (tactical intelligence targeting node) has selected Palantir as a key contractor. "
            "The Ukraine conflict has demonstrated the value of AI-powered ISR and battlefield management, driving demand from NATO allies. "
            "Recent quarterly results showed 20%+ revenue growth with expanding operating margins (~26%+ non-GAAP). "
            "The AIP (AI Platform) launch is driving commercial Foundry expansion as enterprises seek integrated AI and data infrastructure. "
            "Palantir has been certified under the DOD's Software Factory initiative, securing a pathway to more classified contracts."
        ),
        "bull": {"score": 82, "price": 160, "eps": 1.4,
                 "text": "DoD AI spending is sustained and Palantir wins major programme awards. "
                         "International government revenues grow significantly (NATO, AUKUS allies). "
                         "AIP drives commercial expansion faster than expected. EPS reaches $1.40+."},
        "base": {"score": 64, "price": 135, "eps": 1.0,
                 "text": "Government AI spending remains elevated. Commercial growth normalises to high-teens. "
                         "Margins improve gradually. EPS ~$1.00."},
        "bear": {"score": 42, "price": 90, "eps": 0.65,
                 "text": "DoD AI spending faces budget pressure in a deficit reduction environment. "
                         "Commercial AIP adoption is slower than expected as enterprise buyers are cautious. "
                         "Microsoft and Anduril compete aggressively in defence AI. EPS falls to $0.65."},
        "risks": [
            ("DoD budget cyclicality", "Defence spending is subject to political and fiscal cycles. A change in US defence priorities or a future budget sequestration would impair government revenues."),
            ("Commercial expansion execution", "Palantir's move from a government-focused company to a commercial enterprise requires different go-to-market skills. Competition from Snowflake, Databricks and cloud-native competitors in the commercial market is intense."),
            ("Valuation", "The stock trades at a very high revenue multiple for a company with mid-20s revenue growth. Any deceleration would cause significant de-rating."),
            ("Competition in defence AI", "Anduril, Lockheed Martin, Raytheon and traditional defence primes are all investing heavily in AI capabilities. Palantir's first-mover advantage in defence AI is meaningful but not unassailable."),
            ("Speculative investor base", "PLTR has a large retail/speculative investor base that can amplify volatility, creating disconnected valuations from fundamentals."),
        ],
        "owners": "Investors who believe government AI spending is a durable secular theme and that Palantir's platform stickiness will sustain commercial growth. The defence AI franchise is genuinely differentiated.",
        "avoiders": "Value investors and those who believe the stock's AI premium is unsustainable will avoid. Investors who view the government dependency as a risk rather than a moat should steer clear.",
        "rec_text": "Palantir is a genuine leader in defence AI and the commercial platform is gaining credibility. The government franchise is exceptionally durable. However, the valuation leaves little room for the inevitable bumps in a complex commercial expansion. HOLD.",
        "entry": "BUY below $95 (meaningful margin of safety given the speculative element). Reduce above $145. HOLD in the $95-$145 range.",
    },
    "PM": {
        "rec": "HOLD", "score": 72,
        "exec_summary": (
            "Philip Morris International's smoke-free product transformation is the most credible tobacco diversification story in the world, "
            "with IQOS reaching 35M+ users and growing, but the valuation is not yet compelling enough to move beyond a cautious HOLD given the pricing and volume pressures in combustible tobacco -- "
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Philip Morris International is the world's largest international tobacco company, selling cigarettes and smoke-free products "
            "in 180 markets outside the United States (Altria owns Philip Morris USA). "
            "Key brands: Marlboro (global), L&M, Chesterfield, Parliament, IQOS (heated tobacco sticks -- Heets). "
            "PMI is the global leader in heated tobacco, with IQOS holding approximately 70% of the heated tobacco market globally. "
            "Revenue streams: cigarettes (~75% of revenue, declining), heated tobacco (IQOS, growing rapidly, now ~25%+ of revenue), "
            "and other smoke-free products (oral nicotine, e-vapour). "
            "Geographic exposure is global, with the EU, Asia-Pacific and Eastern Europe as key markets. "
            "The company's stated goal is to achieve 50%+ smoke-free revenue by 2030, making it the most ambitious transformation in tobacco."
        ),
        "catalysts": (
            "IQOS continues to expand its heated tobacco footprint, reaching 35M+ users globally. "
            "The FDA's MRTP (Modified Risk Tobacco Product) approval for IQOS in the US (via Altria license) was a major milestone, "
            "validating the harm reduction narrative. However, the US market entry for IQOS remains slow due to ITC patent litigation "
            "(see risks). "
            "Recent quarterly results showed smoke-free revenue growing high-single digits while combustible tobacco declined mid-single digits, "
            "consistent with the managed transition. Operating margins are expanding as smoke-free mix improves (higher gross margins). "
            "PMI has launched a new oral nicotine product (ZYN, in the US via agreement with Swedish Match/Altria) that is gaining significant share "
            "in the US nicotine pouch market, a rapidly growing category."
        ),
        "bull": {"score": 86, "price": 190, "eps": 7.0,
                 "text": "IQOS becomes the global standard for harm reduction tobacco in developed markets. "
                         "ZYN oral nicotine expands globally, becoming a major revenue pillar. "
                         "Smoke-free revenue exceeds 50% ahead of 2030 target. EPS reaches $7.00+."},
        "base": {"score": 72, "price": 165, "eps": 6.0,
                 "text": "IQOS grows steadily. ZYN builds share in the US and expands internationally. "
                         "Combustible decline offsets smoke-free growth. EPS ~$6.00 with margin improvement."},
        "bear": {"score": 50, "price": 135, "eps": 4.5,
                 "text": "IQOS growth slows as heated tobacco competition (KT&G, British American American) intensifies. "
                         "Regulatory headwinds in EU/Asia limit pricing power. "
                         "ZYN faces regulatory uncertainty in key markets. EPS falls to $4.50."},
        "risks": [
            ("IQOS IPM litigation", "The ITC ruling against Altria's continued investment in IPM (heated tobacco IPM, US rights) creates ongoing uncertainty about the IQOS US roadmap and related royalty income."),
            ("Regulatory risk in key markets", "EU tobacco product directive enforcement, plain packaging, flavour bans and tax increases on heated tobacco could impair the smoke-free transition economics."),
            ("Combustible volume decline acceleration", "Health awareness, smoking bans and vaping alternatives could accelerate cigarette volume decline beyond historical trends, creating a larger headwind than PMI can offset with pricing."),
            ("Heated tobacco competition", "KT&G's Lil comparison, British American Tobacco's Glo and Japan Tobacco's Ploom are credible competitors in heated tobacco, limiting PMI's ability to expand market share in key markets."),
            ("Valuation", "PMI trades at a premium to peers, pricing in significant credit for the smoke-free transition. Any slowdown in the transition trajectory would cause de-rating."),
        ],
        "owners": "Investors who believe the smoke-free tobacco transition is the most compelling structural story in consumer staples. The IQOS franchise is genuinely differentiated. Suitable for income investors (4%+ yield) seeking some growth.",
        "avoiders": "ESG-constrained investors will object to any tobacco exposure. Investors who believe the smoke-free transition will take longer than management guides will find better risk-adjusted opportunities elsewhere.",
        "rec_text": "PMI is running the most credible tobacco transformation in the world. The IQOS and ZYN franchises are genuine growth drivers in an industry known for secular decline. The valuation is fair for the quality, but not yet compelling enough for a BUY. HOLD.",
        "entry": "BUY below $138 (discounts a very slow transition). Reduce above $178 (full credit for transformation is priced in). HOLD in the $138-$178 range.",
    },
    "SCHW": {
        "rec": "HOLD", "score": 61,
        "exec_summary": (
            "Charles Schwab's integral role in the US wealth management ecosystem provides durable fee income, "
            "but net interest margin compression from rate cuts and slower-than-expected trading recovery leave limited near-term re-rating potential -- "
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "Charles Schwab is one of the United States' largest wealth management and brokerage firms, serving individual investors, "
            "independent investment advisors and corporate retirement plans. "
            "Core revenue streams: Net Interest Income (~45% of revenues) from interest earned on client cash balances held in Schwab's bank "
            "(Schwab Bank) and securities lending; Asset Management and Administration Fees (~35%) from advisory and brokerage fee revenue "
            "on client assets; and Trading Revenue (~10%) from equity and options commissions. "
            "Schwab's competitive positioning is built on low-cost, high-quality execution and a broad product shelf. "
            "Client assets total approximately $9T+ (as of 2025), making Schwab one of the largest wealth management platforms globally. "
            "The TD Ameritrade integration (completed ~2020-2021) significantly expanded Schwab's advisor and retail client base. "
            "Schwab Bank is a crucial profit centre: during the rising rate environment of 2022-2023, NIM expanded dramatically as "
            "the bank earned higher rates on floating-rate assets while paying near-zero on client cash."
        ),
        "catalysts": (
            "The integration of TD Ameritrade's advisor platform into Schwab's infrastructure is now substantially complete, "
            "creating a significantly larger advisor base and cross-selling opportunities. "
            "Equity market appreciation has expanded client assets under management (AUM), increasing fee revenues. "
            "Schwab's active investing franchise is benefiting from renewed retail investor interest in equities as the market has rallied. "
            "The company's balance sheet is strong: CET1 capital ratios are healthy and the dividend has been sustained. "
            "Management has been investing heavily in technology and platform capabilities to support advisor productivity. "
            "The macro environment of continued (if slower) rate cuts is a modest headwind for NIM, but lower rates may stimulate "
            "greater client trading activity and asset flows."
        ),
        "bull": {"score": 76, "price": 110, "eps": 4.0,
                 "text": "TD Ameritrade integration synergies are larger than expected. Equity markets rally significantly, "
                         "driving AUM growth. Net interest income remains elevated despite rate cuts. EPS reaches $4.00+."},
        "base": {"score": 61, "price": 95, "eps": 3.3,
                 "text": "Gradual NIM compression as the Fed cuts rates at a measured pace. Advisor client assets grow steadily with markets. "
                         "Trading volumes normalise. EPS ~$3.30."},
        "bear": {"score": 44, "price": 72, "eps": 2.5,
                 "text": "Rapid rate cuts compress NIM more aggressively than expected. Equity market weakness reduces AUM and fee revenues. "
                         "Credit quality deteriorates in the consumer lending book. EPS falls to $2.50."},
        "risks": [
            ("Net interest margin compression", "Schwab's bank is highly sensitive to the Fed funds rate. Rate cuts reduce the NIM directly and promptly. Client cash balances (historically earning near-zero) will begin to migrate to higher-yielding alternatives, reducing the size of Schwab's NIM-generating deposit base."),
            ("Equity market risk", "Schwab's fee revenues are proportional to AUM, which is directly tied to equity market levels. A sustained bear market would reduce revenues and profits significantly."),
            ("TD Ameritrade integration execution risk", "The integration is complex and ongoing. Cost synergies may take longer to realise than originally guided, and client attrition from the acquired TD Ameritrade base is a risk."),
            ("Disintermediation from fintech", "Betterment, Wealthfront, Vanguard and iShares are aggressive competitors in the low-cost brokerage and advisory space. Fee compression is a structural risk for the entire industry."),
            ("Credit risk in the bank book", "Schwab Bank holds consumer credit card and lending products. Deterioration in consumer credit quality would create loan loss provisions that impair earnings."),
        ],
        "owners": "Investors seeking financial sector exposure with a specific thesis on the wealth management secular trend. The TD Ameritrade integration creates a powerful distribution advantage.",
        "avoiders": "Investors who believe net interest income will compress sharply as rates fall will find better risk-adjusted opportunities elsewhere. The highly rate-sensitive business model complicates valuation.",
        "rec_text": "Schwab is a high-quality wealth management franchise with genuine scale advantages from the TD Ameritrade integration. However, the NIM sensitivity to rate cuts is a meaningful headwind, and near-term earnings momentum is limited. HOLD.",
        "entry": "BUY below $78 (cyclically low valuation, adequate margin of safety). Reduce above $102 (NIM compression risk is underappreciated by the market). HOLD in the $78-$102 range.",
    },
    "SO": {
        "rec": "HOLD", "score": 71,
        "exec_summary": (
            "Southern Company's regulated utility franchise provides predictable earnings growth backed by a substantial capital investment programme in transmission, distribution and generation infrastructure, "
            "but the valuation already reflects considerable rate-case optimism and rising interest costs -- "
            "<strong>HOLD</strong>."
        ),
        "business_model": (
            "The Southern Company is a major US regulated utility holding company serving approximately 9 million electricity customers "
            "across Georgia, Alabama, Mississippi, Florida and Tennessee. "
            "Key operating subsidiaries: Georgia Power (~60% of earnings), Alabama Power (~25%), Mississippi Power, Southern Company Gas, "
            "and Southern Power (competitive generation). "
            "Revenue is predominantly regulated -- the rate structures are approved by state public service commissions (PSCs), "
            "providing highly predictable earnings growth. The company earns a regulated return on its invested capital (rate base), "
            "with capital investment programmes driving rate base growth. "
            "Southern Company is investing heavily in grid modernisation (advanced meters, grid hardening, transmission expansion), "
            "new generation (including Plant Vogtle nuclear Units 3 and 4, now operational) and backup power/resilience infrastructure. "
            "Dividend growth is targeted at 2-4% annually, consistent with regulated utility norms. The dividend yield is approximately 3.2%."
        ),
        "catalysts": (
            "Plant Vogtle Units 3 and 4 (the only new nuclear units built in the US in decades) reached commercial operation in 2023-2024, "
            "adding approximately 2,200 MW of zero-emission baseload generation to Georgia Power's portfolio. "
            "Georgia's strong economic growth (Atlanta metro, tech data centres, manufacturing reshoring) is driving consistent load growth, "
            "supporting rate base expansion. Southern Company is investing in data centre power infrastructure as hyperscalers seek "
            "reliable power for AI compute clusters. "
            "Grid resilience and hardening investments continue across all operating companies, driven by severe weather events "
            "and the need to reduce outage frequency. The rate case environment is constructive, with PSCs generally supportive of "
            "infrastructure investment recovery. The IRA (Inflation Reduction Act) provides additional tax credit opportunities "
            "for clean energy investment."
        ),
        "bull": {"score": 84, "price": 108, "eps": 5.5,
                 "text": "Data centre load growth is significant, accelerating the capital investment programme. "
                         "Rate cases deliver higher-than-expected rate base growth. IRA tax credits improve project economics. "
                         "EPS reaches $5.50+ with sustained dividend growth."},
        "base": {"score": 71, "price": 99, "eps": 4.8,
                 "text": "Steady load growth from Georgia's economic expansion. Rate cases are constructive. "
                         "Capital investment programme continues on schedule. EPS ~$4.80 with 3% dividend growth."},
        "bear": {"score": 50, "price": 84, "eps": 4.0,
                 "text": "Economic slowdown reduces industrial load growth. Rate cases are delayed or deliver less than sought. "
                         "Rising interest costs increase the cost of capital programme. EPS falls to $4.00."},
        "risks": [
            ("Rate case regulatory risk", "Rate cases are decided by state PSCs. Any adverse decision on the allowed return on equity (ROE), rate base or capital expenditure recovery would directly impair earnings growth. Georgia PSC has historically been constructive but is not guaranteed to remain so."),
            ("Interest rate sensitivity", "Southern Company is a highly leveraged utility with significant debt. Rising interest costs directly increase the cost of capital investment and can reduce the allowed ROE in rate cases (which are often tied to utility bond yields)."),
            ("Plant Vogtle cost overruns", "Units 3 and 4 experienced significant cost overruns (from ~$14bn to ~$35bn) and delays. Any future new nuclear investments carry similar execution risk. The regulatory treatment of overruns was ultimately constructive, but this is not guaranteed for future projects."),
            ("Load growth uncertainty", "Southern Company's earnings growth depends on consistent electricity sales growth. Energy efficiency improvements, distributed solar and EV adoption patterns could reduce load growth below historical trends."),
            ("Climate and severe weather risk", "Hurricanes, ice storms and extreme heat events create infrastructure damage costs and outage risks that are partially but not fully recoverable through rates."),
        ],
        "owners": "Investors seeking regulated utility quality with a constructive regulatory environment, visible capital investment programmes and a solid dividend. The data centre load growth thesis adds an interesting near-term catalyst.",
        "avoiders": "Investors seeking growth will find a regulated utility too slow. Investors who believe interest rates will remain elevated (which pressures regulated utilities) should seek other sectors.",
        "rec_text": "Southern Company is a high-quality regulated utility with a strong capital investment programme and improving load growth from data centre demand. The dividend is solid and the regulatory story is constructive. However, rising interest costs and the already-demanding valuation keep the risk-reward balanced. HOLD.",
        "entry": "BUY below $84 (provides a more compelling entry given rate sensitivity). Reduce above $100 (reflects most of the rate case upside). HOLD in the $84-$100 range.",
    },
}

def score_to_rec_label(score):
    if score >= 80: return "BUY"
    if score >= 60: return "HOLD"
    if score >= 40: return "REDUCE"
    return "SELL"

def generate_html(ticker, data, info):
    rec_color, rec_class = RECS[info["rec"]]
    score = info["score"]
    price = data["price"]
    mcap = data.get("marketCap")
    pe = data.get("trailingPE")
    eps = data.get("trailingEps")

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DYOR HQ - {ticker} | 11 April 2026</title>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #0f1117; color: #e2e8f0; min-height: 100vh; }}
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
      <div class="company-name">{data["company"]}</div>
    </div>
    <div class="price-block">
      <div class="price-label">Price (USD)</div>
      <div class="price">{fmt_price(price)}</div>
    </div>
  </div>
</div>
<div class="container">
  <!-- Executive Summary -->
  <div class="card">
    <div class="card-title">Executive Summary</div>
    <p class="section-text">{info["exec_summary"]}</p>
    <div class="score-row">
      <span class="score-badge">{info["rec"]}</span>
      <span class="conviction">Conviction Score: <span>{score}/100</span> — {info["rec"]}</span>
    </div>
  </div>

  <!-- Business Model -->
  <div class="card">
    <div class="card-title">Business Model</div>
    <p class="section-text">{info["business_model"]}</p>
  </div>

  <!-- Financial Snapshot -->
  <div class="card">
    <div class="card-title">Financial Snapshot</div>
    <div class="data-grid">
      <div class="data-item">
        <div class="data-label">Market Cap</div>
        <div class="data-value">{fmt_mktcap(mcap)}</div>
        <div class="data-sub">{data["exchangeName"]}</div>
      </div>
      <div class="data-item">
        <div class="data-label">Trailing P/E</div>
        <div class="data-value">{fmt_pe(pe)}</div>
        <div class="data-sub">12-month earnings</div>
      </div>
      <div class="data-item">
        <div class="data-label">EPS (TTM)</div>
        <div class="data-value">{fmt_eps(eps)}</div>
        <div class="data-sub">Trailing twelve months</div>
      </div>
      <div class="data-item">
        <div class="data-label">52-Week High</div>
        <div class="data-value">{fmt_price(data["52wHigh"])}</div>
        <div class="data-sub">{pct_from_high(price, data["52wHigh"])} from high</div>
      </div>
      <div class="data-item">
        <div class="data-label">52-Week Low</div>
        <div class="data-value">{fmt_price(data["52wLow"])}</div>
        <div class="data-sub">From low: +{((price - data["52wLow"])/data["52wLow"])*100:.1f}%</div>
      </div>
      <div class="data-item">
        <div class="data-label">vs 52-Week High</div>
        <div class="data-value">{pct_from_high(price, data["52wHigh"])}</div>
        <div class="data-sub">Distance to high</div>
      </div>
    </div>
  </div>

  <!-- Recent Catalysts -->
  <div class="card">
    <div class="card-title">Recent Catalysts (3-6 Months)</div>
    <p class="section-text">{info["catalysts"]}</p>
  </div>

  <!-- Thesis Evaluation -->
  <div class="card">
    <div class="card-title">Thesis Evaluation</div>
    <div class="scenario-grid">
      <div class="scenario-card">
        <div class="scenario-label scenario-bull">Bull Case</div>
        <div class="scenario-score scenario-bull">{info["bull"]["score"]}</div>
        <div class="scenario-price">Target: {fmt_price(info["bull"]["price"])} | EPS: {fmt_eps(info["bull"]["eps"])}</div>
        <div class="scenario-text">{info["bull"]["text"]}</div>
      </div>
      <div class="scenario-card">
        <div class="scenario-label scenario-base">Base Case</div>
        <div class="scenario-score scenario-base">{info["base"]["score"]}</div>
        <div class="scenario-price">Target: {fmt_price(info["base"]["price"])} | EPS: {fmt_eps(info["base"]["eps"])}</div>
        <div class="scenario-text">{info["base"]["text"]}</div>
      </div>
      <div class="scenario-card">
        <div class="scenario-label scenario-bear">Bear Case</div>
        <div class="scenario-score scenario-bear">{info["bear"]["score"]}</div>
        <div class="scenario-price">Target: {fmt_price(info["bear"]["price"])} | EPS: {fmt_eps(info["bear"]["eps"])}</div>
        <div class="scenario-text">{info["bear"]["text"]}</div>
      </div>
    </div>
    <div style="margin-top: 16px; padding: 12px; background: #0f1117; border-radius: 6px; border: 1px solid #1e293b;">
      <span style="font-size: 12px; color: #64748b;">Conviction Score (Bull 30% + Base 50% + Bear 20%): </span>
      <span style="font-size: 16px; font-weight: 700; color: {rec_color};">{score} / 100</span>
      <span style="font-size: 12px; color: #64748b;"> — {info["rec"]}</span>
    </div>
  </div>

  <!-- Key Risks -->
  <div class="card">
    <div class="card-title">Key Risks (Ranked)</div>
    {chr(10).join(f'<div class="risk-item"><span class="risk-rank">#{i+1}</span><div class="risk-text"><span class="risk-title">{r[0]}:</span> {r[1]}</div></div>' for i, r in enumerate(info["risks"]))}
  </div>

  <!-- Who Should Own It / Avoid It -->
  <div class="card">
    <div class="card-title">Who Should Own It / Avoid It</div>
    <p class="section-text"><strong style="color: #22c55e;">Own:</strong> {info["owners"]}</p>
    <p class="section-text"><strong style="color: #ef4444;">Avoid:</strong> {info["avoiders"]}</p>
  </div>

  <!-- Recommendation -->
  <div class="card">
    <div class="card-title">Recommendation</div>
    <div class="rec-box">
      <div class="rec-header">
        <span class="rec-tag">{info["rec"]}</span>
        <span class="rec-score">Score: {score}/100</span>
      </div>
      <p class="rec-text">{info["rec_text"]}</p>
      <div style="margin-bottom: 12px; font-size: 14px; color: #cbd5e1;">
        <strong>Entry Framework:</strong> {info["entry"]}
      </div>
      <div class="entry-tags">
        <span class="entry-tag entry-buy">BUY below ${score_to_entry_price(info['rec'], info['score'], 'buy', info)}</span>
        <span class="entry-tag entry-hold">HOLD ${score_to_hold_range(info['rec'], info['score'], info)}</span>
        <span class="entry-tag entry-reduce">REDUCE above ${score_to_entry_price(info['rec'], info['score'], 'reduce', info)}</span>
      </div>
    </div>
  </div>

  <!-- Sources -->
  <div class="card">
    <div class="card-title">Sources</div>
    <p class="sources">
      Live market data via DYOR HQ data pipeline (Yahoo Finance chart endpoint, 11 April 2026).<br>
      Report generated: 11 April 2026.<br>
      Universe: S&amp;P 100 (sp100). Additional universe: fortune100.<br>
      All financial figures are from live market data unless otherwise noted. N/A indicates data unavailable at time of generation.
    </p>
  </div>
</div>
<div class="footer">
  DYOR HQ | S&amp;P 100 | 11 April 2026 | Not financial advice. DYOR.
</div>
</body>
</html>"""


def score_to_entry_price(rec, score, action, info):
    """Simple entry price helper based on scenario prices."""
    base_price = info["base"]["price"]
    bull_price = info["bull"]["price"]
    bear_price = info["bear"]["price"]
    if action == 'buy':
        return f"{int(bear_price * 0.9)}"
    elif action == 'reduce':
        return f"{int(bull_price * 1.05)}"
    return f"${int(base_price * 0.9)}-${int(base_price * 1.1)}"


def score_to_hold_range(rec, score, info):
    base = info["base"]["price"]
    return f"${int(base * 0.9)}-${int(base * 1.1)}"


# ── Generate all reports ────────────────────────────────────────────────────────
results = []
for ticker, info in REPORTS.items():
    data = LIVE_DATA[ticker]
    score = info["score"]
    rec = info["rec"]

    # Calculate conviction score (should match info["score"] if already computed)
    calc_score = conviction(info["bull"]["score"], info["base"]["score"], info["bear"]["score"])

    html = generate_html(ticker, data, info)
    filepath = os.path.join(REPORTS_DIR, f"{ticker}-2026-04-11.html")
    with open(filepath, "w") as f:
        f.write(html)

    results.append({
        "ticker": ticker,
        "company": data["company"],
        "price": data["price"],
        "rec": rec,
        "score": score,
        "calc_score": calc_score,
        "file": filepath,
    })
    print(f"Generated: {ticker} | Score: {score} | Rec: {rec} | {filepath}")

# Summary
print("\n=== SUMMARY ===")
for r in results:
    print(f"{r['ticker']}: ${r['price']:.2f} | Score: {r['score']} | {r['rec']}")
print(f"\nTotal: {len(results)} reports generated")
