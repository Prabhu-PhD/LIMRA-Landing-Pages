"""
Package each country page as a standalone website, one zip per country.

The client puts each page on its own domain, so a country page cannot simply
be lifted out of the combined build: there it lives at /philippines/, whereas
on its own domain it has to be the site root.

Unlike the campus bundles, a country page pulls assets from every university
in that country: four sets of logos, photographs, marquee thumbnails and
brochures for the Philippines, two for Timor-Leste. Listing those by hand
would rot the moment a seventh college is added, so this script starts from
the built HTML and follows every reference it finds, including the ones inside
CSS, until nothing new turns up. Whatever the page actually asks for is what
gets packaged.

Run after `npm run build`:

    python tools/package-countries.py

Writes dist/<id>/ for inspection and dist/LIMRA-<id>.zip for sending on.
"""

import json
import os
import re
import shutil
import zipfile

SITE = "_site"
OUT = "dist"

# Referenced from HTML attributes, from CSS url(), and from the lightbox's
# data-full, which points at the full-size image behind each thumbnail.
HTML_REF = re.compile(r'(?:href|src|data-full|content)="(/[^"]*)"')
CSS_REF = re.compile(r'url\(\s*["\']?(/[^"\')]+)')

NETLIFY = """# Standalone landing page: {name}.
# Upload the CONTENTS of this folder to the ROOT of its domain.

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Content-Security-Policy = "frame-ancestors 'none';"
    Strict-Transport-Security = "max-age=31536000; includeSubDomains; preload"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

# Must stay last: Netlify takes the first matching rule.
[[redirects]]
  from = "/*"
  to = "/404.html"
  status = 404
"""

README = """{name} landing page
{rule}

This folder is a COMPLETE website on its own. It covers all {count}
{adjective} partner universities on a single page.

HOW TO PUBLISH
--------------
Upload everything INSIDE this folder to the root of the domain, so that
index.html sits at the top level. Do not upload the folder itself.

  CORRECT:  yourdomain.com/          -> the {short} page
  WRONG:    yourdomain.com/{ident}/  -> images and styling will break

The site must be served over HTTPS. Google Ads requires it, and the enquiry
form will not submit reliably without it.

DO NOT JUDGE IT BY DOUBLE-CLICKING index.html
---------------------------------------------
It will look broken, with no design and no images. That is expected. These
pages use absolute paths, which only resolve when a web server is serving
them. Upload the folder, or ask Prabhu for a preview link.

WHAT IS IN HERE
---------------
  index.html      The {short} enquiry page
  privacy/        Privacy policy. Google Ads requires this to stay reachable.
  thank-you/      Fallback confirmation, used only if JavaScript fails
  404.html        Shown for any unknown address
  assets/         Images, fonts and the university brochures
  css/ js/        Styling and behaviour
  netlify.toml    Security headers and the 404 rule, used by Netlify

UNIVERSITIES COVERED
--------------------
{unis}

BEFORE SPENDING ON ADS
----------------------
The Google Ads conversion ID and label are still blank. Until they are set
you cannot tell which ads produce enquiries. See CLIENT-HANDOFF.md.

Questions: contact Prabhu.
"""


# After relativise() the shipped paths are relative, so verify() needs its own
# patterns. crawl() still uses HTML_REF/CSS_REF because it runs first, on the
# absolute form.
REL_HTML_REF = re.compile(r'(?:href|src|data-full|content)="([^":#?][^"]*)"')
REL_CSS_REF = re.compile(r"""url\(\s*["']?([^"')][^"')]*)""")

SKIP_PREFIXES = ("http:", "https:", "//", "mailto:", "tel:", "data:", "#")


def relativise(root):
    """Rewrite root-absolute references to depth-relative ones.

    The bundle previously assumed a domain root. Dropped into a subdirectory
    instead - limraedu.com/philippines-lp/ - every "/css/lp.css" resolved
    against the PARENT site, which answered with its own HTML page at status
    200 and Content-Type text/html. The browser refused to apply that as a
    stylesheet, so the page rendered as naked markup with broken images: total
    failure, and no 404 anywhere to point at it.

    Relative paths let the folder sit at any depth, root included.
    """
    changed = 0
    for dirpath, _, files in os.walk(root):
        rel_dir = os.path.relpath(dirpath, root).replace("\\", "/")
        depth = 0 if rel_dir == "." else rel_dir.count("/") + 1
        prefix = "../" * depth

        for f in files:
            if not f.endswith((".html", ".css")):
                continue
            path = os.path.join(dirpath, f)
            text = original = open(path, encoding="utf-8").read()

            def rewrite(match):
                whole, ref = match.group(0), match.group(1)
                if ref.startswith("//"):
                    return whole                    # protocol-relative, leave it
                new = prefix + ref.lstrip("/")
                if not new:
                    new = "./"                      # href="/" sitting at the root
                return whole.replace(ref, new, 1)

            pattern = HTML_REF if f.endswith(".html") else CSS_REF
            text = pattern.sub(rewrite, text)

            if text != original:
                open(path, "w", encoding="utf-8").write(text)
                changed += 1
    return changed


