import React, { useEffect, useMemo, useRef, useState } from "react";

type Timeframe = "1m" | "5m" | "15m" | "1H" | "1D" | "1W";
type Tone = "up" | "down" | "neutral";

type Decision = {
  status: string;
  bias: string;
  grade: string;
  confidence: string;
  mode: string;
  score: number;
  nextAction: string;
  behavior: string;
};

type ConfluenceNode = {
  label: string;
  publicLabel: string;
  level: number;
  score: number;
  tone: Tone;
};

type LiveDecisionUpdate = {
  type: "LIVE_UPDATE";
  symbol: string;
  price: number;
  volume: number;
  timestamp: string;
  sequence: number;
  decision: Decision;
  confluence: ConfluenceNode[];
};

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1H", "1D", "1W"];

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "https://alpaca-backend-kxfg.onrender.com";

function sanitizeSymbol(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z]/g, "");
}

const keyLevels = {
  breakout: 288.62,
  priorHigh: 287.22,
  expansion: 285.45,
  confirm: 280.7,
  trigger: 278.86,
  trap: 278.37,
  fail: 275,
};

const baseCandles = [
  { o: 278.86, h: 283.75, l: 278.37, c: 280.67 },
  { o: 280.75, h: 281.76, l: 278.64, c: 280.99 },
  { o: 280.99, h: 282.65, l: 280.74, c: 282.15 },
  { o: 282.02, h: 283.73, l: 281.42, c: 283.43 },
  { o: 283.51, h: 284.75, l: 283.21, c: 283.54 },
  { o: 283.55, h: 284.34, l: 282.87, c: 283.95 },
  { o: 283.95, h: 285.45, l: 283.83, c: 285.27 },
  { o: 285.26, h: 286.1, l: 284.35, c: 285.78 },
  { o: 285.78, h: 287.22, l: 285.65, c: 286.1 },
  { o: 286.12, h: 286.46, l: 285.38, c: 285.5 },
  { o: 285.51, h: 286, l: 285.16, c: 285.16 },
  { o: 285.34, h: 285.6, l: 283.95, c: 284.26 },
  { o: 284.26, h: 284.39, l: 283.01, c: 283.07 },
  { o: 283.07, h: 283.23, l: 282.3, c: 282.39 },
  { o: 282.38, h: 283.23, l: 282.01, c: 283.14 },
  { o: 283.48, h: 283.73, l: 282.61, c: 282.61 },
  { o: 282.65, h: 282.91, l: 281.46, c: 281.88 },
  { o: 281.88, h: 282.39, l: 281.75, c: 282.08 },
  { o: 282.1, h: 283.55, l: 281.97, c: 283.53 },
  { o: 283.51, h: 284.03, l: 283.26, c: 284.01 },
  { o: 284.47, h: 284.94, l: 284.25, c: 284.81 },
  { o: 285.04, h: 285.1, l: 280.15, c: 280.15 },
];

function runDecision(price: number, volumeConfirm: boolean): Decision {
  const score =
    price >= keyLevels.confirm && volumeConfirm
      ? 82
      : price >= keyLevels.trigger
        ? 49
        : 38;

  return {
    status: score >= 80 ? "A LONG" : score >= 45 ? "B TACTICAL LONG" : "STANDDOWN",
    bias: score >= 45 ? "LONG" : "NEUTRAL",
    grade: score >= 80 ? "A" : score >= 45 ? "B" : "C",
    confidence: score >= 80 ? "HIGH" : score >= 45 ? "MEDIUM" : "LOW",
    mode: score >= 80 ? "Expansion Confirmed" : "Retest / Hold Zone",
    score,
    nextAction:
      price >= keyLevels.trigger
        ? "Price is above the anchor but below full confirmation; protect failure levels."
        : "Wait for reclaim above the trigger anchor.",
    behavior: price >= keyLevels.trigger ? "ABOVE GAP OPEN ANCHOR" : "WAITING / DIGESTION",
  };
}

function buildConfluenceNodes(price: number): ConfluenceNode[] {
  return [
    { label: "Expansion Node 1", publicLabel: "Expansion Node", level: 288.62, score: 63, tone: "up" as Tone },
    { label: "Liquidity Retest", publicLabel: "Liquidity Retest", level: 287.22, score: 60, tone: "up" as Tone },
    { label: "Expansion Node 2", publicLabel: "Expansion Node", level: 285.45, score: 57, tone: "up" as Tone },
    { label: "Failure Node", publicLabel: "Failure Node", level: 275, score: 53, tone: "down" as Tone },
  ].map((node) => ({
    ...node,
    score: Math.max(
      35,
      Math.min(94, node.score + (price > keyLevels.trigger && node.tone === "up" ? 5 : 0))
    ),
  }));
}

