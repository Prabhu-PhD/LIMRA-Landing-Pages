"""
Resize and recompress the campus imagery for web delivery.

The source photographs come straight from the client's library at full
camera resolution: several are 6000x4000, which is roughly 24 megapixels
delivered to fill a 350px gallery tile. That made each landing page about
4.5 MB, almost all of it images. On the mobile connections most ad traffic
arrives on, that is several seconds of waiting before anyone sees the form,
and Google Ads scores landing page speed as part of Quality Score, so it
costs money twice.

Run after adding any new campus images:

    python tools/optimize-images.py            # report only, changes nothing
    python tools/optimize-images.py --apply    # rewrite the files in place

Originals are committed to git, so `git checkout assets/campus` restores
them if a result is ever unsatisfactory.
"""

import glob
import os
import sys

from PIL import Image

# Widest the image is ever displayed, doubled for high-density screens.
MAX_WIDTH = {
    "hero": 1920,   # full-bleed hero background
    "tile": 1200,   # largest mosaic tile is ~600px wide
    "logo": 420,    # rendered at up to 158px
}
WEBP_QUALITY = 80


def classify(path):
    name = os.path.basename(path)
    if "-logo." in name:
        return "logo"
    if "-hero." in name:
        return "hero"
    return "tile"


def main():
    apply_changes = "--apply" in sys.argv
    files = sorted(glob.glob("assets/campus/*"))

    before_total = after_total = 0
    rows = []

    for path in files:
        kind = classify(path)
        limit = MAX_WIDTH[kind]
        before = os.path.getsize(path)
        before_total += before

        im = Image.open(path)
        w, h = im.size

        if w > limit:
            new_h = round(h * limit / w)
            resized = im.resize((limit, new_h), Image.LANCZOS)
        else:
            resized = im.copy()

        # Always encode to a temp file first. Re-compressing an already-small
        # image can make it bigger, in which case the original is left alone.
        tmp = path + ".probe"
        quality = 88 if kind == "logo" else WEBP_QUALITY
        resized.save(tmp, "WEBP", quality=quality, method=6)
        candidate = os.path.getsize(tmp)

        improves = candidate < before
        after = candidate if improves else before

        if apply_changes and improves:
            os.replace(tmp, path)
        else:
            os.remove(tmp)

        after_total += after
        final_size = resized.size if improves else (w, h)
        rows.append((os.path.basename(path), f"{w}x{h}", final_size,
                     before / 1024, after / 1024, "" if improves else "kept"))

    print(f"{'file':34s} {'from':>12s} {'to':>12s} {'KB':>8s} {'new KB':>8s}")
    for name, was, now, kb_before, kb_after, note in rows:
        print(f"{name:34s} {was:>12s} {str(now[0]) + 'x' + str(now[1]):>12s} "
              f"{kb_before:8.0f} {kb_after:8.0f}  {note}")

    saved = before_total - after_total
    print()
    print(f"before : {before_total / 1024:8.0f} KB")
    print(f"after  : {after_total / 1024:8.0f} KB")
    print(f"saved  : {saved / 1024:8.0f} KB  ({100 * saved / before_total:.0f}% smaller)")
    if not apply_changes:
        print("\nreport only. re-run with --apply to write the files.")


if __name__ == "__main__":
    main()
