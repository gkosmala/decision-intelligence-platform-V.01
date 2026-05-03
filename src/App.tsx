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
  engine: {
    regime: string;
    score: number;
    expansionNode: ConfluenceNode;
    protectedLabelsOnly: boolean;
  };
};

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1H", "1D", "1W"];

const keyLevels = {
  breakout: 288.62,
  priorHigh: 287.22,
  expansion: 285.45,
  confirm: 280.7,
  trigger: 278.86,
  trap: 278.37,
  fail: 275,
  support: 273.37,
  breakdown: 268.14,
};

const initialCandles = [
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
  { o: 285.18, h: 285.74, l: 285.04, c: 285.34 },
  { o: 285.34, h: 285.6, l: 283.95, c: 284.26 },
  { o: 284.26, h: 284.39, l: 283.01, c: 283.07 },
  { o: 283.07, h: 283.23, l: 282.3, c: 282.39 },
  { o: 282.38, h: 283.23, l: 282.01, c: 283.14 },
  { o: 283.18, h: 283.7, l: 282.92, c: 283.5 },
  { o: 283.48, h: 283.73, l: 282.61, c: 282.61 },
  { o: 282.65, h: 282.91, l: 281.46, c: 281.88 },
  { o: 281.88, h: 282.39, l: 281.75, c: 282.08 },
  { o: 282.1, h: 283.55, l: 281.97, c: 283.53 },
  { o: 283.51, h: 284.03, l: 283.26, c: 284.01 },
  { o: 284.01, h: 284.27, l: 283.68, c: 283.97 },
  { o: 283.95, h: 284.03, l: 283.51, c: 283.94 },
  { o: 283.96, h: 284.02, l: 283.2, c: 283.62 },
  { o: 283.62, h: 284.55, l: 283.55, c: 284.48 },
  { o: 284.47, h: 284.94, l: 284.25, c: 284.81 },
  { o: 284.8, h: 285.49, l: 284.39, c: 285.28 },
  { o: 285.28, h: 285.4, l: 284.65, c: 285.04 },
  { o: 285.04, h: 285.1, l: 280.15, c: 280.15 },
];

function runDecision(price: number, volumeConfirm: boolean): Decision {
  const score = price >= keyLevels.confirm && volumeConfirm ? 82 : price >= keyLevels.trigger ? 49 : 38;
  return {
    status: score >= 80 ? "A LONG" : score >= 45 ? "B TACTICAL LONG" : "STANDDOWN",
    bias: score >= 45 ? "LONG" : "NEUTRAL",
    grade: score >= 80 ? "A" : score >= 45 ? "B" : "C",
    confidence: score >= 80 ? "HIGH" : score >= 45 ? "MEDIUM" : "LOW",
    mode: score >= 80 ? "Expansion Confirmed" : "Retest / Hold Zone",
    score,
    nextAction: price >= keyLevels.trigger ? "Price is above the gap-open anchor but below full confirmation; protect 278.37." : "Wait for reclaim above the gap-open anchor.",
    behavior: price >= keyLevels.trigger ? "ABOVE GAP OPEN ANCHOR" : "WAITING / DIGESTION",
  };
}

function buildConfluenceNodes(price: number): ConfluenceNode[] {
  return [
    { label: "Expansion Node 1", publicLabel: "Expansion Node", level: 288.62, score: 63, tone: "up" as Tone },
    { label: "Liquidity Retest", publicLabel: "Liquidity Retest", level: 287.22, score: 60, tone: "up" as Tone },
    { label: "Expansion Node 2", publicLabel: "Expansion Node", level: 285.45, score: 57, tone: "up" as Tone },
    { label: "Failure Node 1", publicLabel: "Failure Node", level: 275, score: 53, tone: "down" as Tone },
  ].map((node) => ({ ...node, score: Math.max(35, Math.min(94, node.score + (price > keyLevels.trigger && node.tone === "up" ? 5 : 0))) }));
}

function createLiveUpdate(symbol: string, price: number, sequence = 0): LiveDecisionUpdate {
  const volume = Math.round(500000 + Math.random() * 5000000);
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
    engine: {
      regime: decision.mode,
      score: decision.score,
      expansionNode: confluence[0],
      protectedLabelsOnly: true,
    },
  };
}