function createLiveUpdate(symbol: string, price: number, volume: number, sequence: number): LiveDecisionUpdate {
  const volumeConfirm = volume > 1500000;
  const decision = runDecision(price, volumeConfirm);
  const confluence = buildConfluenceNodes(price);

  return {
    type: "LIVE_UPDATE",
    symbol,
    price,
    volume,
    timestamp: new Date().toISOString(),
    sequence,
    decision,
    confluence,
  };
}

function useLiveFeed(symbol: string, manualPrice: number, liveMode: boolean) {
  const [connected, setConnected] = useState(false);
  const [live, setLive] = useState<LiveDecisionUpdate>(() =>
    createLiveUpdate(symbol, manualPrice, 750000, 0)
  );
  const sequenceRef = useRef(0);
  const symbolRef = useRef(sanitizeSymbol(symbol));

  useEffect(() => {
    symbolRef.current = sanitizeSymbol(symbol);
  }, [symbol]);

  useEffect(() => {
    let cancelled = false;

    async function fetchLive(currentSymbol: string) {
      if (!liveMode) return;

      try {
        const cleanSymbol = sanitizeSymbol(currentSymbol);
        if (!cleanSymbol) return;

        console.log("FETCHING LIVE SYMBOL:", cleanSymbol);

        const response = await fetch(`${BACKEND_URL}/api/stock/${encodeURIComponent(cleanSymbol)}?t=${Date.now()}`);

        if (!response.ok) {
          throw new Error(`Backend returned ${response.status}`);
        }

        const stock = await response.json();

        if (cancelled) return;

        const livePrice = Number(stock.last ?? stock.close ?? manualPrice);
        const liveVolume = Number(stock.volume ?? 0);

        sequenceRef.current += 1;
        setLive(createLiveUpdate(cleanSymbol, livePrice, liveVolume, sequenceRef.current));
        setConnected(true);
      } catch (error) {
        console.error("Live feed error:", error);
        if (!cancelled) setConnected(false);
      }
    }

    if (liveMode) {
      fetchLive(symbolRef.current);
      const interval = window.setInterval(() => {
        fetchLive(symbolRef.current);
      }, 5000);
      return () => {
        cancelled = true;
        window.clearInterval(interval);
      };
    }

    setConnected(true);
    const interval = window.setInterval(() => {
      sequenceRef.current += 1;
      const drift = (Math.random() - 0.45) * 1.25;
      setLive((prev) =>
        createLiveUpdate(
          symbol,
          Number(Math.max(1, prev.price + drift).toFixed(2)),
          Math.round(500000 + Math.random() * 5000000),
          sequenceRef.current
        )
      );
    }, 1400);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      setConnected(false);
    };
  }, [symbol, liveMode, manualPrice]);

  return { connected, live };
}

