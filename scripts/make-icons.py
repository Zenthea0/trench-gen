"""Génère les icônes de l'application (PNG) : un coude de tranchée sur fond de terre.
Usage : python3 scripts/make-icons.py
"""
import os
from PIL import Image, ImageDraw

SOL = (216, 199, 160)
REBORD = (125, 100, 70)
FOND = (52, 39, 27)
MARGE = (59, 45, 32)


def icone(taille: int, maskable: bool) -> Image.Image:
    s = 4  # sur-échantillonnage pour lisser
    t = taille * s
    img = Image.new("RGB", (t, t), MARGE if maskable else SOL)
    d = ImageDraw.Draw(img)
    zone = 0.62 if maskable else 1.0  # la zone « sûre » des icônes maskables
    off = (1 - zone) / 2 * t
    z = t * zone
    if maskable:
        d.rectangle([off, off, off + z, off + z], fill=SOL)

    def p(x, y):
        return (off + x * z, off + y * z)

    chemin = [p(0.5, 1.0), p(0.5, 0.5), p(1.0, 0.5)]
    for largeur, couleur in ((0.30, REBORD), (0.20, FOND)):
        w = int(largeur * z)
        d.line(chemin, fill=couleur, width=w, joint="curve")
        # carré de raccord au centre pour un coude net
        cx, cy = p(0.5, 0.5)
        d.rectangle([cx - w / 2, cy - w / 2, cx + w / 2, cy + w / 2], fill=couleur)
    return img.resize((taille, taille), Image.LANCZOS)


os.makedirs("public/icons", exist_ok=True)
icone(192, False).save("public/icons/icon-192.png")
icone(512, False).save("public/icons/icon-512.png")
icone(512, True).save("public/icons/icon-maskable-512.png")
print("Icônes générées dans public/icons/")