function useLiveFeed(symbol: string, manualPrice: number, demoFeed: boolean) {
  const [connected, setConnected] = useState(false);
  const [live, setLive] = useState<LiveDecisionUpdate>(() => createLiveUpdate(symbol, manualPrice, 0));
  const sequenceRef = useRef(0);

  useEffect(() => {
    if (demoFeed) {
      setConnected(true);
      const interval = window.setInterval(() => {
        setLive((previous) => {
          sequenceRef.current += 1;
          const directionBias = sequenceRef.current % 7 === 0 ? -1 : 1;
          const drift = ((Math.random() - 0.42) * 1.35) * directionBias;
          const nextPrice = Math.max(1, Number((previous.price + drift).toFixed(2)));
          return createLiveUpdate(symbol, nextPrice, sequenceRef.current);
        });
      }, 1400);
      return () => {
        window.clearInterval(interval);
        setConnected(false);
      };
    }

    const url = import.meta.env.VITE_LIVE_WS_URL || "ws://localhost:4000/live";
    const ws = new WebSocket(url);
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "LIVE_UPDATE" && payload.symbol === symbol) setLive(payload);
    };
    return () => ws.close();
  }, [symbol, demoFeed]);

  useEffect(() => {
    if (!demoFeed) return;
    sequenceRef.current += 1;
    setLive(createLiveUpdate(symbol, manualPrice, sequenceRef.current));
  }, [symbol, manualPrice, demoFeed]);

  return { connected, live };
}

export default function App() {
  const [ticker, setTicker] = useState("AAPL");
  const [priceText, setPriceText] = useState("280.15");
  const [timeframe, setTimeframe] = useState<Timeframe>("5m");
  const [demoFeed, setDemoFeed] = useState(true);
  const [demoShareMode, setDemoShareMode] = useState(true);
  const [activeTab, setActiveTab] = useState("command");
  const [candles, setCandles] = useState(initialCandles);

  const manualPrice = Number(priceText) || 0;
  const { connected, live } = useLiveFeed(ticker, manualPrice, demoFeed);
  const price = live?.price ?? manualPrice;
  const decision = live?.decision ?? runDecision(price, false);
  const nodes = live?.confluence ?? buildConfluenceNodes(price);

  useEffect(() => {
    setCandles((prev) => {
      const prior = prev[prev.length - 1];
      const next = { o: prior.c, h: Math.max(prior.c, price) + 0.12, l: Math.min(prior.c, price) - 0.12, c: price };
      return [...prev.slice(-29), next];
    });
  }, [price]);

  const liveAge = useMemo(() => new Date(live.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }), [live.timestamp]);

  function forceDemoTick() {
    const drift = (Math.random() - 0.45) * 2.2;
    const nextPrice = Math.max(1, Number((price + drift).toFixed(2)));
    setPriceText(nextPrice.toFixed(2));
  }

  return (
    <>
      <style>{css}</style>
      <div className="app">
        <div className="shell">
          <header className="topbar">
            <div>
              <div className="eyebrow">Live Intelligent Decision Platform</div>
              <div className="sim-label">Simulation Mode: Synthetic Feed + Synthetic Flow Engine</div>
              <div className="title-row">
                {demoShareMode && <Badge color="blue">Demo Presentation Mode</Badge>}
                <h1>Decision Command Center</h1>
                <Badge color={connected ? "green" : "yellow"}>{connected ? "LIVE" : "OFFLINE"}</Badge>
                <Badge color="blue">{demoFeed ? "Demo Feed" : "Backend Feed"}</Badge>
                <Badge color="yellow">Tick #{live.sequence}</Badge>
              </div>
            </div>
            <div className="controls">
              <button className="btn blue" onClick={() => setDemoShareMode(!demoShareMode)}>{demoShareMode ? "Exit Demo Mode" : "Enter Demo Mode"}</button>
              <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} />
              <input value={priceText} onChange={(e) => setPriceText(e.target.value)} />
              <div className="timeframes">
                {TIMEFRAMES.map((tf) => (
                  <button key={tf} onClick={() => setTimeframe(tf)} className={timeframe === tf ? "active" : ""}>{tf}</button>
                ))}
              </div>
              <button className="btn light" onClick={() => setDemoFeed(!demoFeed)}>{demoFeed ? "Use Backend Feed" : "Use Demo Feed"}</button>
              <button className="btn green" onClick={forceDemoTick}>Force Tick</button>
            </div>
          </header>

          <nav className="tabs">
            {[
              ["command", "Command Center"],
              ["feed", "Live Feed"],
              ["performance", "Performance"],
              ["merge", "Merge Instructions"],
            ].map(([key, label]) => (
              <button key={key} onClick={() => setActiveTab(key)} className={activeTab === key ? "active" : ""}>{label}</button>
            ))}
          </nav>

          {activeTab === "command" && (
            <main className={demoShareMode ? "demo-scale" : ""}>
              <div className="layout-3">
                <Card className="wide">
                  <div className="card-head">
                    <div>
                      <h2>📊 {ticker} Smart Chart + Live Levels</h2>
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
                  <Metric label="Symbol" value={ticker} />
                  <Metric label="Live Price" value={`$${price.toFixed(2)}`} />
                  <Metric label="Engine Score" value={`${decision.score}%`} />
                  <Metric label="Regime" value={decision.mode} />
                </div>
              </Card>
            </main>
          )}

          {activeTab === "feed" && <LiveFeedPanel live={live} connected={connected} demoFeed={demoFeed} />}
          {activeTab === "performance" && <PerformancePanel price={price} decision={decision} />}
          {activeTab === "merge" && <MergeInstructions />}
        </div>
      </div>
    </>
  );
}