export default function App() {
  const [tickerInput, setTickerInput] = useState("AAPL");
  const [activeTicker, setActiveTicker] = useState("AAPL");
  const [priceText, setPriceText] = useState("280.15");
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");
  const [liveMode, setLiveMode] = useState(false);
  const [activeTab, setActiveTab] = useState("command");
  const [candles, setCandles] = useState(baseCandles);

  const manualPrice = Number(priceText) || 0;
  const { connected, live } = useLiveFeed(activeTicker, manualPrice, liveMode);
  useEffect(() => {
  if (liveMode && live?.price) {
    setPriceText(live.price.toFixed(2));
  }
}, [live.price, liveMode]);

  const price = live.price;
  const decision = live.decision;
  const nodes = live.confluence;

    function loadSymbol() {
    const clean = sanitizeSymbol(tickerInput);

    console.log("SETTING TICKER:", clean);

    if (!clean) {
      alert("Invalid symbol");
      return;
    }

    setTickerInput(clean);
    setActiveTicker(clean);
    setCandles(baseCandles);
  }

  useEffect(() => {
    setCandles((prev) => {
      const prior = prev[prev.length - 1];
      const next = {
        o: prior.c,
        h: Math.max(prior.c, price) + 0.12,
        l: Math.min(prior.c, price) - 0.12,
        c: price,
      };
      return [...prev.slice(-29), next];
    });
  }, [price]);

  const liveAge = useMemo(
    () =>
      new Date(live.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    [live.timestamp]
  );

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <div className="shell">
          <header className="topbar">
            <div className="system-header">
              <div className="eyebrow">Sigmalytic System // Decision Layer</div>
              <div className="sim-label">
                {liveMode ? "Live Market Feed · Alpaca IEX · Synthetic Options Intelligence" : "Simulation Mode · Synthetic Feed · Controlled Environment"}
              </div>
              <div className="header-desc">
                Real-time decision intelligence system that scores, interprets, and projects market behavior using multi-layer confluence.
              </div>
              <div className="powered">
                Powered by Confluence Engine · Expansion Node Modeling · Forward Projection Layer
              </div>
              <div className="header-divider" />
            </div>

            <div className="title-row">
              <h1>Decision Command Center</h1>
              <Badge color={connected ? "green" : "yellow"}>{connected ? "LIVE" : "OFFLINE"}</Badge>
              <Badge color="blue">{liveMode ? "Live Alpaca Feed" : "Synthetic Feed"}</Badge>
              <Badge color="yellow">Tick #{live.sequence}</Badge>
            </div>

            <div className="controls">
              <input value={tickerInput} onChange={(e) => setTickerInput(e.target.value.toUpperCase())} />
              <button className="btn green" onClick={loadSymbol}>Load Symbol</button>
              {liveMode ? (
  		<div className="live-price-box">
   		 <span>Live Price</span>
   		 <strong>${price.toFixed(2)}</strong>
 		 </div>
		) : (
  	<input
    value={priceText}
    onChange={(e) => setPriceText(e.target.value)}
    title="Manual synthetic price"
  />
)}
              <div className="timeframes">
                {TIMEFRAMES.map((tf) => (
                  <button key={tf} onClick={() => setTimeframe(tf)} className={timeframe === tf ? "active" : ""}>
                    {tf}
                  </button>
                ))}
              </div>
              <button className="btn light" onClick={() => setLiveMode(!liveMode)}>
                {liveMode ? "Use Synthetic Feed" : "Use Live Alpaca Feed"}
              </button>
            </div>
          </header>

          <nav className="tabs">
            {[
              ["command", "Command Center"],
              ["feed", "Live Feed"],
              ["performance", "Performance"],
              ["merge", "Setup"],
            ].map(([key, label]) => (
              <button key={key} onClick={() => setActiveTab(key)} className={activeTab === key ? "active" : ""}>
                {label}
              </button>
            ))}
          </nav>

          {activeTab === "command" && (
            <main>
              <div className="chart-decision-stack">
                <Card>
                  <div className="card-head">
                    <div>
                      <h2>📊 {activeTicker} Smart Chart + Live Levels</h2>
                      <p>Last update {liveAge} · Vol {live.volume.toLocaleString()} · {timeframe}</p>
                    </div>
                    <span className="pill">Last ${price.toFixed(2)}</span>
                  </div>
                  <SmartChart candles={candles} price={price} nodes={nodes} />
                </Card>

                <DecisionHero decision={decision} nodes={nodes} price={price} />
              </div>

              <div className="grid-4">
                <TradeCard price={price} decision={decision} />
                <ProbabilityLadder price={price} nodes={nodes} decision={decision} />
                <TimeEngine />
                <AlertsPanel decision={decision} price={price} />
              </div>

              <OptionsMatrix price={price} decision={decision} tick={live.sequence} />

              <Card>
                <div className="grid-4 compact">
                  <Metric label="Symbol" value={activeTicker} />
                  <Metric label="Live Price" value={`$${price.toFixed(2)}`} />
                  <Metric label="Engine Score" value={`${decision.score}%`} />
                  <Metric label="Regime" value={decision.mode} />
                </div>
              </Card>
            </main>
          )}

          {activeTab === "feed" && <LiveFeedPanel live={live} connected={connected} liveMode={liveMode} />}
          {activeTab === "performance" && <PerformancePanel price={price} decision={decision} />}
          {activeTab === "merge" && <MergeInstructions />}
        </div>
      </div>
    </>
  );
}

