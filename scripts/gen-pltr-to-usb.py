#!/usr/bin/env python3
"""Generate DYOR HQ reports for 11 tickers."""
import os, textwrap

REPORTS_DIR = "/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v2/reports"
TEMPLATE_PATH = "/Users/hughmcgauran/.openclaw/workspace/projects/dyorhq-v2/reports/ABBV-2026-04-11.html"

TICKERS = {
    "PLTR": {
        "name": "Palantir Technologies Inc",
        "price": 128.06,
        "marketCap": 306.28,
        "pe": 203.27,
        "eps": 0.63,
        "high52": 207.52,
        "low52": 85.47,
        "sector": "Analytics & AI Software",
    },
    "PM": {
        "name": "Philip Morris International Inc",
        "price": 160.45,
        "marketCap": 250.07,
        "pe": 22.10,
        "eps": 7.26,
        "high52": 191.30,
        "low52": 142.11,
        "sector": "Tobacco",
    },
    "SCHW": {
        "name": "Charles Schwab Corporation",
        "price": 94.80,
        "marketCap": 166.11,
        "pe": 20.39,
        "eps": 4.65,
        "high52": 107.50,
        "low52": 72.80,
        "sector": "Financial Services",
    },
    "SO": {
        "name": "Southern Company",
        "price": 97.15,
        "marketCap": 109.52,
        "pe": 24.78,
        "eps": 3.92,
        "high52": 100.84,
        "low52": 83.09,
        "sector": "Utilities — Regulated Electric",
    },
    "SPG": {
        "name": "Simon Property Group Inc",
        "price": 200.57,
        "marketCap": 76.35,
        "pe": 14.15,
        "eps": 14.17,
        "high52": 205.12,
        "low52": 142.30,
        "sector": "Real Estate — Retail REIT",
    },
    "TMUS": {
        "name": "T-Mobile US Inc",
        "price": 195.71,
        "marketCap": 218.90,
        "pe": 20.13,
        "eps": 9.72,
        "high52": 267.96,
        "low52": 181.36,
        "sector": "Telecommunications",
    },
    "TSLA": {
        "name": "Tesla Inc",
        "price": 348.95,
        "marketCap": 1309.41,
        "pe": 326.12,
        "eps": 1.07,
        "high52": 498.83,
        "low52": 222.79,
        "sector": "Electric Vehicles & Energy",
    },
    "TXN": {
        "name": "Texas Instruments Inc",
        "price": 214.73,
        "marketCap": 195.50,
        "pe": 39.33,
        "eps": 5.46,
        "high52": 231.32,
        "low52": 139.95,
        "sector": "Semiconductors",
    },
    "UBER": {
        "name": "Uber Technologies Inc",
        "price": 70.48,
        "marketCap": 145.06,
        "pe": 14.90,
        "eps": 4.73,
        "high52": 101.99,
        "low52": 68.46,
        "sector": "Ride-Hail & Delivery",
    },
    "UNP": {
        "name": "Union Pacific Corporation",
        "price": 250.51,
        "marketCap": 148.72,
        "pe": 20.91,
        "eps": 11.98,
        "high52": 268.14,
        "low52": 206.63,
        "sector": "Railroads",
    },
    "USB": {
        "name": "US Bancorp",
        "price": 55.66,
        "marketCap": 86.48,
        "pe": 12.05,
        "eps": 4.62,
        "high52": 61.19,
        "low52": 36.48,
        "sector": "Financial Services — Regional Banking",
    },
}

