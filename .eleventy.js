// Eleventy config — LIMRA Google Ads landing pages
//
// One template (landing.njk) + one data file (_data/campuses.json) generate
// every campus page. To add a seventh college, add one entry to the JSON and
// drop five images into assets/campus/. Nothing else changes.

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("js");
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("robots.txt");

  // "01", "02", ... for the numbered "why this college" cards.
  eleventyConfig.addFilter("pad2", (n) => String(n).padStart(2, "0"));

  // Cache-buster stamped once per build and appended to the CSS/JS URLs.
  // Without it, a returning visitor can keep running the previous deploy's
  // stylesheet or script until their browser decides to revalidate.
  eleventyConfig.addGlobalData("buildId", () => Date.now().toString(36));

  return {
    dir: { input: ".", includes: "_includes", data: "_data", output: "_site" },
    templateFormats: ["njk"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};
