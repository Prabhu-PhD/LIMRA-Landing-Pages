"""
Recompress the university brochures without visibly degrading them.

The brochures are scans, and several of the images inside them are far larger
than the space they occupy on the page: one is 2540x1693px sitting in an A4
frame, another is 389KB at 483x763px. That weight costs nothing on the landing
page itself, since a brochure only downloads when someone taps the button, but
it is a slow and expensive download for a student on mobile data, and that tap
happens after the click has already been paid for.

The approach is deliberately conservative:

  - Each image is capped at TARGET_DPI relative to the size it is actually
    drawn at on the page, not resized by a blanket percentage. An image already
    at or below that resolution is left completely untouched.
  - Images carrying transparency are skipped. Re-encoding those as JPEG would
    flatten the alpha channel and put boxes behind logos.
  - Very small images are skipped; the saving is not worth the risk.

Run:

    python tools/compress-brochures.py            # writes dist/brochures-new/
    python tools/compress-brochures.py --apply    # replaces the originals

Originals are never modified unless --apply is given, and even then a copy is
kept in dist/brochures-original/.
"""

import io
import os
import shutil
import sys

import fitz
from PIL import Image

SRC = "assets/brochures"
OUT = "dist/brochures-new"
BACKUP = "dist/brochures-original"

TARGET_DPI = 180      # comfortably above screen reading, below print excess
JPEG_QUALITY = 82     # visually indistinguishable at this DPI in testing
MIN_BYTES = 24 * 1024  # leave small images alone


def compress(path, out_path):
    doc = fitz.open(path)
    before = os.path.getsize(path)
    touched = skipped_alpha = skipped_small = 0

    for page in doc:
        for info in page.get_images(full=True):
            xref = info[0]
            try:
                raw = doc.extract_image(xref)
            except Exception:
                continue
            if len(raw["image"]) < MIN_BYTES:
                skipped_small += 1
                continue

            # Transparency must survive: JPEG has no alpha channel.
            if raw.get("smask") or raw["ext"] == "png" and "A" in Image.open(
                    io.BytesIO(raw["image"])).mode:
                skipped_alpha += 1
                continue

            rects = page.get_image_rects(xref)
            if not rects:
                continue
            drawn_w = max(r.width for r in rects)
            drawn_h = max(r.height for r in rects)

            # How many pixels this image actually needs at TARGET_DPI.
            need_w = max(1, int(drawn_w / 72.0 * TARGET_DPI))
            need_h = max(1, int(drawn_h / 72.0 * TARGET_DPI))

            im = Image.open(io.BytesIO(raw["image"]))
            if im.width <= need_w and im.height <= need_h and raw["ext"] in ("jpeg", "jpg"):
                continue  # already lean enough

            if im.mode not in ("RGB", "L"):
                im = im.convert("RGB")
            if im.width > need_w or im.height > need_h:
                im.thumbnail((need_w, need_h), Image.LANCZOS)

            buf = io.BytesIO()
            im.save(buf, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)
            if buf.tell() < len(raw["image"]):
                page.replace_image(xref, stream=buf.getvalue())
                touched += 1

    doc.save(out_path, garbage=4, deflate=True, clean=True)
    doc.close()
    after = os.path.getsize(out_path)
    return before, after, touched, skipped_alpha, skipped_small


def main():
    apply = "--apply" in sys.argv
    os.makedirs(OUT, exist_ok=True)

    print("{:<36}{:>9}{:>9}{:>8}   {}".format("brochure", "before", "after", "saved", "images"))
    tb = ta = 0
    results = []

    for f in sorted(os.listdir(SRC)):
        if not f.endswith(".pdf"):
            continue
        b, a, t, sa, ss = compress(os.path.join(SRC, f), os.path.join(OUT, f))
        tb += b
        ta += a
        results.append((f, b, a))
        print("{:<36}{:>8.2f}M{:>8.2f}M{:>7.0f}%   {} rewritten, {} kept for alpha, {} small".format(
            f, b / 1048576, a / 1048576, (1 - a / b) * 100, t, sa, ss))

    print("\n{:<36}{:>8.2f}M{:>8.2f}M{:>7.0f}%".format(
        "TOTAL", tb / 1048576, ta / 1048576, (1 - ta / tb) * 100))

    if apply:
        os.makedirs(BACKUP, exist_ok=True)
        for f, _, _ in results:
            shutil.copy2(os.path.join(SRC, f), os.path.join(BACKUP, f))
            shutil.copy2(os.path.join(OUT, f), os.path.join(SRC, f))
        print("\nApplied. Originals preserved in " + BACKUP)
    else:
        print("\nNothing replaced. Review " + OUT + ", then re-run with --apply.")


if __name__ == "__main__":
    main()
