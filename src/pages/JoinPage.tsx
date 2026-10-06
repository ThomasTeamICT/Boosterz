import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getWidgetByCode } from '../lib/storage';
import { BrandMark } from '../components/Brand';
import '../styles/leerling.css';

const linkStyle = { color: 'var(--text-soft)', fontSize: '0.9rem' };

export function JoinPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // courses.ts (21 kB) hangt aan één functie van vier regels. Lui ophalen
  // scheelt ~4,6 kB gzip op het kritieke leerlingpad; het kost hoogstens een
  // fractie van een seconde op het moment dat er écht een cursuscode getypt is.
  const go = async () => {
    const c = code.trim().toUpperCase();
    if (c.length < 6) {
      setError('Vul de volledige code in (6 tekens).');
      return;
    }
    // Eén codeveld voor alles: eerst widgets, dan cursussen, dan klassen.
    if (getWidgetByCode(c)) {
      navigate(`/speel/${c}`);
      return;
    }
    const { getCourseByCode } = await import('../lib/courses');
    if (getCourseByCode(c)) {
      navigate(`/cursus/lees/${c}`);
      return;
    }
    const { getClassByCode } = await import('../lib/classes');
    const { getClassPackByCode } = await import('../lib/classPack');
    if (getClassByCode(c) || getClassPackByCode(c)) {
      navigate(`/leerling/${c}`);
      return;
    }
    setError(
      `Geen opdracht, cursus of klas gevonden met code ${c} op dit toestel. Werk je thuis? Vraag dan de draagbare link of het klaspakket aan je leerkracht.`
    );
  };

  return (
    <div className="player-shell" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="player-topbar">
        {/* Geen link: een tik op het logo bracht leerlingen in de leerkrachtschil
            (en zaaide daar voorbeeldmateriaal). Leerkrachten hebben hieronder
            hun eigen link. */}
        <span className="topbar-logo" style={{ fontSize: '1.05rem' }}>
          <BrandMark size={28} />
          <span className="wordmark">Booster<b>z</b></span>
        </span>
      </header>
      <main id="main" style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 20 }}>
        <div style={{ maxWidth: 440, width: '100%' }}>
          <div className="card card-pad" style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: '1.45rem' }}>Meedoen met een opdracht</h1>
            <p style={{ color: 'var(--text-soft)' }}>
              Typ de code die je van je leerkracht kreeg: van een oefening, een cursus of van je klas.
            </p>
            <form onSubmit={(e) => { e.preventDefault(); void go(); }}>
              <input
                className="input join-code-input"
                value={code}
                maxLength={6}
                placeholder="ABC123"
                autoFocus
                aria-label="Code van 6 tekens"
                onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setError(''); }}
              />
              {error && <p role="alert" style={{ color: 'var(--err)', fontWeight: 600, marginTop: 10 }}>{error}</p>}
              <button className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 14 }} type="submit" disabled={code.length < 6}>
                Starten
              </button>
            </form>
          </div>
          <p className="join-links" style={{ textAlign: 'center', marginTop: 14, marginBottom: 0, display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/voortgang" className="join-link" style={linkStyle}>
              Mijn voortgang
            </Link>
            <Link to="/klas/open" className="join-link" style={linkStyle}>
              Klaspakket openen
            </Link>
            <Link to="/" className="join-link" style={linkStyle}>
              Ik ben leerkracht
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
