"""Builds concept sheets (PDF), the updated concept register and per-concept folders."""
import csv, json, os, shutil, sys, textwrap
from PIL import Image, ImageDraw, ImageFont

UPLOADS, OUT, OWNER_CSV = sys.argv[1], sys.argv[2], sys.argv[3]
inv = json.load(open(os.path.join(OUT, "inventory.json")))
images = inv["images"]
owner_rows = list(csv.DictReader(open(OWNER_CSV, encoding="utf-8-sig")))
fields = list(owner_rows[0].keys())

NEXT = {
    "ACQ-01": "In the Fresno portal, tap each F1-F5 parcel and screenshot the info popup showing the APN; note the layer names and date.",
    "DES-03": "Engineer review of one canopy module: loads, wind retraction, deployment and failure states, maintenance.",
    "EDO-01": "Store the genome rules (arm count, 120-degree angle, materials, colours) as data, separate from the renders.",
    "BRD-01": "Lock the canonical mark, palette and type; use 15a1ad15 as the master primitive; fix 'AIM-BSR' typos.",
    "EDO-02": "Accessibility and egress review of the kiosk; functional UI first, media second.",
    "SYS-01": "File under the EDO Droid track; define what a robot may do in a building (permissions) before any pilot.",
    "FUT-01": "Keep as worldbuilding, labelled speculative; fix typos before sharing.",
    "LET-01": "Label dashboard numbers 'illustrative'; check short-term-rental rules per site; use the 9-step cycle for the L.E.T. admin stages.",
    "WEAR-01": "Decide whether wearables sit inside AIM; remove or qualify medical claims before any publication.",
    "MED-01": "Register as Dance8 reference set 'ref-stuttr-crew' for clip consistency.",
}
MISSING = "No image for this family was received in this conversation. Record as missing until the files are supplied."

concepts = owner_rows + [dict({k: "" for k in fields}, **c) for c in inv["new_concepts"]]
by_concept = {}
for im in images:
    by_concept.setdefault(im["concept_id"], []).append(im)

# ---- updated concept register (owner schema, values filled, nothing invented)
upd = []
for c in concepts:
    c = dict(c)
    ims = by_concept.get(c["concept_id"], [])
    if ims:
        c["asset_filename"] = ";".join(i["archive_filename"] for i in ims)
        c["asset_url_or_library_ref"] = "AIM-B5R_Visual_Archive/" + c["concept_id"] + "/"
        c["created_date"] = min(i["received_date"] for i in ims)
        c["source_prompt_or_session"] = "Uploaded to Claude session 2026-10-07/09 (prompts not supplied)"
        c["image_version"] = "v1"
        c["status"] = "TAGGED"
        c["owner"] = "Daniel Ebuehi"
        extra = "Proposed family (owner to approve)." if c["concept_id"] in ("LET-01", "WEAR-01", "MED-01") else ""
        c["notes"] = (extra + f" {len(ims)} image(s). Cross-tagged images listed in image_register.csv.").strip()
    else:
        c["notes"] = (c.get("notes") or "") + " No matching image received; historic renders not accessible here."
        c["notes"] = c["notes"].strip()
    upd.append(c)
with open(os.path.join(OUT, "AIM_B5R_Image_Concept_Register_v0.2.csv"), "w", newline="") as f:
    wr = csv.DictWriter(f, fieldnames=fields)
    wr.writeheader()
    wr.writerows(upd)

# ---- per-concept folders with byte-identical originals
arch = os.path.join(OUT, "AIM-B5R_Visual_Archive")
shutil.rmtree(arch, ignore_errors=True)
for im in images:
    d = os.path.join(arch, im["concept_id"])
    os.makedirs(d, exist_ok=True)
    shutil.copyfile(os.path.join(UPLOADS, im["upload_filename"]), os.path.join(d, im["archive_filename"]))
for name in ("image_register.csv", "excluded_uploads.csv", "AIM_B5R_Image_Concept_Register_v0.2.csv"):
    shutil.copyfile(os.path.join(OUT, name), os.path.join(arch, name))

# ---- concept sheets
W, H, M = 1700, 2200, 90
BG, INK, MUTED, RULE, WARN = (250, 250, 248), (24, 24, 28), (96, 96, 104), (210, 210, 214), (176, 64, 32)
F = "/usr/share/fonts/truetype/dejavu/"
font = lambda s, b=False: ImageFont.truetype(F + ("DejaVuSans-Bold.ttf" if b else "DejaVuSans.ttf"), s)
COLL = {"Evidence": (24, 110, 92), "Operational UI": (36, 86, 160), "Concept": (120, 70, 150), "Brand": (170, 110, 20)}


