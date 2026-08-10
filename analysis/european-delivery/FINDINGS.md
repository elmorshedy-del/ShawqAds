# Why European countries deliver unpredictable results

Analysis window: **2026-01-01 → 2026-08-10** (live Meta Graph API + Shopify Admin API, not the
10-day `public/data/*.json` snapshot). 6,611 Meta country×day×adset rows, 2,278 Shopify orders,
126 campaigns. FX is daily TRY→USD from Frankfurter; ROAS is currency-neutral (spend and
`action_values` are both TRY).

Reproduce: `node pull-meta.mjs && node pull-shopify.mjs`, then run the numbered scripts.
Both pulls read credentials from env (`SHAWQ_META_TOKEN`/`SHAWQ_META_ID`, `SHOPIFY`) and write
to `./data/` — they never touch `public/data/*.json`.

---

## The short answer

**The country is not the variable. The campaign is.**

A variance decomposition over 81 European campaign×country cells (§9): knowing the **country**
explains **10.4%** of the variation in outcome (F = 0.73 — *less* than its degrees of freedom
would produce by chance). Knowing the **campaign** explains **75.3%** (F = 2.9).

Countries appear to flip because campaigns flip, and every country inside a campaign flips with
it. Slicing results by country then does two damaging things at once: it splits each campaign's
conversions into 3–5 fragments too small to read (§1–3), and it slices along a dimension that
carries almost none of the signal in the first place.

The noise-floor analysis in §1–3 remains correct — it is *why* a country-week number is
unreadable. But the conclusion to draw from it is not "Europe is noisy, ignore it." It is
**"stop reading results by country; read them by campaign."**

At monthly resolution Europe tracks Anglo ROAS at **r = 0.986**, holding a steady **12% discount**
(sd of the ratio: 0.052).

---

## 1. The mechanism: the noise floor

For ROAS built from `N` conversions with order-value dispersion `γ`, the coefficient of
variation has a hard floor:

```
CV_min = sqrt((1 + γ²) / N)
```

No campaign quality, creative, or targeting can beat this. It is a property of counting.

| Country | conv/week | observed ROAS CV | theoretical floor | excess ratio |
|---|---|---|---|---|
| US | 17.6 | 0.48 | 0.26 | 1.82 |
| CA | 6.7 | 0.81 | 0.45 | 1.82 |
| GB | 5.7 | 0.74 | 0.44 | 1.67 |
| DE | 3.0 | 0.88 | 0.61 | 1.44 |
| FR | 2.6 | 0.93 | 0.69 | 1.34 |
| NL | 2.1 | 1.05 | 0.75 | 1.41 |
| ES | 2.0 | 1.05 | 0.73 | 1.43 |
| IT | 0.9 | 1.40 | 1.13 | 1.23 |
| AT | 0.4 | 1.72 | 1.70 | 1.01 |

**The excess ratio is not higher in Europe.** US and CA sit at 1.82 — the *highest* in the
account. European volatility is at or below what pure counting noise predicts. There is no
extra European instability to explain; the countries differ only in `N`.

A CV near 1.0 means the standard deviation equals the mean. Italy's median week is ROAS **0.00**
and its best is **4.69** — from one unchanged campaign.

**Ruled out along the way:** order-value dispersion is *not* the European problem. Within-country
`CV(AOV)` is 0.30–0.51 for European markets, at or below US (0.479) and CA (0.571).

## 2. The consequence: zero predictive validity

Lag-1 autocorrelation of weekly ROAS — does this week predict next week?

| Bucket | median lag-1 r |
|---|---|
| Anglo | **0.46** |
| EU/EEA+UK | **0.01** |

Several European markets are *negative* — DE −0.24, AT −0.35, IT −0.16, ES −0.06 — pure mean
reversion. A good European week is, if anything, more likely to be followed by a bad one.
In the US a weekly read explains 21% of next week's variance (CA: 45%). In Europe it explains
nothing.

## 3. What this did to decisions

Days of spend needed for a ±30% reliable ROAS read, versus how long campaigns actually ran:

