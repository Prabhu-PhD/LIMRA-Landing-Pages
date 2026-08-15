"""
Package each campus as a standalone website, one zip per university.

The client is putting each landing page on its own domain. That means a
campus page cannot simply be lifted out of the combined build: there it
lives at /dmsf/, whereas on its own domain it has to be the site root.
This script rebuilds each one as a complete, self-contained site with the
campus page as index.html, carrying only the assets that campus actually
uses, plus its own privacy page, thank-you fallback, 404 and robots.txt.

Run after `npm run build`:

    python tools/package-sites.py

Writes dist/<id>/ for inspection and dist/LIMRA-<Name>.zip for sending on.
"""

import json
import os
import re
import shutil
import zipfile

SITE = "_site"
OUT = "dist"

# Everything a bundle needs regardless of which campus it is.
SHARED_ASSETS = [
    "logo-white.svg", "logo.svg", "director.webp", "og-default.webp",
    "favicon.svg", "favicon-32.png", "favicon-192.png", "apple-touch-icon.png",
]

NETLIFY = """# Standalone landing page for {name}.
# Upload the contents of this folder to the ROOT of its domain.

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

README = """{name} - landing page
{rule}

This folder is a COMPLETE website for {name} on its own.

HOW TO PUBLISH
--------------
Upload everything INSIDE this folder to the root of the domain, so that
index.html sits at the top level. Do not upload the folder itself.

  CORRECT:  yourdomain.com/            -> the {short} page
  WRONG:    yourdomain.com/{ident}/   -> images and styling will break

The site must be served over HTTPS. Google Ads requires it and the
enquiry form needs it.

DO NOT OPEN THE FILES BY DOUBLE-CLICKING
----------------------------------------
They will look broken, with no design or images. That is normal. These
pages use absolute paths, which only work when a web server is serving
them. Upload them, or ask Prabhu for a preview link.

WHAT IS IN HERE
---------------
  index.html      The {short} enquiry page
  privacy/        Privacy policy. Google Ads requires this to stay reachable.
  thank-you/      Fallback confirmation page
  404.html        Shown for any unknown address
  assets/         Images and fonts used by this page only
  css/ js/        Styling and behaviour
  netlify.toml    Security headers and the 404 rule, used by Netlify

BEFORE SPENDING ON ADS
----------------------
Three tracking values must be filled in or you will not be able to tell
which ads produce enquiries. See CLIENT-HANDOFF.md in the main package.

Questions: contact Prabhu.
"""


def copy(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(src, dst)


def build_one(campus):
    ident, short, name = campus["id"], campus["shortName"], campus["name"]
    short = re.sub(r"<[^>]+>", "", short)
    root = os.path.join(OUT, ident)
    if os.path.exists(root):
        shutil.rmtree(root)

    # The campus page becomes the site root.
    copy(os.path.join(SITE, ident, "index.html"), os.path.join(root, "index.html"))

    for page in ("privacy", "thank-you"):
        copy(os.path.join(SITE, page, "index.html"), os.path.join(root, page, "index.html"))

    # Standalone 404 links back to "/" instead of listing six campuses.
    copy(os.path.join(SITE, "404-standalone.html"), os.path.join(root, "404.html"))
    copy(os.path.join(SITE, "robots.txt"), os.path.join(root, "robots.txt"))

    for name_ in ("fonts.css", "lp.css"):
        copy(os.path.join(SITE, "css", name_), os.path.join(root, "css", name_))
    copy(os.path.join(SITE, "js", "lp.js"), os.path.join(root, "js", "lp.js"))

    for f in SHARED_ASSETS:
        src = os.path.join(SITE, "assets", f)
        if os.path.exists(src):
            copy(src, os.path.join(root, "assets", f))

    for f in os.listdir(os.path.join(SITE, "assets", "fonts")):
        copy(os.path.join(SITE, "assets", "fonts", f), os.path.join(root, "assets", "fonts", f))

    # Only this campus's photographs.
    campus_dir = os.path.join(SITE, "assets", "campus")
    for f in os.listdir(campus_dir):
        if f.startswith(ident + "-"):
            copy(os.path.join(campus_dir, f), os.path.join(root, "assets", "campus", f))

    # Only the accreditation marks this campus actually displays.
    for a in campus["accreditation"]:
        copy(os.path.join(SITE, "assets", "accreditation", a["img"]),
             os.path.join(root, "assets", "accreditation", a["img"]))

    with open(os.path.join(root, "netlify.toml"), "w", encoding="utf-8") as fh:
        fh.write(NETLIFY.format(name=name))

    with open(os.path.join(root, "READ-ME-FIRST.txt"), "w", encoding="utf-8") as fh:
        fh.write(README.format(name=name, short=short, ident=ident, rule="=" * (len(name) + 15)))

    return root


def verify(root, ident):
    """Every local path the HTML asks for must exist in the bundle."""
    missing = []
    for dirpath, _, files in os.walk(root):
        for f in files:
            if not f.endswith(".html"):
                continue
            page = os.path.join(dirpath, f)
            html = open(page, encoding="utf-8").read()
            for ref in re.findall(r'(?:href|src)="(/[^"]*)"', html):
                ref = ref.split("?")[0].split("#")[0]
                if not ref or ref.endswith("/"):
                    ref = ref + "index.html"
                target = os.path.join(root, ref.lstrip("/"))
                if not os.path.exists(target):
                    missing.append(f"{os.path.relpath(page, root)} -> {ref}")
    return missing


def main():
    campuses = json.load(open("_data/campuses.json", encoding="utf-8"))
    os.makedirs(OUT, exist_ok=True)

    print(f"{'campus':24s} {'files':>6s} {'size':>9s}  broken refs")
    total_missing = 0

    for c in campuses:
        root = build_one(c)
        missing = verify(root, c["id"])
        total_missing += len(missing)

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
        flag = "OK" if not missing else f"{len(missing)} BROKEN"
        print(f"{c['id']:24s} {n:6d} {size:8.1f}M  {flag}")
        for m in missing:
            print(f"    {m}")

    print(f"\n{len(campuses)} standalone bundles in {OUT}/")
    print("all internal references resolve" if not total_missing
          else f"WARNING: {total_missing} broken references")


if __name__ == "__main__":
    main()