function SmartChart({ candles, price, nodes }: { candles: typeof initialCandles; price: number; nodes: ConfluenceNode[] }) {
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
        {nodes.map((node) => (
          <div key={node.label} className={`node-line ${node.tone}`} style={{ top: `${18 + y(node.level) * 0.66}%` }}>
            <span>{node.publicLabel} {node.score}%</span>
          </div>
        ))}
        <div className="ai-bias">AI Bias<br /><strong>{nodes[0]?.publicLabel} {nodes[0]?.score}%</strong></div>
      </div>
    </div>
  );
}

function DecisionHero({ decision, nodes, price }: { decision: Decision; nodes: ConfluenceNode[]; price: number }) {
  return (
    <Card>
      <div className="decision-hero">
        <div className="hero-top">
          <div>
            <div className="section-label">Decision Engine</div>
            <div className="hero-status">{decision.status}</div>
            <div className="hero-sub">Execution Window</div>
          </div>
          <div className="arrow">▲</div>
        </div>
        <div className="state-pill">Live State: {decision.behavior}</div>
        <div className="next-action">
          <div className="section-label">Next Action</div>
          <h3>{decision.nextAction}</h3>
          <p>Current price: ${price.toFixed(2)} · Top node: {nodes[0]?.publicLabel} {nodes[0]?.score}%</p>
        </div>
        <Progress label="Signal Strength" value={decision.score} />
        <div className="grid-2">
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
      <div className="note yellow">Entry logic: tactical only above 278.86; A-grade continuation requires confirmation above 280.70 with live-volume confirmation.</div>
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
      {rows.map((row) => <LadderRow key={row.label} row={row} price={price} />)}
    </Card>
  );
}

function LadderRow({ row, price }: { row: { label: string; level: number; probability: number; tone: Tone }; price: number }) {
  return (
    <div className="ladder-row">
      <div className="between"><span>{row.label}</span><span className={row.tone}>{row.probability}%</span></div>
      <Bar value={row.probability} />
      <p>Level ${row.level.toFixed(2)} · Current ${price.toFixed(2)}</p>
    </div>
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
      <Metric label="Clock" value={now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} />
      <Metric label="Session Phase" value={phase} />
      <div className="note">Time engine will later ingest event windows, economic releases, opening/closing auction behavior, and proprietary cycle windows.</div>
    </Card>
  );
}

function AlertsPanel({ decision, price }: { decision: Decision; price: number }) {
  const [audioEnabled, setAudioEnabled] = useState(false);
  const alertState = decision.score >= 80 ? "Expansion Alert" : price < keyLevels.trap ? "Trap-Door Alert" : "Monitoring";
  return (
    <Card>
      <h2>🔔 Visual + Audio Alerts</h2>
      <div className={`alert ${alertState === "Monitoring" ? "warn" : "go"}`}>{alertState}</div>
      <button className="btn light full" onClick={() => setAudioEnabled(!audioEnabled)}>Audio Alerts: {audioEnabled ? "ON" : "OFF"}</button>
      <p className="muted">Visual triggers are active now. Browser audio will be wired after backend event severity is finalized.</p>
    </Card>
  );
}

