# Qiyaam Finder UAE

A free static web app built from your spreadsheet data.

## What it includes

- Map view with markers
- Search and filtering
- GPS / "Use my location"
- Distance sorting
- Direct Google Maps links
- Local geocode cache in the browser

## Files

- `index.html`
- `styles.css`
- `app.js`
- `data/mosques.json`

## How to run

Because the app fetches JSON, do not open `index.html` directly by double-clicking it.

Run a tiny local server instead.

### Option 1: Python
From this folder:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

### Option 2: VS Code Live Server
Open the folder in VS Code and run Live Server.

## How geocoding works

Your spreadsheet mainly contains Google Maps short links, not latitude/longitude pairs.

So this app geocodes each mosque on first load using OpenStreetMap / Nominatim, then stores the coordinates in browser localStorage for faster future loads.

For a small private/community dataset this is fine. If you scale this up heavily, switch to a dedicated geocoding service or pre-fill coordinates.

## How to update the data

Edit `data/mosques.json` or send me a new spreadsheet and I can regenerate it.

Each item looks like this:

```json
{
  "id": 1,
  "name": "Mudon Mosque",
  "area": "Mudon",
  "qiyaamTime": "12:00 AM",
  "qiyaamMinutes": 0,
  "mapsLink": "https://share.google/l0OVkZxjrR46RDYXv",
  "details": "",
  "emirate": "Dubai",
  "ladiesSection": false,
  "timestamp": "2026-03-09T07:54:20.638000"
}
```

## Free hosting options

- GitHub Pages
- Netlify
- Vercel

This app is static, so hosting can be free.
