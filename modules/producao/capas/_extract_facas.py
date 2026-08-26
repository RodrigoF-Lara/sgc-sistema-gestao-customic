"""One-shot extractor: PDF facas -> SVG + PNG thumbs + catalog.json."""
import json
import os
import re
from pathlib import Path

import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[3]
PDF = ROOT / "Facas customic capas.pdf"
OUT = Path(__file__).resolve().parent / "facas"
PAD = 8.0


def slugify(text: str) -> str:
    t = text.lower().strip().replace("+", " plus ").replace("/", " ")
    t = re.sub(r"[^a-z0-9]+", "-", t)
    return t.strip("-")


def fmt(n: float) -> str:
    return f"{n:.3f}".rstrip("0").rstrip(".")


def pt(p):
    return (float(p.x), float(p.y))


def drawing_to_d(items) -> str:
    parts = []
    cx = cy = None
    for it in items:
        kind = it[0]
        if kind == "l":
            p1, p2 = pt(it[1]), pt(it[2])
            if cx is None or abs(cx - p1[0]) > 0.05 or abs(cy - p1[1]) > 0.05:
                parts.append(f"M {fmt(p1[0])} {fmt(p1[1])}")
            parts.append(f"L {fmt(p2[0])} {fmt(p2[1])}")
            cx, cy = p2
        elif kind == "c":
            p1, p2, p3, p4 = pt(it[1]), pt(it[2]), pt(it[3]), pt(it[4])
            if cx is None or abs(cx - p1[0]) > 0.05 or abs(cy - p1[1]) > 0.05:
                parts.append(f"M {fmt(p1[0])} {fmt(p1[1])}")
            parts.append(
                f"C {fmt(p2[0])} {fmt(p2[1])} {fmt(p3[0])} {fmt(p3[1])} {fmt(p4[0])} {fmt(p4[1])}"
            )
            cx, cy = p4
        elif kind == "re":
            r = it[1]
            x, y, w, h = float(r.x0), float(r.y0), float(r.width), float(r.height)
            parts.append(f"M {fmt(x)} {fmt(y)} H {fmt(x + w)} V {fmt(y + h)} H {fmt(x)} Z")
            cx, cy = x, y
    if parts:
        parts.append("Z")
    return " ".join(parts)


def shift_d(d: str, dx: float, dy: float) -> str:
    tokens = d.split()
    out = []
    i = 0
    cmd = None
    while i < len(tokens):
        t = tokens[i]
        if re.match(r"^[MLCHVZ]$", t, re.I):
            cmd = t.upper()
            out.append(cmd)
            i += 1
            continue
        if cmd == "H":
            out.append(fmt(float(t) + dx))
            i += 1
        elif cmd == "V":
            out.append(fmt(float(t) + dy))
            i += 1
        elif cmd in ("M", "L"):
            x = float(t)
            y = float(tokens[i + 1])
            out.append(fmt(x + dx))
            out.append(fmt(y + dy))
            i += 2
        elif cmd == "C":
            nums = [float(tokens[i + k]) for k in range(6)]
            for k, n in enumerate(nums):
                out.append(fmt(n + (dx if k % 2 == 0 else dy)))
            i += 6
        else:
            i += 1
    return " ".join(out)


def pretty_name(raw: str):
    display = re.sub(r"\s*/\s*", " / ", raw)
    display = re.sub(r"\s+", " ", display).strip()
    low = display.lower()
    if low.startswith("iphone"):
        display = "iPhone" + display[6:]
        brand = "apple"
    elif low.startswith("samsung"):
        display = "Samsung" + display[7:]
        brand = "samsung"
    else:
        brand = "outro"
    display = re.sub(
        r"\b(pro|max|plus|air|ultra|plus)\b",
        lambda m: m.group(1).capitalize(),
        display,
        flags=re.I,
    )
    return display, brand


def make_white_transparent(pix: fitz.Pixmap) -> fitz.Pixmap:
    if pix.n != 4:
        pix = fitz.Pixmap(fitz.csRGB, pix, True)
    samples = bytearray(pix.samples)
    wpx, hpx = pix.width, pix.height
    for pxi in range(wpx * hpx):
        o = pxi * 4
        r, g, b = samples[o], samples[o + 1], samples[o + 2]
        if r > 248 and g > 248 and b > 248:
            samples[o + 3] = 0
        elif r > 220 and g > 220 and b > 220:
            darkness = 255 - min(r, g, b)
            samples[o + 3] = min(255, darkness * 8)
    return fitz.Pixmap(pix.colorspace, wpx, hpx, bytes(samples), True)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(PDF)
    models = []

    for i, page in enumerate(doc):
        raw_name = (page.get_text() or f"Faca {i + 1}").strip().split("\n")[0].strip()
        drawings = page.get_drawings()
        if len(drawings) < 2:
            print("skip page", i + 1)
            continue

        drawings_sorted = sorted(
            drawings,
            key=lambda d: abs((d["rect"].x1 - d["rect"].x0) * (d["rect"].y1 - d["rect"].y0)),
            reverse=True,
        )
        outer_d_abs = drawing_to_d(drawings_sorted[0]["items"])
        cam_d_abs = drawing_to_d(drawings_sorted[1]["items"])
        ob = drawings_sorted[0]["rect"]
        x0 = float(ob.x0) - PAD
        y0 = float(ob.y0) - PAD
        w = float(ob.width) + PAD * 2
        h = float(ob.height) + PAD * 2
        outer_d = shift_d(outer_d_abs, -x0, -y0)
        cam_d = shift_d(cam_d_abs, -x0, -y0)

        display, brand = pretty_name(raw_name)
        sid = slugify(display)
        existing = {m["id"] for m in models}
        if sid in existing:
            sid = f"{sid}-p{i + 1}"

        svg = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fmt(w)} {fmt(h)}" '
            f'width="{fmt(w)}" height="{fmt(h)}">\n'
            f'  <path fill="none" stroke="#111" stroke-width="1.2" stroke-linejoin="round" d="{outer_d}"/>\n'
            f'  <path fill="none" stroke="#111" stroke-width="1.2" stroke-linejoin="round" d="{cam_d}"/>\n'
            "</svg>\n"
        )
        svg_name = f"{sid}.svg"
        (OUT / svg_name).write_text(svg, encoding="utf-8")

        clip = fitz.Rect(ob.x0 - PAD, ob.y0 - PAD, ob.x1 + PAD, ob.y1 + PAD)
        pix = page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=clip, alpha=True)
        pix = make_white_transparent(pix)
        png_name = f"{sid}.png"
        pix.save(str(OUT / png_name))

        models.append(
            {
                "id": sid,
                "name": display,
                "brand": brand,
                "page": i + 1,
                "aliases": [raw_name, display],
                "viewBox": [0, 0, round(w, 3), round(h, 3)],
                "width": round(w, 3),
                "height": round(h, 3),
                "outer": outer_d,
                "camera": cam_d,
                "svg": f"facas/{svg_name}",
                "thumb": f"facas/{png_name}",
            }
        )
        print(i + 1, display, sid, round(w, 1), round(h, 1))

    catalog = {"source": "Facas customic capas.pdf", "models": models}
    (OUT / "catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("OK", len(models), "models ->", OUT)


if __name__ == "__main__":
    main()