function OptionsMatrix({ price, decision, tick }: { price: number; decision: Decision; tick: number }) {
  const distanceFromTrigger = Math.abs(price - keyLevels.trigger);
  const distanceFromExpansion = Math.abs(price - keyLevels.expansion);
  const volatilityScore = Math.max(18, Math.min(96, Math.round(distanceFromTrigger * 18 + (tick % 9) * 4 + (decision.score > 75 ? 18 : 0))));
  const callPressure = Math.max(12, Math.min(94, Math.round(decision.score + (price > keyLevels.confirm ? 8 : -10) + (price > keyLevels.expansion ? 12 : 0) + (tick % 5))));
  const putPressure = Math.max(8, Math.min(92, Math.round(100 - callPressure + (price < keyLevels.trap ? 22 : 0))));
  const gammaPressure = Math.max(20, Math.min(95, Math.round(55 + (price - keyLevels.confirm) * 7 + (tick % 6) * 2)));

  const flowBias = price >= keyLevels.expansion ? "Call Expansion / Upside Chase" : price >= keyLevels.confirm ? "Call Accumulation / Supportive Flow" : price <= keyLevels.trap ? "Put Dominance / Trap-Door Risk" : "Neutral Rotation / Pinning Behavior";
  const dealerZone = price >= keyLevels.expansion ? "Short Gamma Expansion Risk" : price <= keyLevels.fail ? "Defensive Hedge Pressure" : price >= keyLevels.confirm ? "Dealer Pin 280–285" : "Retest / Balance Zone";
  const dominantStrike = price >= keyLevels.expansion ? "288–290C" : price >= keyLevels.confirm ? "285C / 280P" : price <= keyLevels.trap ? "275P" : "280 Straddle";
  const flowTone: Tone = price >= keyLevels.confirm ? "up" : price <= keyLevels.trap ? "down" : "neutral";

  const zones = [
    ["Call Wall", price >= keyLevels.expansion ? "290" : "285", `${callPressure}% call-side pressure`, "up"],
    ["Put Wall", price <= keyLevels.trap ? "272.5" : "275", `${putPressure}% put-side pressure`, "down"],
    ["Gamma Pivot", price >= keyLevels.confirm ? "282.5" : "280", `${gammaPressure}% dealer sensitivity`, "neutral"],
    ["Vol Trigger", price >= keyLevels.expansion ? "LIVE" : "288", `${volatilityScore}% expansion energy`, "up"],
  ];

  const strategies = [
    ["Bull Put Credit Spread", price > keyLevels.confirm ? "Support confirmed above hold gate" : "Wait for reclaim", Math.max(42, Math.min(78, callPressure - 6))],
    ["Broken-Wing Butterfly", `Center near ${price > keyLevels.expansion ? "288" : "285"} expansion`, Math.max(40, Math.min(74, gammaPressure - 4))],
    ["Iron Condor", dealerZone.includes("Pin") ? "Compression inside dealer pin" : "Lower priority outside pin", Math.max(35, Math.min(70, 88 - volatilityScore))],
    ["Long Strangle", volatilityScore > 65 ? "Expansion conditions improving" : "Wait for stronger volatility trigger", Math.max(32, Math.min(76, volatilityScore - 8))],
  ];

  return (
    <Card>
      <div className="card-head">
        <div><h2>🧱 Dynamic Options Matrix + Flow Map</h2><p>Synthetic demo flow updates each tick from price location, decision score, volatility pressure, and dealer-zone logic.</p></div>
        <Badge color={flowTone === "down" ? "yellow" : flowTone === "up" ? "green" : "blue"}>{flowBias}</Badge>
      </div>
      <div className="grid-4">
        {zones.map(([name, level, desc, tone]) => <ZoneCard key={name as string} name={String(name)} level={String(level)} desc={String(desc)} tone={tone as Tone} />)}
      </div>
      <div className="grid-3">
        <div className="panel"><h3>🌑 Flow Map</h3><p>Bias: <span className={flowTone}>{flowBias}</span></p><div className="grid-2"><Metric label="Call Pressure" value={`${callPressure}%`} /><Metric label="Put Pressure" value={`${putPressure}%`} /></div><p className="muted">Dominant strike cluster: {dominantStrike}</p></div>
        <div className="panel"><h3>📉 Volatility Meter</h3><Bar value={volatilityScore} /><p className="muted">Volatility pressure: {volatilityScore}% · Distance from trigger: {distanceFromTrigger.toFixed(2)}</p><p className="muted">Distance from expansion gate: {distanceFromExpansion.toFixed(2)}</p></div>
        <div className="panel"><h3>🧭 Dealer Zone</h3><p>State: <span className="neutral">{dealerZone}</span></p><p className="muted">Gamma pressure: {gammaPressure}%</p><p className="muted">Tick #{tick} · live demo recalculation active</p></div>
      </div>
      <div className="grid-4">
        {strategies.map(([name, desc, probability]) => <div key={String(name)} className="panel"><h3>{name}</h3><p>{desc}</p><Bar value={Number(probability)} /><p className="score-text">{probability}%</p></div>)}
      </div>
      <div className="note blue">Demo Mode: this is a synthetic options-flow simulator. The live build will replace these synthetic values with Alpaca option chains, snapshots, Greeks, and order/flow-derived analytics.</div>
    </Card>
  );
}

