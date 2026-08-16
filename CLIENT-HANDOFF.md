# LIMRA Landing Pages Handover

Six advertising landing pages, one per partner university. Built for paid
traffic (Google Ads, Meta, or any other source). Their single job is to turn
an ad click into a contactable enquiry.

Prepared by Prabhu. Everything needed to deploy is in this package.

---

## 1. What is in this package

| Folder | What it is | Who needs it |
|---|---|---|
| `website-files/` | The finished website, ready to upload | Whoever deploys the site |
| `source-files/` | The editable project | Whoever updates content later |
| `CLIENT-HANDOFF.md` | This document | Everyone |

**To publish the site you only need `website-files/`.** It is plain HTML, CSS,
JavaScript and images. No database, no server software, no monthly cost.

---

## 2. Read this before you open anything

**Do not judge the pages by double-clicking a file on your computer.** They
will look broken, with no styling and no images.

That is normal and expected. These pages use absolute paths (`/css/...`),
which only resolve when the files are served by a web server. Opened directly
from a folder, the browser cannot find them.

To see the pages properly, either upload them to hosting (Section 4) or ask
Prabhu for the preview link.

---

## 3. The pages

Once deployed at, for example, `lp.limraedu.com`, the URLs are:

| University | URL |
|---|---|
| Davao Medical School Foundation | `/dmsf/` |
| Gullas College of Medicine | `/gcm/` |
| Brokenshire College of Medicine | `/brokenshire/` |
| Lyceum Northwestern University | `/lyceum/` |
| Universidade Católica Timorense | `/ucts/` |
| University of PEACE | `/university-of-peace/` |

Plus a thank-you page (`/thank-you/`), a privacy policy (`/privacy/`), and a
simple holding page at the root.

Each of these is the **final URL** you put into an ad.

---

## 4. How to deploy

### ⚠️ One hard requirement

**The files must sit at the root of a domain or subdomain.**

- ✅ `lp.limraedu.com` → works
- ✅ `limraedu.in` → works
- ❌ `limraedu.com/landing/` → **will not work.** Every image, stylesheet and
  link will break.

If a subfolder is the only option, tell Prabhu before you deploy. It needs a
different build, not a different upload.

The site must also be served over **HTTPS**. Google Ads requires it, and the
enquiry form will not submit reliably without it.

### Option A: Netlify, Vercel or Cloudflare Pages (recommended, free)

Drag the **contents** of `website-files/` onto the host's upload area, then
point your domain at it. Nothing to configure, no build step needed.

### Option B: regular web hosting (cPanel, shared hosting, FTP)

Upload everything **inside** `website-files/` into the web root, usually
`public_html/`. Do not upload the `website-files` folder itself; upload what
is inside it, so that `index.html` lands directly in the web root.

### Option C: Amazon S3, Google Cloud Storage, or similar

Upload the contents of `website-files/` and enable static website hosting with
`index.html` as the index document.

### A note for whoever deploys

Three short URLs (`/davao`, `/cebu`, `/peace`) are configured in
`netlify.toml` and work **only on Netlify**. On any other host those aliases
will 404. The six main URLs in Section 3 work everywhere. They are a
convenience for ad copy, not a requirement.

---

## 5. ⚠️ Three settings required before any ad money is spent

The pages will collect enquiries the moment they are live. But **without
these three values you will have no idea which ads are working**, which
campaign produced which lead, or what a lead costs you.

Open `source-files/_data/site.js` and fill in:

| Setting | Where it comes from |
|---|---|
| `ga4Id` | Google Analytics → Admin → Data streams → the `G-XXXXXXX` value |
| `adsConversionId` | Google Ads → Goals → Conversions → Tag setup (`AW-XXXXXXX`) |
| `adsConversionLabel` | The same conversion action, shown next to the ID |

Then rebuild and redeploy (Section 7), or send the values to Prabhu and he
will do it.

### Or set them in Netlify instead of in the code

The five integration values can be set as environment variables in the
Netlify dashboard, under **Site configuration, then Environment variables**.
An environment variable overrides whatever is written in `_data/site.js`,
so the values can be changed without a code change or a developer. Add the
variable, then trigger a redeploy.

| Variable | Holds |
|---|---|
| `GA4_ID` | the `G-XXXXXXX` from Google Analytics |
| `ADS_CONVERSION_ID` | the `AW-XXXXXXX` from Google Ads |
| `ADS_CONVERSION_LABEL` | the label beside that conversion action |
| `SHEET_ENDPOINT` | the Apps Script Web App URL |
| `WEB3FORMS_KEY` | a separate key, to keep ad enquiries out of the main inbox |

**Until `ga4Id` has a real value, no analytics or advertising scripts load at
all and no tracking cookies are set.** That is deliberate, so the pages stay
clean and compliant until they are properly configured. It is not a bug.

### ⚠️ Set the Ads conversion up as an *event*, not a page visit

When creating the conversion action in Google Ads, choose the option that
tracks a **website event using a tag**, not the one that counts visits to a
particular "thank you" URL.

These pages confirm the enquiry **inside the form**, without sending the
visitor to another page, because every extra page load is somewhere a person
can drop out. That is better for conversion rates, but it means there is no
thank-you URL for Google to count. The page fires the conversion event
directly instead. A URL-based conversion action would silently record zero
conversions forever, while the enquiries themselves kept arriving by email.