function SmartChart({ candles, price, nodes }: { candles: typeof baseCandles; price: number; nodes: ConfluenceNode[] }) {
  const chartLevels = [
    { level: keyLevels.breakout, label: "288.62 Breakout", tone: "up" as Tone },
    { level: keyLevels.priorHigh, label: "287.22 Liquidity", tone: "up" as Tone },
    { level: keyLevels.expansion, label: "285.45 Expansion", tone: "up" as Tone },
    { level: keyLevels.confirm, label: "280.70 Hold Gate", tone: "neutral" as Tone },
    { level: keyLevels.trigger, label: "278.86 Trigger", tone: "neutral" as Tone },
    { level: keyLevels.trap, label: "278.37 Trap Door", tone: "down" as Tone },
    { level: keyLevels.fail, label: "275.00 Fail Gate", tone: "down" as Tone },
  ];

  const all = candles.flatMap((c) => [c.h, c.l]).concat(chartLevels.map((l) => l.level), nodes.map((n) => n.level), price);
  const max = Math.max(...all) + 0.75;
  const min = Math.min(...all) - 0.75;
  const y = (value: number) => ((max - value) / (max - min)) * 100;

  return (
    <div className="chart">
      <div className="chart-model-label">MODEL: CONFLUENCE ENGINE v1.0</div>
      <div className="chart-bg" />

      {chartLevels.map((level) => (
        <div key={level.label} className={`level ${level.tone}`} style={{ top: `${18 + y(level.level) * 0.66}%` }}>
          <span>{level.label}</span>
        </div>
      ))}

      <div className="candles">
        {candles.map((c, i) => {
          const x = (i / Math.max(candles.length - 1, 1)) * 100;
          const up = c.c >= c.o;
          const highY = y(c.h);
          const lowY = y(c.l);
          const openY = y(c.o);
          const closeY = y(c.c);
          const bodyTop = Math.min(openY, closeY);
          const bodyHeight = Math.max(Math.abs(closeY - openY), 1.3);
          return (
            <div key={i} className="candle" style={{ left: `${x}%` }}>
              <div className={`wick ${up ? "up" : "down"}`} style={{ top: `${highY}%`, height: `${Math.max(lowY - highY, 1)}%` }} />
              <div className={`body ${up ? "up" : "down"}`} style={{ top: `${bodyTop}%`, height: `${bodyHeight}%` }} />
            </div>
          );
        })}
      </div>

      <div className="projection">
        <div className="projection-title">Forward Projection</div>
        <div className="ghost-candle-wrap">
          <div className="ghost-label">Ghost Candle</div>
          <div className="ghost-track">
            <div className="ghost-wick" />
            <div className="ghost-body" />
          </div>
          <div className="ghost-price">Projected Path</div>
        </div>

        {nodes.map((node) => (
          <div key={node.label} className={`node-line ${node.tone}`} style={{ top: `${47 + y(node.level) * 0.46}%` }}>
            <span>{node.publicLabel} {node.score}%</span>
          </div>
        ))}

        <div className="ai-bias">
          Model Bias<br />
          <strong>{nodes[0]?.publicLabel} {nodes[0]?.score}%</strong>
        </div>
      </div>
    </div>
  );
}

function DecisionHero({ decision, nodes, price }: { decision: Decision; nodes: ConfluenceNode[]; price: number }) {
  return (
    <Card className="decision-wide">
      <div className="decision-hero">
        <div className="hero-top">
          <div>
            <div className="section-label">Decision Engine</div>
            <div className="hero-status">{decision.status}</div>
            <div className="hero-sub">Execution Window</div>
            <div className="hero-desc">Confluence-driven signal derived from multi-factor expansion modeling</div>
          </div>
          <div className="arrow">▲</div>
        </div>

        <div className="state-pill">Live State: {decision.behavior}</div>

        <div className="next-action">
          <div className="section-label">Execution Directive</div>
          <h3>{decision.nextAction}</h3>
          <p>Current price: ${price.toFixed(2)} · Top node: {nodes[0]?.publicLabel} {nodes[0]?.score}%</p>
        </div>

        <Progress label="Signal Strength" value={decision.score} />

        <div className="grid-2 decision-metrics">
          <Metric label="Bias" value={decision.bias} />
          <Metric label="Grade" value={decision.grade} />
          <Metric label="Confidence" value={decision.confidence} />
          <Metric label="Mode" value={decision.mode} />
        </div>
      </div>
    </Card>
  );
}

function TradeCard({ price, decision }: { price: number; decision: Decision }) {
  const size = decision.score >= 80 ? "FULL" : decision.score >= 65 ? "HALF" : decision.score >= 45 ? "PROBE" : "NONE";
  return (
    <Card>
      <h2>🎯 Trade Card</h2>
      <Metric label="Bias" value={decision.bias} />
      <Metric label="Setup" value={decision.status} />
      <Metric label="Suggested Size" value={size} />
      <div className="note yellow">Entry logic: tactical only above trigger; A-grade continuation requires confirmation with live-volume expansion.</div>
      <p className="muted">Live reference: ${price.toFixed(2)}</p>
    </Card>
  );
}

