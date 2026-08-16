/* ============================================================
   EVERY setting for the landing pages lives here.

   The five integration values at the bottom can also be set as environment
   variables in the Netlify dashboard, under Site configuration then
   Environment variables. An environment variable always wins over the value
   written here.

   That matters because this repository is public and because it lets the
   values be changed without a code change or a developer: set them in
   Netlify, trigger a redeploy, done.

     GA4_ID                 the G-XXXXXXX from Google Analytics
     ADS_CONVERSION_ID      the AW-XXXXXXX from Google Ads
     ADS_CONVERSION_LABEL   the label beside that conversion action
     SHEET_ENDPOINT         the Apps Script Web App URL
     WEB3FORMS_KEY          overrides the shared key, for a separate inbox
   ============================================================ */

const env = process.env;

module.exports = {
  // There is deliberately NO link to limraedu.com anywhere on these pages.
  // The current main site uses the older design, and sending paid traffic
  // there breaks the experience. Add one back only once the redesign is live.

  name: "LIMRA Overseas Education",
  url: env.SITE_URL || "https://limra-lp.netlify.app",

  // Each campus has its own counsellor number, set in _data/campuses.json.
  // These two are the fallback for the pages that have no campus behind them:
  // the holding page, the 404 page, the thank-you page and the privacy policy.
  phonePrimary: "+91 94443 75000",
  phonePrimaryDial: "+919444375000",

  // Each campus's WhatsApp is the same line as its phone number, so the campus
  // pages derive it from campus.phoneDial rather than storing it twice. This
  // value is only the fallback for the pages with no campus behind them.
  whatsappDial: "919444375000",

  // No email address is published on these pages. The client asked for every
  // email ID to be removed, so the routes onward are phone, WhatsApp and the
  // form only. Enquiries still arrive by email through Web3Forms; that is the
  // delivery mechanism, not a published address.

  address:
    "New No.177, Royapettah High Road, 1st Floor, SMS Centre, Mylapore, Chennai 600 004",

  yearsExperience: "24",
  studentsPlaced: "2,000+",
  currentIntake: "2026",

  // Web3Forms delivers enquiries by email. This key is shared with the main
  // LIMRA website, so landing page enquiries currently arrive in the same
  // inbox. Set WEB3FORMS_KEY to separate them.
  web3formsKey: env.WEB3FORMS_KEY || "e2ada0b6-6b85-4459-a825-800d4c1762cb",

  // Google Apps Script Web App URL. See tools/google-apps-script.gs.
  // Leave empty to deliver leads by email only.
  sheetEndpoint: env.SHEET_ENDPOINT || "",

  // Until ga4Id holds a real G-XXXXXXX value, no analytics or advertising
  // script loads at all and no cookies are set. That is deliberate.
  ga4Id: env.GA4_ID || "G-KCMZYD7HFW",
  adsConversionId: env.ADS_CONVERSION_ID || "",
  adsConversionLabel: env.ADS_CONVERSION_LABEL || ""
};
