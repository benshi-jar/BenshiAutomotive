# Walkaround (working name)

A used BMW listing checker for US buyers. Paste a listing link or VIN and get the engine, its known weak points, open recalls, questions for the seller, and a buy, negotiate, or walk verdict. BMW comes first, other makes follow.

## Status

Landing page only, built to test demand before the real tool is written.

- `index.html` is the home page. `styles.css` and `site.js` are shared by every page.
- `check.html` and `checker.js` are the free checker. It runs in the browser and uses two small server functions in `api/`: `api/vin.js` decodes a VIN and `api/recalls.js` looks up recalls, both through NHTSA's free public services. Vercel runs anything in `api/` automatically.
- `listing-parse.js` reads text a buyer copied from a listing page and picks out the VIN, mileage, asking price, year and model, so they can paste instead of typing. It only reads the pasted text and fetches nothing. Its tests run with `node tests/listing-parse.test.js`.
- `data/models.json` says which engine each model and model year has. It was cross-checked against Wikipedia engine pages on 2026-11-20 (see its `checked` note for what that did and did not confirm). When a VIN decodes, the checker also compares the engine size and cylinder count from the VIN to break ties and flag disagreements.
- `engines/` holds one guide page per BMW engine. They are generated from `data/engines.json` by `build.py`.
- To change a guide, edit `data/engines.json`, run `python3 build.py`, and commit the result. Deploying needs no build step.
- The waitlist form sends signups to a Formspree form, which emails them to the owner.
- The name, the $7 price, the repair cost ranges and the Trending rows are placeholders.
- The recalls in the sample report are real NHTSA records for the 2013 BMW 335i.

## Run it

Open `index.html` in a browser, or deploy the repo to any static host such as Vercel or GitHub Pages.
