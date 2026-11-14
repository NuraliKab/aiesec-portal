# Project Guide

My own study notes for this repository. It explains every file in plain English, so I can answer any question about the code in an interview.

**How to use it:** open the file being explained next to this guide and read both side by side. The comments in the code use the same "phase" numbers as this guide.

Contents:

1. [The Big Picture](#1-the-big-picture)
2. [File-by-File Walkthrough](#2-file-by-file-walkthrough)
3. [Top 10 Interview Questions](#3-top-10-interview-questions--simple-answers)
4. [Honest Notes Before an Interview](#4-honest-notes-before-an-interview)

---

## 1. The Big Picture

### The story in five steps

1. AIESEC people type volunteer projects into a **Google Sheet**. It has 20+ tabs, one per partner city.
2. A **Python script** (`scripts/etl_parser.py`) downloads the whole sheet as one Excel file.
3. The script walks through every tab, finds the project table, cleans each row and puts everything into **one list**.
4. It saves that list as **`frontend/src/data/projects.json`**.
5. The **React website** (`frontend/src/App.tsx`) imports that JSON file and shows the projects as cards with search, filters and sorting.

"ETL" in the script name means **E**xtract (download the sheet), **T**ransform (clean the rows), **L**oad (save the JSON). It is just the usual name for this kind of script.

### How the files connect

```text
                    Google Sheet
                         |
                         v
   requirements.txt --> scripts/etl_parser.py <-- tests/test_etl_parser.py
   (packages it needs)   |                        (checks the cleaning functions)
                         v
          frontend/src/data/projects.json
                         |
                         v
   frontend/src/types/project.ts --> frontend/src/App.tsx <-- frontend/src/App.css
   (the shape of one project)        (the page)               (how the page looks)
                                          ^
                                          |
                             frontend/src/main.tsx  <-- frontend/index.html
                             (puts App on the page)     (the empty page the browser opens)

   .github/workflows/ci_and_sync.yml  runs the tests and the script every 6 hours
```

| File | What it does | Who uses it |
| --- | --- | --- |
| `scripts/etl_parser.py` | Downloads the sheet, cleans it, writes `projects.json` | Me, and GitHub Actions |
| `tests/test_etl_parser.py` | 51 small checks for the cleaning functions | `pytest` |
| `requirements.txt` | List of Python packages to install | `pip` |
| `data/raw/IR Tool 26.2.xlsx` | A saved copy of the sheet, for working offline | The script, when I pass the path |
| `frontend/src/data/projects.json` | The clean list of projects | `App.tsx` |
| `frontend/src/types/project.ts` | Tells TypeScript which fields a project has | `App.tsx` |
| `frontend/src/App.tsx` | The whole page: filters and cards | `main.tsx` |
| `frontend/src/App.css` | Colors, spacing, layout | `App.tsx` |
| `.github/workflows/ci_and_sync.yml` | Runs everything automatically | GitHub |
| `docker-compose.yml` | Starts a PostgreSQL database for v2.0. **Not used yet** | Nobody yet |

**The one sentence to remember:** the two halves only meet at `projects.json`. Python writes it, React reads it, and `project.ts` describes what is inside.

---

## 2. File-by-File Walkthrough

## 2.1 `scripts/etl_parser.py`

The file has four parts, from top to bottom: imports, settings, helper functions, and `main()`.

### Imports

| Import | Why I need it |
| --- | --- |
| `io` | `io.BytesIO` lets me treat downloaded bytes like a file, so I never save the `.xlsx` to disk |
| `json` | To write the final list as JSON |
| `os` | To build file paths and create the output folder |
| `re` | Regular expressions, for finding numbers and links inside messy text |
| `sys` | `sys.argv` reads the optional file path from the command line, `sys.exit(1)` stops with an error |
| `datetime` | `date` to count days between two dates, `datetime` to spot Excel date cells |
| `urllib.parse` | To take a Google redirect link apart |
| `openpyxl` | The library that reads Excel files |
| `requests` | The library that downloads things from the internet |

### Settings at the top

- **`SHEET_ID`, `EXPORT_URL`**: the Google Sheet and the special link that downloads it as `.xlsx`. Any public Google Sheet can be exported like this.
- **`REPO_ROOT`, `OUTPUT_PATH`**: where to save the JSON. `__file__` is the path of the script itself, and I go two folders up from it to find the repo root. This way the script works no matter which folder I run it from.
- **`HEADER_FIXES`**: a few tabs spell a column name differently (`ACCOMODATION` with one M, `TIMELINE OPEN`). I rename them so every project has the same field names.
- **`SDG_MAP`**: every AIESEC project brand belongs to one UN goal ("Global Classroom" is goal 4, Quality Education). Used when the SDG cell is empty.
- **`MONTHS`**: turns `"JUL"` into `7`.
- **`NO_WORDS`, `NO_PHRASES`**: ways people write "no" in the housing column.

### Helper functions

All of these take one raw cell value and return a clean value. They never touch files or the internet. That is why they are easy to test: give an input, check the output.

#### `clean_text(value)`

`"Opportunity\nLink "` becomes `"OPPORTUNITY LINK"`.

Cells often have line breaks and double spaces. `str(value).split()` cuts the text at every kind of gap (spaces, tabs, line breaks), `" ".join(...)` glues the pieces back with single spaces, and `.upper()` makes it capital letters. After this, comparing two texts is safe.

#### `clean_url(raw_url)`

Returns a real link, or `None` if the cell has no link.

1. If the text contains `google.com/url`, it is a Google redirect like `https://www.google.com/url?q=https://aiesec.org/...&sa=D`. `urlparse` splits the link into parts, `parse_qs` turns the part after `?` into a dictionary, and I take the `q` value. That is the real link.
2. Then a regex picks the link out of the text.

The regex is `(https?://[^\s)\"'>]+)`:

| Piece | Meaning |
| --- | --- |
| `http` | the letters "http" |
| `s?` | an optional "s", so both `http` and `https` work |
| `://` | exactly these three characters |
| `[^\s)\"'>]` | one character that is **not** a space, `)`, `"`, `'` or `>`. The `^` inside `[ ]` means "not" |
| `+` | one or more of those characters |
| `( )` | save what was found, so I can read it with `match.group(1)` |

In words: start at `http://` or `https://` and keep going until a space or a closing bracket or quote. So `"see https://x.org/a for photos"` gives `https://x.org/a`, and `"Booklet.pdf"` gives `None`.

#### `clean_fee(raw_fee)`

`"75 EUR"` → `75.0`, `"104,20€"` → `104.2`, `"190-450$"` → `190.0`, `"no"` → `None`.

The regex is `(\d+(?:[.,]\d+)?)`:

| Piece | Meaning |
| --- | --- |
| `\d+` | one or more digits: `104` |
| `(?: ... )?` | an **optional** group. `?:` means "group these pieces but don't save them on their own" |
| `[.,]` | one dot or one comma |
| `\d+` | the digits after it: `20` |
| outer `( )` | save the whole number: `104,20` |

`re.search` returns the **first** match, which is why `"190-450$"` gives `190` (the lowest price). After that I swap the comma for a dot, because Python only understands `104.20`, then `float()` makes it a number and `round(..., 2)` keeps two decimals.

A number cell like `104.2` goes through the same code: `str(104.2)` is the text `"104.2"`, and the regex reads it back.

`0.0` (free) and `None` (unknown) are different on purpose. A free project should be first when sorting by price. An unknown one should not.

#### `clean_currency(raw_fee)`

`"57$"` → `"USD"`, `"75 EUR"` → `"EUR"`, `104.2` → `"EUR"`, `"no"` → `None`.

`clean_fee` keeps the number and throws the rest away, so on its own the website can't tell 57 dollars from 57 euros. This function reads the same cell again and answers one question: which currency?

1. If `clean_fee` finds no number, there is no fee, so there is no currency either: return `None`.
2. If the text has a `$` sign or the letters `USD`, return `"USD"`.
3. Otherwise return `"EUR"`. Almost every tab is in euros, and many cells are just a number with nothing after it, so euros is the default.

No regex here. `"$" in text` is a plain "is this character somewhere in the text" check.

#### `weeks_from_text(text)`

`"6 weeks"` → `6`, `"6/4 weeks"` → `6`.

The regex is `(\d+)(?:\s*/\s*\d+)?\s*weeks?`, with `re.IGNORECASE` so capital letters don't matter:

| Piece | Meaning |
| --- | --- |
| `(\d+)` | the number I keep |
| `(?:\s*/\s*\d+)?` | optionally a slash and a second number (`/4`), which I skip. `\s*` means "any number of spaces, also zero" |
| `\s*` | optional spaces |
| `weeks?` | "week" or "weeks" |

"6/4 weeks" means the normal length is 6 weeks with a 4-week option, so the first number is the right one.

#### `weeks_from_dates(text)`

`"13 Jul - 24 Aug"` → `6`.

The regex is `(\d{1,2})\s+([a-z]{3})[a-z]*\s*[-–]\s*(\d{1,2})\s+([a-z]{3})`:

| Piece | Meaning |
| --- | --- |
| `(\d{1,2})` | the day: 1 or 2 digits |
| `\s+` | at least one space |
| `([a-z]{3})` | the first three letters of the month: `Jul` |
| `[a-z]*` | the rest of the month if it is written in full (`August` = `Aug` + `ust`) |
| `\s*[-–]\s*` | a dash (short or long) with optional spaces around it |
| `(\d{1,2})\s+([a-z]{3})` | the same again for the end date |

Then:

1. `match.groups()` gives the four saved pieces: `("13", "Jul", "24", "Aug")`.
2. `MONTHS` turns the month names into numbers.
3. I build two `date` objects. The sheet never writes the year, so I use 2001 for both. Only the gap between them matters.
4. `try / except ValueError` catches impossible dates like "31 Feb".
5. If the end is before the start (`"15 Dec - 26 Jan"`), the range crosses new year, so I move the end to 2002.
6. `(end - start).days / 7`, rounded, is the number of weeks.

#### `clean_duration(raw_duration, raw_timeline)`

Returns the length in weeks, or `None`.

It makes a list of **guesses**, best one first:

1. The cell is already a number (`6`).
2. Or: `"6 weeks"` in the DURATION cell, then a date range in the DURATION cell.
3. Last: `"6 weeks"` written in the TIMELINE cell (some tabs put it there).

Then it returns the first guess that is between 1 and 52. No volunteer project is 0 or 99 weeks long, so those are typos and get skipped.

#### `clean_bool(raw_value)`

Turns the housing cell into `True` or `False`.

- A number: more than 0 means yes.
- Text that is exactly one of `NO_WORDS` (`"NO"`, `"?"`, `"-"`, empty...) is `False`.
- Text that **starts with** the word NO or NOT is `False`. The regex is `(NO|NOT)\b`. `|` means "or", and `\b` means "the word ends here", so `"NO, find your own"` matches but `"NORMAL"` or `"NOVEMBER"` does not. `re.match` only looks at the start of the text.
- Text containing one of `NO_PHRASES` (`"provided but NOT COVERED"`) is `False`.
- Everything else is `True`, because people describe the place instead of writing yes: `"host families"`, `"dorms of the NGO"`.

Unknown counts as `False` on purpose. It is better to show "Housing: No/Unconfirmed" than to promise housing that doesn't exist.

#### `resolve_sdg(raw_sdg, project_name)`

Returns the UN goal number (1 to 17), or `None`.

1. Look for a number in the SDG cell with `\d+` (one or more digits). This handles `4`, `4.0` and `"SDG 13"`. The number must be between 1 and 17.
2. If that fails, clean the project name and check which key of `SDG_MAP` is **inside** it. `"GLOBAL CLASSROOM" in "GLOBAL CLASSROOM - TEACHING ENGLISH"` is `True`, so longer titles work too.

### `main()`

#### Phase 1: download and open the workbook

- If I gave a path on the command line (`sys.argv[1]`), open that local file. This is for working offline and for testing.
- Otherwise `requests.get(EXPORT_URL, timeout=30)` downloads the sheet. `timeout=30` means "give up after 30 seconds" so the script can't hang forever.
- If the status code is not 200 (OK), print the problem and `sys.exit(1)`. Exit code 1 means "failed", which makes the GitHub Action show a red X.
- `io.BytesIO(response.content)` wraps the downloaded bytes so `openpyxl` can read them like a file. Nothing is saved to disk.
- `data_only=True` means: for a formula cell, give me the result, not the formula.

#### Phase 2: the master list

`all_projects = []`. Every tab adds its projects to this one list.

#### Phase 3: loop through each sheet

`workbook.worksheets` is the list of tabs. For each one:

**3a: skip summary tabs.** Tabs with "CLUSTER" or "LC X" in the name are overviews and templates, not project tables.

**3b: find the header row.** The table does not start on the same row in every tab. Some have notes or a title above it. So I go down the rows, clean every cell with `clean_text`, and look for the first row that has a cell that is exactly `PROJECT` and a cell that is exactly `OPPORTUNITY LINK`. That row is the header. I save the column names (after `HEADER_FIXES`) and the position of the row, then `break` out of the loop.

**3c: no header, skip the tab.** If `header` is still `None`, this tab has no project table.

**3d: loop through the rows under the header.** `rows[header_position + 1:]` means "every row after the header". For each row:

1. **Stop at the private section.** If any cell starts with `OUR EXPERIENCES` or `CURRENT STATE`, `break`. Below that line are notes about students who already went abroad. `break` leaves the loop completely, so nothing below is ever read.
2. **Skip empty rows.** `any(texts)` is `False` when every cell is empty. `continue` jumps to the next row.
3. **Build the project dictionary.** `zip(header, row)` pairs each column name with the cell under it, like closing a zipper: `("PROJECT", cell1), ("FEE", cell2), ...`. For each pair:
   - skip columns with no name or a repeated name
   - if the value is a `datetime` (Excel date cell), turn it into text with `.isoformat()`: `"2026-03-01T00:00:00"`
   - if it is text, `.strip()` the spaces, and `or None` turns an empty text into `None`
   - **hidden links:** some editors pasted a link inside text, so the cell shows `Booklet.pdf` and the real URL is hidden behind it. `openpyxl` keeps that URL in `cell.hyperlink.target`. If the text I can see is not a link (`clean_url(value) is None`) and there is a hidden one, I use the hidden one. This is only done for the two link columns.
4. **Skip closed projects.** If TIMELINE or EXTRA INFO says "no slots now", `continue`.
5. **Keep only real projects.** A row needs a title or a link. A row with neither is a leftover note. If it has a link but no title, it gets the title "Global Volunteer Opportunity".
6. **Add the clean fields.** `ID` (tab name + real row number, so it is unique), `COUNTRY` (the tab name), and the results of the helper functions: `SDG`, `FEE_NUMERIC`, `FEE_CURRENCY`, `DURATION_WEEKS`, `ACCOMMODATION_BOOL`. The raw columns stay in the dictionary too, so the website can still show the original text.

**3e: add to the master list.** `all_projects.extend(projects)` adds all of this tab's projects, and a `print` shows how many were found.

#### Phase 4: save the JSON

- **Safety check first:** if `all_projects` is empty, something is wrong (probably the sheet layout changed). The script exits with an error and does **not** touch the old file, so the website never goes blank.
- `os.makedirs(..., exist_ok=True)` creates the folder if it is missing.
- `with open(...) as f:` opens the file and closes it automatically at the end of the block.
- `json.dump(all_projects, f, indent=2, ensure_ascii=False, default=str)`:
  - `indent=2` makes the file readable for people
  - `ensure_ascii=False` keeps letters like `ș` and flag emojis as they are
  - `default=str` is a safety net: if a value is a type JSON can't save (like a time), turn it into text instead of crashing

---

## 2.2 `frontend/src/types/project.ts`

TypeScript wants to know what is inside a project. This file is that description.

- **`RawCell`** = `string | number | null`. A raw cell is whatever someone typed: text, a number, or nothing.
- **`interface Project`** has two groups:
  - **Made or cleaned by Python**, always there: `ID`, `COUNTRY`, `PROJECT`, `"OPPORTUNITY LINK"`, `BOOKLET`, `SDG`, `FEE_NUMERIC`, `FEE_CURRENCY`, `DURATION_WEEKS`, `ACCOMMODATION_BOOL`. The website filters and sorts only by these.
  - **Copied raw from the sheet**, marked with `?` because not every tab has every column: `PROVIDER`, `MEALS`, `FEE`, `DURATION`... These are only shown as text.

Field names with a space need quotes (`"OPPORTUNITY LINK"`), and in the code they are read as `project["OPPORTUNITY LINK"]`.

Why it helps: if I mistype `project.FEE_NUMERC`, the code doesn't compile. And `number | null` forces me to handle the "unknown" case every time.

---

## 2.3 `frontend/src/App.tsx`

### Before the component

- `allProjects`: the JSON file, imported at the top. Vite puts it inside the website bundle when building, so there is no download when the page opens.
- `SDG_LABELS`: goal number → name.
- `formatTimeline`: Python saves Excel dates as `"2026-03-01T00:00:00"`. The regex `^(\d{4})-(\d{2})-(\d{2})(T00:00:00)?$` matches exactly that shape (`^` = start of text, `$` = end, `\d{4}` = four digits). If it matches, I show `1 Mar 2026`. Normal text like "from June" is returned unchanged.
- `hasMeals`, `hasTransport`: the MEALS and TRANSPORTATION columns are free text, so these read the text in three plain steps: (1) "not provided / not covered / not paid" → no, (2) a word like "meal", "yes", "provided", "covered" → yes, (3) anything else → no. For meals, a bare number like `2` also counts as yes (2 meals a day). `/\d/.test(text)` just asks "is there a digit in this text?".

### The three hooks

| Hook | What it is | In this file |
| --- | --- | --- |
| `useState` | A variable React **remembers** between renders. Calling its `set...` function makes React run `App()` again (a "re-render") | One per filter control |
| `useMemo` | Remembers the **result of a calculation**. Only recalculates when a value in its list `[...]` has changed | Building the filter options, and filter + sort |
| `useEffect` | Runs code **after** a render, when a value in its list has changed | Keeping the slider at the max fee |

### Phase 1: load the data, find the filter options

One loop over all projects collects the unique countries, SDGs and durations into `Set`s (a Set ignores duplicates) and finds the highest fee. The list at the end of this `useMemo` is `[]` (empty), so it runs **once** and never again.

`maxFeeDetected = Math.ceil(highestFee / 5) * 5` rounds the highest fee **up** to a multiple of 5. Example: 250.77 → 255. The slider moves in steps of 5, so without this it would stop at 250 and hide the 250.77 project.

### Phase 2: state

One `useState` per control: `searchText`, `country`, `sdg`, `duration`, `maxFee`, the four checkboxes, `sortBy`. `"ALL"` means "this dropdown is switched off". `openCards` is an object that remembers which cards are open, like `{ "Izmir🇹🇷_12": true }`.

### Phase 3: sync the slider, then filter and sort

**The `useEffect`** sets `maxFee` to `maxFeeDetected` whenever `maxFeeDetected` changes. (See the honest note about this in section 4.)

**The big `useMemo`** makes `visibleProjects`:

1. `.filter(...)` goes through every project and asks a list of questions. Each `if` that fails does `return false` (hide it). If none fails, `return true` (keep it).
   - search text: is it in the title, provider, description, requirements or country?
   - dropdowns: does the country / SDG / duration match?
   - **price slider:** `if (project.FEE_NUMERIC !== null && project.FEE_NUMERIC > maxFee) return false`. A project with an unknown fee stays visible.
   - checkboxes: housing uses the clean `ACCOMMODATION_BOOL`, meals and transport use the two helper functions, "Direct Apply" needs a link.
2. `.sort(...)` orders what is left. The function gets two projects `a` and `b` and returns a negative number if `a` comes first. `a.FEE_NUMERIC ?? Infinity` means "use the fee, but if it is `null` use infinity", which pushes unknown fees to the end.

The list at the end `[searchText, country, ..., sortBy]` holds every value the calculation uses. If none of them changed, React reuses the old result.

### What happens when I drag the price slider from 255 to 80

1. The browser fires `onChange` on the range input. My handler calls `setMaxFee(80)`.
2. React runs `App()` again. `maxFee` is now `80`.
3. Phase 1 `useMemo` has `[]`, so it does **not** run. Countries, SDGs and `maxFeeDetected` stay the same.
4. The `useEffect` watches `[maxFeeDetected]`, which did not change, so it does **not** run. (If it watched `maxFee`, it would push the slider back to the max every time. That is why its list matters.)
5. The big `useMemo` has `maxFee` in its list, so it **runs**: filter and sort again.
6. React updates the page: the label shows "≤ 80 EUR", the counter shows fewer projects, the cards change, and the reset button turns red and says "(1)".

This happens for every step while dragging. It feels instant because it is just a loop over a few hundred objects in memory.

### What happens when I pick a country

Same path: `onChange` on the `<select>` → `setCountry("Izmir🇹🇷")` → re-render → `country` is in the big `useMemo`'s list → filter and sort again → cards update.

Clicking the blue country badge on a card calls the same `setCountry`. Because the dropdown has `value={country}`, it updates too. That is called a **controlled input**: React's state is the single source of truth and the control just shows it.

### What happens when I open a card

`toggleCard` updates `openCards` → re-render. But `openCards` is **not** in the big `useMemo`'s list, so nothing is filtered or sorted again. Only that one card draws its extra details. This is exactly what `useMemo` is for.

`setOpenCards((previous) => ({ ...previous, [id]: !previous[id] }))` copies the old object (`...previous`) and flips one entry. I copy instead of changing the old object, because React only notices a **new** object.

### Phase 4: header and filter bar

Plain JSX. The four checkboxes are drawn with `.map()` over a small `toggles` array, because they look the same.

**Why nothing jumps while dragging the slider** (the CSS is in `App.css`):

- the slider box has a fixed width (`flex: 0 0 280px`), so it can't grow or shrink
- the "≤ 80 EUR" label has a `min-width`, so "5 EUR" and "255 EUR" take the same space
- `font-variant-numeric: tabular-nums` makes every digit the same width
- the reset button is **always** on the page. With no filters it is `disabled` and grey instead of hidden, so it never pops in and pushes things around

### Phase 5: the cards

`visibleProjects.length === 0 ? (message) : (cards)` shows a "no projects match" box, or the grid.

For each project, a few variables are prepared first (`description`, `durationLabel`, `feeLabel`, `hasMoreDetails`...), then the card is drawn:

- `feeLabel` is the clean number plus its currency, like "57 USD". `feeIcon` picks a dollar note or a euro note to match.
- `key={project.ID}` gives React a unique name for each card, so it can tell them apart when the list changes.
- `{meals && <span>...</span>}` means "draw this only if `meals` is not empty".
- `className={isOpen ? "card-description open" : "card-description clamped"}` picks a CSS class. `clamped` cuts the text after 3 lines.
- The apply link uses `target="_blank"` (new tab) with `rel="noopener noreferrer"`, which stops the new tab from controlling my page.

---

## 2.4 `frontend/src/App.css`

Normal CSS, in the same order as the page. Two things worth being able to explain:

- `.filter-grid` uses `grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))`. It means "make as many columns as fit, each at least 200px wide, and share the leftover space". That is how the filters wrap on a phone without any media query.
- `.cards` uses the same idea with 360px for the card grid.

---

## 2.5 `tests/test_etl_parser.py`

The tests check the six cleaning functions. They don't need the internet or the Excel file, so they run in under a second.

`@pytest.mark.parametrize` lets me write **one** test function and a **list** of `(input, expected)` pairs. pytest runs the function once per pair and reports each one separately:

```python
@pytest.mark.parametrize("raw_fee, expected", [("75 EUR", 75.0), ("104,20€", 104.2)])
def test_clean_fee(raw_fee, expected):
    assert clean_fee(raw_fee) == expected
```

`assert` means "this must be true, or the test fails".

| Group | Checks | Examples |
| --- | --- | --- |
| phase 1: `clean_url` | redirects are unwrapped, plain text is not a link | Google redirect, `"GC Matale.pdf"` → `None` |
| phase 2: `clean_fee` | every price format becomes a number | `"104,20€"`, `"190-450$"`, `"0 EUR"` vs `None` |
| phase 3: `clean_duration` | weeks from text, from dates, from TIMELINE | `"6/4 weeks"`, `"15 Dec - 26 Jan"`, `"99 weeks"` → `None` |
| phase 4: `clean_bool` | all the ways people write yes and no | `"host families"` → `True`, `"provided but not covered"` → `False` |
| phase 5: `resolve_sdg` | number from the cell, or guess from the name | `"SDG 13"`, `99` is ignored |
| phase 6: `clean_currency` | dollars or euros | `"57$"` → `"USD"`, a bare number → `"EUR"` |

Most inputs are copied from real cells in the sheet. Run them with `PYTHONPATH=. pytest tests/`. `PYTHONPATH=.` tells Python to look in the current folder, so `from scripts.etl_parser import ...` works.

---

## 2.6 `.github/workflows/ci_and_sync.yml`

GitHub Actions is a free computer that GitHub starts for me. This file tells it what to do.

**When it runs** (the `on:` part): on every push to `main`, every 6 hours (`cron: "0 */6 * * *"` = minute 0 of every 6th hour), and by hand from the Actions tab.

**What it does**, step by step:

1. Downloads the repository.
2. Installs Python and the packages from `requirements.txt`.
3. Runs `ruff` (a style checker) and `pytest`. **If a test fails, everything stops here.** Broken code can never update the data.
4. Runs the parser, which downloads the sheet and rewrites `projects.json`.
5. Installs Node.js and runs `npx tsc -b`, the TypeScript check. This makes sure the new JSON still fits the `Project` type.
6. `git add` the JSON. `git diff --staged --quiet` succeeds when nothing changed. The `||` means "only if that fails, do the next part", so it commits and pushes **only when the data really changed**.

`permissions: contents: write` is needed because step 6 pushes a commit.

---

## 2.7 The small files

- `requirements.txt`: the four Python packages (`requests`, `openpyxl`, `pytest`, `ruff`).
- `frontend/index.html`: an almost empty page with `<div id="root">`. `main.tsx` puts the React app inside it.
- `frontend/src/main.tsx`: three lines that start React. `StrictMode` is a development helper that warns about mistakes.
- `frontend/src/index.css`: removes the browser's default margins.
- `frontend/package.json`: the JavaScript packages and the commands `dev`, `build`, `lint`.
- `docker-compose.yml`: starts PostgreSQL. It is a head start for v2.0 and is not used by anything yet.

---

## 3. Top 10 Interview Questions & Simple Answers

These are written the way I would say them out loud. Change the words so they sound like me.

**1. Walk me through how your project works.**

"AIESEC keeps volunteer projects in a Google Sheet with more than 20 tabs, one per partner city. My Python script downloads the sheet as an Excel file, goes through each tab, finds the project table and cleans every row, for example it turns '104,20€' into the number 104.2. It saves everything as one JSON file. The React website imports that file and shows the projects as cards with search, filters and sorting. A GitHub Action runs the script every six hours, so the data stays fresh without me doing anything."

**2. What problem does it solve?**

"A student could not ask a simple question like 'which projects are under 80 euros and include housing?' without opening every tab and reading every row. Now it is one slider and one checkbox."

**3. What was the hardest bug you fixed?**

"Finding where the table starts. Every tab has the header on a different row. At first I looked for a row with a cell 'PROJECT' and a cell 'OPPORTUNITY LINK', but some tabs write the header with a line break inside the cell, so those tabs were skipped. I loosened the check to 'any cell that *contains* the word LINK and any cell that *contains* PROJECT'. That found the missing tabs but broke others: one tab had a note row saying 'Possible 4 weeks projects?' next to a Canva URL with the word 'link' in it, so the script picked that row as the header and read nonsense. The real fix was to clean every cell first, removing line breaks and extra spaces, and then match the two names *exactly*. What I learned is to clean the data first and then compare strictly, instead of making the comparison looser."

(This really happened. The loose version is in commit `c10b637`, and `git log -p scripts/etl_parser.py` shows the change.)

*Other true stories I can use instead:* the booklet links that showed "Booklet.pdf" instead of a URL (fixed by reading the hidden hyperlink), or the MEALS column that sometimes holds the number `1` instead of text (calling `.toLowerCase()` on a number crashes in JavaScript, so every raw value goes through `String()` first).

**4. Why a JSON file instead of a database for v1.0?**

"The data is small, a few hundred rows, it only changes when someone edits the sheet, and users only read it. A static file means no server to pay for or keep running, and the page loads instantly. A database makes sense when users need to save things, like favourites or accounts, and that is my plan for version 2 with FastAPI and PostgreSQL."

**5. How do you test your code?**

"The cleaning functions take a value and return a value, with no files or network, so they are easy to test. I have 51 pytest cases using parametrize, and most inputs are copied from real cells in the sheet. They run on every push in GitHub Actions, and if one fails the data sync stops. For the frontend I rely on the TypeScript compiler, which checks that the JSON still fits the Project type. I don't have automated frontend tests yet. That would be my next step."

**6. How does filtering work in React?**

"Each filter control has its own useState. When one changes, React re-renders the component. The filtering and sorting sit inside one useMemo that lists all the filter values as dependencies, so it only recalculates when a filter really changed. Opening a card, for example, re-renders but does not re-filter."

**7. Explain one of your regular expressions.**

"For fees I use `\d+`, then an optional group with a dot or comma and more digits. So it finds '104,20' in '104,20€'. Then I replace the comma with a dot, because Python only reads a dot as the decimal point, and convert to float. `re.search` returns the first match, so for a range like '190-450$' I get the lowest price."

**8. How does the data stay up to date?**

"A GitHub Actions workflow runs every six hours on a cron schedule. It runs the tests, then the parser, then the TypeScript check, and commits the JSON only if it changed. There is also a safety check in the script: if it finds zero projects, it exits with an error and keeps the old file, so a change in the sheet can't empty the website."

**9. The sheet has personal data. How do you handle that?**

"Under each project table there is a section about students who already went abroad. Those sections start with 'OUR EXPERIENCES' or 'CURRENT STATE'. My loop breaks as soon as it sees one of those, so nothing below is read at all. It is not filtered out later, it never gets into the program."

**10. What would you improve?**

"Three things. First, currency: a few tabs write fees in dollars. I save the currency and show it on the card, but the price slider and the price sort still compare the plain numbers, so 57 dollars and 57 euros count as the same. I would convert everything to euros with an exchange rate. Second, I would move the meals and transport text reading from the frontend into the Python script, next to the housing one, so all cleaning lives in one place and is covered by the same tests. Third, version 2: a FastAPI backend with PostgreSQL, with a partner_lcs table and a projects table in a one-to-many relationship."

---

## 4. Honest Notes Before an Interview

Things I should know so no question surprises me.

**The `useEffect` in `App.tsx` does very little today.** The data is a static file, so `maxFeeDetected` never changes after the page loads. The effect runs once and sets the slider to the value it already has. It becomes useful in v2.0, when the data arrives from an API *after* the first render. If someone asks, say exactly that. The line `// eslint-disable-next-line react-hooks/set-state-in-effect` inside it is there because the linter warns that setting state in an effect causes an extra render, and here that is intended.

**Dollars and euros are not converted.** The card shows the right currency ("57 USD"), because `clean_currency` saves it in `FEE_CURRENCY`. But the price slider and "sort by price" only look at `FEE_NUMERIC`, so a 57 dollar project is treated like a 57 euro one, and the slider label always says EUR. I left it like this on purpose: a fixed exchange rate in the code would be wrong again next month. It is answer 10 above.

**The duration tag says "6 weeks" when the sheet says nothing.** That is the standard AIESEC length, but it is a guess. The duration *filter* does not guess: it uses `DURATION_WEEKS`, which is `null` in that case.

**Meals and transport are read in the frontend, housing in Python.** It works, but it is not consistent. Also answer 10.

**Deployment is not in this repo.** The GitHub Action only commits the JSON. My commit history shows the site was deployed on Vercel. If the repo is still connected there, every commit (also the bot's) makes Vercel rebuild the site. Check the Vercel dashboard before saying this in an interview.

**If they ask "did you use AI tools?"** Say yes, and then show that you understand every line. Explaining a regex piece by piece or walking through the slider story above is the proof. Using a tool is normal. Not understanding your own code is the problem.

**Things I can demo live:**

```bash
python3 scripts/etl_parser.py "data/raw/IR Tool 26.2.xlsx"
```

Runs the script on the saved copy of the sheet, no internet needed, and prints how many projects each tab gave. (It rewrites `projects.json` with the old backup data, so run the script once more without the path afterwards.)

```bash
PYTHONPATH=. pytest tests/ -v
```

Shows every test case by name.