function ZoneCard({ name, level, desc, tone }: { name: string; level: string; desc: string; tone: Tone }) {
  return <div className="panel"><p className="muted">{name}</p><div className={`zone-level ${tone}`}>{level}</div><p className="muted">{desc}</p></div>;
}

function LiveFeedPanel({ live, connected, demoFeed }: { live: LiveDecisionUpdate; connected: boolean; demoFeed: boolean }) {
  return (
    <Card>
      <div className="card-head"><div><h2>🔌 Live Feed Monitor</h2><p>Demo Feed simulates ticks. Backend Feed will not move until ws://localhost:4000/live is running.</p></div><Badge color={connected ? "green" : "yellow"}>{connected ? "Connected" : "Disconnected"}</Badge></div>
      <div className="grid-4 compact"><Metric label="Feed Mode" value={demoFeed ? "Demo" : "Backend"} /><Metric label="Symbol" value={live.symbol} /><Metric label="Price" value={`$${live.price.toFixed(2)}`} /><Metric label="Volume" value={live.volume.toLocaleString()} /><Metric label="Tick #" value={live.sequence} /></div>
      <pre>{JSON.stringify(live, null, 2)}</pre>
    </Card>
  );
}

function PerformancePanel({ price, decision }: { price: number; decision: Decision }) {
  const [exitPrice, setExitPrice] = useState(282.15);
  const [trades, setTrades] = useState<Array<{ id: number; entry: number; exit: number; pnl: number; score: number; status: string }>>([]);
  function logTrade() {
    const pnl = Number(((exitPrice - price) * 10).toFixed(2));
    setTrades([{ id: Date.now(), entry: price, exit: exitPrice, pnl, score: decision.score, status: decision.status }, ...trades]);
  }
  const totalPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);
  const wins = trades.filter((trade) => trade.pnl > 0).length;
  const winRate = trades.length ? Math.round((wins / trades.length) * 100) : 0;
  return (
    <div className="layout-3">
      <Card><h2>📈 Performance Logger</h2><div className="grid-2"><label>Entry<input value={price.toFixed(2)} readOnly /></label><label>Exit<input value={exitPrice} onChange={(e) => setExitPrice(Number(e.target.value) || 0)} /></label></div><button className="btn green full" onClick={logTrade}>Log Outcome</button><div className="note">Current setup: {decision.status} · Score {decision.score}%</div></Card>
      <Card className="wide"><div className="grid-3 compact"><Metric label="Trades" value={trades.length} /><Metric label="Win Rate" value={`${winRate}%`} /><Metric label="Total P&L" value={`${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}`} /></div>{trades.length === 0 && <p className="muted">No outcomes logged yet.</p>}{trades.map((trade) => <div key={trade.id} className="trade-row"><div className="between"><strong>{trade.status} · Score {trade.score}</strong><span className={trade.pnl >= 0 ? "up" : "down"}>{trade.pnl.toFixed(2)}</span></div><p>Entry {trade.entry.toFixed(2)} · Exit {trade.exit.toFixed(2)}</p></div>)}</Card>
    </div>
  );
}