function ProbabilityLadder({ price, nodes, decision }: { price: number; nodes: ConfluenceNode[]; decision: Decision }) {
  const rows = [
    { label: "Upside Expansion", level: nodes[0]?.level ?? 288.62, probability: nodes[0]?.score ?? 63, tone: "up" as Tone },
    { label: "Liquidity Retest", level: nodes[1]?.level ?? 287.22, probability: nodes[1]?.score ?? 60, tone: "up" as Tone },
    { label: "Hold / Balance", level: keyLevels.confirm, probability: decision.score, tone: "neutral" as Tone },
    { label: "Failure Gate", level: keyLevels.fail, probability: 100 - decision.score, tone: "down" as Tone },
  ];

  return (
    <Card>
      <h2>🪜 Probability Ladder</h2>
      {rows.map((row) => (
        <div className="ladder-row" key={row.label}>
          <div className="between"><span>{row.label}</span><span className={row.tone}>{row.probability}%</span></div>
          <Bar value={row.probability} />
          <p>Level ${row.level.toFixed(2)} · Current ${price.toFixed(2)}</p>
        </div>
      ))}
    </Card>
  );
}

function TimeEngine() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const minutes = now.getHours() * 60 + now.getMinutes();
  const inSession = minutes >= 570 && minutes <= 960;
  const phase = !inSession ? "Outside RTH" : minutes < 630 ? "Opening Drive" : minutes < 840 ? "Midday Auction" : "Closing Auction";
  
  return (
    <Card>
      <h2>⏱️ Time Engine</h2>
      <Metric label="Clock" value={now.toLocaleTimeString()} />
      <Metric label="Session Phase" value={phase} />
      <div className="note">Future layer: event windows, economic releases, opening/closing auction behavior, and proprietary cycle windows.</div>
    </Card>
  );
}

function AlertsPanel({ decision, price }: { decision: Decision; price: number }) {
  const alertState = decision.score >= 80 ? "Expansion Alert" : price < keyLevels.trap ? "Trap-Door Alert" : "Monitoring";
  return (
    <Card>
      <h2>🔔 Visual + Audio Alerts</h2>
      <div className={`alert ${alertState === "Monitoring" ? "warn" : "go"}`}>{alertState}</div>
      <p className="muted">Visual triggers active. Browser audio can be added after alert severity rules are finalized.</p>
    </Card>
  );
}

function OptionsMatrix({ price, decision, tick }: { price: number; decision: Decision; tick: number }) {
  const volatilityScore = Math.max(18, Math.min(96, Math.round(Math.abs(price - keyLevels.trigger) * 18 + (tick % 9) * 4)));
  const callPressure = Math.max(12, Math.min(94, Math.round(decision.score + (price > keyLevels.confirm ? 8 : -10) + (tick % 5))));
  const putPressure = Math.max(8, Math.min(92, 100 - callPressure));
  const gammaPressure = Math.max(20, Math.min(95, Math.round(55 + (price - keyLevels.confirm) * 7)));

  const flowBias = price >= keyLevels.confirm ? "Call Accumulation / Supportive Flow" : "Neutral Rotation / Pinning Behavior";

  return (
    <Card>
      <div className="card-head">
        <div>
          <h2>🧱 Dynamic Options Matrix + Flow Map</h2>
          <p>Synthetic options intelligence derived from underlying price, volume, volatility proxy, and decision score.</p>
        </div>
        <Badge color="blue">{flowBias}</Badge>
      </div>

      <div className="grid-4">
        <ZoneCard name="Call Wall" level="285" desc={`${callPressure}% call-side pressure`} tone="up" />
        <ZoneCard name="Put Wall" level="275" desc={`${putPressure}% put-side pressure`} tone="down" />
        <ZoneCard name="Gamma Pivot" level="280" desc={`${gammaPressure}% dealer sensitivity`} tone="neutral" />
        <ZoneCard name="Vol Trigger" level="LIVE" desc={`${volatilityScore}% expansion energy`} tone="up" />
      </div>

      <div className="note blue">This remains a synthetic options layer until Tradier or another options data source is connected.</div>
    </Card>
  );
}

