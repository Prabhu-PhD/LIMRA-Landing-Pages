# LIMRA Google Ads Landing Pages

Six conversion-focused landing pages, one per partner college. Google Ads
traffic lands here; the only job of these pages is to collect a qualified
enquiry.

This is a **separate repo from the main website** (`LIMRA`). Nothing here
depends on the main site, and changes here can never break limraedu.com.

| Campus | URL |
|---|---|
| Davao Medical School Foundation | `/dmsf/` |
| Gullas College of Medicine | `/gcm/` |
| Brokenshire College of Medicine | `/brokenshire/` |
| Lyceum Northwestern University | `/lyceum/` |
| Universidade Católica Timorense | `/ucts/` |
| University of PEACE | `/university-of-peace/` |

Short ad-friendly aliases also work: `/davao`, `/cebu`, `/peace`.

---

## The one thing to understand

**All six pages come from a single template.** Edit
[`landing.njk`](landing.njk) once and every campus page updates. The words and
numbers for each campus live in [`_data/campuses.json`](_data/campuses.json).

```
_data/campuses.json   ← the content of all six pages, and each campus's
                        counsellor phone number (edit this most often)
_data/site.js       ← WhatsApp number, form key, tracking IDs (edit once)
landing.njk           ← the page layout, shared by all six
_includes/base.njk    ← header, footer, sticky mobile bar
css/lp.css            ← all styling
js/lp.js              ← form handling, ad tracking, conversions
assets/campus/        ← 8 images per campus
privacy.njk           ← privacy policy (Google Ads requires a reachable one)
```

To add a seventh college: add one entry to `campuses.json`, drop eight images
into `assets/campus/` named `<id>-logo.png`, `<id>-hero.webp`, and
`<id>-1.webp` through `<id>-6.webp`. That's the whole job.

**Caption every gallery image by looking at it**, not by trusting the
filename. The `caption` field is what the visitor reads, and a lab photo
labelled "campus" undermines the credibility the whole page is built on.

---

## Run it locally

