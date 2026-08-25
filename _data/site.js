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

  // The two official LIMRA contacts, per the client review document.
  // Standardised across every page: the per-university counsellor numbers
  // that used to drive this were removed on the client's instruction.
  phonePrimary: "+91 94457 83333",
  phonePrimaryDial: "+919445783333",
  phoneSecondary: "+91 99529 22333",
  phoneSecondaryDial: "+919952922333",

  // Secondary line doubles as the WhatsApp number.
  whatsappDial: "919952922333",

  // No email address is published on these pages. The client asked for every
  // email ID to be removed, so the routes onward are phone, WhatsApp and the
  // form only. Enquiries still arrive by email through Web3Forms; that is the
  // delivery mechanism, not a published address.

  address:
    "New No.177, Royapettah High Road, 1st Floor, SMS Centre, Mylapore, Chennai 600 004",

  // A search URL rather than a place link, because LIMRA has not supplied a
  // Google Business place ID. Send one and this should be swapped for it, so
  // the pin lands on the office rather than on a geocoded guess.
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=New%20No.177%2C%20Royapettah%20High%20Road%2C%201st%20Floor%2C%20SMS%20Centre%2C%20Mylapore%2C%20Chennai%20600%20004%2C%20India",

  yearsExperience: "24",
  studentsPlaced: "2,000+",
  currentIntake: "2026",

  // Web3Forms delivers enquiries by email. This key is shared with the main
  // LIMRA website, so landing page enquiries currently arrive in the same
  // inbox. Set WEB3FORMS_KEY to separate them.
  web3formsKey: env.WEB3FORMS_KEY || "e2ada0b6-6b85-4459-a825-800d4c1762cb",

  // Google Apps Script Web App URL. See tools/google-apps-script.gs.
  // Leave empty to deliver leads by email only.
  //
  // Points at the "LIMRA lead collector" script owned by limraeduads@gmail.com,
  // which appends to the "LIMRA Ad Leads" sheet. This URL is not a secret: it
  // ships inside the page's JavaScript, so anyone viewing source can read it
  // whether or not it sits in this repository. It accepts writes only and
  // exposes nothing back, but it does mean the sheet can be posted junk. If
  // that ever happens, redeploy the script under a new URL and update this.
  sheetEndpoint: env.SHEET_ENDPOINT ||
    "https://script.google.com/macros/s/AKfycbyLPRhSBDqKEXtwW5w0zyE6yaBLCkp_fJWTygKHVEye4eZh2c1gfqR-yPF2Bkb5lz1WCQ/exec",

  // Until these hold real values, no analytics or advertising script loads at
  // all and no cookies are set. That is deliberate.
  //
  // The Google Ads tag is configured HERE, not pasted into the pages. The
  // client supplied the standard gtag snippet, which loads gtag.js itself and
  // bootstraps window.dataLayer / window.gtag. This site already does both in
  // js/lp.js: it loads gtag.js exactly once and then issues one
  // gtag("config", id) per ID. Pasting the snippet as well would fetch
  // gtag.js a second time, redefine window.gtag, replay gtag("js", ...) and
  // send a duplicate page_view on every page - inflating GA4 sessions and
  // muddying the Ads data the tag exists to collect. One ID here reaches
  // every page through _includes/base.njk.
  ga4Id: env.GA4_ID || "G-KCMZYD7HFW",
  adsConversionId: env.ADS_CONVERSION_ID || "AW-11218154452",

  // The "Submit lead form" conversion action. Client supplied the event
  // snippet; only these three values differ from the generic one, so they
  // live here rather than being pasted as a <script> into a page. See
  // fireConversion() in js/lp.js for where and when it actually fires.
  adsConversionLabel: env.ADS_CONVERSION_LABEL || "hoXxCPfmwOccENTnneUp",
  adsConversionValue: 1.0,
  adsConversionCurrency: "INR"
};
