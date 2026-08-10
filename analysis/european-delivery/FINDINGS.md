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

European results are not unpredictable because Europe behaves erratically. They are
unpredictable because **each European country produces too few conversions per decision to
measure anything**, and decisions were being made on a window far shorter than the one required
to see through that noise.

At monthly resolution — where the sample is finally large enough — Europe is one of the *most
predictable* things in the account: it tracks Anglo ROAS at **r = 0.986**, holding a steady
**12% discount** (sd of the ratio: 0.052). The erraticism is entirely an artifact of the
resolution the numbers are being read at.

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
