"""Genereer de drie PNG-appiconen zonder externe dependencies."""

from pathlib import Path
import struct
import zlib


ACHTERGROND = (17, 20, 24)
KAART = (28, 33, 40)
ACCENT = (63, 185, 80)
UITVOER = Path(__file__).resolve().parents[1] / "app"


def teken_afgeronde_rechthoek(canvas, breedte, x0, y0, x1, y1, radius, kleur):
    x0, y0, x1, y1, radius = [round(waarde * breedte) for waarde in (x0, y0, x1, y1, radius)]
    for y in range(y0, y1):
        nabij_y = min(max(y, y0 + radius), y1 - radius - 1)
        for x in range(x0, x1):
            nabij_x = min(max(x, x0 + radius), x1 - radius - 1)
            if (x - nabij_x) ** 2 + (y - nabij_y) ** 2 <= radius ** 2:
                positie = (y * breedte + x) * 3
                canvas[positie:positie + 3] = bytes(kleur)


def teken_cirkel(canvas, breedte, midden_x, midden_y, radius, kleur):
    midden_x, midden_y, radius = [round(waarde * breedte) for waarde in (midden_x, midden_y, radius)]
    for y in range(midden_y - radius, midden_y + radius):
        for x in range(midden_x - radius, midden_x + radius):
            if (x - midden_x) ** 2 + (y - midden_y) ** 2 <= radius ** 2:
                positie = (y * breedte + x) * 3
                canvas[positie:positie + 3] = bytes(kleur)


def verklein(canvas, bron_breedte, doel_breedte, factor):
    uitvoer = bytearray(doel_breedte * doel_breedte * 3)
    deler = factor * factor
    for doel_y in range(doel_breedte):
        for doel_x in range(doel_breedte):
            som = [0, 0, 0]
            for offset_y in range(factor):
                bron_y = doel_y * factor + offset_y
                for offset_x in range(factor):
                    bron_x = doel_x * factor + offset_x
                    positie = (bron_y * bron_breedte + bron_x) * 3
                    som[0] += canvas[positie]
                    som[1] += canvas[positie + 1]
                    som[2] += canvas[positie + 2]
            doel = (doel_y * doel_breedte + doel_x) * 3
            uitvoer[doel:doel + 3] = bytes(kanaal // deler for kanaal in som)
    return uitvoer


def png_blok(soort, gegevens):
    return struct.pack(">I", len(gegevens)) + soort + gegevens + struct.pack(">I", zlib.crc32(soort + gegevens))


def schrijf_png(pad, breedte, pixels):
    scanregels = b"".join(
        b"\x00" + bytes(pixels[y * breedte * 3:(y + 1) * breedte * 3])
        for y in range(breedte)
    )
    inhoud = b"\x89PNG\r\n\x1a\n"
    inhoud += png_blok(b"IHDR", struct.pack(">IIBBBBB", breedte, breedte, 8, 2, 0, 0, 0))
    inhoud += png_blok(b"IDAT", zlib.compress(scanregels, 9))
    inhoud += png_blok(b"IEND", b"")
    pad.write_bytes(inhoud)


def maak_icoon(bestandsnaam, formaat):
    factor = 4
    breedte = formaat * factor
    canvas = bytearray(bytes(ACHTERGROND) * breedte * breedte)
    teken_cirkel(canvas, breedte, 0.5, 0.5, 0.41, KAART)
    teken_afgeronde_rechthoek(canvas, breedte, 0.22, 0.465, 0.78, 0.535, 0.025, ACCENT)
    teken_afgeronde_rechthoek(canvas, breedte, 0.235, 0.39, 0.315, 0.61, 0.025, ACCENT)
    teken_afgeronde_rechthoek(canvas, breedte, 0.135, 0.30, 0.25, 0.70, 0.035, ACCENT)
    teken_afgeronde_rechthoek(canvas, breedte, 0.685, 0.39, 0.765, 0.61, 0.025, ACCENT)
    teken_afgeronde_rechthoek(canvas, breedte, 0.75, 0.30, 0.865, 0.70, 0.035, ACCENT)
    schrijf_png(UITVOER / bestandsnaam, formaat, verklein(canvas, breedte, formaat, factor))


if __name__ == "__main__":
    maak_icoon("icon-512.png", 512)
    maak_icoon("icon-192.png", 192)
    maak_icoon("apple-touch-icon.png", 180)