---

## 6. Where the enquiries go

### Email (already working)

Every submitted form is delivered by email through **Web3Forms**. The subject
line names the university, for example *"New DMSF enquiry (Google Ads landing
page)"*, so the counselling team knows immediately which campus the student is
asking about.

Each enquiry also carries the advertising details behind it: the Google click
ID and all campaign parameters. That is what lets you connect a student back
to the exact ad they clicked.

**Note:** these pages currently use the same Web3Forms account as the main
LIMRA website, so landing page enquiries arrive in the same inbox. If you
would rather keep them separate, create a second free key at
<https://web3forms.com> and send it to Prabhu.

### Google Sheet (optional, about 5 minutes to set up)

Enquiries can also drop into a Google Sheet automatically, which is usually
easier for a team to work from than an inbox.

Full instructions are in the notes at the top of
`source-files/tools/google-apps-script.gs`. In short:

1. Sign in as the LIMRA Google account **only**, using an incognito window.
   A second signed-in Google account is what causes Apps Script to bounce you
   between account-chooser screens, and it is the most common thing to go
   wrong here.
2. Create the sheet, e.g. "LIMRA Ad Leads", and copy its ID out of the address
   bar: the long middle section of `.../spreadsheets/d/<THIS PART>/edit`.
3. Go to **script.google.com → New project**. Do **not** use the sheet's
   Extensions → Apps Script menu; that is what triggers the account loop.
4. Paste in the contents of `google-apps-script.gs` and set `SHEET_ID`.
5. Run the `testConnection` function once and accept the permission prompt.
   Doing this before deploying is what turns a silent failure into a readable
   error message.
6. **Deploy → New deployment**, type **Web app**, execute as **Me**, access
   **Anyone** (not "Anyone with a Google account").
7. Send the resulting `/exec` URL to Prabhu, or set it as the `SHEET_ENDPOINT`
   environment variable in Netlify and redeploy.

Email delivery is the reliable path and keeps working regardless; the sheet is
a convenience layer on top. If the sheet is ever misconfigured, no lead is
lost.

---

## 7. Editing the pages later

All six pages are generated from **one** template. You never edit six files.

- **Words, numbers and the counsellor phone number** for each university:
  `source-files/_data/campuses.json`
- **WhatsApp number and settings:** `source-files/_data/site.js`
- **Page layout:** `source-files/landing.njk`
- **Design and colours:** `source-files/css/lp.css`

To produce an updated website after editing, with [Node.js](https://nodejs.org)
18 or newer installed:

```bash
npm install
npm run build
```

That regenerates the `_site` folder, which is the new `website-files` to
upload.

If nobody on your side works with code, send the changes to Prabhu instead.

---

## 8. Things that look wrong but are deliberate

Please pass this section to your SEO or marketing agency before they "fix"
anything.

**The pages are hidden from Google search.** Every page carries a `noindex`
tag and `robots.txt` blocks general crawlers. This is intentional. These pages
are close copies of the university pages on limraedu.com, and if Google
indexed both, they would compete with each other and weaken the main site's
existing search rankings. Google's own advertising crawler (`AdsBot-Google`)
is explicitly allowed through, so Quality Score is unaffected.

**There is no menu and no links to limraedu.com.** A landing page has one job.
Every route off the page leads to a phone call, a WhatsApp chat, or the form.
Adding navigation will reduce the number of enquiries. The link back to the
main site was also left out because limraedu.com currently runs the older
design, and sending ad traffic there breaks the experience. Once the new main
site is live, this is worth revisiting.

**No fees are published.** Fees change per intake, and stale prices on an
advertising page are both a trust problem and an advertising-policy risk. The
FAQ tells the visitor a counsellor will share current costs, which is also a
reason for them to submit the form.

**The privacy policy must stay reachable.** Google Ads requires a working
privacy policy on any page that collects personal details. Do not remove
`/privacy/` or the links to it.

**The enquiry form appears twice, plus once more on exit.** Some visitors
decide immediately and some read first. When a visitor moves to leave the
page, a short form offers the fee structure in exchange for a name and phone
number. It appears once per visit and never for someone who has already
submitted.

---

## 9. Content accuracy

All university information, establishment years, hospital names and clinical
figures were taken from the corresponding pages on limraedu.com, which were
built from the universities' own brochures. Nothing was invented for these
pages.

All photographs are real images from the universities and from the student
accommodation LIMRA arranges. No stock photography and no AI-generated images
are used.

**If any fact changes, it must be updated in both places:** here and on the
main website.

Two figures worth confirming before the campaign starts, because they appear
prominently:

- **24+ years** and **2,000+ students placed** (used across all six pages)
- **92% FMGE pass rate**, shown on the Lyceum page only

---

## 10. What we need back from you

1. The domain or subdomain these pages will live on.
2. The three tracking values from Section 5.
3. The Google Sheet URL from Section 6, if you want that.
4. Confirmation of the phone numbers and the two figures in Section 9.
5. Whether landing page enquiries should go to a separate inbox.

Once the site is live, send the URL and Prabhu will check the pages, the form,
and the tracking end to end before any budget goes live.