function MergeInstructions() {
  return (
    <Card>
      <h2>🧩 Vite-Ready Setup</h2>
      <p className="muted">This version requires Vite + React only. No Tailwind. No PostCSS. No extra styling packages.</p>
      <Code>{`npm create vite@latest decision-intelligence-platform -- --template react-ts
cd decision-intelligence-platform
npm install

# Replace src/App.tsx with this file
npm run dev`}</Code>
      <Code>{`// Optional .env for future backend feed
VITE_LIVE_WS_URL=ws://localhost:4000/live`}</Code>
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
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function Bar({ value }: { value: number }) {
  return <div className="bar"><div style={{ width: `${value}%` }} /></div>;
}

function Progress({ label, value }: { label: string; value: number }) {
  return <div className="progress"><div className="between"><span>{label}</span><span>{value}%</span></div><Bar value={value} /></div>;
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
.topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; flex-wrap: wrap; }
.eyebrow { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .32em; color: #6ee7b7; }
.sim-label { margin-top: 5px; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .2em; color: #93c5fd; }
h1 { margin: 0; font-size: 32px; line-height: 1; font-weight: 950; }
h2 { margin: 0 0 12px; font-size: 18px; font-weight: 900; }
h3 { margin: 0 0 8px; font-size: 14px; font-weight: 850; }
p { margin: 0; color: #cbd5e1; }
.title-row { margin-top: 10px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; justify-content: flex-end; }
input { background: #0f172a; color: white; border: 1px solid rgba(255,255,255,.10); border-radius: 12px; padding: 10px 12px; width: 110px; outline: none; }
input:focus { border-color: rgba(52,211,153,.55); }
.btn, .tabs button, .timeframes button { border: 0; cursor: pointer; border-radius: 12px; padding: 10px 12px; font-size: 12px; font-weight: 900; }
.btn.light { background: white; color: #020617; }
.btn.green { background: rgba(16,185,129,.12); border: 1px solid rgba(52,211,153,.40); color: #a7f3d0; }
.btn.blue { background: rgba(59,130,246,.10); border: 1px solid rgba(96,165,250,.40); color: #bfdbfe; }
.btn.full { width: 100%; }
.timeframes { display: flex; gap: 4px; padding: 4px; background: #0f172a; border: 1px solid rgba(255,255,255,.10); border-radius: 12px; }
.timeframes button { background: transparent; color: #cbd5e1; }
.timeframes button.active { background: white; color: #020617; }
.tabs { display: flex; gap: 8px; padding: 4px; border-radius: 12px; background: #0f172a; border: 1px solid rgba(255,255,255,.10); overflow-x: auto; }
.tabs button { background: transparent; color: #cbd5e1; white-space: nowrap; }
.tabs button.active { background: white; color: #020617; }
.demo-scale { transform: scale(1.01); transform-origin: top center; }
.card { background: rgba(15,23,42,.72); border: 1px solid rgba(255,255,255,.10); border-radius: 22px; padding: 16px; box-shadow: 0 24px 60px rgba(0,0,0,.28); display: flex; flex-direction: column; gap: 12px; }
.layout-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px; }
.wide { grid-column: span 2; }
.grid-4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 12px 0; }
.grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.compact { margin-bottom: 0; }
.card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
.card-head p, .muted { font-size: 12px; color: #94a3b8; }
.pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 6px 10px; background: #020617; border: 1px solid rgba(255,255,255,.10); color: #cbd5e1; font-size: 12px; }
.badge { display: inline-flex; align-items: center; border-radius: 999px; border: 1px solid; padding: 5px 10px; font-size: 12px; font-weight: 900; }
.badge.green { color: #86efac; background: rgba(16,185,129,.18); border-color: rgba(52,211,153,.50); box-shadow: 0 0 18px rgba(16,185,129,.22); }
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
.bar > div { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #ef4444, #facc15, #34d399); transition: width .25s ease; }
.progress { margin-top: 12px; }
.decision-hero { display: flex; flex-direction: column; gap: 16px; }
.hero-top { display: flex; justify-content: space-between; gap: 12px; }
.section-label { color: #94a3b8; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .28em; }
.hero-status { margin-top: 10px; color: #6ee7b7; font-size: 42px; font-weight: 950; line-height: 1; }
.hero-sub { margin-top: 10px; color: #cbd5e1; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .22em; }
.arrow { width: 56px; height: 56px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.60); border-radius: 16px; color: #6ee7b7; font-size: 30px; }
.state-pill { border-radius: 999px; background: rgba(0,0,0,.30); border: 1px solid rgba(255,255,255,.10); padding: 10px 14px; font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .16em; }
.next-action { border-radius: 18px; background: rgba(0,0,0,.30); border: 1px solid rgba(255,255,255,.10); padding: 18px; }
.next-action h3 { color: white; font-size: 18px; margin-top: 8px; }
.next-action p { font-size: 13px; color: #cbd5e1; margin-top: 8px; }
.chart { position: relative; height: 430px; overflow: hidden; border-radius: 20px; border: 1px solid rgba(255,255,255,.10); background: #020617; padding: 16px; }
.chart-bg { position: absolute; left: 16px; right: 16px; top: 48px; bottom: 40px; border-radius: 14px; border: 1px solid rgba(255,255,255,.06); background: rgba(15,23,42,.30); }
.level { position: absolute; left: 16px; right: 160px; z-index: 10; border-top: 1px solid; }
.level.up { border-color: rgba(52,211,153,.70); }
.level.down { border-color: rgba(248,113,113,.70); }
.level.neutral { border-color: rgba(253,224,71,.70); }
.level span { position: absolute; top: -13px; left: 4px; background: #020617; border: 1px solid rgba(255,255,255,.10); border-radius: 6px; padding: 2px 7px; font-size: 10px; font-weight: 900; color: #e2e8f0; }
.candles { position: absolute; left: 16px; right: 160px; top: 48px; bottom: 40px; z-index: 20; }
.candle { position: absolute; top: 0; bottom: 0; }
.wick { position: absolute; width: 1px; transform: translateX(-50%); }
.wick.up, .body.up { background: #34d399; }
.wick.down, .body.down { background: #f87171; }
.body { position: absolute; width: 10px; transform: translateX(-50%); border-radius: 3px; }
.projection { position: absolute; right: 16px; top: 48px; bottom: 40px; width: 130px; border-radius: 14px; border: 1px solid rgba(255,255,255,.18); background: rgba(0,0,0,.50); padding: 8px; z-index: 30; }
.projection-title { font-size: 10px; color: #94a3b8; font-weight: 950; text-transform: uppercase; letter-spacing: .16em; }
.node-line { position: absolute; left: 8px; right: 8px; border-top: 1px dashed; }
.node-line.up { border-color: rgba(52,211,153,.60); }
.node-line.down { border-color: rgba(248,113,113,.60); }
.node-line span { position: absolute; right: 0; top: -13px; background: #020617; border-radius: 4px; padding: 1px 4px; font-size: 10px; color: #6ee7b7; }
.node-line.down span { color: #fca5a5; }
.ai-bias { position: absolute; left: 8px; right: 8px; bottom: 8px; border: 1px solid rgba(255,255,255,.10); background: rgba(2,6,23,.85); border-radius: 10px; padding: 8px; color: #cbd5e1; font-size: 10px; }
.ai-bias strong { color: #6ee7b7; }
.ladder-row, .panel, .trade-row { border: 1px solid rgba(255,255,255,.10); background: #020617; border-radius: 14px; padding: 12px; margin-bottom: 10px; }
.ladder-row p, .trade-row p { font-size: 10px; color: #94a3b8; margin-top: 6px; }
.alert { border-radius: 18px; padding: 18px; text-align: center; font-weight: 950; }
.alert.warn { border: 1px solid rgba(250,204,21,.30); background: rgba(234,179,8,.10); color: #fef3c7; }
.alert.go { border: 1px solid rgba(52,211,153,.40); background: rgba(16,185,129,.10); color: #d1fae5; }
.zone-level { font-size: 28px; font-weight: 950; margin: 6px 0; }
.score-text { text-align: right; color: #6ee7b7; font-size: 12px; font-weight: 900; margin-top: 8px; }
pre, .code { margin: 0; max-height: 430px; overflow: auto; border-radius: 14px; border: 1px solid rgba(255,255,255,.10); background: rgba(0,0,0,.40); padding: 16px; color: #a7f3d0; font-size: 12px; }
label { color: #94a3b8; font-size: 12px; }
label input { margin-top: 6px; width: 100%; }
@media (max-width: 1100px) { .layout-3, .grid-4, .grid-3 { grid-template-columns: 1fr; } .wide { grid-column: auto; } .topbar { flex-direction: column; } .controls { justify-content: flex-start; } }
@media (max-width: 640px) { .app { padding: 12px; } h1 { font-size: 26px; } .hero-status { font-size: 34px; } .chart { height: 360px; } .projection { width: 110px; } .level, .candles { right: 140px; } }
`;

