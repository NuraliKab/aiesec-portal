import { useState, useMemo, useEffect } from "react";
import rawProjectsData from "./data/projects.json";
import type { Project } from "./types/project";

// ==============================================================================
// TYPE CONTRACT (Strict boundary aligned with Python ETL output)
// ==============================================================================
export type { Project };

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

// Defensive fee resolver helper: normalized ETL float -> raw numeric cell -> regex over string
const getProjectFee = (p: Project): number | null => {
  if (typeof p.FEE_NUMERIC === "number") return p.FEE_NUMERIC;
  if (typeof p.FEE === "number") return p.FEE;
  if (p.FEE) {
    const match = String(p.FEE).match(/(\d+(?:[.,]\d+)?)/);
    if (match) return parseFloat(match[1].replace(",", "."));
  }
  return null;
};

// Format ISO date strings (e.g. "2026-03-01T00:00:00") into readable dates while preserving free text
const formatTimeline = (raw: string | number | null | undefined): string | null => {
  const str = String(raw ?? "").trim();
  if (!str) return null;
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00)?$/);
  if (isoMatch) {
    const dateObj = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00Z`);
    if (!Number.isNaN(dateObj.getTime())) {
      return dateObj.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
    }
  }
  return str;
};

export default function App() {
  // phase 1: ingest JSON defensively
  const allProjects: Project[] = useMemo(() => {
    return Array.isArray(rawProjectsData) ? (rawProjectsData as Project[]) : [];
  }, []);

  // phase 2: compute dataset boundaries for dynamic filter bounds
  const { countries, sdgs, durations, maxFeeDetected } = useMemo(() => {
    const countrySet = new Set<string>();
    const sdgSet = new Set<number>();
    const durationSet = new Set<number>();
    let maxFee = 0;

    for (const p of allProjects) {
      if (p.COUNTRY) countrySet.add(p.COUNTRY);
      if (p.SDG !== null && p.SDG !== undefined) sdgSet.add(p.SDG);
      if (p.DURATION_WEEKS) durationSet.add(p.DURATION_WEEKS);
      const fee = getProjectFee(p);
      if (fee !== null && fee > maxFee) maxFee = fee;
    }

    return {
      countries: Array.from(countrySet).sort(),
      sdgs: Array.from(sdgSet).sort((a, b) => a - b),
      durations: Array.from(durationSet).sort((a, b) => a - b),
      // align ceiling to step=5 so the range thumb can reach the maximum project fee
      maxFeeDetected: maxFee > 0 ? Math.ceil(maxFee / 5) * 5 : 250,
    };
  }, [allProjects]);

  // phase 3: filter & sort states
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
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  // synchronize slider state with dynamic dataset bounds
  useEffect(() => {
    if (maxFeeDetected > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMaxFee(maxFeeDetected);
    }
  }, [maxFeeDetected]);

  // helper: reset all filters
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

  const toggleCardExpand = (id: string) => {
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // phase 4: single-pass composite predicate filtering + comparator sorting
  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return allProjects
      .filter((project) => {
        // 1. Text Search (safe against null/numbers via String coercion)
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
        const fee = getProjectFee(project);
        if (fee !== null && fee > maxFee) {
          return false;
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
            return (getProjectFee(a) ?? Number.POSITIVE_INFINITY) - (getProjectFee(b) ?? Number.POSITIVE_INFINITY);
          case "FEE_DESC":
            return (getProjectFee(b) ?? -1) - (getProjectFee(a) ?? -1);
          case "DURATION_ASC":
            return (a.DURATION_WEEKS ?? Number.POSITIVE_INFINITY) - (b.DURATION_WEEKS ?? Number.POSITIVE_INFINITY);
          case "DURATION_DESC":
            return (b.DURATION_WEEKS ?? -1) - (a.DURATION_WEEKS ?? -1);
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

  const logisticsToggles = [
    { label: "🏠 Housing Covered", checked: onlyAccommodation, onChange: setOnlyAccommodation },
    { label: "🍽️ Meals Provided", checked: onlyMeals, onChange: setOnlyMeals },
    { label: "🚌 Transport Included", checked: onlyTransport, onChange: setOnlyTransport },
    { label: "⚡ Direct Apply Only", checked: onlyReadyToApply, onChange: setOnlyReadyToApply },
  ];

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
          <div style={{ fontSize: "0.95rem", fontWeight: 600, color: "#334155", background: "#ffffff", padding: "0.5rem 1rem", borderRadius: "8px", border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.05)", fontVariantNumeric: "tabular-nums" }}>
            Showing <strong>{filteredProjects.length}</strong> of {allProjects.length} projects
          </div>
        </div>

        {/* Multi-Dimensional Filter Control Panel */}
        <section style={{ marginTop: "1.5rem", background: "#ffffff", padding: "1.5rem", borderRadius: "14px", border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" }}>
          {/* Row 1: Search, Country, SDG, Duration, Sort */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: "0.35rem" }}>Search Query</label>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  placeholder="Title, skills, provider..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "0.6rem 2rem 0.6rem 0.8rem", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", outline: "none" }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search query"
                    title="Clear search"
                    style={{ position: "absolute", right: "0.45rem", top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "1.05rem", lineHeight: 1, padding: "0.2rem" }}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "#64748b", marginBottom: "0.35rem" }}>Country / LC</label>
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", padding: "0.6rem 0.8rem", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", background: "#fff", cursor: "pointer" }}
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
                style={{ width: "100%", boxSizing: "border-box", padding: "0.6rem 0.8rem", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", background: "#fff", cursor: "pointer" }}
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
                style={{ width: "100%", boxSizing: "border-box", padding: "0.6rem 0.8rem", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", background: "#fff", cursor: "pointer" }}
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
                style={{ width: "100%", boxSizing: "border-box", padding: "0.6rem 0.8rem", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.9rem", background: "#fff", cursor: "pointer" }}
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

          {/* Row 2: Budget Range Slider + Logistics Toggles + Reset Button (Fixed geometry — 0 layout shift) */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1.5rem", borderTop: "1px solid #f1f5f9", paddingTop: "1.25rem" }}>
            {/* Fee Range Slider: fixed 280px basis so its track never shrinks or moves while dragging */}
            <div style={{ width: "280px", flex: "0 0 280px", maxWidth: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                <span>Max Fee Budget:</span>
                <span style={{ color: "#0284c7", background: "#e0f2fe", padding: "0.15rem 0.5rem", borderRadius: "6px", fontVariantNumeric: "tabular-nums", minWidth: "82px", textAlign: "right" }}>
                  ≤ {maxFee} EUR
                </span>
              </div>
              <input
                type="range"
                min="0"
                max={maxFeeDetected}
                step="5"
                value={maxFee}
                onChange={(e) => setMaxFee(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#0284c7", cursor: "pointer", display: "block" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "#94a3b8", marginTop: "0.2rem", fontVariantNumeric: "tabular-nums" }}>
                <span>0 EUR</span>
                <span>{maxFeeDetected} EUR</span>
              </div>
            </div>

            {/* Logistics Pill Checkboxes: anchored left so they never jump when Reset state changes */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.65rem", alignItems: "center", flex: "1 1 360px" }}>
              {logisticsToggles.map(({ label, checked, onChange }) => (
                <label
                  key={label}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    userSelect: "none",
                    padding: "0.45rem 0.8rem",
                    borderRadius: "8px",
                    border: checked ? "1px solid #0284c7" : "1px solid #e2e8f0",
                    background: checked ? "#e0f2fe" : "#f8fafc",
                    color: checked ? "#0369a1" : "#334155",
                    transition: "background-color 0.15s ease, border-color 0.15s ease",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => onChange(e.target.checked)}
                    style={{ accentColor: "#0284c7", cursor: "pointer", margin: 0 }}
                  />
                  {label}
                </label>
              ))}
            </div>

            {/* Clear All Filters: always mounted with fixed minWidth so activating filters causes zero layout shift */}
            <div style={{ marginLeft: "auto", flex: "0 0 auto" }}>
              <button
                type="button"
                onClick={resetFilters}
                disabled={activeFilterCount === 0}
                style={{
                  minWidth: "160px",
                  background: activeFilterCount > 0 ? "#fef2f2" : "#f8fafc",
                  border: activeFilterCount > 0 ? "1px solid #fecaca" : "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "0.5rem 1rem",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: activeFilterCount > 0 ? "#dc2626" : "#94a3b8",
                  cursor: activeFilterCount > 0 ? "pointer" : "default",
                  fontVariantNumeric: "tabular-nums",
                  transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
                }}
              >
                Reset Filters ({activeFilterCount})
              </button>
            </div>
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
            type="button"
            onClick={resetFilters}
            style={{ marginTop: "1rem", background: "#0284c7", color: "#fff", border: "none", padding: "0.6rem 1.25rem", borderRadius: "8px", fontWeight: 600, cursor: "pointer" }}
          >
            Clear All Active Filters
          </button>
        </div>
      ) : (
        <main style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: "1.5rem" }}>
          {filteredProjects.map((p, idx) => {
            const cardId = String(p.ID || idx);
            const isExpanded = Boolean(expandedCards[cardId]);
            const resolvedFee = getProjectFee(p);
            const timelineFormatted = formatTimeline(p.TIMELINE);
            const requirementsStr = String(p.REQUIREMENTS ?? "").trim();
            const extraInfoStr = String(p["EXTRA INFO"] ?? "").trim();
            const transportStr = String(p.TRANSPORTATION ?? "").trim();
            const jobDescStr = String(p["JOB DESCRIPTION"] ?? "").trim();
            const hasExtraDetails =
              jobDescStr.length > 140 ||
              Boolean(requirementsStr) ||
              Boolean(timelineFormatted) ||
              Boolean(extraInfoStr) ||
              (Boolean(transportStr) && transportStr.toLowerCase() !== "no");

            return (
              <article
                key={cardId}
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
                  {/* Meta Badges (clickable to quick-filter by Country or SDG) */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.85rem" }}>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedCountry((prev) =>
                          prev === p.COUNTRY ? "ALL" : (p.COUNTRY || "ALL")
                        )
                      }
                      title={
                        selectedCountry === p.COUNTRY
                          ? "Click to show all countries"
                          : `Filter by ${p.COUNTRY}`
                      }
                      style={{
                        background: selectedCountry === p.COUNTRY ? "#0284c7" : "#e0f2fe",
                        color: selectedCountry === p.COUNTRY ? "#ffffff" : "#0369a1",
                        fontSize: "0.75rem",
                        fontWeight: 800,
                        padding: "0.3rem 0.65rem",
                        borderRadius: "20px",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {p.COUNTRY || "Partner LC"}
                    </button>
                    {p.SDG && (
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedSdg((prev) =>
                            prev === String(p.SDG) ? "ALL" : String(p.SDG)
                          )
                        }
                        title={
                          selectedSdg === String(p.SDG)
                            ? "Click to show all SDGs"
                            : `Filter by SDG #${p.SDG}`
                        }
                        style={{
                          background: selectedSdg === String(p.SDG) ? "#15803d" : "#dcfce7",
                          color: selectedSdg === String(p.SDG) ? "#ffffff" : "#15803d",
                          fontSize: "0.75rem",
                          fontWeight: 800,
                          padding: "0.3rem 0.65rem",
                          borderRadius: "20px",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        SDG #{p.SDG} {SDG_LABELS[p.SDG] ? `• ${SDG_LABELS[p.SDG].split(" ")[0]}` : ""}
                      </button>
                    )}
                  </div>

                  <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.35rem 0", color: "#0f172a" }}>
                    {p.PROJECT || "Global Volunteer Opportunity"}
                  </h2>

                  {p.PROVIDER && (
                    <p style={{ fontSize: "0.85rem", color: "#64748b", margin: "0 0 0.75rem 0", fontWeight: 500 }}>
                      📍 {String(p.PROVIDER)}
                    </p>
                  )}

                  {jobDescStr && (
                    <p
                      style={{
                        fontSize: "0.85rem",
                        color: "#475569",
                        lineHeight: 1.55,
                        margin: "0 0 0.75rem 0",
                        ...(isExpanded
                          ? { whiteSpace: "pre-line" }
                          : {
                              display: "-webkit-box",
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }),
                      }}
                    >
                      {jobDescStr}
                    </p>
                  )}

                  {/* Relational Attributes Badge Strip */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", margin: "0.85rem 0", fontSize: "0.78rem" }}>
                    <span style={{ background: "#f1f5f9", padding: "0.35rem 0.6rem", borderRadius: "6px", fontWeight: 600 }}>
                      ⏱ {p.DURATION ? String(p.DURATION) : p.DURATION_WEEKS ? `${p.DURATION_WEEKS} weeks` : "6 weeks"}
                    </span>
                    <span style={{ background: "#f1f5f9", padding: "0.35rem 0.6rem", borderRadius: "6px", fontWeight: 600 }}>
                      💶 {resolvedFee !== null ? `${resolvedFee} EUR` : p.FEE ? String(p.FEE) : "Inquire with LC"}
                    </span>
                    <span style={{ background: p.ACCOMMODATION_BOOL ? "#f0fdf4" : "#fef2f2", color: p.ACCOMMODATION_BOOL ? "#166534" : "#991b1b", padding: "0.35rem 0.6rem", borderRadius: "6px", fontWeight: 600 }}>
                      🏠 {p.ACCOMMODATION_BOOL ? "Housing: Yes" : "Housing: No/Unconfirmed"}
                    </span>
                    {p.MEALS !== null && p.MEALS !== undefined && String(p.MEALS).trim() !== "" && (
                      <span style={{ background: "#f1f5f9", padding: "0.35rem 0.6rem", borderRadius: "6px", fontWeight: 600 }}>
                        🍽️ {String(p.MEALS)}
                      </span>
                    )}
                    {timelineFormatted && (
                      <span style={{ background: "#f1f5f9", padding: "0.35rem 0.6rem", borderRadius: "6px", fontWeight: 600 }}>
                        📅 {timelineFormatted}
                      </span>
                    )}
                  </div>

                  {/* Expandable Additional Details (Requirements, Transport, Extra Info) */}
                  {isExpanded && (
                    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "0.75rem", marginTop: "0.5rem", fontSize: "0.8rem", color: "#334155", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      {requirementsStr && (
                        <div>
                          <strong>Requirements:</strong> {requirementsStr}
                        </div>
                      )}
                      {transportStr && (
                        <div>
                          <strong>Transportation:</strong> {transportStr}
                        </div>
                      )}
                      {extraInfoStr && (
                        <div>
                          <strong>Extra Info:</strong> {extraInfoStr}
                        </div>
                      )}
                    </div>
                  )}

                  {hasExtraDetails && (
                    <button
                      type="button"
                      onClick={() => toggleCardExpand(cardId)}
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: "0.2rem 0",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "#0284c7",
                        cursor: "pointer",
                      }}
                    >
                      {isExpanded ? "Show less ▴" : "More project details ▾"}
                    </button>
                  )}
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
            );
          })}
        </main>
      )}
    </div>
  );
}