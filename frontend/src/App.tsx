import { useState, useMemo } from "react";
import rawProjectsData from "./data/projects.json";

// ==============================================================================
// TYPE CONTRACT (Strict boundary aligned with Python ETL output)
// ==============================================================================
export interface Project {
  ID?: string;
  COUNTRY?: string;
  PROJECT?: string;
  "OPPORTUNITY LINK"?: string | null;
  PROVIDER?: string | null;
  "JOB DESCRIPTION"?: string | null;
  BOOKLET?: string | null;
  ACCOMMODATION?: string | null;
  MEALS?: string | number | null;
  TRANSPORTATION?: string | null;
  FEE?: string | number | null;
  DURATION?: string | null;
  TIMELINE?: string | null;
  REQUIREMENTS?: string | null;
  // Normalized primitives injected by Python ETL
  SDG?: number | null;
  FEE_NUMERIC?: number | null;
  DURATION_WEEKS?: number | null;
  ACCOMMODATION_BOOL?: boolean;
}

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

export default function App() {
  // Phase 1: Ingest JSON defensively
  const allProjects: Project[] = useMemo(() => {
    return Array.isArray(rawProjectsData) ? (rawProjectsData as Project[]) : [];
  }, []);

  // Phase 2: Compute dataset boundaries for dynamic filter bounds
  const { countries, sdgs, durations, maxFeeDetected } = useMemo(() => {
    const countrySet = new Set<string>();
    const sdgSet = new Set<number>();
    const durationSet = new Set<number>();
    let maxFee = 0;

    for (const p of allProjects) {
      if (p.COUNTRY) countrySet.add(p.COUNTRY);
      if (p.SDG !== null && p.SDG !== undefined) sdgSet.add(p.SDG);
      if (p.DURATION_WEEKS) durationSet.add(p.DURATION_WEEKS);
      if (p.FEE_NUMERIC && p.FEE_NUMERIC > maxFee) maxFee = p.FEE_NUMERIC;
    }

    return {
      countries: Array.from(countrySet).sort(),
      sdgs: Array.from(sdgSet).sort((a, b) => a - b),
      durations: Array.from(durationSet).sort((a, b) => a - b),
      maxFeeDetected: Math.ceil(maxFee) || 250,
    };
  }, [allProjects]);

  // Phase 3: Filter & Sort States
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCountry, setSelectedCountry] = useState<string>("ALL");
  const [selectedSdg, setSelectedSdg] = useState<string>("ALL");
  const [selectedDuration, setSelectedDuration] = useState<string>("ALL");
  const [maxFee, setMaxFee] = useState<number>(maxFeeDetected);
  const [onlyAccommodation, setOnlyAccommodation] = useState<boolean>(false);
  const [onlyMeals, setOnlyMeals] = useState<boolean>(false);
  const [onlyTransport, setOnlyTransport] = useState<boolean>(false);
  const [onlyReadyToApply, setOnlyReadyToApply] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<string>("FEE_ASC");

  // Helper: Reset all filters
  const resetFilters = () => {
    setSearchQuery("");
    setSelectedCountry("ALL");
    setSelectedSdg("ALL");
    setSelectedDuration("ALL");
    setMaxFee(maxFeeDetected);
    setOnlyAccommodation(false);
    setOnlyMeals(false);
    setOnlyTransport(false);
    setOnlyReadyToApply(false);
    setSortBy("FEE_ASC");
  };

  // Phase 4: Single-pass composite predicate filtering + comparator sorting
  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return allProjects
      .filter((project) => {
        // 1. Text Search (safe against null/numbers)
        if (q) {
          const title = String(project.PROJECT ?? "").toLowerCase();
          const provider = String(project.PROVIDER ?? "").toLowerCase();
          const desc = String(project["JOB DESCRIPTION"] ?? "").toLowerCase();
          const req = String(project.REQUIREMENTS ?? "").toLowerCase();
          const country = String(project.COUNTRY ?? "").toLowerCase();
          if (
            !title.includes(q) &&
            !provider.includes(q) &&
            !desc.includes(q) &&
            !req.includes(q) &&
            !country.includes(q)
          ) {
            return false;
          }
        }

        // 2. Country / Partner LC Filter
        if (selectedCountry !== "ALL" && project.COUNTRY !== selectedCountry) {
          return false;
        }

        // 3. SDG Filter
        if (selectedSdg !== "ALL" && project.SDG !== Number(selectedSdg)) {
          return false;
        }

        // 4. Duration Filter
        if (
          selectedDuration !== "ALL" &&
          project.DURATION_WEEKS !== Number(selectedDuration)
        ) {
          return false;
        }

        // 5. Max Fee Filter
        if (project.FEE_NUMERIC !== null && project.FEE_NUMERIC !== undefined) {
          if (project.FEE_NUMERIC > maxFee) return false;
        }

        // 6. Accommodation Toggle
        if (onlyAccommodation && !project.ACCOMMODATION_BOOL) {
          return false;
        }

        // 7. Meals Toggle (SAFE STRING CAST - NEVER CRASHES ON NUMBERS LIKE 1)
        if (onlyMeals) {
          const mealsStr = String(project.MEALS ?? "").trim().toLowerCase();
          if (!mealsStr || mealsStr === "no" || mealsStr === "false" || mealsStr === "none") {
            return false;
          }
          const isNotProvided =
            mealsStr.includes("not provided") ||
            mealsStr.includes("not covered") ||
            mealsStr.includes("not paid");
          const hasAffirmativeToken =
            mealsStr.includes("meal") ||
            mealsStr.includes("yes") ||
            mealsStr.includes("provided") ||
            mealsStr.includes("covered") ||
            /\d/.test(mealsStr); // Matches "1", "2 meals", "3 meals"

          if (isNotProvided || !hasAffirmativeToken) {
            return false;
          }
        }

        // 8. Transportation Toggle (SAFE STRING CAST)
        if (onlyTransport) {
          const transportStr = String(project.TRANSPORTATION ?? "").trim().toLowerCase();
          if (!transportStr || transportStr === "no" || transportStr === "false" || transportStr === "none") {
            return false;
          }
          const isNotProvided =
            transportStr.includes("not provided") ||
            transportStr.includes("not covered") ||
            transportStr.includes("not paid");
          const hasTransport =
            transportStr.includes("yes") ||
            transportStr.includes("covered") ||
            transportStr.includes("paid") ||
            transportStr.includes("provided");

          if (isNotProvided || !hasTransport) {
            return false;
          }
        }

        // 9. Application Readiness (Exclude Drafts)
        if (onlyReadyToApply && !project["OPPORTUNITY LINK"]) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case "FEE_ASC":
            return (a.FEE_NUMERIC ?? 0) - (b.FEE_NUMERIC ?? 0);
          case "FEE_DESC":
            return (b.FEE_NUMERIC ?? 0) - (a.FEE_NUMERIC ?? 0);
          case "DURATION_ASC":
            return (a.DURATION_WEEKS ?? 0) - (b.DURATION_WEEKS ?? 0);
          case "DURATION_DESC":
            return (b.DURATION_WEEKS ?? 0) - (a.DURATION_WEEKS ?? 0);
          case "NAME_ASC":
            return String(a.PROJECT ?? "").localeCompare(String(b.PROJECT ?? ""));
          case "COUNTRY_ASC":
            return String(a.COUNTRY ?? "").localeCompare(String(b.COUNTRY ?? ""));
          default:
            return 0;
        }
      });
  }, [
    allProjects,
    searchQuery,
    selectedCountry,
    selectedSdg,
    selectedDuration,
    maxFee,
    onlyAccommodation,
    onlyMeals,
    onlyTransport,
    onlyReadyToApply,
    sortBy,
  ]);

  const activeFilterCount =
    (searchQuery ? 1 : 0) +
    (selectedCountry !== "ALL" ? 1 : 0) +
    (selectedSdg !== "ALL" ? 1 : 0) +
    (selectedDuration !== "ALL" ? 1 : 0) +
    (maxFee < maxFeeDetected ? 1 : 0) +
    (onlyAccommodation ? 1 : 0) +
    (onlyMeals ? 1 : 0) +
    (onlyTransport ? 1 : 0) +
    (onlyReadyToApply ? 1 : 0);

  return (
    <div style={{ maxWidth: "1350px", margin: "0 auto", padding: "2rem", fontFamily: "system-ui, -apple-system, sans-serif", color: "#0f172a", backgroundColor: "#f8fafc", minHeight: "100vh" }}>
      {/* Title Header */}
      <header style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <h1 style={{ fontSize: "2.25rem", fontWeight: 800, color: "#0284c7", margin: 0, letterSpacing: "-0.025em" }}>
              AIESEC Global Opportunities Portal
            </h1>
            <p style={{ color: "#64748b", marginTop: "0.4rem", fontSize: "1rem" }}>
              Explore and filter verified volunteer projects across all bilateral LC partnerships
            </p>
          </div>
          <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#334155", background: "#ffffff", padding: "0.5rem 1rem", borderRadius: "8px", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
            Showing <strong>{filteredProjects.length}</strong> of {allProjects.length} projects
          </div>
        </div>

        {/* Multi-Dimensional Filter Control Panel */}
        <section style={{ marginTop: "1.5rem", background: "#ffffff", padding: "1.5rem", borderRadius: "14px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" }}>
          {/* Row 1: Search, Country, SDG, Duration, Sort */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: "0.35rem" }}>Search Query</label>
              <input
                type="text"
                placeholder="Title, skills, provider..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "0.6rem 0.8rem", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", outline: "none" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: "0.35rem" }}>Country / LC</label>
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "0.6rem 0.8rem", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", background: "#fff" }}
              >
                <option value="ALL">All Partners ({countries.length})</option>
                {countries.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: "0.35rem" }}>UN SDG Goal</label>
              <select
                value={selectedSdg}
                onChange={(e) => setSelectedSdg(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "0.6rem 0.8rem", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", background: "#fff" }}
              >
                <option value="ALL">All SDGs ({sdgs.length})</option>
                {sdgs.map((s) => (
                  <option key={s} value={s}>
                    SDG #{s}: {SDG_LABELS[s] || "Volunteer Initiative"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: "0.35rem" }}>Duration</label>
              <select
                value={selectedDuration}
                onChange={(e) => setSelectedDuration(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "0.6rem 0.8rem", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", background: "#fff" }}
              >
                <option value="ALL">Any Length</option>
                {durations.map((d) => (
                  <option key={d} value={d}>{d} Weeks</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: "0.35rem" }}>Sort Results</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "0.6rem 0.8rem", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", background: "#fff" }}
              >
                <option value="FEE_ASC">Price: Low to High</option>
                <option value="FEE_DESC">Price: High to Low</option>
                <option value="DURATION_ASC">Duration: Shortest</option>
                <option value="DURATION_DESC">Duration: Longest</option>
                <option value="NAME_ASC">Project Title: A-Z</option>
                <option value="COUNTRY_ASC">Country: A-Z</option>
              </select>
            </div>
          </div>

          {/* Row 2: Budget Range Slider + Logistics Toggles + Reset Button */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "1.5rem", borderTop: "1px solid #f1f5f9", paddingTop: "1.25rem" }}>
            {/* Fee Range Slider */}
            <div style={{ minWidth: "260px", flex: "1 1 260px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.3rem" }}>
                <span>Max Fee Budget:</span>
                <span style={{ color: "#0284c7" }}>≤ {maxFee} EUR</span>
              </div>
              <input
                type="range"
                min="0"
                max={maxFeeDetected}
                step="5"
                value={maxFee}
                onChange={(e) => setMaxFee(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#0284c7" }}
              />
            </div>

            {/* Logistics Checkboxes */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "1.25rem", alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={onlyAccommodation}
                  onChange={(e) => setOnlyAccommodation(e.target.checked)}
                  style={{ accentColor: "#0284c7" }}
                />
                🏠 Housing Covered
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={onlyMeals}
                  onChange={(e) => setOnlyMeals(e.target.checked)}
                  style={{ accentColor: "#0284c7" }}
                />
                🍽️ Meals Provided
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={onlyTransport}
                  onChange={(e) => setOnlyTransport(e.target.checked)}
                  style={{ accentColor: "#0284c7" }}
                />
                🚌 Transport Included
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontSize: "0.875rem", fontWeight: 600, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={onlyReadyToApply}
                  onChange={(e) => setOnlyReadyToApply(e.target.checked)}
                  style={{ accentColor: "#0284c7" }}
                />
                ⚡ Direct Apply Only
              </label>
            </div>

            {/* Clear All Filters */}
            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                style={{
                  background: "#f1f5f9",
                  border: "1px solid #cbd5e1",
                  borderRadius: "8px",
                  padding: "0.5rem 1rem",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: "#dc2626",
                  cursor: "pointer",
                }}
              >
                Reset Filters ({activeFilterCount})
              </button>
            )}
          </div>
        </section>
      </header>

      {/* Project Cards Display Grid */}
      {filteredProjects.length === 0 ? (
        <div style={{ textAlign: "center", padding: "5rem 2rem", background: "#ffffff", borderRadius: "14px", border: "1px solid #e2e8f0" }}>
          <h3 style={{ fontSize: "1.35rem", fontWeight: 700, color: "#1e293b", margin: 0 }}>No projects match your criteria</h3>
          <p style={{ color: "#64748b", marginTop: "0.5rem", fontSize: "0.95rem" }}>
            Try expanding your fee budget or unchecking logistics constraints
          </p>
          <button
            onClick={resetFilters}
            style={{ marginTop: "1rem", background: "#0284c7", color: "#fff", border: "none", padding: "0.6rem 1.25rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}
          >
            Clear All Active Filters
          </button>
        </div>
      ) : (
        <main style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "1.5rem" }}>
          {filteredProjects.map((p, idx) => (
            <article
              key={p.ID || idx}
              style={{
                background: "#ffffff",
                borderRadius: "14px",
                border: "1px solid #e2e8f0",
                padding: "1.5rem",
                boxShadow: "0 2px 4px rgba(0,0,0,0.03)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                {/* Meta Badges */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.85rem" }}>
                  <span style={{ background: "#e0f2fe", color: "#0369a1", fontSize: "0.75rem", fontWeight: 800, padding: "0.3rem 0.65rem", borderRadius: "20px" }}>
                    {p.COUNTRY || "Partner LC"}
                  </span>
                  {p.SDG && (
                    <span style={{ background: "#dcfce7", color: "#15803d", fontSize: "0.75rem", fontWeight: 800, padding: "0.3rem 0.65rem", borderRadius: "20px" }}>
                      SDG #{p.SDG} {SDG_LABELS[p.SDG] ? `• ${SDG_LABELS[p.SDG].split(" ")[0]}` : ""}
                    </span>
                  )}
                </div>

                <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.35rem 0", color: "#0f172a" }}>
                  {p.PROJECT || "Global Volunteer Opportunity"}
                </h2>

                {p.PROVIDER && (
                  <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "0 0 0.75rem 0", fontWeight: 500 }}>
                    📍 {p.PROVIDER}
                  </p>
                )}

                {p["JOB DESCRIPTION"] && (
                  <p style={{ fontSize: "0.85rem", color: "#475569", lineHeight: 1.5, margin: "0 0 1rem 0", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {p["JOB DESCRIPTION"]}
                  </p>
                )}

                {/* Relational Attributes Badge Strip */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", margin: "1rem 0", fontSize: "0.78rem" }}>
                  <span style={{ background: "#f1f5f9", padding: "0.35rem 0.6rem", borderRadius: "6px", fontWeight: 600 }}>
                    ⏱ {p.DURATION || (p.DURATION_WEEKS ? `${p.DURATION_WEEKS} weeks` : "6 weeks")}
                  </span>
                  <span style={{ background: "#f1f5f9", padding: "0.35rem 0.6rem", borderRadius: "6px", fontWeight: 600 }}>
                    💶 {p.FEE_NUMERIC !== null && p.FEE_NUMERIC !== undefined ? `${p.FEE_NUMERIC} EUR` : (p.FEE || "Inquire with LC")}
                  </span>
                  <span style={{ background: p.ACCOMMODATION_BOOL ? "#f0fdf4" : "#fef2f2", color: p.ACCOMMODATION_BOOL ? "#166534" : "#991b1b", padding: "0.35rem 0.6rem", borderRadius: "6px", fontWeight: 600 }}>
                    🏠 {p.ACCOMMODATION_BOOL ? "Housing: Yes" : "Housing: No/Unconfirmed"}
                  </span>
                  {p.MEALS && (
                    <span style={{ background: "#f1f5f9", padding: "0.35rem 0.6rem", borderRadius: "6px", fontWeight: 600 }}>
                      🍽️ {String(p.MEALS)}
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "1rem", marginTop: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {p["OPPORTUNITY LINK"] ? (
                  <a
                    href={p["OPPORTUNITY LINK"]}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ background: "#0284c7", color: "#ffffff", padding: "0.55rem 1rem", borderRadius: "8px", textDecoration: "none", fontSize: "0.85rem", fontWeight: 700 }}
                  >
                    Apply on AIESEC →
                  </a>
                ) : (
                  <span style={{ fontSize: "0.8rem", color: "#d97706", fontStyle: "italic", fontWeight: 600 }}>
                    Draft — Link pending
                  </span>
                )}

                {p.BOOKLET && (
                  <a
                    href={p.BOOKLET}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: "0.8rem", color: "#64748b", textDecoration: "underline", fontWeight: 600 }}
                  >
                    LC Booklet ↗
                  </a>
                )}
              </div>
            </article>
          ))}
        </main>
      )}
    </div>
  );
}