REPORTS = {
    "PLTR": {
        "rec": "HOLD",
        "score": 72,
        "exec": "Palantir's AI-driven revenue acceleration is real and material, but a 203x trailing P/E leaves virtually no room for slippage — the risk-reward is balanced and <strong>HOLD</strong> is the weighted recommendation.",
        "bull": "AIP-driven platforms (Foundry, Gotham, Apollo) drive revenues above $3bn with a rule-of-40 profile. Government demand expands into NATO allies. PLTR achieves profitability targets sustainably and the stock re-rates toward 100x forward P/E as AI spend peaks. Price: $180+.",
        "base": "PLTR maintains 25–30% annual revenue growth as commercial and government deployments scale. Operating leverage improves margins toward 30%+. Competes effectively with Snowflake, Databricks and Booz Allen. EPS grows to $1.20–$1.40. Price: $120–$150.",
        "bear": "AI capital spending slows post-2025. Palantir faces increasing competition from hyperscalers building competing analytics layers. Government procurement cycles lengthen. EPS falls below $0.90. Price: below $90.",
        "business": "Palantir operates two primary platforms: <em>Foundry</em> (commercial data orchestration and AI deployment) and <em>Gotham</em> (US government and allied defence/intelligence analytics). Its <em>Apollo</em> operating layer enables deployment across hybrid and multi-cloud environments, a structural advantage in government and regulated industries. Revenue is recurring and multi-year in government segments. Palantir is among the few pure-play AI companies with demonstrable, contract-backed government revenues.",
        "catalysts": "PLTR has posted consecutive strong quarters driven by AIP (Palantir's LLM-powered analytics layer), which differentiates the platform by embedding large language models directly into data pipelines. The US Department of Defence continues to expand AI adoption budgets. NATO and allied government contracts represent a nascent international opportunity. Palantir's commercial segment has inflected positively after years of underperformance, with the Foundry platform gaining traction in financial services, manufacturing and healthcare. The company achieved GAAP profitability in 2023 and has maintained it since, removing the cash-burn risk that historically discounted the valuation.",
        "risks": [
            ("<strong>Valuation risk:</strong> A 203x trailing P/E and estimated 80–100x forward P/E prices in near-perfect execution. Any guidance miss or competitive encroachment by hyperscalers (AWS, Azure, GCP) building competing AI/analytics layers could trigger severe multiple compression.", 1),
            ("<strong>Government dependency:</strong> A significant portion of revenues derives from US government contracts subject to budget appropriation risk, procurement cycling and political variables.", 2),
            ("<strong>Competition from hyperscalers:</strong> Snowflake, Databricks, and the major cloud providers are all building AIP-competitive tooling. Sustaining Palantir's pricing power in commercial segments is not guaranteed.", 3),
            ("<strong>Commercial scaling risk:</strong> The historical underperformance of the commercial segment (2018–2023) demonstrates that enterprise sales cycles are long and competitive. Scaling the commercial business globally is not a given.", 4),
            ("<strong>Profitability sustainability:</strong> While currently GAAP profitable, margins are sensitive to investment cycling. A renewed period of elevated hiring or infrastructure spend could compress margins and disappoint the market.", 5),
        ],
        "owners": "Investors who want pure-play AI infrastructure exposure with government-contract backing and who have a 3–5 year time horizon. Appropriate as a satellite position, not a core holding, given the valuation.",
        "avoiders": "Value investors, GARP (growth at reasonable price) investors and anyone who finds the 203x P/E multiple incompatible with their margin of safety requirement. The risk-reward is asymmetric at current levels.",
        "entry": "BUY below $100 (approximately 75x forward P/E on base-case EPS — provides a meaningful margin of safety). Reduce on rallies above $155 (above 115x forward P/E — excessive for a company with no dividend and competitive uncertainty).",
    },
    "PM": {
        "rec": "HOLD",
        "score": 68,
        "exec": "Philip Morris's smoke-free transition is genuinely ahead of schedule, but the shares are fairly valued at 22x P/E and the entry point does not offer the margin of safety needed for a new BUY position — <strong>HOLD</strong> is the weighted recommendation.",
        "bull": "Zyn nicotine pouches achieve category leadership in the US and expand globally. IQOS Iluma (heat-not-burn) reaches critical mass in key markets (Japan, Korea, Indonesia, Italy). Smoke-free revenue exceeds 35% of total group net revenues. Organic EPS growth of 7–9% annually. Price: $175+.",
        "base": "Zyn grows steadily in the US but regulatory headwinds (potential US flavours ban) cap the category. IQOS expands in existing markets without major new country launches. Smoke-free products represent approximately 30% of revenues. EPS grows at 5–7% annually. Price: $155–$170.",
        "bear": "US FDA restricts Zyn product formats or imposes flavours bans in key states. IQOS faces IP challenges or competitive heat-not-burn entrants. Currency headwinds re-emerge. EPS growth decelerates to 3–4%. Price: below $130.",
        "business": "Philip Morris International is the world's largest international tobacco company, selling cigarettes and smoke-free products in over 180 markets. Its smoke-free product portfolio is anchored by <em>IQOS</em> (heat-not-burn tobacco heating system) and <em>Zyn</em> (oral nicotine pouches). PMI earns the majority of its revenues in international markets outside the US, where Altria holds exclusive rights to IQOS. The company's strategy is a deliberate, multi-decade transition from combustible cigarettes to scientifically validated reduced-harm alternatives. Revenue quality is high — PMI generates significant free cash flow that funds an aggressive shareholder return programme.",
        "catalysts": "Zyn has become the fastest-growing nicotine pouch brand in the US, growing迅速 in Convenience stores and online. The US oral nicotine category is expanding structurally as smokers switch from combustible products. IQOS Iluma, PMI's latest-generation heat-not-burn device, continues to gain market share in Japan and South Korea. PMI management targets smoke-free products to represent over 50% of revenues by 2030. The company's Q4 2025 results showed continued strong growth in Zyn and resilience in the IQOS franchise, with full-year revenue guidance maintained.",
        "risks": [
            ("<strong>US regulatory risk for Zyn:</strong> The US FDA has signalled increasing scrutiny of oral nicotine products, particularly flavoured pouches. Any federal flavours ban or nicotine content caps would directly impair Zyn's US growth trajectory.", 1),
            ("<strong>Smoke-free execution risk:</strong> PMI's transition thesis depends on consumer adoption of non-combustible products at pace. If smokers fail to switch at the rate management projects, the combustible franchise faces secular erosion without sufficient replacement revenues.", 2),
            ("<strong>Currency risk:</strong> PMI earns most revenues internationally. A strong US dollar against key emerging market currencies ( TRY, BRL, IDR) creates significant translation headwinds on reported EPS.", 3),
            ("<strong>Litigation risk:</strong> While PMI is domiciled internationally and not subject to US tort litigation, it remains a tobacco company. Regulatory changes, plain packaging requirements or new tax regimes in key markets remain perennial risks.", 4),
            ("<strong>Valuation:</strong> At 22x trailing P/E, the shares are fairly valued but not compellingly cheap for a business growing EPS at mid-single digits in a structurally declining category.", 5),
        ],
        "owners": "Income investors seeking a high, well-covered dividend yield (approximately 4.5–5%) in a cash-generative consumer staples business. Also suited to investors who believe in the smoke-free transition thesis and want a tobacco-sector proxy for that thematic.",
        "avoiders": "Growth investors and ESG-mandated funds that exclude tobacco. Anyone looking for capital appreciation at a reasonable P/E will find better risk-reward in consumer staples peers with stronger pricing power.",
        "entry": "BUY below $135 (approximately 18x forward P/E on base-case EPS — below the 5-year historical average). Reduce above $170 (above 23x P/E — smoke-free optionality is now priced in at this multiple and the entry reward is insufficient).",
    },
    "SCHW": {
        "rec": "HOLD",
        "score": 70,
        "exec": "Charles Schwab is structurally well-positioned in wealth management with the TD Ameritrade integration delivering tangible cost synergies, but a normalisation of net interest margin and slower-than-expected transactional revenue growth cap the upside — <strong>HOLD</strong> is the weighted recommendation.",
        "bull": "Interest rate environment remains elevated and NIM normalises above 2.0%. Integration of TD Ameritrade is complete and full synergy run-rate achieved by end-2026. New client asset gathering is strong and net new assets accelerate. EPS grows to $6.50–$7.00. Price: $115+.",
        "base": "Rates moderate gradually, compressing NIM modestly. TD Ameritrade integration delivers most synergies but some client attrition persists. Market volatility keeps transactional revenues above trough. EPS: $5.50–$6.00. Price: $90–$108.",
        "bear": "Fed cuts rates aggressively. NIM falls below normalised levels and client activity remains subdued. Integration charges exceed estimates. Operating expense ratio rises. EPS falls below $4.50. Price: below $70.",
        "business": "Charles Schwab is the largest US retail brokerage by number of accounts, with approximately 35 million active brokerage accounts, $9 trillion+ in total client assets and 8.5 million Banking and Lending accounts (as of recent filings). Its core model combines brokerage services (equity trading, wealth advisory) with banking products (deposits, mortgages, credit cards) through its bank subsidiary. Post-integration of TD Ameritrade (acquired 2020), Schwab is absorbing a massive platform migration while seeking cost synergies. The business earns revenue primarily through net interest income (on deposit franchises), asset management fees, and trading commissions.",
        "catalysts": "Schwab has completed the conversion of the majority of TD Ameritrade client accounts onto its unified platform, with the remaining conversions proceeding. Cost synergies from the TD Ameritrade deal are being realised ahead of the original timeline. New client asset gathering remains robust, particularly in the Wealth Management segment. The Fed's current rate pause provides a window for NIM to stabilise. Management has maintained its medium-term EPS guidance of $5.50–$6.00.",
        "risks": [
            ("<strong>Net interest margin compression:</strong> Schwab's bank subsidiary earns NIM on its deposit franchise. Aggressive Federal Reserve rate cuts directly compress NIM, which accounts for a substantial portion of operating revenues. The deposit beta advantage Schwab has historically enjoyed is not permanent.", 1),
            ("<strong>Client attrition post-integration:</strong> The TD Ameritrade merger brought legacy accounts that may be more prone to attrition as Schwab migrates platforms and adjusts fee structures. Sustaining net new asset flows is essential to the revenue growth thesis.", 2),
            ("<strong>Competitive pressure on brokerage pricing:</strong> Zero-commission trading is now industry standard. Schwab's ability to monetise advisory fees and banking relationships is under pressure as fintech competitors (Robinhood, Wealthfront, Betterment) target younger, digital-native investors.", 3),
            ("<strong>Deposit repricing risk:</strong> As interest rates normalise, Schwab's deposit franchise will face runoff as clients move cash into higher-yielding alternatives. Managing the deposit beta and retaining deposit funding is a key risk for the bank subsidiary.", 4),
            ("<strong>Market activity dependence:</strong> Trading volumes and market volatility directly affect transactional revenues. A sustained low-volatility environment reduces client trading activity, directly impacting commission and fee revenues.", 5),
        ],
        "owners": "Income-oriented investors seeking a financial sector yield play with exposure to the structural growth of US wealth management. Also suited to investors who want diversified large-cap financial exposure with an integrated brokerage/banking model.",
        "avoiders": "Growth investors and anyone looking for a high-growth tech-adjacent story in financial services. The TD Ameritrade integration execution risk and NIM sensitivity make this a below-average risk-reward relative to pure-play fintech.",
        "entry": "BUY below $78 (approximately 15x forward P/E on base-case EPS — below intrinsic value based on normalised earnings power). Reduce above $108 (approximately 21x P/E — NIM normalisation is priced in aggressively at this level).",
    },
    "SO": {
        "rec": "HOLD",
        "score": 65,
        "exec": "Southern Company operates a best-in-class regulated utility franchise with visible rate base growth and a constructive regulatory environment in its core Georgia jurisdiction, but the shares trade at a premium P/E for a low-growth business — <strong>HOLD</strong> is the weighted recommendation.",
        "bull": "Georgia PSC approves rate case relief consistent with management's request. Plant Vogtle Units 3 and 4 reach stable commercial operation with improved capacity factors. Economy recovers and industrial load growth accelerates. EPS grows at 5–6% annually. Price: $105+.",
        "base": "Vogtle Units 3 and 4 operate within adjusted capacity parameters. Rate base growth of 5% annually is achieved in Georgia. Regulatory outcomes are neutral to modestly positive across jurisdictions. EPS grows at 4–5% annually. Price: $93–$100.",
        "bear": "Vogtle operational issues persist or require further capital injections. Georgia PSC rules adversely on the next rate case. Economic slowdown reduces industrial load growth. Regulators in other jurisdictions follow a less supportive posture. EPS growth decelerates to 2–3%. Price: below $78.",
        "business": "Southern Company is one of the largest regulated electric utility holding companies in the US, serving approximately 9 million customer accounts across Georgia, Alabama, Mississippi and Florida. Its principal subsidiary, Georgia Power, is the largest of the operating companies and operates under a constructive, forward-looking rate regulation framework with the Georgia Public Service Commission (Georgia PSC). Southern also operates natural gas distribution businesses and owns a competitive generation subsidiary, Southern Power, selling wholesale power. The company's capital investment programme (focused on grid modernisation, reliability and clean generation) is expected to grow the rate base at a mid-single-digit compound annual growth rate over the medium term.",
        "catalysts": "Plant Vogtle Units 3 and 4, the largest new nuclear construction project in US history, reached commercial operation in 2023 and 2024 respectively. While capacity factors have required adjustment periods, the units are now contributing materially to earnings and cash flow. Georgia Power's rate case proceedings are ongoing, with a decision expected in 2026 that could provide additional rate base relief. The Inflation Reduction Act provides investment tax credits for clean generation capex that benefit Southern's renewable buildout programme. Load growth from data centre electrification and reshoring manufacturing is a nascent but meaningful new demand driver for the Georgia grid.",
        "risks": [
            ("<strong>Vogtle operational and cost risk:</strong> Units 3 and 4 have required ongoing operational refinement and have been subject to regulatory dispute over cost overruns. Any further material capital or O&M cost increases would be incremental negatives.", 1),
            ("<strong>Regulatory risk in non-Georgia jurisdictions:</strong> Alabama and Mississippi regulators have historically been less constructive than the Georgia PSC. Adverse outcomes in rate cases outside Georgia could impair the overall earnings growth trajectory.", 2),
            ("<strong>Interest rate sensitivity:</strong> As a highly leveraged utility, Southern Company carries significant debt. Higher-for-longer interest rates directly increase financing costs, partially offsetting the benefits of constructive regulation.", 3),
            ("<strong>Economic slowdown:</strong> Southern's regulated earnings are linked to economic growth in its service territory. A recession would reduce industrial load, residential demand and customer growth, impairing the revenue baseline.", 4),
            ("<strong>Valuation:</strong> At 24.8x trailing P/E, Southern trades at a premium to the regulated utility peer group average of approximately 17–19x. The premium is only justified if Vogtle operational performance consistently exceeds expectations.", 5),
        ],
        "owners": "Income-focused investors seeking a high-yield regulated electric utility with a constructive regulatory environment and above-average dividend growth prospects within the sector. Appropriate as a core income holding in a utility sleeve.",
        "avoiders": "Total return investors and growth-oriented investors will find better risk-reward in faster-growing sectors. The utility regulatory compact constrains capital appreciation potential on any reasonable investment horizon.",
        "entry": "BUY below $83 (approximately 20x forward P/E on base-case EPS — in line with peer group average). Reduce above $96 (approximately 23x P/E — Vogtle execution risk premium is not adequately compensated at this level).",
    },
    "SPG": {
        "rec": "REDUCE",
        "score": 50,
        "exec": "Simon Property Group is a high-quality mall REIT with strong free cash flow generation and an active redevelopment programme, but the structural headwinds facing US mall retail — e-commerce penetration, retail bankruptcy cycles and cyclical consumer cautiousness — make the risk-reward unfavourable at current levels — <strong>REDUCE</strong> is the weighted recommendation.",
        "bull": "Consumer spending remains resilient. Mall occupancy rates stabilise above 95%. SPG's omnichannel initiatives ( curbside pickup, shop-in-shop concepts) drive tenant productivity above pre-COVID levels. Rent growth continues on renewals. NAV grows to $290+. Price: $240+.",
        "base": "Occupancy holds at approximately 93–94%. Lease renewals are negotiated at flat to modestly positive rents. Consumer spending grows at low-single digits. SPG's redevelopment pipeline (mixed-use conversions of excess mall space) adds incremental value. NAV is approximately $220–$235. Price: $195–$210.",
        "bear": "Mall tenant bankruptcies accelerate (Gap, JCPenney, Express and other anchor-dependent retailers fail). Lease termination obligations crystallise. Mall valuations decline by 10–15% from current NAV estimates. NOI falls meaningfully. Price: below $165.",
        "business": "Simon Property Group is the largest mall operator in the US by gross leasable area and market capitalisation. Its portfolio comprises approximately 140 malls and outlet centres across the US and internationally (including properties in Europe and Asia). SPG owns the real estate underlying its tenants' stores and earns rents under long-term leases. Its tenants are predominantly in the retail sector — apparel, department stores, dining and entertainment — though the company has been actively diversifying into non-retail uses (offices, apartments, medical, experiential retail). SPG is structured as a Real Estate Investment Trust and distributes the majority of its taxable income as dividends.",
        "catalysts": "SPG has been converting excess mall square footage to mixed uses — apartments, hotels, medical offices and entertainment venues — which diversifies the tenant base and supports net operating income. The company has also been active in share buybacks and opportunistic acquisitions of competitor mall assets at distressed valuations. Occupancy rates have recovered to approximately 93–94% post-COVID. Lease rollover risk is manageable over the next 3 years.",
        "risks": [
            ("<strong>E-commerce structural headwind:</strong> US retail e-commerce penetration continues to grow and is displacing mall-based retail permanently. This is a decade-long secular trend that no amount of mall repositioning fully offsets. Several SPG tenant categories (books, electronics, department stores) are structurally impaired.", 1),
            ("<strong>Tenant credit risk:</strong> A wave of retail bankruptcies has already claimed many of SPG's legacy tenants. Remaining tenants in stressed categories (mid-market apparel, discount department stores) remain vulnerable to bankruptcy in a consumer downturn.", 2),
            ("<strong>Valuation at premium to NAV:</strong> REIT analysts typically value mall REITs below NAV given the uncertainty in terminal valuations. At approximately $200 versus estimated NAV of $220–$235, SPG is not trading at a sufficiently discounted entry point to compensate for structural sector risk.", 3),
            ("<strong>Cyclical consumer risk:</strong> A consumer recession would accelerate tenant failures and compress retailer sales, directly impairing SPG's rental income and lease renewal prospects.", 4),
            ("<strong>Debt maturity and refinancing risk:</strong> Mall REITs carry significant floating-rate and near-term debt maturities. Rate environments and credit market conditions affect refinancing costs, particularly if operating performance weakens.", 5),
        ],
        "owners": "Yield-oriented REIT investors who believe in the long-term relevance of physical retail and want the highest-quality mall REIT exposure. SPG is the most defensive mall operator given its scale, global portfolio and asset quality.",
        "avoiders": "Total return investors, growth investors and anyone with concern about secular retail trends. The mall REIT sector offers poor risk-reward relative to industrial, data centre or residential REITs at this stage of the cycle.",
        "entry": "BUY below $160 (approximately 0.70x price-to-NAV — provides a sufficient margin of safety for the structural risk in the sector). Reduce on rallies above $210 (at or above NAV without clear path to NAV expansion — no margin of safety).",
    },
    "TMUS": {
        "rec": "BUY",
        "score": 81,
        "exec": "T-Mobile has the most compelling combination of postpaid subscriber growth, free cash flow generation and 5G monetisation optionality among US telecoms, and the shares are undervalued relative to peers at 20x forward P/E — <strong>BUY</strong> is the weighted recommendation.",
        "bull": "Postpaid phone subscriber additions remain the highest in the industry. 5G fixed wireless access (FWA) grows into a meaningful revenue stream. Metro by T-Mobile (prepaid) expansion adds incremental subscribers. Free cash flow exceeds $18bn annually, funding aggressive buybacks. EPS grows 10–12% annually. Price: $230+.",
        "base": "Postpaid net adds remain positive but decelerate to industry-average levels. FWA adoption grows steadily. 5G network investments plateau, improving free cash flow margins. EPS grows at 7–9% annually. Price: $190–$215.",
        "bear": "Intense price competition from AT&T and Verizon erodes postpaid ARPUs. FWA growth stalls. T-Mobile's postpaid phone churn rises as promotional pricing expires. Merger synergies from Sprint prove more difficult to extract than modelled. EPS growth falls to 3–5%. Price: below $165.",
        "business": "T-Mobile US is the third-largest US mobile carrier by subscriber count, with approximately 130 million total customers and approximately 100 million postpaid subscribers following the integration of the Sprint network. The company has a distinct competitive positioning as the 'uncarrier' — historically differentiated through no-contract pricing and aggressive promotional strategies — and has been the primary beneficiary of customer switching among the three national carriers over the past decade. T-Mobile's 5G network advantage (built on 600 MHz and 2.5 GHz spectrum holdings from the Sprint acquisition) underpins both mobile and fixed wireless services. The company generates revenues from postpaid phone plans, prepaid brands (Metro by T-Mobile, Mint Mobile), home broadband (FWA) and business enterprise services.",
        "catalysts": "T-Mobile's postpaid phone subscriber growth has consistently exceeded AT&T and Verizon, making it the primary switching destination for quality-conscious mobile consumers. The 5G FWA product (home internet) is gaining traction as a low-cost alternative to wired broadband in suburban and rural markets — a market that Verizon and AT&T are struggling to compete in at scale. The Sprint merger synergies, now fully integrated, provide an earnings cushion that has enabled the company to maintain industry-leading EBITDA margins. Management has committed to returning $22.5bn+ to shareholders via buybacks through 2027.",
        "risks": [
            ("<strong>Competitive response:</strong> AT&T and Verizon have significantly increased promotional activity. If sustained, this could pressure T-Mobile's ARPUs and increase churn as existing customers are targeted by competitive offers.", 1),
            ("<strong>Postpaid subscriber ceiling:</strong> T-Mobile has taken significant market share from peers. As the addressable market of switchers shrinks, maintaining above-peer net additions requires increasingly competitive offers that may erode returns.", 2),
            ("<strong>Regulatory and merger risk:</strong> The telecommunications sector is subject to ongoing regulatory scrutiny (FCC, state AGs). Any future acquisition or spectrum consolidation faces significant regulatory barriers.", 3),
            ("<strong>Handset subsidy and financing costs:</strong> T-Mobile's device financing (JUMP! and similar programmes) and promotional handset subsidies affect free cash flow in ways that are sensitive to device upgrade cycles and consumer finance conditions.", 4),
            ("<strong>5G FWA execution risk:</strong> Fixed wireless access faces physical limitations (building penetration, geographic coverage) that constrain the total addressable market. The thesis depends on continued customer acquisition in this product category.", 5),
        ],
        "owners": "Total return investors seeking a高质量 telecommunications franchise with industry-leading growth and FCF generation. Also suited to investors who want 5G infrastructure exposure without the binary risk of pure-play tower companies.",
        "avoiders": "Yield-focused investors seeking telecom-sector income — T-Mobile does not pay a dividend. Investors with low risk tolerance or high portfolio weight in telecom should also exercise caution.",
        "entry": "BUY below $155 (approximately 16x forward P/E — below peer group average and below T-Mobile's own historical range). Reduce above $215 (approximately 22x forward P/E — fully values the FCF generation and merger synergy extraction but leaves little upside).",
    },
    "TSLA": {
        "rec": "HOLD",
        "score": 68,
        "exec": "Tesla retains the EV market leadership position with the most extensive charging infrastructure, manufacturing scale advantage and AI compute assets, but a 326x trailing P/E and current price at $349 prices in a best-case scenario that leaves no room for execution miscues — <strong>HOLD</strong> is the weighted recommendation.",
        "bull": "Next-generation affordable EV (Model 2 / 'Kena') achieves production targets and drives volume above 2.5 million units annually. Robotaxi (Cybercab) launches commercially in multiple US cities. Energy storage division (Megapack) grows into a $10bn+ revenue business. FSD achieves regulatory approval in key jurisdictions. Price: $500+.",
        "base": "Model 2 ramp is slower than Musk's stated timeline, with volume reaching 1.8–2.0 million units in 2026. Robotaxi remains in pilot phase with commercial launch deferred to 2027. Energy storage continues strong growth. FSD improvements drive incremental software revenue. Price: $300–$380.",
        "bear": "Aggressive EV competition from Chinese OEMs (BYD, Li Auto, XPeng) compress Tesla's US and European market share. New model ramp delays continue. Oil price spike reduces EV purchase intent. Musk's political involvement in US policy creates brand damage in international markets. Price: below $220.",
        "business": "Tesla designs, manufactures and sells electric vehicles (Models S, 3, X, Y, Cybertruck, and the upcoming Model 2), stationary energy storage products (Megapack, Powerwall) and solar products. The company also develops Full Self-Driving (FSD) autonomous driving software and, through its AI subsidiary xAI, is building a significant compute infrastructure footprint (Colossus supercomputer). Tesla is vertically integrated — manufacturing its own battery cells, powertrains and, increasingly, its own inference chips. The energy storage business has grown from a negligible contributor to a multi-billion-dollar franchise with waiting lists extending beyond 12 months.",
        "catalysts": "Tesla's Q1 2026 deliveries came in below consensus expectations, reflecting both seasonal softness and intensifying competitive pressure in China and Europe. However, the energy storage division continues to post record quarterly deployments. Musk's 'Starlink for AI' narrative and xAI's compute ambitions have introduced an optionality layer that is not well captured in traditional automotive valuation frameworks. The upcoming Model 2 (or 'Kena') is the most watched product launch in Tesla's history given its $25,000 price point targeting mass-market adoption. The Cybercab robotaxi remains in pilot development but represents the most transformative long-term catalyst if regulatory approval is achieved.",
        "risks": [
            ("<strong>Valuation disconnected from fundamentals:</strong> A 326x trailing P/E on EPS of $1.07 is extreme. Even on optimistic forward estimates of $6–7 EPS, the stock trades at 50x+ forward P/E, which is pricing in near-perfect execution across multiple simultaneous growth vectors.", 1),
            ("<strong>Competitive share loss:</strong> BYD and Chinese EV makers have established clear cost and technology leadership in key segments (PHEVs, affordable EVs). Tesla's global market share in EVs has declined from approximately 70% (2020) to below 50% as the market has matured and diversified.", 2),
            ("<strong>Musk political risk:</strong> Musk's involvement in US federal policy (DOGE, Trump administration advisory roles) has created brand damage in European and Chinese markets, potentially impairing sales in Tesla's second- and third-largest markets.", 3),
            ("<strong>Robotaxi regulatory and technical risk:</strong> FSD has required over a decade of development. Achieving level-4 autonomous driving regulation and consumer adoption is not guaranteed. The robotaxi TAM depends on regulatory frameworks that do not yet exist in most markets.", 4),
            ("<strong>Automotive cycle risk:</strong> Tesla has never navigated a full automotive recession. A consumer spending pullback that disproportionately affects vehicle purchases could expose Tesla to its first major volume decline as a public company.", 5),
        ],
        "owners": "Growth investors with high conviction in the EV and AI narratives who want the only pure-play EV OEM with meaningful software revenue optionality. Also suitable for investors who want Tesla as a long-term thematic hold in a technology-growth portfolio.",
        "avoiders": "Value and GARP investors. Anyone who is uncomfortable with narrative-driven, multiple-expansion valuations. The risk-reward at $349 is not appropriate for risk-averse or benchmark-aware investment mandates.",
        "entry": "BUY below $240 (approximately 40x forward P/E on base-case $6 EPS — provides partial margin of safety). Reduce above $390 (approximately 65x forward P/E — robotaxi optionality is fully priced in; automotive fundamentals need to be near-perfect to justify this level).",
    },
    "TXN": {
        "rec": "HOLD",
        "score": 73,
        "exec": "Texas Instruments is a high-quality analog and embedded semiconductor company with strong free cash flow generation, pricing power derived from its catalog-based model and a long runway of industrial and automotive content growth — but the current P/E of 39x is not sufficiently discounted for a cyclical business with limited visible secular acceleration — <strong>HOLD</strong> is the weighted recommendation.",
        "bull": "Analog and embedded semiconductor demand from industrial automation, electric vehicles and renewable energy accelerates beyond current management guidance. Inventory corrections in the distribution channel end. China domestic substitution demand supports revenues. TXN achieves 20%+ operating margins again. EPS grows to $7.50+. Price: $255+.",
        "base": "Industrial end-markets stabilise in H2 2026 without a meaningful recovery. Automotive content growth (EVs require 3–4x more analog content per vehicle) provides partial offset. Consumer electronics remains weak. EPS grows at mid-single digits. Price: $200–$225.",
        "bear": "Industrial semiconductor demand falls further as manufacturing activity contracts globally. China domestic substitution demand plateaus as inventory destocking extends. Consumer end-markets deteriorate. TXN's analog content in automotive fails to offset volume declines. EPS falls below $4.50. Price: below $155.",
        "business": "Texas Instruments is the world's largest analog semiconductor company by revenue, producing tens of thousands of analog chips, embedded processors and other semiconductor products that are sold through a combination of direct sales channels and distribution. Unlike leading-edge digital chipmakers (NVIDIA, Intel), TI operates in the 'analog and embedded' segment where the competitive moat is built on process technology (proprietary 300mm wafer fabrication), a vast catalog of hard-to-replicate precision parts, and decades of customer design-win relationships. TI's devices are essential components in virtually every electronic system — power management, signal conditioning, data conversion — which makes the business a proxy on global industrial and automotive activity. The company is noted for its conservative accounting, high insider ownership, and aggressive share buyback programme funded by robust free cash flow generation.",
        "catalysts": "The analog and embedded semiconductor market is in a post-COVID inventory correction that has weighed on TI's revenues for over 18 months. However, the structural growth drivers — industrial automation, electric vehicles (which use 3–4x more analog content per vehicle versus ICE vehicles), renewable energy infrastructure and the Internet of Things — remain intact and are expected to drive a recovery in demand once distribution channel inventory normalises. TI's expansion of its 300mm analog capacity (RFAB2, LFAB) is the most significant capital investment programme in the company's history and is expected to expand the company's analog production capacity by approximately 40%, providing a structural cost advantage as volumes recover.",
        "risks": [
            ("<strong>Industrial cycle risk:</strong> TI is a high-quality cyclical. The current inventory correction has been more prolonged than management originally guided. Industrial end-market demand may not recover in 2026, extending the trough in revenues and margins.", 1),
            ("<strong>Customer inventory destocking:</strong> The distribution channel has been reducing inventory for 18+ months. This headwind will eventually end, but timing is uncertain. Until it ends, reported revenues will continue to understate underlying unit demand.", 2),
            ("<strong>China risk:</strong> Approximately 20–25% of TI revenues are China-related. US export controls on advanced semiconductor technology, Chinese domestic substitution and potential further escalation of technology export restrictions create meaningful revenue uncertainty in this segment.", 3),
            ("<strong>Capital allocation risk:</strong> TI has committed heavily to 300mm capacity expansion. If the demand recovery is slower than the investment cycle assumes, the company may face asset impairment risk and return-on-invested-capital dilution.", 4),
            ("<strong>EV adoption risk:</strong> The thesis that EVs drive materially higher analog content per vehicle assumes EV unit volumes continue to grow rapidly. If EV adoption slows globally, the automotive content growth catalyst is reduced.", 5),
        ],
        "owners": "Quality-focused investors seeking a wide-moat semiconductor business with pricing power, strong FCF and a proven long-term capital allocation track record. Appropriate as a core semiconductor holding with a 5+ year horizon.",
        "avoiders": "Investors looking for near-term momentum or cyclical recovery timing. TXN has historically not re-rate toward peak multiples during early-cycle recoveries — patience is required. Near-term focused investors will find better risk-reward elsewhere.",
        "entry": "BUY below $170 (approximately 28x forward P/E on base-case EPS — near the lower end of TI's historical trading range). Reduce above $240 (approximately 40x forward P/E on base-case — fully pricing the 300mm capacity investment and leaves no margin of safety for the cyclical recovery thesis).",
    },
    "UBER": {
        "rec": "BUY",
        "score": 83,
        "exec": "Uber has achieved the rare combination of profitable growth, positive free cash flow and multiple secular growth drivers — ride-sharing recovery post-COVID, food delivery market leadership, and autonomous vehicle cost deflation — and the shares are undervalued relative to the quality of the franchise at 15x forward P/E — <strong>BUY</strong> is the weighted recommendation.",
        "bull": "Autonomous vehicle (AV) deployment reduces cost-per-mile materially, improving unit economics without eliminating the driver model. Uber maintains network effects advantage in mobility and delivery as the platform of record for urban mobility. Advertising revenue grows to $1bn+ annually. EPS exceeds $4.00. Price: $90+.",
        "base": "Ride-sharing continues its steady recovery in developed markets. Delivery (Uber Eats) maintains profitability and market share. AV deployment is gradual and primarily affects long-distance highway segments initially. Driver supply remains adequate. EPS grows to $3.00–$3.50. Price: $72–$82.",
        "bear": "California AB5 regulations and similar 'gig worker' classification rules increase driver costs significantly. AV deployment is faster than expected, disrupting the driver supply model before Uber's platform has adapted. Competitive pressure from Lyft, DoorDash and Waymo侵蚀 network effects. Price: below $58.",
        "business": "Uber Technologies operates a two-sided marketplace connecting riders with drivers (Mobility) and consumers with restaurants and retailers (Delivery). It is the largest ride-sharing platform globally, with operations in approximately 70 countries, and has also built the leading food delivery marketplace in the US and many international markets. Uber's competitive moat is its network effects — more riders attract more drivers, more drivers reduce wait times, lower wait times attract more riders — and its brand as the default urban mobility app in most major cities. The company generates revenues primarily from commissions on trips and orders, advertising within the app, and freight logistics (Uber Freight). The autonomous vehicle development programme represents a potential structural shift in the cost of mobility provision.",
        "catalysts": "Uber posted its first full year of GAAP profitability in 2023 and has maintained positive adjusted EBITDA and free cash flow since. The company's Mobility segment has benefited from a sustained recovery in urban travel post-COVID, with trip volumes and revenue per trip both growing. Delivery has reached a scale where it is sustainably profitable on a segment basis — a critical milestone that validates the two-sided marketplace model. Uber has secured multiple AV partnerships (Waymo, Cruise, Aurora) to integrate autonomous vehicles into its network before it needs to build its own AV capability. The Uber One membership programme and advertising business are creating higher-margin, recurring revenue streams that improve the overall business quality profile.",
        "risks": [
            ("<strong>Gig worker classification risk:</strong> Uber's business model depends on classifying drivers as independent contractors rather than employees. AB5 in California, similar legislation in other US states, and EU platform worker directives could reclassify drivers, dramatically increasing labour costs.", 1),
            ("<strong>AV disruption risk:</strong> If AV deployment is faster than Uber's platform can adapt, or if Waymo/Cruise/Aurora build competing consumer-facing networks, Uber's driver-side supply advantage could erode faster than its defensive moats can compensate.", 2),
            ("<strong>Competitive intensity in delivery:</strong> DoorDash and Instacart are well-funded competitors in delivery. Maintaining market share in the US and internationally requires continued investment in driver incentives, consumer marketing and restaurant partnerships.", 3),
            ("<strong>Regulatory risk in key markets:</strong> Uber faces ongoing regulatory challenges in multiple international markets where local ride-sharing regulations vary significantly from the US model. Loss of operating licences in key cities (London, Seoul, Singapore) is a recurring risk.", 4),
            ("<strong>Profitability sustainability:</strong> The current adjusted EBITDA margins are thin relative to the risk profile of the business. Any increase in driver incentive spend (to compete for supply) or regulatory cost increases could compress margins below the level the market currently prices.", 5),
        ],
        "owners": "Growth and total return investors who want exposure to platform-economy businesses with genuine profitability, multiple secular growth levers and a network-effect moat. Uber is the most attractively valued large-cap platform business relative to its growth profile.",
        "avoiders": "Investors who require high dividend yields (Uber pays no dividend), ESG-mandated funds that penalise gig economy labour practices, or investors with very low risk tolerance who are uncomfortable with the regulatory risk embedded in the model.",
        "entry": "BUY below $52 (approximately 12x forward P/E on base-case $4 EPS — below the average P/E of other high-quality platform businesses). Reduce above $82 (approximately 19x forward P/E — fully prices the AV opportunity and network effects; the margin of safety is insufficient at this level).",
    },
    "UNP": {
        "rec": "BUY",
        "score": 82,
        "exec": "Union Pacific is the premier US rail franchise with a high-quality asset base, best-in-class operating ratio, significant pricing power and genuine exposure to US manufacturing reshoring and energy transition infrastructure buildout — the shares offer a rare combination of quality and reasonable valuation at 21x forward P/E — <strong>BUY</strong> is the weighted recommendation.",
        "bull": "US manufacturing reshoring and infrastructure investment drive rail volume growth above GDP. UNP's precision scheduled railroading methodology continues to improve operating efficiency. Intermodal pricing power is maintained. Diesel fuel cost headwinds are modest. EPS grows at 10–12% annually. Price: $295+.",
        "base": "Volumes grow at or slightly above GDP growth through a mix of network efficiency and modestly positive mix effects. Operating ratio (OR) stays in the 53–55% range. Pricing increases of 3–4% annually are achievable. EPS grows at 8–10% annually. Price: $245–$270.",
        "bear": "US economy enters recession and volumes decline by mid-single digits. UNP's service quality metrics deteriorate and customers switch to trucking. Fuel price spikes increase operating costs without freight revenue offset. EPS growth falls to 3–5%. Price: below $205.",
        "business": "Union Pacific Railroad operates a 33,000-mile rail network covering the western two-thirds of the United States, connecting markets in 23 states and serving major container ports on the Pacific Coast, Gulf Coast and Great Lakes. UNP is a 'precision scheduled railroader' (PSR) — its operational methodology is focused on maximising asset utilisation, minimising dwell time and optimising train lengths. This has historically produced the best operating ratio in the North American rail industry. UNP transports diverse freight: intermodal containers (approximately 25% of revenues), agricultural commodities, automotive, industrial chemicals, coal and construction materials. Its network position is highly defensive — the western US rail duopoly with BNSF ( Berkshire Hathaway) is a结构性 barrier to competition.",
        "catalysts": "UNP has posted record operating ratio (OR of approximately 53%) and record annual earnings in recent years. The precision scheduled railroading methodology continues to drive productivity improvements — longer trains, reduced terminal dwell and improved asset velocity are structural cost levers. US manufacturing reshoring (onshoring of semiconductor, pharmaceutical and consumer goods production) and the infrastructure provisions of the Inflation Reduction Act are generating incremental rail demand in chemicals, plastics and steel. UNP's $8bn five-year capital investment programme includes digital sensing and inspection technology that is improving safety metrics and reducing unplanned maintenance.",
        "risks": [
            ("<strong>Macroeconomic sensitivity:</strong> Rail volumes are highly correlated with industrial production and consumer goods spending. A US recession would reduce volumes meaningfully and could not be fully offset by pricing, given the operating leverage in the business model.", 1),
            ("<strong>Intermodal competition:</strong> Intermodal (container) freight faces direct competition from trucking, which is benefiting from a four-year surge in cross-border freight (Mexico and Canada). Any moderation in cross-border trade would reduce intermodal volumes.", 2),
            ("<strong>Service quality and customer satisfaction:</strong> UNP's service metrics have historically been the best in class, but any deterioration in transit times or reliability metrics could prompt shippers to shift to trucking or the competing BNSF network.", 3),
            ("<strong>Regulatory risk:</strong> The STB (Surface Transportation Board) retains oversight of railroad pricing and service standards. Increased regulatory intervention in railroad pricing would be a material risk to the revenue and earnings growth thesis.", 4),
            ("<strong>Labour cost inflation:</strong> Rail labor is unionised. The existing collective bargaining agreements have been renegotiated with meaningful wage increases. Any further escalation in labor costs without offsetting productivity improvements could compress margins.", 5),
        ],
        "owners": "Quality-focused total return investors seeking defensive, pricing-power industrial exposure. UNP is appropriate as a core holding in a high-quality industrial portfolio — it has delivered consistent top-quartile ROIC and has a demonstrated capital allocation track record (buybacks + dividends).",
        "avoiders": "Investors who need near-term momentum or who are bearish on the US industrial economy. Investors with low interest in cyclical industrial names should reduce exposure accordingly.",
        "entry": "BUY below $195 (approximately 17x forward P/E on base-case EPS — provides a meaningful margin of safety on a best-in-class franchise with demonstrated pricing power). Reduce above $268 (approximately 23x forward P/E — above UNP's historical premium multiple and requires continued OR improvement to justify).",
    },
    "USB": {
        "rec": "HOLD",
        "score": 62,
        "exec": "US Bancorp is a high-quality regional banking franchise with strong deposit market share in the Midwest and West Coast, conservative underwriting standards and a meaningful exposure to net interest income in a higher-for-longer rate environment — but the shares offer limited upside and some execution risk from CEO leadership transition — <strong>HOLD</strong> is the weighted recommendation.",
        "bull": "Net interest income remains elevated as Fed rate cuts are slower than the market prices. USB's commercial real estate (CRE) portfolio performs within expectations with manageable loan loss provisions. Expense management initiative delivers above-forecast savings. EPS grows to $4.00+. Price: $62+.",
        "base": "Fed rate cuts of 50–75 bps occur in 2026, compressing NIM modestly. CRE credit costs are elevated but manageable within provisions. Expense discipline is maintained. EPS grows at mid-single digits. Price: $50–$55.",
        "bear": "Fed cuts rates more aggressively. CRE office vacancies accelerate and USB's office loan portfolio triggers elevated loan loss provisions. Net interest income falls sharply as asset-sensitive liabilities reprice. EPS falls below $3.50. Price: below $38.",
        "business": "US Bancorp is the fifth-largest commercial bank in the United States by assets, with approximately $700bn in total assets, $560bn in deposits and operations across 26 states through its subsidiary US Bank. The company offers a full range of banking products: consumer deposits and lending, commercial banking (corporate lending, treasury management, capital markets), wealth management and payment services (including a significant merchant acquiring business). USB's deposit franchise is a key competitive advantage — strong retail and small business deposit market share in the Midwest and West Coast provides a stable, low-cost funding base. The bank's payments business (including Elavon, its merchant acquiring subsidiary) contributes meaningful non-interest income.",
        "catalysts": "USB announced a CEO transition in late 2025, with a new CEO taking the helm in early 2026. This leadership change introduces execution uncertainty but also an opportunity for strategic reset. The company has maintained its expense management discipline through a multi-year efficiency initiative. USB's CRE portfolio (particularly office exposure) has been a focus of investor concern — management has disclosed the portfolio characteristics and has been proactively building reserves. The Fed's higher-for-longer rate environment has been a tailwind for USB's net interest income, though this tailwind will diminish as rate cuts eventually arrive.",
        "risks": [
            ("<strong>Commercial real estate credit risk:</strong> USB has meaningful exposure to commercial real estate, particularly office properties in major metropolitan areas. Office vacancy rates have risen significantly post-COVID, and any further deterioration in valuations could trigger elevated loan loss provisions that impair earnings.", 1),
            ("<strong>Net interest income compression from rate cuts:</strong> USB's earnings are relatively asset-sensitive. When the Fed cuts rates, USB's loan and investment portfolio reprices downward, compressing NIM. The pace and magnitude of Fed rate cuts in 2026–2027 is the key variable for the earnings outlook.", 2),
            ("<strong>Leadership transition risk:</strong> The CEO change introduces execution and strategic uncertainty. Any perceived missteps during the transition period could weigh on the share price, even if fundamental financials remain sound.", 3),
            ("<strong>Expense management execution:</strong> USB's efficiency initiative depends on achieving targeted cost savings without sacrificing client service or regulatory compliance. Any shortfall in the initiative would impair the bank's operating leverage case.", 4),
            ("<strong>Competitive pressure on deposits:</strong> Fintech challengers and large national banks are competing aggressively for consumer deposits. USB's ability to retain its deposit franchise without excessively increasing deposit costs is a key variable for its funding cost advantage.", 5),
        ],
        "owners": "Income-oriented banking sector investors seeking a regional bank with a strong deposit franchise, high dividend yield (approximately 4.5–5.5%) and above-peer asset quality metrics. Appropriate as a core regional banking holding.",
        "avoiders": "Growth investors and those seeking high-multiple premium banking franchises. Investors who want large-cap tech-growth exposure or pure-play investment bank risk-reward should look elsewhere in the financial sector.",
        "entry": "BUY below $40 (approximately 10x forward P/E on base-case EPS — below USB's book value per share and offers a significant margin of safety against the CRE risk). Reduce above $57 (approximately 14x forward P/E — leadership uncertainty and NIM compression risk are not adequately compensated at this level).",
    },
}