def copy(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(src, dst)


def crawl(root):
    """Follow every local reference from the pages already in the bundle,
    copying each one in, until a pass turns up nothing new. CSS is scanned
    too, because the font files are only ever named inside fonts.css."""
    seen, added = set(), True
    while added:
        added = False
        for dirpath, _, files in os.walk(root):
            for f in files:
                if not f.endswith((".html", ".css")):
                    continue
                path = os.path.join(dirpath, f)
                if path in seen:
                    continue
                seen.add(path)
                text = open(path, encoding="utf-8").read()
                pattern = HTML_REF if f.endswith(".html") else CSS_REF
                for ref in pattern.findall(text):
                    ref = ref.split("?")[0].split("#")[0]
                    if not ref or ref.startswith("//"):
                        continue
                    rel = ref.lstrip("/")
                    if ref.endswith("/"):
                        rel += "index.html"
                    src = os.path.join(SITE, rel)
                    dst = os.path.join(root, rel)
                    if os.path.exists(src) and not os.path.exists(dst):
                        copy(src, dst)
                        added = True


def build_one(country, unis):
    ident = country["id"]
    root = os.path.join(OUT, ident)
    if os.path.exists(root):
        shutil.rmtree(root)

    # The country page becomes the site root.
    copy(os.path.join(SITE, ident, "index.html"), os.path.join(root, "index.html"))
    for page in ("privacy", "thank-you"):
        copy(os.path.join(SITE, page, "index.html"), os.path.join(root, page, "index.html"))

    # The standalone 404 points back to "/" rather than listing other pages.
    copy(os.path.join(SITE, "404-standalone.html"), os.path.join(root, "404.html"))
    copy(os.path.join(SITE, "robots.txt"), os.path.join(root, "robots.txt"))

    crawl(root)
    relativise(root)

    with open(os.path.join(root, "netlify.toml"), "w", encoding="utf-8") as fh:
        fh.write(NETLIFY.format(name=country["adTitle"]))

    names = "\n".join("  - {} ({}), brochure included".format(
        re.sub(r"<[^>]+>", "", u["name"]), u["city"]) for u in unis)
    with open(os.path.join(root, "READ-ME-FIRST.txt"), "w", encoding="utf-8") as fh:
        fh.write(README.format(
            name=country["shortName"], rule="=" * (len(country["shortName"]) + 14),
            short=country["shortName"], ident=ident, count=len(unis),
            adjective=country.get("adjective", country["shortName"]), unis=names))
    return root


def verify(root):
    """Every local path any page asks for must exist inside the bundle."""
    missing = []
    for dirpath, _, files in os.walk(root):
        for f in files:
            if not f.endswith((".html", ".css")):
                continue
            path = os.path.join(dirpath, f)
            text = open(path, encoding="utf-8").read()
            pattern = REL_HTML_REF if f.endswith(".html") else REL_CSS_REF
            for ref in pattern.findall(text):
                ref = ref.split("?")[0].split("#")[0]
                if not ref or ref.startswith(SKIP_PREFIXES):
                    continue
                # `content` carries prose as often as it carries a path - meta
                # descriptions, viewport, robots. A real reference has no
                # spaces and either a directory separator or a file extension.
                if " " in ref or ("/" not in ref and "." not in ref):
                    continue
                if ref.endswith("/"):
                    ref += "index.html"
                # Relative to the file that names it, not to the bundle root.
                target = os.path.normpath(os.path.join(dirpath, ref))
                if not os.path.exists(target):
                    missing.append("{} -> {}".format(os.path.relpath(path, root), ref))
    return missing


def main():
    countries = json.load(open("_data/countries.json", encoding="utf-8"))
    campuses = json.load(open("_data/campuses.json", encoding="utf-8"))
    os.makedirs(OUT, exist_ok=True)

    print("{:<16}{:>7}{:>10}   {}".format("country", "files", "size", "broken refs"))
    problems = 0

    for c in countries:
        unis = [u for u in campuses if u["country"] == c["country"]]
        root = build_one(c, unis)
        missing = verify(root)
        problems += len(missing)

        zip_path = os.path.join(OUT, "LIMRA-" + c["id"] + ".zip")
        if os.path.exists(zip_path):
            os.remove(zip_path)

        n = 0
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
            for dirpath, _, files in os.walk(root):
                for f in files:
                    full = os.path.join(dirpath, f)
                    z.write(full, os.path.relpath(full, root).replace(os.sep, "/"))
                    n += 1

        size = os.path.getsize(zip_path) / 1048576
        print("{:<16}{:>7}{:>9.1f}M   {}".format(
            c["id"], n, size, "OK" if not missing else "{} BROKEN".format(len(missing))))
        for m in missing:
            print("    " + m)

    if problems:
        raise SystemExit("\n{} broken reference(s): do not send these.".format(problems))
    print("\nBundles written to dist/. Send the two zip files.")


if __name__ == "__main__":
    main()