function ZoneCard({ name, level, desc, tone }: { name: string; level: string; desc: string; tone: Tone }) {
  return (
    <div className="panel">
      <p className="muted">{name}</p>
      <div className={`zone-level ${tone}`}>{level}</div>
      <p className="muted">{desc}</p>
    </div>
  );
}

function LiveFeedPanel({ live, connected, liveMode }: { live: LiveDecisionUpdate; connected: boolean; liveMode: boolean }) {
  return (
    <Card>
      <div className="card-head">
        <div>
          <h2>🔌 Live Feed Monitor</h2>
          <p>Backend URL: {BACKEND_URL}</p>
        </div>
        <Badge color={connected ? "green" : "yellow"}>{connected ? "Connected" : "Disconnected"}</Badge>
      </div>
      <div className="grid-4 compact">
        <Metric label="Feed Mode" value={liveMode ? "Live Alpaca" : "Synthetic"} />
        <Metric label="Symbol" value={live.symbol} />
        <Metric label="Price" value={`$${live.price.toFixed(2)}`} />
        <Metric label="Volume" value={live.volume.toLocaleString()} />
      </div>
      <pre>{JSON.stringify(live, null, 2)}</pre>
    </Card>
  );
}

function PerformancePanel({ price, decision }: { price: number; decision: Decision }) {
  return (
    <Card>
      <h2>📈 Performance Logger</h2>
      <Metric label="Current Price" value={`$${price.toFixed(2)}`} />
      <Metric label="Current Setup" value={decision.status} />
      <Metric label="Score" value={`${decision.score}%`} />
      <div className="note">Trade logging can be reconnected after the live feed stabilizes.</div>
    </Card>
  );
}

