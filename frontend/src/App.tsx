import { useEffect, useMemo, useState } from "react";
import projectsData from "./data/projects.json";
import type { Project, RawCell } from "./types/project";
import "./App.css";

// the file made by scripts/etl_parser.py. it is bundled into the website,
// so the page never has to wait for a download
const allProjects = projectsData as Project[];

// names of the UN goals, shown in the SDG dropdown and on the cards
const SDG_LABELS: Record<number, string> = {
  3: "Good Health & Well-Being",
  4: "Quality Education",
  5: "Gender Equality",
  8: "Decent Work & Economic Growth",
  10: "Reduced Inequalities",
  12: "Responsible Consumption",
  13: "Climate Action",
  14: "Life Below Water",
  15: "Life on Land",
  17: "Partnerships for the Goals",
};

// the python script saves excel date cells as "2026-03-01T00:00:00".
// we show those as "1 Mar 2026" and leave normal text like "from June" alone
function formatTimeline(raw: RawCell | undefined): string {
  const text = String(raw ?? "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(T00:00:00)?$/);
  if (!match) {
    return text;
  }
  // months start at 0 in javascript, so March ("03") is month 2
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// MEALS and TRANSPORTATION are free text typed by many different people
// ("3 meals x day", "provided but not paid for", "yes", or just the number 2),
// so these two functions decide if the text really means "yes, it is included"
function hasMeals(project: Project): boolean {
  const text = String(project.MEALS ?? "").toLowerCase();

  // "not provided", "3 meals provided, not covered", "provided but not paid for"
  if (text.includes("not provided") || text.includes("not covered") || text.includes("not paid")) {
    return false;
  }
  // "3 meals x day", "yes", "provided and covered"
  if (text.includes("meal") || text.includes("yes") || text.includes("provided") || text.includes("covered")) {
    return true;
  }
  // just a number like 2 means "2 meals a day"
  if (/\d/.test(text)) {
    return true;
  }
  // empty, "no", "?", "sometimes"
  return false;
}

function hasTransport(project: Project): boolean {
  const text = String(project.TRANSPORTATION ?? "").toLowerCase();

  // "not provided", "provided but not covered", "paid but not provided"
  if (text.includes("not provided") || text.includes("not covered") || text.includes("not paid")) {
    return false;
  }
  // "yes", "provided", "covered for commuting", "provided and paid"
  if (text.includes("yes") || text.includes("provided") || text.includes("covered") || text.includes("paid")) {
    return true;
  }
  // empty, "no", "."
  return false;
}

export default function App() {
  // phase 1: load the json data and find the options for the filter controls.
  // the [] at the end means this loop runs once, not on every re-render
  const { countries, sdgs, durations, maxFeeDetected } = useMemo(() => {
    const countrySet = new Set<string>();
    const sdgSet = new Set<number>();
    const durationSet = new Set<number>();
    let highestFee = 0;

    for (const project of allProjects) {
      countrySet.add(project.COUNTRY);
      if (project.SDG !== null) {
        sdgSet.add(project.SDG);
      }
      if (project.DURATION_WEEKS !== null) {
        durationSet.add(project.DURATION_WEEKS);
      }
      if (project.FEE_NUMERIC !== null && project.FEE_NUMERIC > highestFee) {
        highestFee = project.FEE_NUMERIC;
      }
    }

    return {
      countries: [...countrySet].sort(),
      sdgs: [...sdgSet].sort((a, b) => a - b),
      durations: [...durationSet].sort((a, b) => a - b),
      // round max fee up to the nearest 5 so the slider (which moves in
      // steps of 5) doesn't hide the most expensive project
      maxFeeDetected: Math.ceil(highestFee / 5) * 5,
    };
  }, []);

  // phase 2: one piece of state for every filter control
  const [searchText, setSearchText] = useState("");
  const [country, setCountry] = useState("ALL");
  const [sdg, setSdg] = useState("ALL");
  const [duration, setDuration] = useState("ALL");
  const [maxFee, setMaxFee] = useState(maxFeeDetected);
  const [onlyHousing, setOnlyHousing] = useState(false);
  const [onlyMeals, setOnlyMeals] = useState(false);
  const [onlyTransport, setOnlyTransport] = useState(false);
  const [onlyWithLink, setOnlyWithLink] = useState(false);
  const [sortBy, setSortBy] = useState("FEE_ASC");
  // remembers which cards are open, like { "Izmir🇹🇷_12": true }
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});

  // phase 3: keep the slider in sync with the data, then filter and sort

  // the slider starts at the highest fee, so no project is hidden at first.
  // if the data changes and the highest fee moves, the slider moves with it
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMaxFee(maxFeeDetected);
  }, [maxFeeDetected]);

  // useMemo runs this again only when one of the filters in the list at the
  // bottom changes. opening a card, for example, does not re-filter anything
  const visibleProjects = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    const matching = allProjects.filter((project) => {
      // search box: the text can be in the title, provider, description,
      // requirements or country
      if (query !== "") {
        const fields = [
          project.PROJECT,
          project.PROVIDER,
          project["JOB DESCRIPTION"],
          project.REQUIREMENTS,
          project.COUNTRY,
        ];
        const found = fields.some((field) => String(field ?? "").toLowerCase().includes(query));
        if (!found) {
          return false;
        }
      }

      // dropdowns: "ALL" means the filter is switched off
      if (country !== "ALL" && project.COUNTRY !== country) {
        return false;
      }
      if (sdg !== "ALL" && project.SDG !== Number(sdg)) {
        return false;
      }
      if (duration !== "ALL" && project.DURATION_WEEKS !== Number(duration)) {
        return false;
      }

      // price slider: hide projects that cost more than the slider says.
      // a project with an unknown fee stays visible, we can't say it's too expensive
      if (project.FEE_NUMERIC !== null && project.FEE_NUMERIC > maxFee) {
        return false;
      }

      // housing toggle: the python script already turned this into true / false
      if (onlyHousing && !project.ACCOMMODATION_BOOL) {
        return false;
      }

      // meals toggle
      if (onlyMeals && !hasMeals(project)) {
        return false;
      }

      // transport toggle
      if (onlyTransport && !hasTransport(project)) {
        return false;
      }

      // direct apply toggle: hide drafts that have no apply link yet
      if (onlyWithLink && !project["OPPORTUNITY LINK"]) {
        return false;
      }

      return true;
    });

    // sort what is left. a project with an unknown fee or duration
    // always goes to the end of the list
    return matching.sort((a, b) => {
      if (sortBy === "FEE_ASC") {
        return (a.FEE_NUMERIC ?? Infinity) - (b.FEE_NUMERIC ?? Infinity);
      }
      if (sortBy === "FEE_DESC") {
        return (b.FEE_NUMERIC ?? -1) - (a.FEE_NUMERIC ?? -1);
      }
      if (sortBy === "DURATION_ASC") {
        return (a.DURATION_WEEKS ?? Infinity) - (b.DURATION_WEEKS ?? Infinity);
      }
      if (sortBy === "DURATION_DESC") {
        return (b.DURATION_WEEKS ?? -1) - (a.DURATION_WEEKS ?? -1);
      }
      if (sortBy === "NAME_ASC") {
        return a.PROJECT.localeCompare(b.PROJECT);
      }
      return a.COUNTRY.localeCompare(b.COUNTRY);
    });
  }, [
    searchText,
    country,
    sdg,
    duration,
    maxFee,
    onlyHousing,
    onlyMeals,
    onlyTransport,
    onlyWithLink,
    sortBy,
  ]);

  // how many filters are switched on (shown on the reset button)
  const activeFilterCount = [
    searchText !== "",
    country !== "ALL",
    sdg !== "ALL",
    duration !== "ALL",
    maxFee < maxFeeDetected,
    onlyHousing,
    onlyMeals,
    onlyTransport,
    onlyWithLink,
  ].filter(Boolean).length;

  function resetFilters() {
    setSearchText("");
    setCountry("ALL");
    setSdg("ALL");
    setDuration("ALL");
    setMaxFee(maxFeeDetected);
    setOnlyHousing(false);
    setOnlyMeals(false);
    setOnlyTransport(false);
    setOnlyWithLink(false);
    setSortBy("FEE_ASC");
  }

  function toggleCard(id: string) {
    // "previous" is always the newest version of the state, so two quick
    // clicks can never overwrite each other
    setOpenCards((previous) => ({ ...previous, [id]: !previous[id] }));
  }

  // the four checkboxes look the same, so we describe them here and draw them in a loop
  const toggles = [
    { label: "🏠 Housing Covered", checked: onlyHousing, onChange: setOnlyHousing },
    { label: "🍽️ Meals Provided", checked: onlyMeals, onChange: setOnlyMeals },
    { label: "🚌 Transport Included", checked: onlyTransport, onChange: setOnlyTransport },
    { label: "⚡ Direct Apply Only", checked: onlyWithLink, onChange: setOnlyWithLink },
  ];

  return (
    <div className="page">
      {/* phase 4: header and filter bar */}
      <header className="page-header">
        <div className="title-row">
          <div>
            <h1 className="title">AIESEC Global Opportunities Portal</h1>
            <p className="subtitle">
              Explore and filter verified volunteer projects across all bilateral LC partnerships
            </p>
          </div>
          <div className="result-count">
            Showing <strong>{visibleProjects.length}</strong> of {allProjects.length} projects
          </div>
        </div>

        <section className="filters">
          {/* row 1: search box, three dropdowns and the sort order */}
          <div className="filter-grid">
            <div>
              <label className="filter-label">Search Query</label>
              <div className="search-box">
                <input
                  className="search-input"
                  type="text"
                  placeholder="Title, skills, provider..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
                {searchText && (
                  <button
                    className="search-clear"
                    type="button"
                    onClick={() => setSearchText("")}
                    aria-label="Clear search query"
                    title="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="filter-label">Country / LC</label>
              <select className="filter-select" value={country} onChange={(e) => setCountry(e.target.value)}>
                <option value="ALL">All Partners ({countries.length})</option>
                {countries.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="filter-label">UN SDG Goal</label>
              <select className="filter-select" value={sdg} onChange={(e) => setSdg(e.target.value)}>
                <option value="ALL">All SDGs ({sdgs.length})</option>
                {sdgs.map((number) => (
                  <option key={number} value={number}>
                    SDG #{number}: {SDG_LABELS[number] || "Volunteer Initiative"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="filter-label">Duration</label>
              <select className="filter-select" value={duration} onChange={(e) => setDuration(e.target.value)}>
                <option value="ALL">Any Length</option>
                {durations.map((weeks) => (
                  <option key={weeks} value={weeks}>{weeks} Weeks</option>
                ))}
              </select>
            </div>

            <div>
              <label className="filter-label">Sort Results</label>
              <select className="filter-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="FEE_ASC">Price: Low to High</option>
                <option value="FEE_DESC">Price: High to Low</option>
                <option value="DURATION_ASC">Duration: Shortest</option>
                <option value="DURATION_DESC">Duration: Longest</option>
                <option value="NAME_ASC">Project Title: A-Z</option>
                <option value="COUNTRY_ASC">Country: A-Z</option>
              </select>
            </div>
          </div>

          {/* row 2: price slider, checkboxes and reset button. the slider has a
              fixed width and the reset button is always there (see App.css),
              so nothing moves while you drag the slider */}
          <div className="filter-row">
            <div className="fee-slider">
              <div className="fee-slider-top">
                <span>Max Fee Budget:</span>
                <span className="fee-value">≤ {maxFee} EUR</span>
              </div>
              <input
                className="fee-range"
                type="range"
                min="0"
                max={maxFeeDetected}
                step="5"
                value={maxFee}
                onChange={(e) => setMaxFee(Number(e.target.value))}
              />
              <div className="fee-scale">
                <span>0 EUR</span>
                <span>{maxFeeDetected} EUR</span>
              </div>
            </div>

            <div className="toggles">
              {toggles.map((toggle) => (
                <label key={toggle.label} className={toggle.checked ? "toggle on" : "toggle"}>
                  <input
                    type="checkbox"
                    checked={toggle.checked}
                    onChange={(e) => toggle.onChange(e.target.checked)}
                  />
                  {toggle.label}
                </label>
              ))}
            </div>

            <div className="reset-box">
              <button
                className="reset-button"
                type="button"
                onClick={resetFilters}
                disabled={activeFilterCount === 0}
              >
                Reset Filters ({activeFilterCount})
              </button>
            </div>
          </div>
        </section>
      </header>

      {/* phase 5: project cards, or a message when no project matches */}
      {visibleProjects.length === 0 ? (
        <div className="empty">
          <h3>No projects match your criteria</h3>
          <p>Try expanding your fee budget or unchecking logistics constraints</p>
          <button type="button" onClick={resetFilters}>
            Clear All Active Filters
          </button>
        </div>
      ) : (
        <main className="cards">
          {visibleProjects.map((project) => {
            const isOpen = Boolean(openCards[project.ID]);
            const description = String(project["JOB DESCRIPTION"] ?? "").trim();
            const requirements = String(project.REQUIREMENTS ?? "").trim();
            const transport = String(project.TRANSPORTATION ?? "").trim();
            const extraInfo = String(project["EXTRA INFO"] ?? "").trim();
            const meals = String(project.MEALS ?? "").trim();
            const timeline = formatTimeline(project.TIMELINE);

            // the grey details box lists these three fields, so it needs at least one of them
            const hasDetails = requirements !== "" || transport !== "" || extraInfo !== "";

            // show the "more details" button only if opening the card shows something new:
            // a long description that was cut off, or details worth reading
            // (a transport cell that just says "no" is not worth a click)
            const hasMoreDetails =
              description.length > 140 ||
              requirements !== "" ||
              extraInfo !== "" ||
              (transport !== "" && transport.toLowerCase() !== "no");

            // duration tag: use the sheet's own words when it has them
            let durationLabel = "6 weeks";
            if (project.DURATION) {
              durationLabel = String(project.DURATION);
            } else if (project.DURATION_WEEKS) {
              durationLabel = `${project.DURATION_WEEKS} weeks`;
            }

            // fee tag: the clean number with its currency ("57 USD") if we have it,
            // else whatever the sheet says
            let feeLabel = "Inquire with LC";
            if (project.FEE_NUMERIC !== null) {
              feeLabel = `${project.FEE_NUMERIC} ${project.FEE_CURRENCY}`;
            } else if (project.FEE) {
              feeLabel = String(project.FEE);
            }
            // a dollar note for dollar fees, a euro note for everything else
            const feeIcon = project.FEE_CURRENCY === "USD" ? "💵" : "💶";

            const countrySelected = country === project.COUNTRY;
            const sdgSelected = sdg === String(project.SDG);

            return (
              <article key={project.ID} className="card">
                <div>
                  {/* clicking a badge filters by that country or SDG, clicking again removes the filter */}
                  <div className="card-badges">
                    <button
                      className={countrySelected ? "badge country selected" : "badge country"}
                      type="button"
                      onClick={() => setCountry(countrySelected ? "ALL" : project.COUNTRY)}
                      title={countrySelected ? "Click to show all countries" : `Filter by ${project.COUNTRY}`}
                    >
                      {project.COUNTRY}
                    </button>
                    {project.SDG !== null && (
                      <button
                        className={sdgSelected ? "badge sdg selected" : "badge sdg"}
                        type="button"
                        onClick={() => setSdg(sdgSelected ? "ALL" : String(project.SDG))}
                        title={sdgSelected ? "Click to show all SDGs" : `Filter by SDG #${project.SDG}`}
                      >
                        SDG #{project.SDG} {SDG_LABELS[project.SDG] ? `• ${SDG_LABELS[project.SDG].split(" ")[0]}` : ""}
                      </button>
                    )}
                  </div>

                  <h2 className="card-title">{project.PROJECT}</h2>

                  {project.PROVIDER && <p className="card-provider">📍 {String(project.PROVIDER)}</p>}

                  {description && (
                    <p className={isOpen ? "card-description open" : "card-description clamped"}>
                      {description}
                    </p>
                  )}

                  <div className="card-tags">
                    <span className="tag">⏱ {durationLabel}</span>
                    <span className="tag">{feeIcon} {feeLabel}</span>
                    <span className={project.ACCOMMODATION_BOOL ? "tag yes" : "tag no"}>
                      🏠 {project.ACCOMMODATION_BOOL ? "Housing: Yes" : "Housing: No/Unconfirmed"}
                    </span>
                    {meals && <span className="tag">🍽️ {meals}</span>}
                    {timeline && <span className="tag">📅 {timeline}</span>}
                  </div>

                  {/* the extra details only exist on the page while the card is open */}
                  {isOpen && hasDetails && (
                    <div className="card-details">
                      {requirements && (
                        <div>
                          <strong>Requirements:</strong> {requirements}
                        </div>
                      )}
                      {transport && (
                        <div>
                          <strong>Transportation:</strong> {transport}
                        </div>
                      )}
                      {extraInfo && (
                        <div>
                          <strong>Extra Info:</strong> {extraInfo}
                        </div>
                      )}
                    </div>
                  )}

                  {hasMoreDetails && (
                    <button className="more-button" type="button" onClick={() => toggleCard(project.ID)}>
                      {isOpen ? "Show less ▴" : "More project details ▾"}
                    </button>
                  )}
                </div>

                <div className="card-actions">
                  {project["OPPORTUNITY LINK"] ? (
                    <a
                      className="apply-button"
                      href={project["OPPORTUNITY LINK"]}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Apply on AIESEC →
                    </a>
                  ) : (
                    <span className="draft-note">Draft — Link pending</span>
                  )}

                  {project.BOOKLET && (
                    <a className="booklet-link" href={project.BOOKLET} target="_blank" rel="noopener noreferrer">
                      LC Booklet ↗
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </main>
      )}
    </div>
  );
}
