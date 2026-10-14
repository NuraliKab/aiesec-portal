import './App.css';

export default function App() {
  return (
    <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif', backgroundColor: '#f4f6f8', minHeight: '100vh' }}>
      <h1 style={{ color: '#037ef3' }}>AIESEC Trento & Perugia Portal</h1>
      <p style={{ color: '#555' }}>Browse available global volunteer projects below[cite: 1].</p>

      {/* Project Card */}
      <div style={{ 
        background: 'white', 
        borderRadius: '8px', 
        padding: '20px', 
        maxWidth: '400px', 
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        marginTop: '20px'
      }}>
        <span style={{ background: '#e1f5fe', color: '#0288d1', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}>
          🇵🇹 PORTUGAL • SDG 10
        </span>
        
        <h2 style={{ margin: '12px 0 8px 0', fontSize: '20px' }}>Equify</h2>
        <p style={{ fontSize: '14px', color: '#666' }}>Centro Social Nossa Senhora das Graças[cite: 2]</p>
        
        <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '12px 0' }} />
        
        <div style={{ fontSize: '14px', color: '#333', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div>💰 <strong>Fee:</strong> 75 EUR[cite: 2]</div>
          <div>🏠 <strong>Accommodation:</strong> Yes[cite: 2]</div>
          <div>🍽️ <strong>Meals:</strong> 1 meal x day[cite: 2]</div>
          <div>⏳ <strong>Duration:</strong> 6 weeks[cite: 2]</div>
        </div>

        <a 
          href="https://aiesec.org/opportunity/global-volunteer/13282633" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ 
            display: 'block', 
            marginTop: '16px', 
            background: '#037ef3', 
            color: 'white', 
            textAlign: 'center', 
            padding: '10px', 
            borderRadius: '4px', 
            textDecoration: 'none',
            fontWeight: 'bold'
          }}
        >
          View on AIESEC.org →
        </a>
      </div>
    </div>
  );
}