function MergeInstructions() {
  return (
    <Card>
      <h2>🧩 Setup</h2>
      <Code>{`Frontend: Vercel
Backend: Render
Live backend URL:
${BACKEND_URL}`}</Code>
    </Card>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

function Badge({ children, color = "green" }: { children: React.ReactNode; color?: "green" | "blue" | "yellow" }) {
  return <span className={`badge ${color}`}>{children}</span>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <div className="bar">
      <div style={{ width: `${value}%` }} />
    </div>
  );
}

function Progress({ label, value }: { label: string; value: number }) {
  return (
    <div className="progress">
      <div className="between"><span>{label}</span><span>{value}%</span></div>
      <Bar value={value} />
    </div>
  );
}

function Code({ children }: { children: string }) {
  return <pre className="code"><code>{children}</code></pre>;
}

const css = `
* { box-sizing: border-box; }
body { margin: 0; background: #020617; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: white; }
button, input { font: inherit; }
.app { min-height: 100vh; background: #020617; padding: 24px; }
.shell { max-width: 1400px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }
.topbar { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px; }
.system-header { width: 100%; text-align: center; }
.eyebrow { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .32em; color: #6ee7b7; }
.sim-label { margin-top: 6px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .2em; color: #93c5fd; }
.header-desc { margin: 10px auto 0; font-size: 12px; color: #94a3b8; max-width: 760px; }
.powered { margin-top: 6px; font-size: 11px; color: #64748b; letter-spacing: .08em; }
.header-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 16px auto 0; width: 60%; }
h1 { margin: 0; font-size: 32px; line-height: 1; font-weight: 950; }
h2 { margin: 0 0 12px; font-size: 18px; font-weight: 900; color: #f8fafc; }
h3 { margin: 0 0 8px; font-size: 14px; font-weight: 850; }
p { margin: 0; color: #cbd5e1; }
.title-row, .controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px; }
input { background: #0f172a; color: white; border: 1px solid rgba(255,255,255,.10); border-radius: 12px; padding: 10px 12px; width: 110px; outline: none; }
.btn, .tabs button, .timeframes button { border: 0; cursor: pointer; border-radius: 12px; padding: 10px 12px; font-size: 12px; font-weight: 900; }
.btn.light { background: white; color: #020617; }
.btn.green { background: rgba(16,185,129,.12); border: 1px solid rgba(52,211,153,.40); color: #a7f3d0; }
.timeframes { display: flex; gap: 4px; padding: 4px; background: #0f172a; border: 1px solid rgba(255,255,255,.10); border-radius: 12px; }
.timeframes button { background: transparent; color: #cbd5e1; }
.timeframes button.active { background: white; color: #020617; }
.tabs { display: flex; gap: 8px; padding: 4px; border-radius: 12px; background: #0f172a; border: 1px solid rgba(255,255,255,.10); overflow-x: auto; justify-content: center; }
.tabs button { background: transparent; color: #cbd5e1; white-space: nowrap; }
.tabs button.active { background: white; color: #020617; }
.card { background: rgba(15,23,42,.72); border: 1px solid rgba(255,255,255,.10); border-radius: 22px; padding: 16px; box-shadow: 0 24px 60px rgba(0,0,0,.28); display: flex; flex-direction: column; gap: 12px; }
.chart-decision-stack { display: flex; flex-direction: column; gap: 16px; margin-bottom: 16px; }
.grid-4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px; }
.grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.compact { margin-bottom: 0; }
.card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.card-head p, .muted { font-size: 12px; color: #94a3b8; }
.pill { border-radius: 999px; padding: 6px 10px; background: #020617; border: 1px solid rgba(255,255,255,.10); color: #cbd5e1; font-size: 12px; }
.badge { border-radius: 999px; border: 1px solid; padding: 5px 10px; font-size: 12px; font-weight: 900; }
.badge.green { color: #86efac; background: rgba(16,185,129,.18); border-color: rgba(52,211,153,.50); }
.badge.blue { color: #93c5fd; background: rgba(59,130,246,.12); border-color: rgba(96,165,250,.38); }
.badge.yellow { color: #fde68a; background: rgba(234,179,8,.12); border-color: rgba(250,204,21,.38); }
.metric { background: rgba(0,0,0,.25); border: 1px solid rgba(255,255,255,.10); border-radius: 14px; padding: 12px; min-height: 62px; }
.metric span { display: block; color: #94a3b8; font-size: 12px; margin-bottom: 4px; }
.metric strong { display: block; color: white; font-weight: 950; }
.note { border: 1px solid rgba(255,255,255,.10); background: #020617; border-radius: 14px; padding: 12px; color: #cbd5e1; font-size: 12px; }
.note.yellow { border-color: rgba(250,204,21,.22); background: rgba(234,179,8,.10); color: #fef3c7; }
.note.blue { border-color: rgba(96,165,250,.25); background: rgba(59,130,246,.10); color: #dbeafe; }
.between { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.up { color: #6ee7b7; }
.down { color: #fca5a5; }
.neutral { color: #fde68a; }
.bar { height: 10px; background: #1e293b; border-radius: 999px; overflow: hidden; margin-top: 8px; }
.bar > div { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #ef4444, #facc15, #34d399); }
.progress { margin-top: 12px; }
.decision-wide .decision-hero { display: grid; grid-template-columns: 1.15fr 1fr 1fr; align-items: stretch; gap: 18px; }
.hero-top { display: flex; justify-content: space-between; gap: 12px; }
.section-label { color: #94a3b8; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .28em; }
.hero-status { margin-top: 10px; color: #6ee7b7; font-size: 42px; font-weight: 950; line-height: 1; }
.hero-sub { margin-top: 10px; color: #cbd5e1; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .22em; }
.hero-desc { font-size: 11px; color: #94a3b8; margin-top: 6px; }
.arrow { width: 56px; height: 56px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.60); border-radius: 16px; color: #6ee7b7; font-size: 30px; }
.state-pill { grid-column: 1 / -1; text-align: center; border-radius: 999px; background: rgba(0,0,0,.30); border: 1px solid rgba(255,255,255,.10); padding: 10px 14px; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .16em; }
.next-action { border-radius: 18px; background: rgba(0,0,0,.30); border: 1px solid rgba(255,255,255,.10); padding: 18px; }
.next-action h3 { color: white; font-size: 18px; margin-top: 8px; }
.next-action p { font-size: 13px; color: #cbd5e1; margin-top: 8px; }
.decision-metrics { grid-column: 1 / -1; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.chart { position: relative; height: 430px; overflow: hidden; border-radius: 20px; border: 1px solid rgba(255,255,255,.10); background: #020617; padding: 16px; }
.chart-model-label { position: absolute; top: 10px; right: 14px; font-size: 10px; color: #64748b; letter-spacing: .18em; font-weight: 700; z-index: 70; }
.chart-bg { position: absolute; left: 16px; right: 180px; top: 48px; bottom: 40px; border-radius: 14px; border: 1px solid rgba(255,255,255,.06); background: rgba(15,23,42,.30); }
.level { position: absolute; left: 16px; right: 180px; z-index: 10; border-top: 1px solid; }
.level.up { border-color: rgba(52,211,153,.70); }
.level.down { border-color: rgba(248,113,113,.70); }
.level.neutral { border-color: rgba(253,224,71,.70); }
.level span { position: absolute; top: -13px; left: 4px; background: #020617; border: 1px solid rgba(255,255,255,.10); border-radius: 6px; padding: 2px 7px; font-size: 10px; font-weight: 900; color: #e2e8f0; }
.candles { position: absolute; left: 16px; right: 180px; top: 48px; bottom: 40px; z-index: 20; }
.candle { position: absolute; top: 0; bottom: 0; }
.wick { position: absolute; width: 1px; transform: translateX(-50%); }
.wick.up, .body.up { background: #34d399; }
.wick.down, .body.down { background: #f87171; }
.body { position: absolute; width: 10px; transform: translateX(-50%); border-radius: 3px; }
.projection { position: absolute; right: 16px; top: 48px; bottom: 40px; width: 150px; border-radius: 14px; border: 1px solid rgba(255,255,255,.18); background: rgba(0,0,0,.50); padding: 8px; z-index: 30; }
.projection-title { font-size: 10px; color: #94a3b8; font-weight: 950; text-transform: uppercase; letter-spacing: .16em; }
.ghost-candle-wrap { position: absolute; left: 10px; right: 10px; top: 34px; height: 118px; border: 1px solid rgba(52,211,153,.18); border-radius: 12px; background: rgba(15,23,42,.55); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
.ghost-label { font-size: 9px; color: #93c5fd; text-transform: uppercase; letter-spacing: .14em; font-weight: 900; }
.ghost-track { position: relative; height: 56px; width: 22px; display: flex; align-items: center; justify-content: center; }
.ghost-wick { position: absolute; height: 56px; width: 1px; background: rgba(148,163,184,.75); }
.ghost-body { position: absolute; height: 34px; width: 13px; border-radius: 4px; border: 1px dashed rgba(52,211,153,.85); background: rgba(52,211,153,.14); }
.ghost-price { font-size: 9px; color: #94a3b8; }
.node-line { position: absolute; left: 8px; right: 8px; border-top: 1px dashed; }
.node-line.up { border-color: rgba(52,211,153,.60); }
.node-line.down { border-color: rgba(248,113,113,.60); }
.node-line span { position: absolute; right: 0; top: -13px; background: #020617; border-radius: 4px; padding: 1px 4px; font-size: 10px; color: #6ee7b7; }
.ai-bias { position: absolute; left: 8px; right: 8px; bottom: 8px; border: 1px solid rgba(255,255,255,.10); background: rgba(2,6,23,.85); border-radius: 10px; padding: 8px; color: #cbd5e1; font-size: 10px; }
.ai-bias strong { color: #6ee7b7; }
.ladder-row, .panel, .trade-row { border: 1px solid rgba(255,255,255,.10); background: #020617; border-radius: 14px; padding: 12px; margin-bottom: 10px; }
.ladder-row p { font-size: 10px; color: #94a3b8; margin-top: 6px; }
.alert { border-radius: 18px; padding: 18px; text-align: center; font-weight: 950; }
.alert.warn { border: 1px solid rgba(250,204,21,.30); background: rgba(234,179,8,.10); color: #fef3c7; }
.alert.go { border: 1px solid rgba(52,211,153,.40); background: rgba(16,185,129,.10); color: #d1fae5; }
.zone-level { font-size: 28px; font-weight: 950; margin: 6px 0; }
pre, .code { margin: 0; max-height: 430px; overflow: auto; border-radius: 14px; border: 1px solid rgba(255,255,255,.10); background: rgba(0,0,0,.40); padding: 16px; color: #a7f3d0; font-size: 12px; }
.live-price-box {
  background: #0f172a;
  color: white;
  border: 1px solid rgba(52,211,153,.40);
  border-radius: 12px;
  padding: 8px 14px;
  width: 130px;
  min-height: 50px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: left;
}

.live-price-box span {
  font-size: 10px;
  color: #94a3b8;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .12em;
}

.live-price-box strong {
  font-size: 18px;
  color: #6ee7b7;
  font-weight: 950;
}
@media (max-width: 1100px) {
  .grid-4 { grid-template-columns: 1fr; }
  .decision-wide .decision-hero { grid-template-columns: 1fr; }
  .decision-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .app { padding: 12px; }
  h1 { font-size: 26px; }
  .hero-status { font-size: 34px; }
  .chart { height: 360px; }
  .projection { width: 120px; }
  .chart-bg, .level, .candles { right: 150px; }
}
`;