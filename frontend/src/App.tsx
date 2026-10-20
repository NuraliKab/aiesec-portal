// import { useState } from 'react';
// import './App.css';

// // 1. DATA CONTRACT
// interface Project {
//   id: string;
//   country: string;
//   flag: string;
//   sdg: number;
//   title: string;
//   provider: string;
//   fee: string;
//   accommodation: string;
//   meals: string;
//   duration: string;
//   link: string;
// }

// // 2. DATA SOURCE
// const SAMPLE_PROJECTS: Project[] = [
//   {
//     id: "13282633",
//     country: "Portugal",
//     flag: "🇵🇹",
//     sdg: 10,
//     title: "Equify",
//     provider: "Centro Social Nossa Senhora das Graças",
//     fee: "75 EUR",
//     accommodation: "Yes",
//     meals: "1 meal x day",
//     duration: "6 weeks",
//     link: "https://aiesec.org/opportunity/global-volunteer/13282633"
//   },
//   {
//     id: "1328011",
//     country: "Greece",
//     flag: "🇬🇷",
//     sdg: 13,
//     title: "Green Leaders",
//     provider: "Camping Rovies",
//     fee: "100€",
//     accommodation: "Tent provided",
//     meals: "No",
//     duration: "6 weeks",
//     link: "https://aiesec.org/opportunity/global-volunteer/1328011"
//   },
//   {
//     id: "1323816",
//     country: "Egypt",
//     flag: "🇪🇬",
//     sdg: 15,
//     title: "Rooted",
//     provider: "Just Like Home",
//     fee: "76.32 EUR",
//     accommodation: "Yes",
//     meals: "Sometimes",
//     duration: "6 weeks",
//     link: "https://aiesec.org/opportunity/global-volunteer/1323816"
//   }
// ];

// export default function App() {
//   // STATE: Stores the user's selected country
//   const [selectedCountry, setSelectedCountry] = useState<string>('All');

//   // FILTER: Equivalent to "SELECT * FROM projects WHERE country = selectedCountry"
//   const filteredProjects = SAMPLE_PROJECTS.filter((project) => {
//     if (selectedCountry === 'All') {
//       return true; // Keep all projects
//     }
//     return project.country === selectedCountry; // Keep only matching projects
//   });

//   return (
//     <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif', backgroundColor: '#f4f6f8', minHeight: '100vh' }}>
//       <h1 style={{ color: '#037ef3' }}>AIESEC Trento & Perugia Portal</h1>
//       <p style={{ color: '#555' }}>Browse available global volunteer projects below[cite: 1].</p>

//       {/* FILTER CONTROLS */}
//       <div style={{ marginTop: '20px', marginBottom: '20px' }}>
//         <label style={{ fontWeight: 'bold', marginRight: '10px' }}>Filter by Country: </label>
//         <select 
//           value={selectedCountry} 
//           onChange={(e) => setSelectedCountry(e.target.value)}
//           style={{ padding: '8px 12px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '14px' }}
//         >
//           <option value="All">All Countries (3)</option>
//           <option value="Portugal">🇵🇹 Portugal</option>
//           <option value="Greece">🇬🇷 Greece</option>
//           <option value="Egypt">🇪🇬 Egypt</option>
//         </select>
//       </div>

//       {/* PROJECT CARDS GRID */}
//       <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
//         {filteredProjects.map((project) => (
//           <div 
//             key={project.id}
//             style={{ 
//               background: 'white', 
//               borderRadius: '8px', 
//               padding: '20px', 
//               width: '320px', 
//               boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
//               display: 'flex',
//               flexDirection: 'column',
//               justifyContent: 'space-between'
//             }}
//           >
//             <div>
//               <span style={{ background: '#e1f5fe', color: '#0288d1', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
//                 {project.flag} {project.country.toUpperCase()} • SDG {project.sdg}
//               </span>
              
//               <h2 style={{ margin: '12px 0 6px 0', fontSize: '20px' }}>{project.title}</h2>
//               <p style={{ fontSize: '13px', color: '#666', minHeight: '36px' }}>{project.provider}</p>
              