Needs [Node.js](https://nodejs.org) 18+.

```bash
npm install
```

```bash
npm start
```

Then open <http://localhost:8080/dmsf/>.

To produce the deployable files:

```bash
npm run build
```

The output is the **`_site/`** folder.

---

## Deploy

Connect this repo to Netlify (or Vercel / Cloudflare Pages) with:

- **Build command:** `npm run build`
- **Publish directory:** `_site`

`netlify.toml` already sets this up. Point a domain or subdomain at it. `lp.limraedu.com` is the suggested choice; whatever you pick, put it in
`_data/site.js` as `url`.

---

## ⚠️ Before spending a single rupee on ads

Three IDs must be filled into [`_data/site.js`](_data/site.js). Until then
the pages work and collect leads, but **you will have no idea which ads are
working.**

| Setting | Where it comes from | What breaks without it |
|---|---|---|
| `ga4Id` | Google Analytics → Admin → Data streams | No traffic or behaviour data at all |
| `adsConversionId` | Google Ads → Goals → Conversions | Google Ads can't count leads |
| `adsConversionLabel` | Same conversion action, "Tag setup" | Same as above |

With `ga4Id` blank, **no tracking scripts load and no cookies are set**. That
is deliberate, so the pages stay clean until they're properly configured.

---

## Where the leads go

**1. Email (already working).** Delivered via Web3Forms using the same access
key as the main site. Each enquiry arrives with a subject line naming the
campus, e.g. *"New DMSF enquiry (Google Ads landing page)"*.

**2. Google Sheet (optional, ~5 minutes to set up).** Follow the instructions
at the top of [`tools/google-apps-script.gs`](tools/google-apps-script.gs),
then paste the resulting URL into `sheetEndpoint` in `_data/site.js`.

Every lead carries its ad context: `gclid`, `utm_source`, `utm_medium`,
`utm_campaign`, `utm_term`, `utm_content`, referrer and landing URL, so you
can trace any enquiry back to the exact ad that produced it. The Google Sheet
is the easier place to read this.

If the sheet is ever misconfigured, the email still goes through. Email is the
authoritative path; the sheet is a convenience layer on top.

---

## Deliberate decisions worth knowing

**Nothing links to limraedu.com.** The current main site still uses the older
design, so sending paid traffic there breaks the experience. There is no
`mainSite` setting for that reason, and the brand lockup in the header is not
a link at all. Add a link back only once the redesigned site is live.

**The header shows LIMRA and the university together.** The college logos are
transparent PNGs so they sit straight on the bar. The accreditation logos are
not: they are fully opaque with white baked in, which is why those sit on a
small rounded white plate rather than floating.

**The hero carries the university's recognitions, not LIMRA's numbers.** A
first-time visitor from an ad has to trust the institution before they care
who LIMRA is. The LIMRA figures (24+ years, 2,000+ students, free FMGE
coaching) appear further down, in the LIMRA section. Accreditation is
per-campus: CHED Philippines, for instance, does not apply to the two
Timor-Leste universities.

**Each campus shows its own phone number.** The counsellor number lives in
`campuses.json` as `phone` / `phoneDial` and drives the header, the footer, the
sticky mobile bar and the "prefer to call" link on that page. Pages with no
campus behind them, meaning the holding page, 404, thank-you and privacy, fall
back to `site.phonePrimary`. Two numbers repeat across the six campuses, which
is intended: one counsellor covers two universities.

**WhatsApp stays on one shared number**, not per campus, because `wa.me`
silently fails for a number with no WhatsApp account and that would be a dead
end on a click already paid for. Split it per campus only after each number is
confirmed to have WhatsApp.

**No email address is published anywhere.** The client asked for every email ID
to be removed, so the only routes onward are the phone number, WhatsApp and the
form. Enquiries still arrive by email through Web3Forms; that is the delivery
mechanism, not a published address. The form still asks the student for their
own email, which is how a counsellor sends the fee structure.

**No em dashes anywhere.** They now read as AI-written to many people, which
costs trust on a lead-generation page. Sentences are written to avoid them
rather than swapping in hyphens.

**Exit intent.** When a visitor moves to leave, a modal offers the fee
structure and an eligibility check for just name and phone. It waits 12
seconds, shows once per session, and never appears for someone who has
already submitted. On mobile, where there is no cursor to track, a fast
upward scroll is the trigger instead.

**Assets are versioned per build.** `?v={{ buildId }}` is appended to the CSS
and JS URLs so a returning visitor cannot get a stale stylesheet from the
previous deploy.

**Fonts are self-hosted, not loaded from Google.** Google Fonts costs a DNS
lookup, a TLS handshake and a render-blocking stylesheet before any text can
paint, which is expensive on the mobile connections most ad traffic arrives
on. It also fires before a visitor has consented to anything. Serving the
files ourselves means the page makes **zero third-party requests** until the
tracking IDs in `site.js` are filled in. Re-run `tools/fetch-fonts.py` only
if the font stack changes.

**There is a 404 page** that offers the six campuses and a phone number,
wired up in `netlify.toml`. Traffic that lands there has already been paid
for, so it should not hit a dead end. The catch-all redirect must stay **last**
in that file, or it will swallow the short ad aliases above it.

**Engagement is tracked, not just conversions.** Scroll depth, which sections
were actually seen, time on page, gallery opens and reaching step 2 of the
form all report to GA4. Conversions tell you whether the page worked;
these tell you where people stopped, which is what the next round of changes
should be aimed at.


**These pages are hidden from Google search.** Every page carries
`noindex, nofollow` and `robots.txt` blocks general crawlers. This is
intentional: the pages are near-duplicates of the main site's `/colleges/`
pages, and if Google indexed them they would compete with, and weaken, the
organic rankings the main site has built up. `AdsBot-Google` is explicitly
allowed through, because Google Ads must be able to crawl a landing page to
assess Quality Score.

**There is no site navigation.** No menu, no links out to other pages. Every
route off these pages leads to a phone call, a WhatsApp chat, or the form.
This is the single biggest difference between a landing page and a normal web
page, and the main reason to keep them separate from limraedu.com.

**The form appears twice**, once beside the hero, once at the bottom, because
some visitors decide immediately and others read first.

**No cookie consent banner.** These pages are built for India-targeted traffic,
and no tracking loads until a real GA4 ID is set. **If you ever run ads
targeting the EU or UK, you must add a consent banner before doing so.**

**No fee figures are published.** Fees change per intake and stale numbers on
an ad page are both a trust problem and an ad-policy risk. The FAQ tells the
visitor a counsellor will walk them through current costs, which is also a
reason for them to submit the form.

---

## Content accuracy

All campus copy, establishment years, hospital names and statistics were taken
directly from the corresponding pages on the main LIMRA site, which were in
turn built from the colleges' own brochures. Nothing was invented. If a fact
changes, update it in **both** repos.
