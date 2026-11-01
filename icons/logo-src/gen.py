# Vlastní kresba loga: Lumi + karta (3 varianty). Spuštění: python3 gen.py
RED = '#FF2D4A'
CIRC = [(-40, -10, 44), (14, -24, 50), (50, 14, 40), (-30, 28, 38), (10, 30, 42), (0, 4, 48)]
def lumi(x, y, s=1.0, rot=0, flat=False, halo=0):
    body = ''.join(f'<circle cx="{cx}" cy="{cy}" r="{r}"/>' for cx, cy, r in CIRC)
    ring = ''.join(f'<circle cx="{cx}" cy="{cy}" r="{r + halo}"/>' for cx, cy, r in CIRC) if halo else ''
    if flat:
        body = f'<g clip-path="url(#flat)">{body}<rect x="-62" y="0" width="122" height="60" rx="18"/></g>'
    eyes = ('<ellipse cx="12" cy="-20" rx="7.5" ry="13.5" transform="rotate(-14 12 -20)" fill="#fff"/>'
            '<ellipse cx="38" cy="-13" rx="7.5" ry="13.5" transform="rotate(-14 38 -13)" fill="#fff"/>')
    return f'<g transform="translate({x} {y}) rotate({rot}) scale({s})"><g fill="#000">{ring}</g><g fill="{RED}">{body}</g>{eyes}</g>'
SPADE = 'M0,-62 C18,-34 62,-12 62,16 C62,40 36,50 12,36 C14,52 22,64 32,70 L-32,70 C-22,64 -14,52 -12,36 C-36,50 -62,40 -62,16 C-62,-12 -18,-34 0,-62 Z'
def ace(x, y, w, h, rot=0):
    r = w * 0.15
    return (f'<g transform="rotate({rot} {x + w/2} {y + h/2})"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="#fff"/>'
            f'<text x="{x + w*0.11}" y="{y + h*0.25}" font-family="Helvetica, Arial, sans-serif" font-size="{h*0.22}" font-weight="700" fill="#111">A</text>'
            f'<path d="{SPADE}" fill="#111" transform="translate({x + w*0.5} {y + h*0.58}) scale({w/290})"/></g>')
def back(x, y, w, h, rot=0):
    r = w * 0.15; i = w * 0.06
    return (f'<g transform="rotate({rot} {x + w/2} {y + h/2})"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="#fff"/>'
            f'<rect x="{x+i}" y="{y+i}" width="{w-2*i}" height="{h-2*i}" rx="{r-i}" fill="url(#hatch)"/>'
            f'<rect x="{x+i}" y="{y+i}" width="{w-2*i}" height="{h-2*i}" rx="{r-i}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="3"/></g>')
DEFS = ('<defs><pattern id="hatch" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
        '<rect width="18" height="18" fill="#d63a3a"/><rect width="3.5" height="18" fill="rgba(255,255,255,.16)"/><rect width="18" height="3.5" fill="rgba(255,255,255,.16)"/></pattern>'
        '<clipPath id="flat"><rect x="-120" y="-120" width="240" height="160"/></clipPath></defs>')
paw = lambda x, y, r=15: f'<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{r*0.85}" fill="{RED}"/>'
leg = lambda x, y, h=44: f'<rect x="{x-12}" y="{y}" width="24" height="{h}" rx="12" fill="{RED}"/>'
def svg(inner): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">{DEFS}<rect width="512" height="512" fill="#000"/>{inner}</svg>'
A = svg(lumi(256, 186, 1.55) + ace(160, 214, 192, 248) + paw(210, 216) + paw(302, 216))
B = svg(lumi(252, 226, 2.15) + ace(186, 228, 150, 202, 10) + paw(192, 330, 22) + paw(330, 356, 22))
C = svg(back(160, 226, 192, 248) + lumi(254, 178, 1.4, halo=6) + paw(214, 236, 15) + paw(300, 240, 15))
for n, s in [('A', A), ('B', B), ('C', C)]: open(f'logo-{n}.svg', 'w').write(s)