//               <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '12px 0' }} />
              
//               <div style={{ fontSize: '14px', color: '#333', display: 'flex', flexDirection: 'column', gap: '6px' }}>
//                 <div>💰 <strong>Fee:</strong> {project.fee}</div>
//                 <div>🏠 <strong>Accommodation:</strong> {project.accommodation}</div>
//                 <div>🍽️ <strong>Meals:</strong> {project.meals}</div>
//                 <div>⏳ <strong>Duration:</strong> {project.duration}</div>
//               </div>
//             </div>

//             <a 
//               href={project.link} 
//               target="_blank" 
//               rel="noopener noreferrer"
//               style={{ 
//                 display: 'block', 
//                 marginTop: '16px', 
//                 background: '#037ef3', 
//                 color: 'white', 
//                 textAlign: 'center', 
//                 padding: '10px', 
//                 borderRadius: '4px', 
//                 textDecoration: 'none',
//                 fontWeight: 'bold'
//               }}
//             >
//               View on AIESEC.org →
//             </a>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }




import projectsData from "./data/projects.json";

export default function App() {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f8fafc", fontFamily: "sans-serif", padding: "2rem 1rem" }}>
      <header style={{ maxWidth: "1200px", margin: "0 auto 2rem auto", textAlign: "center" }}>
        <h1 style={{ color: "#037ef3", fontSize: "2.25rem", margin: "0 0 0.5rem 0" }}>
          AIESEC Trento & Perugia Portal
        </h1>
        <p style={{ color: "#64748b", margin: 0 }}>
          Previewing <strong>{projectsData.length}</strong> live volunteer opportunities from Portugal 🇵🇹
        </p>
      </header>

      <main style={{ maxWidth: "1200px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.5rem" }}>
        {projectsData.map((project: any, index: number) => (
          <div
            key={index}
            style={{
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              padding: "1.5rem",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
              border: "1px solid #e2e8f0",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between"
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <span style={{ fontSize: "0.85rem", fontWeight: "bold", backgroundColor: "#e0f2fe", color: "#0369a1", padding: "0.25rem 0.6rem", borderRadius: "9999px" }}>
                  SDG {project.SDG ? Math.round(Number(project.SDG)) : "N/A"}
                </span>
                <span style={{ fontSize: "1.1rem" }}>{project.FLAG} {project.COUNTRY}</span>
              </div>

              <h2 style={{ fontSize: "1.35rem", margin: "0 0 0.5rem 0", color: "#0f172a" }}>
                {project.PROJECT}
              </h2>

              <p style={{ fontSize: "0.9rem", color: "#475569", margin: "0 0 1rem 0" }}>
                <strong>Provider:</strong> {project.PROVIDER || "N/A"}
              </p>

              <div style={{ fontSize: "0.85rem", color: "#64748b", lineHeight: "1.6", marginBottom: "1rem" }}>
                <div><strong>Duration:</strong> {project.DURATION || "N/A"}</div>
                <div><strong>Fee:</strong> {project.FEE || "None"}</div>
                <div><strong>Accommodation:</strong> {project.ACCOMMODATION || "N/A"}</div>
                <div><strong>Meals:</strong> {project.MEALS || "N/A"}</div>
                {project.REQUIREMENTS && (
                  <div style={{ marginTop: "0.5rem", fontStyle: "italic", color: "#334155" }}>
                    "{project.REQUIREMENTS}"
                  </div>
                )}
              </div>
            </div>

            <a
              href={project["OPPORTUNITY LINK"]}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                textAlign: "center",
                backgroundColor: "#037ef3",
                color: "#ffffff",
                padding: "0.6rem 1rem",
                borderRadius: "8px",
                textDecoration: "none",
                fontWeight: 600,
                marginTop: "0.5rem"
              }}
            >
              View on AIESEC.org →
            </a>
          </div>
        ))}
      </main>
    </div>
  );
}