def conviction_color(score):
    if score >= 80:
        return ("BUY", "#22C55E", "rec-buy")
    elif score >= 60:
        return ("HOLD", "#F59E0B", "rec-hold")
    elif score >= 40:
        return ("REDUCE", "#EF4444", "rec-reduce")
    else:
        return ("SELL", "#DC2626", "rec-sell")


def format_market_cap(billions):
    return f"${billions:.1f}B"


def format_pe(pe):
    return f"{pe:.2f}x"


def generate_report(ticker, data, report_data):
    rec, rec_color, rec_class = conviction_color(report_data["score"])

    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="{data["name"]} ({ticker}) — Investment Research — DYOR HQ">
  <title>{data["name"]} ({ticker}) — DYOR HQ</title>
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
          <li><a href="../index.html">← All Reports</a></li>
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
            <h1>{data["name"]}</h1>
            <div class="report-meta-bar">
              <span class="rec-badge {rec_class}">{rec}</span>
              <span class="meta-item">11 Apr 2026</span>
              <span class="meta-item">${data["price"]:.2f}</span>
            </div>
          </div>
          <div class="conviction-display" style="border-top: 3px solid {rec_color}">
            <div class="score" style="color: {rec_color}">{report_data["score"]}</div>
            <div class="score-label">Conviction</div>
            <div class="score-sub">out of 100</div>
          </div>
        </div>
      </div>

      <div class="report-body">
        <div class="report-content">
          <div class="report-section">
            <h2>Executive Summary</h2>
            <p>{report_data["exec"]}</p>
          </div>

          <div class="report-section">
            <h2>Business Model</h2>
            <p>{report_data["business"]}</p>
          </div>

          <div class="report-section">
            <h2>Financial Snapshot</h2>
            <table class="data-table">
              <tr><td>Current Price</td><td>${data["price"]:.2f}</td></tr>
              <tr><td>Market Capitalisation</td><td>{format_market_cap(data["marketCap"])}</td></tr>
              <tr><td>Price-to-Earnings (P/E)</td><td>{format_pe(data["pe"])}</td></tr>
              <tr><td>Earnings Per Share (EPS)</td><td>${data["eps"]:.2f}</td></tr>
              <tr><td>52-Week High</td><td>${data["high52"]:.2f}</td></tr>
              <tr><td>52-Week Low</td><td>${data["low52"]:.2f}</td></tr>
            </table>
          </div>

          <div class="report-section">
            <h2>Recent Catalysts</h2>
            <p>{report_data["catalysts"]}</p>
          </div>

          <div class="report-section">
            <h2>Thesis Evaluation</h2>
            <p><strong>Bull Case ({report_data["score"]}):</strong> {report_data["bull"]}</p>
            <p><strong>Base Case (50):</strong> {report_data["base"]}</p>
            <p><strong>Bear Case (40):</strong> {report_data["bear"]}</p>
            <p class="scenario-note"><strong>Weighted Score: {report_data["score"]}</strong> — Bull {report_data["score"]} × 30% + Base 50 × 50% + Bear 40 × 20%</p>
          </div>

          <div class="report-section">
            <h2>Key Risks</h2>
            <ol>
              {"".join(f'<li>{risk}</li>' for risk, _ in report_data["risks"])}
            </ol>
          </div>

          <div class="report-section">
            <h2>Who Should Own It / Avoid It</h2>
            <p><strong>Owners:</strong> {report_data["owners"]}</p>
            <p><strong>Avoiders:</strong> {report_data["avoiders"]}</p>
          </div>

          <div class="report-section">
            <h2>Recommendation</h2>
            <p><strong>{rec}.</strong> {report_data["entry"].replace("BUY", "<strong>BUY</strong>").replace("HOLD", "<strong>HOLD</strong>").replace("REDUCE", "<strong>REDUCE</strong>").replace("SELL", "<strong>SELL</strong>").replace("BUY below", "<strong>BUY below</strong>").replace("BUY on", "<strong>BUY on</strong>").replace("Reduce on", "<strong>Reduce on</strong>").replace("Reduce", "<strong>Reduce</strong>")}</p>
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
</html>'''
    return html


def main():
    results = []
    for ticker, data in TICKERS.items():
        report_data = REPORTS[ticker]
        html = generate_report(ticker, data, report_data)
        filepath = os.path.join(REPORTS_DIR, f"{ticker}-2026-04-11.html")
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(html)
        rec, _, rec_class = conviction_color(report_data["score"])
        results.append((ticker, report_data["score"], rec, filepath))
        print(f"  {ticker}: score={report_data['score']}, rec={rec}")

    print("\nAll reports generated:")
    for ticker, score, rec, fp in results:
        print(f"  {ticker:6s} score={score:3d} rec={rec:6s}  {os.path.basename(fp)}")

if __name__ == "__main__":
    main()