| Country | days needed | | Campaign | ran | needed |
|---|---|---|---|---|---|
| GB | 15 | | CH_AT_NOR_ASC | 5 | 86 |
| DE | 23 | | Testing_Italy-Spain | 7 | 94 |
| FR | 35 | | FR_NL_BE_ASC | 3 | 35 |
| NL | 39 | | Spain (EU Seed 1%) | 7 | 40 |
| ES | 40 | | IT_ES_CBO | 24 | 40 |
| BE | 42 | | DACH_ASC | 16 | 23 |
| IT | 94 | | Europe_ASC | 11 | 35 |
| AT | 183 | | UK_Skirts_ASC | 5 | 15 |

- **76%** of European campaigns were killed before their result was readable; **55%** before even
  half-readable. Median adequacy (span ÷ needed) = **0.43**.
- Anglo median adequacy = **2.5**; only 29% killed early.
- European campaign×country cells that ever reached a readable 13 conversions: **9 of 226 (4%)**.
  Anglo: **20 of 80 (25%)**.

**No ad set in the entire account — any region — ever exited Meta's learning phase** (50
conversions/week). 39.8% of European ad set-weeks record *zero* conversions.

This is the loop: too few conversions → unreadable number → decision on noise → campaign killed
before it accumulates enough conversions to be readable. The kill decision is what makes the
result look random, and it also guarantees the sample never grows.

## 4. A real European-specific effect (but not the one that explains volatility)

Attribution signal loss is genuinely, sharply European — and it is the **consent regime**, not
geography. Share of Shopify orders arriving with `fbclid` intact:

| Bucket | orders | fbclid survives | fully dark |
|---|---|---|---|
| Anglo | 1,262 | 62.1% | 10.0% |
| GCC | 150 | 72.7% | 8.7% |
| **EU/EEA+UK** | **750** | **34.5%** | **27.5%** |
| **Switzerland** (Europe, outside EU/EEA) | 32 | **75.0%** | 3.1% |

Anglo vs EU/EEA+UK: **z = 11.98, p = 4.9×10⁻³³**.
Switzerland vs EU/EEA+UK: **z = 4.49, p = 7.2×10⁻⁶**.

