# Chrome Web Store listing

Text and answers for publishing the extension. Publishing needs a Chrome Web Store developer account (one-time $5 fee) at https://chrome.google.com/webstore/devconsole.

## Name
Walkaround: used BMW checker

## Summary (132 characters max)
See what a used BMW is due for, open recalls and a fair opening offer, right on the listing page.

## Description
Shopping for a used BMW? Walkaround reads the listing you are already looking at and shows, in a small panel:

- which engine the car has, matched from the VIN
- the known problems that are due at its mileage, with typical shop costs
- serious weak points to get proof of before you buy (like the N20 timing chain)
- open safety recalls for the model year, from NHTSA
- an opening offer: the asking price minus the work that is due without receipts

One click opens the full report with a message to send the seller and what to say in person.

Works on CarGurus, Cars.com, Autotrader, CarMax, Carvana, TrueCar, Facebook Marketplace and Craigslist. Covers the ten most common BMW engines from about 2006 on. Free while in beta.

Walkaround is a research tool, not a mechanic. Always get a pre-purchase inspection. Not affiliated with BMW AG or any listing site.

## Category
Shopping

## Single purpose
Show a short used-BMW buying report (known problems, recalls and an opening offer) on car listing pages.

## Permission justifications
- Host permission for benshiautomotive.vercel.app: the extension sends the car's VIN, year, model, mileage and asking price there to build the report.
- Content scripts on cargurus.com, cars.com, autotrader.com, carmax.com, carvana.com, truecar.com, facebook.com and craigslist.org: to find the car details on listing pages and show the panel. The script does nothing on other pages of those sites.

## Data use answers
- Collects: no personally identifiable information, no health, financial, authentication, personal communications, location, web history or user activity data.
- Website content: the extension reads the listing page locally and sends only the VIN, year, model, mileage and asking price.
- Not sold, not used for purposes unrelated to the single purpose, not used for creditworthiness or lending.

## Privacy policy URL
https://benshiautomotive.vercel.app/privacy

## Screenshots
1280x800 screenshots of the panel on a listing page, and of the full report.
