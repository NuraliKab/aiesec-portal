# AIESEC Global Opportunities Portal

A small website that lets students search every AIESEC volunteer project in one place, instead of scrolling through a giant Google Sheet.

## What This Project Is

AIESEC keeps its volunteer projects in one big Google Sheet with 20+ tabs, one tab per partner city. Every tab is laid out a little differently, the prices and dates are typed by hand, and there is no way to search all cities at once (for example "show me every project under 80 EUR with free housing").

This portal fixes that. A Python script reads all the tabs and turns them into one clean JSON file, and a React website shows that file as cards you can search, filter and sort.

## How It Works (Architecture)

```text
 Google Sheet (20+ tabs)
        |
        |  downloaded as one .xlsx file
        v
 scripts/etl_parser.py          <-- checked by tests/test_etl_parser.py
        |
        |  cleans every row and saves one list
        v
 frontend/src/data/projects.json
        |
        |  imported when the website is built
        v
 React + TypeScript website     (frontend/src/App.tsx)
```

The website never talks to Google. A GitHub Action runs the Python script every 6 hours and commits `projects.json` whenever the sheet has changed, so the page loads instantly and always has recent data.

| Part | Built with |
| --- | --- |
| Data script | Python, `requests`, `openpyxl` |
| Tests | `pytest` (51 test cases) |
| Website | React, TypeScript, Vite |
| Automation | GitHub Actions |

## Key Engineering Challenges Solved

- **Messy fees and durations.** People type `75 EUR`, `104,20€`, `57$`, `6/4 weeks` or `13 Jul - 24 Aug`. Small helper functions turn these into plain numbers (`75.0`, `104.2`, `57.0`, `6`, `6`) and remember the currency, so the website can sort by price and filter by length.
- **Broken and hidden links.** Google wraps pasted links in a redirect (`google.com/url?q=...`), and some cells show a title like `Booklet.pdf` with the real link hidden behind it. The script unwraps the redirect and reads the hidden link from the cell.
- **Stopping before private rows.** Under each project table the sheet has notes about students who already went abroad. The script stops reading as soon as it reaches that section, so none of it ends up on the website.
- **Fast filtering in the browser.** All projects are loaded once, and one `useMemo` block filters and sorts them only when a filter changes. There is no server and no loading spinner.

## How to Run Locally

You need Python 3.11+ and Node.js 20+.

**1. Set up Python (only the first time)**

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**2. Run the script that builds `projects.json`**

```bash
python3 scripts/etl_parser.py
```

No internet? Use the backup copy of the sheet that is saved in the repo:

```bash
python3 scripts/etl_parser.py "data/raw/IR Tool 26.2.xlsx"
```

**3. Run the tests**

```bash
PYTHONPATH=. pytest tests/
```

**4. Start the website**

```bash
cd frontend
npm install
npm run dev
```

Then open the link from the terminal (usually http://localhost:5173).

**5. Check the frontend before committing**

```bash
cd frontend
npx tsc -b
npm run build
```

## Project Structure

```text
aiesec-portal/
├── scripts/etl_parser.py          # downloads the sheet and writes projects.json
├── tests/test_etl_parser.py       # tests for the cleaning functions
├── requirements.txt               # Python packages
├── data/raw/                      # backup copy of the sheet for offline runs
├── .github/workflows/             # runs the tests and the script every 6 hours
└── frontend/
    └── src/
        ├── App.tsx                # the whole page: filters and project cards
        ├── App.css                # styles for the page
        ├── types/project.ts       # what one project looks like in TypeScript
        └── data/projects.json     # made by the Python script, don't edit by hand
```

## Future Roadmap (v2.0)

Version 1 keeps everything in one static `projects.json` file. That is simple and fast, but the data is only as fresh as the last sync, and nothing can be saved (no favourites, no accounts).

The plan for v2.0:

- **FastAPI backend** that serves the projects from an API instead of a file.
- **PostgreSQL database** with two tables: `partner_lcs` (one row per partner city) and `projects`. One partner city has many projects (a 1-to-many relationship), so each project stores the id of its city.
- The Python script stays, but it writes to the database instead of to a JSON file.

`docker-compose.yml` already starts a local PostgreSQL for this work. Version 1 does not use it.
