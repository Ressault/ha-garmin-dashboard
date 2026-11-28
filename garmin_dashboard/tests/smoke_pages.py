"""
Test « chaque page s'ouvre » (à lancer avant l'envoi d'une version).

    python tests/smoke_pages.py http://127.0.0.1:4173

Ouvre les 10 écrans en 390 × 844, en clair et en sombre, et échoue si une page lève une erreur JavaScript,
déborde en largeur, n'a pas de titre principal, ou n'affiche pas l'état d'erreur commun quand l'API est coupée.
Nécessite Playwright (pip install playwright ; playwright install chromium) et une appli en marche.
"""

import sys

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4173"
PAGES = [("synthese", "#/"), ("piliers", "#/longevite"), ("sommeil", "#/sommeil"), ("forme", "#/forme"),
         ("activites", "#/activite"), ("progres", "#/progres"), ("entrainement", "#/entrainement"),
         ("records", "#/records"), ("programme", "#/plan")]
problems: list[str] = []


def check(pg, name, theme):
    errors: list[str] = []
    pg.on("pageerror", lambda e: errors.append(str(e)[:160]))
    return errors


with sync_playwright() as p:
    browser = p.chromium.launch()
    for theme in ("light", "dark"):
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, color_scheme=theme)
        pg = ctx.new_page()
        errors: list[str] = []
        pg.on("pageerror", lambda e: errors.append(str(e)[:160]))
        detail = None
        for name, h in PAGES + [("detail", None)]:
            if name == "detail":
                if not detail:
                    continue
                h = detail
            errors.clear()
            pg.goto(f"{BASE}/{h}")
            pg.wait_for_timeout(2500)
            if name == "activites":
                detail = pg.evaluate("document.querySelector('a[href*=\"#/activity/\"]')?.getAttribute('href')")
            m = pg.evaluate("""() => ({
                overflow: document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth,
                h1: document.querySelectorAll('main[data-role=in] h1').length,
                text: document.querySelector('main[data-role=in]')?.innerText.length ?? 0,
                failed: !!document.querySelector('main[data-role=in] [role=alert]'),
            })""")
            tag = f"{name} ({theme})"
            if errors:
                problems.append(f"{tag} : erreur JavaScript : {errors[0]}")
            if m["overflow"] > 1:
                problems.append(f"{tag} : déborde de {m['overflow']} px en largeur")
            if m["h1"] != 1:
                problems.append(f"{tag} : {m['h1']} titre(s) principal(aux) au lieu d'un")
            if m["text"] < 200:
                problems.append(f"{tag} : page presque vide ({m['text']} caractères)")
            if m["failed"]:
                problems.append(f"{tag} : état d'erreur affiché alors que l'API répond")
        ctx.close()

    # API coupée : chaque page doit le dire et proposer de réessayer, jamais afficher des zéros
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    pg.route("**/api/**", lambda r: r.abort())
    for name, h in PAGES:
        pg.goto(f"{BASE}/{h}")
        pg.wait_for_timeout(1800)
        txt = pg.evaluate("document.querySelector('main[data-role=in]')?.innerText ?? ''")
        if "Réessayer" not in txt:
            problems.append(f"{name} (API coupée) : pas de bouton « Réessayer »")
        for zero in ("0 min", "0,0 km", "0 activité"):
            if zero in txt:
                problems.append(f"{name} (API coupée) : affiche « {zero} » pour une donnée absente")
    ctx.close()
    browser.close()

if problems:
    print("\n".join(problems))
    sys.exit(1)
print(f"OK : {len(PAGES) + 1} pages × 2 thèmes, et {len(PAGES)} pages avec l'API coupée.")