Switzerland is the natural experiment — European market, European AOV ($102 vs the EU's $100),
same catalogue, same ads — but outside the EU/EEA consent regime, and its attribution looks
Anglo. That isolates the consent gate as the cause and rules out "European consumers behave
differently."

The practical effect: roughly two-thirds of European conversions reach Meta without an
observed click identifier, so both Meta's optimiser and the dashboard are working from *modeled*
conversions. Meta's reported European ROAS runs ~20% above what Shopify's paid-attributed orders
support, while in Anglo markets it is honest to within 5%. **Caveat, and it matters:** because
European orders carry less attribution metadata in the first place, part of that 20% gap is
undercounting by the classifier rather than over-claiming by Meta. The signal loss is solid;
the exact size of the over-claim is not.

## 5. Hypotheses tested and rejected

Stated explicitly, because each one is a plausible story that the data does not support.

| Hypothesis | Verdict |
|---|---|
| Europe declined faster than the rest of the account after the June restructure | **No.** Jan–Apr → Jun–Aug: Anglo −45%, Europe −45%, GCC −38%. Lockstep. |
| Bundling countries into shared ad sets (DACH_CBO, FR_NL_BE_CBO) hurts | **No.** Pooled ROAS by bundle width: 1 country 2.21, 2 countries 2.23, 3–4 countries 2.32, 5+ 1.77. |
| Spending too fast burns European ad sets | **Not significant.** Spearman −0.194, p = 0.147. Directionally there but unproven. |
| Letting European campaigns run longer improves them | **Backwards.** The +0.401 correlation is survivorship. Within ad sets surviving ≥21 days, ROAS *decays* with age: Europe 3.32 → 2.77 → 1.91 → 2.00 by week. Anglo does the same. |
| Some European country is a hidden underperformer | **No.** After removing the account-wide monthly trend, no country deviates at Bonferroni p < 0.0036. Italy is most negative (ratio 0.57, raw p = 0.017) but does not survive correction. |
| AOV variance drives European ROAS swings | **No.** European CV(AOV) is at or below US/CA. |

## 6. What actually worked

The nine European campaign×country cells that reached a readable 13+ conversions:

| Campaign | cc | days | ROAS | CPA (TRY) |
|---|---|---|---|---|
| Scaling_UK_ASC2 | GB | 24 | 4.34 | 1,159 |
| Scaling_Euro_Campaign | FR | 37 | 3.85 | 1,144 |
| Scaling_UK_ASC | GB | 28 | 3.72 | 1,368 |
| Testing_Germany_ABO | DE | 41 | 3.29 | 1,578 |
| Testing_AU_ABO (spill) | ES | 36 | 3.25 | 1,416 |
| UK_ABO | GB | 14 | 2.75 | 1,892 |
| DACH_CBO | DE | 30 | 1.72 | 3,420 |
| FR_NL_BE_CBO | FR | 25 | 1.61 | 3,678 |
| UK_ASC | GB | 20 | 1.20 | 3,919 |

Every winner ran **24–41 days**. Every winner concentrated on **one country**. All five best are
from the Jan–Apr single-country ABO/ASC era. But note §5: run length is confounded with
survival, and the era effect is account-wide — so read this as *"these are the only European
reads that were ever statistically legible,"* not as proof that long single-country campaigns
cause good outcomes.

## 7. The lever the data does support

An automated sweep of 13 covariates against European ad set-week ROAS (Bonferroni-corrected)
left exactly two survivors: **add-to-cart per link click** (r = +0.396) and **time** (r = −0.396,
the account-wide decline). Spend, daily spend rate, CPM, frequency, reach, active days, and
number of countries in the ad set all came back null.

Tested *forward* on 84 consecutive European ad set-week pairs — predicting next week's ROAS:

| Signal used this week | Spearman | p |
|---|---|---|
| **ATC per link click** | **0.369** | **0.0008** |
| IC per link click | 0.305 | 0.0054 |
| ROAS (what's used today) | 0.283 | 0.0100 |
| CTR | 0.013 | 0.905 |
| CPC | −0.129 | 0.239 |

Ranking European ad sets on ATC-per-click and reading next week's outcome:

| Tercile on ATC/click | next-week median ROAS |
|---|---|
| bottom third | 1.31 |
| middle third | 1.39 |
| **top third** | **2.22** |

The same exercise ranking on ROAS is non-monotonic (1.39 → 1.34 → 2.14) — the middle third does
*worse* than the bottom, which is what a noise-dominated signal looks like.

Why it works is the same arithmetic as §1: ATC fires 9.5–29× more often than purchase. Relative
standard error per country-week:

| | GB | DE | FR | ES | IT | AT |
|---|---|---|---|---|---|---|
| on purchases | 42% | 57% | 62% | 70% | 107% | 155% |
| on add-to-cart | **12%** | **19%** | **17%** | **20%** | **24%** | **38%** |

Note CTR: significant in-sample (r = 0.182) and **worthless forward** (r = 0.013). A useful
reminder that in-sample correlation on this data is not evidence.

## 8. Practical rules

1. **Don't read European ROAS weekly.** GB is the only European market where a week is close to
   meaningful. DE needs ~23 days, FR ~35, ES/NL/BE ~40, IT ~94, AT ~183.
2. **Judge European ad sets on ATC-per-click**, then confirm with ROAS once the conversion count
   crosses ~13. It is the only forward-predictive signal found, and it converges 3–5× faster.
3. **Set the kill window from the country's conversion rate, not the calendar.** A 7-day test in
   Italy is a coin flip with extra steps.
4. **Consolidate rather than fragment.** 226 European campaign×country cells produced 9 readable
   reads. Fewer, longer, single-country runs are the only way `N` ever gets large enough —
   bundling doesn't hurt performance (§5) but it does split the evidence.
5. **Discount Meta's European ROAS.** Treat it as modeled, and reconcile against Shopify before
   acting on it.
6. **Stop attributing the account-wide decline to Europe.** ROAS fell 45% everywhere between
   Jan–Apr and Jun–Aug. Whatever is causing it (creative fatigue is visible in §5's age-decay in
   both regions) is not a European problem.

---

# Part 2 — at campaign resolution

Part 1 analysed countries. That was the wrong unit, and aggregating to "Europe" in the narrative
hid the structure below. Scripts `12`–`15`.

## 9. Variance decomposition: country vs campaign

81 European campaign×country cells (≥100 link clicks, ≥3,000 TRY):

| Grouping | groups | R² | F |
|---|---|---|---|
| Country | 12 | 10.4% | **0.73** |
| Campaign | 42 | 75.3% | **2.90** |

F < 1 for country means country-grouping explains *less* variance than its degrees of freedom
would generate at random. Country is not merely a weak predictor — it is close to no predictor.

## 10. The same country swings 4–10× across its own campaigns

| Country | cells | worst | median | best | best campaign | worst campaign |
|---|---|---|---|---|---|---|
| GB | 14 | 0.00 | 2.02 | 4.34 | Scaling_UK_ASC2 | UK_Skirts_ASC |
| FR | 12 | 0.00 | 1.43 | 8.48 | Skirt AD Europe | French Campaign |
| NL | 11 | 0.00 | 2.10 | 7.45 | Skirt AD Europe | Europe_ASC |
| DE | 9 | 0.00 | 1.59 | 3.29 | Testing_Germany_ABO | Euro-Shop |
| ES | 8 | 0.63 | 3.05 | 6.25 | IT_ES_Skirts_ASC | Spain (EU Seed 1%) |
| IT | 6 | 0.87 | 2.18 | 3.88 | Testing_Italy-Spain | IT_ES_CBO |
| CH | 4 | 0.46 | 1.95 | 2.74 | Euro-Shop1 | DACH_CBO |

## 11. Inside a single campaign, countries agree closely

This is the finding that reframes everything. If countries were independently erratic, their
outcomes within a shared campaign would scatter. They don't:

| Campaign | countries | min | median | max | CV across countries |
|---|---|---|---|---|---|
| **FR_NL_BE_CBO** | 3 | 1.61 | 1.73 | 1.76 | **0.05** |
| Euro_ASC_MAY26 | 4 | 2.36 | 3.04 | 3.73 | 0.19 |
| Scaling_Euro_Campaign | 4 | 2.32 | 3.66 | 4.11 | 0.23 |
| Euro Skirts | 3 | 3.83 | 5.58 | 6.52 | 0.26 |
| Scaling_UK_ASC | 3 | 3.28 | 3.72 | 5.37 | 0.27 |
| DACH_CBO | 4 | 0.46 | 1.21 | 1.72 | 0.54 |

France, Netherlands and Belgium — three markets that look independently unpredictable across the
account — landed within **9% of each other** inside FR_NL_BE_CBO. They were not three countries
behaving erratically. They were one campaign, observed three times.

## 12. Switzerland: the zeros are a click-count problem, not a campaign-type problem

Every Swiss cell, ordered by link clicks accumulated. Switzerland converts clicks at **1.3%**, so
~77 clicks buys one expected sale:

| Campaign | clicks | sales | expected at 1.3% | days | TRY/day | CH-named |
|---|---|---|---|---|---|---|
| Scaling_Euro_Campaign | 497 | 6 | 6.5 | 33 | 407 | |
| DACH_CBO | 364 | 1 | 4.7 | 18 | 569 | |
| Euro-Shop1 | 362 | 8 | 4.7 | 28 | 509 | |
| DACH_ASC | 237 | 3 | 3.1 | 16 | 541 | |
| CH_AT_NOR_ASC | 83 | **0** | 1.1 | 5 | 945 | ✓ |
| Testing_USA_Shop App | 78 | 4 | 1.0 | 14 | 194 | |
| Euro_ASC_MAY26 | 69 | 1 | 0.9 | 17 | 121 | |
| CH_ASC | 62 | **0** | 0.8 | 4 | 808 | ✓ |
| DACH_Skirts_ASC | 56 | **0** | 0.7 | 5 | 535 | |
| GLOBAL TEST (FUNNEL) | 50 | **0** | 0.7 | 2 | 689 | |
| Euro-Shop | 36 | **0** | 0.5 | 7 | 178 | |
| CH_AT_NOR_ASC - Copy | 28 | **0** | 0.4 | 4 | 484 | ✓ |
| Testing_ZAM_ABO | 12 | **0** | 0.2 | 4 | 126 | |
| CH_AT_NOR_ASC--- | 12 | **0** | 0.2 | 1 | 433 | ✓ |

**The tempting story fails its test.** "Campaigns built around Switzerland don't convert" looks
compelling — four CH-named campaigns, 185 clicks, zero sales. But at Switzerland's own baseline
those 185 clicks predict only **2.41** sales, and **Poisson P(0) = 0.089**. Not significant. The
only CH-named cell with real volume (CH_AT_NOR_ASC, 83 clicks) expected 1.1 and got 0 —
unremarkable.

What actually separates the groups is **click accumulation**, which follows from run length:
every cell below ~70 clicks produced zero sales *regardless of campaign type* (that group includes
the broad GLOBAL TEST, Euro-Shop and DACH_Skirts_ASC), and almost everything above it sold. The
CH-named campaigns ran **1–5 days at 433–945 TRY/day**; the earners ran **14–33 days at 121–541
TRY/day**. Spending fast and briefly buys impressions, not the click volume a 1.3% rate needs.

"It wouldn't launch" and "it wasn't run long enough to accumulate 77 clicks" produce
identical-looking data.

## 13. "Won't even launch" is measurable

European cells that burned ≥2,000 TRY in ≤7 days with zero purchases — **34,017 TRY across 8
cells**:

| Campaign | cc | start | days | TRY/day | clicks | CPM |
|---|---|---|---|---|---|---|
| UK_Skirts_ASC | GB | 2026-08-04 | 5 | 1,541 | 237 | 508 |
| French Campaign | FR | 2026-01-21 | 7 | 922 | 424 | 176 |
| CH_AT_NOR_ASC | CH | 2026-06-21 | 5 | 945 | 83 | 358 |
| Euro-Shop | DE | 2026-04-15 | 7 | 551 | 185 | 299 |
| CH_ASC | CH | 2026-06-07 | 4 | 808 | 62 | 484 |
| Testing_Italy-Spain | ES | 2026-02-19 | 7 | 393 | 185 | 208 |
| DACH_Skirts_ASC | CH | 2026-08-04 | 5 | 535 | 56 | 491 |
| Testing_Italy-Spain | IT | 2026-02-28 | 2 | 1,311 | 104 | 154 |

They share a signature: **median 865 TRY/day vs 565 for European cells generally (1.5×)**, at
**median CPM 328 vs 271 (+21%)**. Launched hot, into a more expensive auction, killed before the
clicks could convert.

## 14. What predicts a campaign×country cell working

Spearman against cell ROAS, n = 83, Bonferroni threshold p < 0.007:

| Feature | r | p | |
|---|---|---|---|
| **ATC per link click** | **+0.498** | <0.0001 | **survives** |
| **Days run** | **+0.405** | 0.0002 | **survives** (survivorship-confounded — see §5) |
| Daily spend rate | −0.290 | 0.0088 | just misses |
| CPM | −0.119 | 0.282 | no |
| Country's share of the campaign | −0.112 | 0.312 | no |
| Total spend | +0.058 | 0.596 | no |

ATC-per-click is **stronger at campaign resolution (0.498) than at ad set-week resolution
(0.396)** — consistent with the campaign being the real unit.

Spend-rate quartiles are suggestive but **not monotonic**, so do not treat this as established:

| Quartile | median TRY/day | pooled ROAS | median ATC/click |
|---|---|---|---|
| Q1 | 289 | **3.09** | **0.144** |
| Q2 | 530 | 2.16 | 0.088 |
| Q3 | 933 | 1.63 | 0.082 |
| Q4 | 1,797 | 2.12 | 0.091 |

## 15. Passenger vs dedicated, tested properly

The Switzerland pattern does **not** generalise into a clean rule across all European markets:

| | cells | pooled ROAS | median ROAS | zero-purchase cells | median TRY/day |
|---|---|---|---|---|---|
| Passenger (<55% of campaign) | 56 | 2.15 | 2.10 | 7% | 513 |
| Dedicated (≥55% of campaign) | 27 | 2.13 | **1.51** | 11% | **1,494** |

Pooled ROAS is identical. The median gap (2.10 vs 1.51) tracks the fact that dedicated campaigns
were run at **3× the daily spend rate**, not the dedication itself — and "country's share of
campaign" is a null predictor in §14 (r = −0.112). So: *the Switzerland story is real for
Switzerland, but "give a country its own campaign" is not, by itself, the thing that breaks it.*

## 16. Where the UK actually ranked, week by week

Shopify revenue rank among all markets, 31 weeks:

| Market | weeks present | best | median | worst | top-3 weeks | absent |
|---|---|---|---|---|---|---|
| GB | 30 | #3 | #6 | #13 | 2 | 1 |
| DE | 28 | #3 | #8.5 | #14 | 2 | 3 |
| FR | 27 | #2 | #7 | #16 | 2 | 4 |
| NL | 28 | #4 | #9 | #15 | 0 | 3 |
| CH | 16 | #2 | #8 | #18 | 1 | 15 |

The UK never took the top slot in any week; its best was #3 (weeks 14 and 30) and it sat at #6
median. France peaked at #2 (weeks 2–3, the January EU-White Friday period). Switzerland's single
top-3 week was W19 (#2) — during Euro-Shop1, the campaign it rode as a passenger.

## Revised practical rules

Replacing rule 4 in Part 1:

1. **Evaluate campaigns, not countries.** Country slices carry 10% of the signal and destroy the
   sample. Judge a campaign on its total, then check country splits only for *exclusion*
   decisions with enough volume behind them.
2. **Use ATC-per-click as the read.** r = 0.498 at campaign level, the strongest and most robust
   predictor found, and it converges 3–5× faster than ROAS.
3. **Watch for the launch-failure signature** — daily rate well above your norm and CPM above the
   country's usual band, in the first 48 hours. That combination preceded every one of the eight
   zero-purchase burns.
4. **Don't build campaigns around single small markets.** Not because dedication is inherently
   worse (§12 and §15 both say it isn't), but because a small market alone forces a high daily
   rate to spend the budget, and then cannot accumulate clicks fast enough to convert before the
   kill decision. Size the test by clicks needed, not budget: at a 1.3% conversion rate, ~77
   clicks buys one expected sale, so a readable 13-conversion test needs ~1,000 clicks.

---

# Part 3 — causes of death

Parts 1 and 2 described *how unstable* results were and *which unit* carried the signal. Neither
named a cause. This part pulls the diagnostic layer that was never fetched — campaign and ad set
configuration, placements, and ad-level creative performance — and does per-campaign autopsies.
Scripts `16`–`21`, plus `pull-config.mjs` and `pull-ads.mjs`.

## 17. The arithmetic that makes this diagnosable

ROAS is not a statistic here — it is an identity:

```
ROAS = (1000 / CPM) x CTR x (ATC per click) x (purchases per ATC) x AOV
```

Every term is measurable, and they multiply to ROAS exactly. So "which link broke" is an
arithmetic question, not an inferential one. Crucially the upper-funnel terms are measured on
thousands of events, not on 1–5 purchases: for the biggest UK ad, ATC-per-click of 0.058 across
2,129 clicks carries a standard error of ±0.005. **This diagnosis rests on numbers that are
precise to ±10%, where the ROAS reads in Part 1 were precise to ±40–100%.**

## 18. The UK autopsy

Nine UK campaigns, GB delivery only, decomposed. Ratios are against the best campaign:

| Campaign | ROAS | CPM $ | CTR % | ATC/click | pur/ATC | AOV $ | CPM ratio | CTR ratio | **ATC ratio** |
|---|---|---|---|---|---|---|---|---|---|
| Scaling_UK_ASC2 | **4.34** | 7.48 | 1.56 | **0.174** | 0.105 | 114 | 1.00× | 1.00× | **1.00×** |
| UK_ABO | 2.75 | 6.23 | 1.79 | 0.108 | 0.076 | 117 | 1.20× | 1.15× | 0.62× |
| UK1_ASC | 1.51 | 7.77 | 1.28 | 0.076 | 0.109 | 112 | 0.96× | 0.82× | 0.43× |
| UK_ASC (Jul–Aug) | 1.20 | 9.95 | **2.18** | 0.069 | 0.080 | 99 | 0.75× | **1.40×** | 0.39× |
| UK_CBO | 1.10 | 8.33 | 1.71 | 0.078 | 0.059 | 116 | 0.90× | 1.10× | 0.45× |
| UK1_ASC3 | 1.03 | 8.27 | 1.33 | 0.059 | 0.120 | 90 | 0.90× | 0.85× | 0.34× |
| UK_Skirts_ASC | 0.00 | 10.67 | 1.56 | 0.110 | 0.000 | — | 0.70× | 1.00× | 0.63× |

**Four of the five terms barely move.** CPM spans 0.70–1.20×, CTR 0.82–1.40×, AOV 0.79–1.03×,
purchases-per-ATC 0.56–1.14×. **ATC-per-click collapses from 1.00× to 0.34×** and tracks campaign
ROAS at **r = 0.766** across the nine campaigns.

Note UK_ASC: it has the **highest CTR of any UK campaign (2.18%)** and the second-worst ROAS. It
bought more clicks than anything else and converted them at a third of the rate. That is the
signature of creative that wins attention without communicating the product.

## 19. The specific ads that did it

ATC-per-click is a property of the creative. UK ads, ranked:

| Ad | Campaign | Spend (TRY) | Clicks | ATC/click | vs median |
|---|---|---|---|---|---|
| **Skirts \| Movement & Styling \| Global** | UK_ASC | **41,978** | 2,129 | **0.058** | 0.47× |
| **VSC Blurry Shirt Masterpiece** | UK_CBO | **21,560** | 1,167 | **0.061** | 0.49× |
| Vescarts Crew Neck 98 | Scaling_UK_ASC2 | 17,330 | 935 | 0.170 | 1.36× |
| Vescarts Skirt 2 | UK_ABO | 17,046 | 1,425 | 0.091 | 0.72× |
| Quote VO - Copy | UK_ASC | 14,987 | 535 | 0.103 | 0.82× |

And the best creatives, by ATC-per-click (≥100 clicks):

| Ad | Campaign | Spend (TRY) | Clicks | ATC/click | vs median |
|---|---|---|---|---|---|
| **Calm Kuffiyah** | Scaling_UK_ASC | 7,180 | 289 | **0.298** | 2.38× |
| **Calm Kuffiyah** | Scaling_UK_ASC2 | 2,802 | 113 | **0.274** | 2.19× |
| Winter 2 EU | Scaling_UK_ASC | 5,412 | 302 | 0.242 | 1.93× |
| Zaytoun Tree Skirt | Scaling_UK_ASC2 | 2,379 | 137 | 0.197 | 1.58× |
| Vescarts Denim Pants 2 | Scaling_UK_ASC2 | 6,181 | 229 | 0.197 | 1.57× |

**Cause of death, UK, named:**

1. **`Skirts | Movement & Styling | Global` — 41,978 TRY at 0.058 ATC/click.** The single largest
   UK ad spend, at less than half the median creative's add-to-cart rate. This one ad is most of
   UK_ASC's failure. Its name says `Global` — it is a templated cross-market asset, not a
   product-specific one; every high-performing UK ad is product-specific.
2. **`VSC Blurry Shirt Masterpiece` — 21,560 TRY at 0.061.** Most of UK_CBO's failure.
3. **The best creative was never scaled.** `Calm Kuffiyah` replicated at 0.298 and 0.274 across
   two separate campaigns — the only UK creative with a repeated high reading — and received
   ~10,000 TRY lifetime. The 0.058 ad received 42,000.
4. **No creative carry-forward.** Only **10 of 40** UK ads ever ran in more than one campaign.
   Each new campaign restarts the creative lottery, which is why "the same country alone" swings.

Aggregate misallocation: ads at **≥0.15 ATC/click took 26% of UK spend**; ads **below 0.08 took
37%**.

## 20. Switzerland and Norway — the campaign did partly deliver

`CH_AT_NOR_ASC`, all five days of it:

| Country | days | spend TRY | clicks | ATC | purchases | ROAS | CPM TRY |
|---|---|---|---|---|---|---|---|
| **NO** | 5 | 4,813 | 166 | 21 | **2** | **2.81** | 439 |
| CH | 5 | 4,724 | 83 | 7 | 0 | 0 | 358 |
| AT | 5 | 1,981 | 74 | 6 | 0 | 0 | 240 |

**Norway delivered** — ROAS 2.81. The campaign as a whole came in at 1.18, not zero. Switzerland
and Austria produced 83 and 74 clicks respectively over five days, which at their conversion rates
predicts about one sale each; zero is an ordinary draw.

The campaign's own defect is visible in the decomposition and it is *not* ATC: its ATC-per-click
was 0.105, near normal. Its **purchases-per-ATC was 0.059 against a 0.088 baseline (0.67×)** —
people added to cart and did not check out.

`CH_ASC` is the genuinely broken campaign, and it is diagnosable rather than noise:

| | CPM $ | CTR % | ATC/click | vs Scaling_Euro baseline |
|---|---|---|---|---|
| Scaling_Euro_Campaign | 5.51 | 1.20 | 0.167 | — |
| **CH_ASC** | **10.49** | 0.93 | **0.032** | CPM 0.53×, **ATC 0.19×** |

It paid **double the CPM** for clicks that added to cart at **one-fifth** the normal rate. That is
a broken campaign, not a small sample.

## 21. Two mechanisms ruled out by direct measurement

- **Audience exhaustion: no.** Frequency is flat across all eleven markets and all eight months,
  1.12–1.37. Nothing is being over-served.
- **Placement drift: no.** UK placement mix is essentially constant across campaigns
  (Instagram feed 34–42%, Reels 30–39%, Stories 13–16%). What changed is the *price* of the same
  placements — Instagram feed CPM in the UK went 322–395 TRY in March to 543–597 TRY in June–August.
  In USD, stripping TRY depreciation, that is **GB +17%, US +19%, AU +24%, DE +61%, IT +41%** —
  real, account-wide, and far too small to explain a 4× ROAS swing on its own.

## 22. Revised diagnosis

The account-wide ROAS decline has two separable components:

1. **A market-price component**, worth roughly −15% to −25% via CPM inflation. Account-wide, not
   European, not controllable.
2. **A creative-allocation component**, worth the remaining 3×. Budget concentrated into
   high-CTR / low-ATC assets — `Skirts | Movement & Styling | Global` and `VSC Blurry Shirt
   Masterpiece` between them absorbed 63,538 TRY at ~0.06 ATC/click — while the repeatable winners
   were never scaled.

**Caveat:** ATC events come from the same pixel that suffers European consent loss (§4). All the
comparisons above are GB-to-GB or within a single campaign, which holds the consent regime
constant, so the relative readings are sound; the absolute ATC rates are understated in EU markets.

## 23. What to actually do

1. **Kill on ATC-per-click within 48 hours, not on ROAS within 7 days.** An ad reaches ±10%
   precision on ATC-rate in a few hundred clicks. Threshold: below **0.08** is a documented loser
   (37% of UK spend went there); above **0.15** is a documented winner (26% went there).
2. **Re-run `Calm Kuffiyah` at scale.** It is the only UK creative with two independent readings
   above 0.27 and it has never received more than 7,180 TRY in a single campaign.
3. **Retire `Skirts | Movement & Styling | Global` and `VSC Blurry Shirt Masterpiece`**, or
   restrict them to top-of-funnel objectives where ATC isn't the goal. They buy clicks well and
   sell nothing.
4. **Carry winners forward between campaigns.** 30 of 40 UK ads ran in exactly one campaign. A new
   campaign should start from the previous winner set, not a fresh slate — that alone would remove
   most of the swing.
5. **Treat a high CTR with a low ATC rate as a red flag, not a green one.** UK_ASC had the
   account's best UK CTR and its second-worst ROAS.