def wrap(d, xy, text, f, fill, width_px, gap=6):
    x, y = xy
    avg = f.getlength("abcdefghijklmnopqrstuvwxyz") / 26
    for para in text.split("\n"):
        for line in textwrap.wrap(para, max(10, int(width_px / avg))) or [""]:
            d.text((x, y), line, font=f, fill=fill)
            y += f.size + gap
    return y


pages = []
for c in upd:
    cid = c["concept_id"]
    ims = by_concept.get(cid, [])
    pg = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(pg)
    col = COLL.get(c["collection"], MUTED)
    d.rectangle([0, 0, W, 14], fill=col)
    d.text((M, 50), f"{cid}", font=font(30, True), fill=col)
    d.text((M + 200, 50), c["collection"].upper() + "  ·  " + (c["priority"] or ""), font=font(24), fill=MUTED)
    y = wrap(d, (M, 96), c["concept_title"], font(54, True), INK, W - 2 * M)
    y += 14
    d.line([M, y, W - M, y], fill=RULE, width=2)
    y += 24
    for label, key in (("Visual subjects", "visual_subjects"), ("Document with each image", "documentation_requirement")):
        d.text((M, y), label.upper(), font=font(20, True), fill=MUTED)
        y = wrap(d, (M, y + 30), c[key], font(26), INK, W - 2 * M) + 14
    d.text((M, y), "EVIDENCE BOUNDARY", font=font(20, True), fill=WARN)
    y = wrap(d, (M, y + 30), c["verification_warning"], font(26, True), WARN, W - 2 * M) + 24

    # thumbnails grid
    grid_top, grid_h = y, 980
    if ims:
        n = len(ims)
        cols = 3 if n > 4 else max(1, min(n, 2)) if n <= 2 else 2
        cols = 3 if n >= 5 else (2 if n >= 2 else 1)
        rows_ = (n + cols - 1) // cols
        cw = (W - 2 * M - (cols - 1) * 24) // cols
        ch = min(int(cw * 0.75), (grid_h - (rows_ - 1) * 54) // rows_ - 34)
        for k, im in enumerate(ims):
            r, q = divmod(k, cols)
            x0 = M + q * (cw + 24)
            y0 = grid_top + r * (ch + 54)
            src = Image.open(os.path.join(UPLOADS, im["upload_filename"])).convert("RGB")
            src.thumbnail((cw, ch))
            d.rectangle([x0, y0, x0 + cw, y0 + ch], fill=(232, 232, 236))
            pg.paste(src, (x0 + (cw - src.width) // 2, y0 + (ch - src.height) // 2))
            label = f"{im['image_id']}  " + im["title"]
            d.text((x0, y0 + ch + 8), label[: int(cw / 11)], font=font(18, True), fill=INK)
        y = grid_top + rows_ * (ch + 54) + 10
    else:
        d.rectangle([M, y, W - M, y + 220], outline=RULE, width=3)
        wrap(d, (M + 30, y + 70), MISSING, font(28), MUTED, W - 2 * M - 60)
        y += 260

    d.line([M, y, W - M, y], fill=RULE, width=2)
    y += 20
    if ims:
        d.text((M, y), "IMAGES AND FLAGS", font=font(20, True), fill=MUTED)
        y += 32
        for im in ims:
            flag = f"  — {im['flags']}" if im["flags"] else ""
            ty = wrap(d, (M, y), f"{im['image_id']}  {im['visible_content']}", font(20), INK, W - 2 * M, gap=4)
            if flag:
                ty = wrap(d, (M + 30, ty), flag.strip(" —"), font(20, True), WARN, W - 2 * M - 30, gap=4)
            y = ty + 8
            if y > H - 260:
                d.text((M, y), "… see image_register.csv for the rest", font=font(20), fill=MUTED)
                y += 30
                break
    y = max(y + 10, H - 220)
    d.text((M, y), "NEXT TEST", font=font(20, True), fill=col)
    wrap(d, (M, y + 30), NEXT.get(cid, "Supply the image files, then tag and review."), font(26, True), INK, W - 2 * M)
    d.text((M, H - 60), f"AIM-B5R Visual Concept Sheets v0.1 · {cid} · status {c['status']} · technical status: concept unless stated · not an approved building, parcel, system or investment",
           font=font(16), fill=MUTED)
    pages.append(pg)

pdf = os.path.join(OUT, "AIM_B5R_Visual_Concept_Sheets_v0.1.pdf")
pages[0].save(pdf, save_all=True, append_images=pages[1:], resolution=200)
shutil.copyfile(pdf, os.path.join(arch, os.path.basename(pdf)))
print("pages", len(pages))
