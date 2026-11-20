#!/usr/bin/env python3
"""Generate the engine guide pages from data/engines.json.

Run `python3 build.py` after editing the data, then commit the generated
files in engines/ and sitemap.xml. The site itself has no build step.
"""
import html
import json
from pathlib import Path

SITE = "https://benshiautomotive.vercel.app"
FORM = "https://formspree.io/f/myeweqok"
ROOT = Path(__file__).parent
esc = html.escape


def risk_class(risk):
    r = risk.lower()
    if r.startswith("low"):
        return "live"
    if r.startswith("medium"):
        return "mid"
    return "bad"


def money(cost):
    if not cost:
        return "Get a quote"
    low, high = cost
    if low == 0 and high == 0:
        return "Free at a dealer"
    if low and high:
        return f"${low:,} to ${high:,}"
    if low:
        return f"${low:,} and up"
    return f"up to ${high:,}"


def page(title, description, path, body):
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<link rel="canonical" href="{SITE}{path}">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<div class="aurora" aria-hidden="true"><b></b><b></b><b></b></div>

<header>
  <div class="wrap">
    <div class="nav">
      <a class="brand" href="/">walk<span class="grad-text">around</span></a>
      <nav aria-label="Sections">
        <a href="/check">Check a car</a>
        <a href="/engines">Engine guides</a>
        <a href="/#faq">FAQ</a>
      </nav>
      <a class="btn small" href="/check">Check a car</a>
    </div>
  </div>
</header>

<main>
{body}
<section id="waitlist">
  <div class="wrap">
    <div class="card cta">
      <h2>Checking a specific car? <span class="grad-text">Run it free</span></h2>
      <p class="sub">The <a href="/check">Walkaround checker</a> takes the VIN or year and model, the mileage and the asking price, and tells you what is due, which recalls apply, and what to offer. Free while in beta. Leave your email to hear when we add more makes.</p>
      <p><a class="btn" href="/check">Check a car</a></p>
      <form class="join" id="join-form" action="{FORM}" method="POST">
        <input id="join-email" name="email" type="email" aria-label="Email address" placeholder="you@example.com" autocomplete="email" required>
        <input class="trap" type="text" name="_gotcha" tabindex="-1" autocomplete="off" aria-hidden="true">
        <input type="hidden" name="source" value="engine-guide{esc(path)}">
        <button class="btn" type="submit">Join the waitlist</button>
      </form>
      <p class="status" id="join-status" role="status"></p>
    </div>
  </div>
</section>
</main>

<footer>
  <div class="wrap">
    <p class="fine">Walkaround is independent and is not affiliated with, sponsored by, or endorsed by BMW AG. These guides are general information and do not replace an inspection by a qualified mechanic. Repair costs are estimates quoted from the linked sources and vary by shop and region.</p>
  </div>
</footer>

