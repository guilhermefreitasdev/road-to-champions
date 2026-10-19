import { useState } from 'react';
import { SAMPLE_AURORA, SAMPLE_TEMPESTADE } from '../data/sample';
import { simulateMap, type MapResult } from '../engine/match';
import { createRng } from '../engine/rng';
import { Scoreboard } from './Scoreboard';

export function App() {
  const [seed, setSeed] = useState(() => String(Date.now()));
  const [result, setResult] = useState<MapResult | null>(null);

  const simulate = () => {
    setResult(simulateMap(SAMPLE_AURORA, SAMPLE_TEMPESTADE, createRng(seed), { map: 'Haven' }));
  };

  return (
    <main className="app">
      <header>
        <h1>Road to Champions</h1>
        <p className="muted">Protótipo do motor de simulação · times e jogadores fictícios de exemplo</p>
      </header>

      <section className="controls">
        <label>
          Seed
          <input value={seed} onChange={(e) => setSeed(e.target.value)} />
        </label>
        <button onClick={simulate}>Simular mapa</button>
        <button className="secondary" onClick={() => setSeed(String(Date.now()))}>
          Nova seed
        </button>
      </section>

      {result && (
        <Scoreboard result={result} teamNames={[SAMPLE_AURORA.name, SAMPLE_TEMPESTADE.name]} />
      )}
    </main>
  );
}