<script src="/site.js" defer></script>
</body>
</html>
"""


def engine_page(e, engines):
    code = e["code"]
    rows = []
    for p in e["problems"]:
        dot = "dot red" if p["severity"] in ("high", "critical") else "dot"
        meta = f"Usually {p['typical_miles']} miles" if p.get("typical_miles") else ""
        note = f" {esc(p['note'])}" if p.get("note") else ""
        meta_html = f'<div class="meta">{esc(meta)}</div>' if meta else ""
        rows.append(
            f'          <div class="item"><span class="{dot}"></span><div class="what"><strong>{esc(p["name"])}</strong>'
            f'<p>{esc(p["what_happens"])}{note}</p>{meta_html}</div><span class="cost">{money(p.get("shop_cost_usd"))}</span></div>'
        )
    models = "".join(f'<span class="chip">{esc(m)}</span>' for m in e["us_models"])
    asks = [f"Do you have a receipt for the {p['name'].lower()}?" for p in e["problems"] if p["severity"] in ("high", "critical")][:3]
    asks += ["How often was the oil changed, and where?", "Can I take it to an independent BMW shop for an inspection before I buy?"]
    ask_html = "".join(f"<li>{esc(a)}</li>" for a in asks)
    extra = ""
    if e.get("also_reported"):
        extra += "<p>Owners also report: " + esc(", ".join(x.lower() for x in e["also_reported"])) + ".</p>"
    if e.get("buyer_note"):
        extra += f"<p>{esc(e['buyer_note'])}</p>"
    sources = [e["source"]] + e.get("extra_sources", [])
    src_html = ", ".join(f'<a href="{esc(s)}" rel="nofollow noopener">{esc(s.split("/")[2])}</a>' for s in sources)
    others = "".join(
        f'<a class="tile" href="/engines/{o["code"].lower()}"><div class="top"><span class="name">{esc(o["code"])}</span>'
        f'<span class="pill {risk_class(o["risk"])}">{esc(o["risk"].split(",")[0].split(" for ")[0].split(" before ")[0].split(" without ")[0])} risk</span></div><p>{esc(o["desc"])}</p></a>'
        for o in engines if o["code"] != code
    )
    body = f"""<section class="guide">
  <div class="wrap">
    <p class="crumbs"><a href="/engines">Engine guides</a> / {esc(code)}</p>
    <h1>BMW {esc(code)} problems: <span class="grad-text">what breaks and what it costs</span></h1>
    <div class="card summary">
      <div class="row"><span class="pill big {risk_class(e['risk'])}">Buyer risk: {esc(e['risk'])}</span><span class="chip">{esc(e['desc'])}</span><span class="chip">Built <b>{esc(e['years'])}</b></span></div>
      <p>{esc(e['verdict'])}</p>
    </div>

    <h2>Which cars have the {esc(code)}</h2>
    <div class="chips">{models}</div>

    <h2>Known weak points</h2>
    <div class="card report">
      <div class="group">
        <div class="items">
{chr(10).join(rows)}
        </div>
      </div>
    </div>
    <div class="prose">{extra}<p>Prices are what a repair shop typically charges, as quoted by the source below. "Get a quote" means the source gave no figure.</p></div>

    <h2>Ask the seller</h2>
    <ul class="ask">{ask_html}</ul>

    <div class="prose"><p>Source: {src_html}. Compiled {esc(DATA['compiled'])}.</p></div>

    <h2>Other engines</h2>
    <div class="guide-list">{others}</div>
  </div>
</section>
"""
    title = f"BMW {code} problems: what breaks and what it costs | Walkaround"
    desc = f"Known weak points of the BMW {code} engine ({e['desc']}), typical mileage, repair costs, and what to ask the seller before buying."
    return page(title, desc, f"/engines/{code.lower()}", body)


def index_page(engines):
    tiles = "".join(
        f'<a class="tile" href="/engines/{e["code"].lower()}"><div class="top"><span class="name">BMW {esc(e["code"])}</span>'
        f'<span class="pill {risk_class(e["risk"])}">{esc(e["risk"].split(",")[0].split(" for ")[0].split(" before ")[0].split(" without ")[0])} risk</span></div>'
        f'<p>{esc(e["desc"])}. {esc(e["verdict"])}</p></a>'
        for e in engines
    )
    body = f"""<section class="guide">
  <div class="wrap">
    <span class="eyebrow">Engine guides</span>
    <h1>The engine matters more than <span class="grad-text">the badge</span></h1>
    <p class="sub">Two used BMWs can look identical and cost very different amounts to own. Pick the engine in the car you are looking at to see what usually breaks, when, and what it costs.</p>
    <div class="guide-list">{tiles}</div>
  </div>
</section>
"""
    return page(
        "BMW engine guides: problems and repair costs | Walkaround",
        "Plain-English guides to common BMW engines: known problems, typical mileage, repair costs, and how risky each one is to buy used.",
        "/engines",
        body,
    )


DATA = json.loads((ROOT / "data" / "engines.json").read_text())


def main():
    engines = DATA["engines"]
    out = ROOT / "engines"
    out.mkdir(exist_ok=True)
    (out / "index.html").write_text(index_page(engines))
    urls = ["/", "/check", "/engines"]
    for e in engines:
        (out / f"{e['code'].lower()}.html").write_text(engine_page(e, engines))
        urls.append(f"/engines/{e['code'].lower()}")
    sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    sitemap += "".join(f"  <url><loc>{SITE}{u}</loc></url>\n" for u in urls) + "</urlset>\n"
    (ROOT / "sitemap.xml").write_text(sitemap)
    (ROOT / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {SITE}/sitemap.xml\n")
    print(f"Wrote {len(engines)} engine pages, the index, sitemap.xml and robots.txt")


if __name__ == "__main__":
    main()
