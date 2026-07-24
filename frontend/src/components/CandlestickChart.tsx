import { useState } from "react";

const candles = [[36,222,190,232,177],[63,204,213,220,185],[90,217,182,226,166],[117,179,161,193,146],[144,165,178,188,151],[171,177,140,190,128],[198,141,154,165,122],[225,155,125,171,110],[252,128,118,143,99],[279,120,142,151,105],[306,143,109,157,91],[333,111,91,125,73],[360,92,117,128,80],[387,115,78,131,66],[414,81,61,100,44],[441,63,82,94,50],[468,81,46,97,29],[495,49,34,66,19],[522,35,55,75,25],[549,56,18,69,4]] as const;

export function CandlestickChart() {
  return <div className="chart-wrap"><div className="price-scale"><span>152</span><span>150</span><span>148</span><span>146</span><span>144</span></div><svg viewBox="0 0 600 270" role="img" aria-label="SOL USD candlestick chart with green and red candles" preserveAspectRatio="none"><path className="grid-lines" d="M0 25H600M0 85H600M0 145H600M0 205H600M0 265H600" />{candles.map(([x, open, close, high, low], index) => { const green = close < open; return <g key={index}><line x1={x} x2={x} y1={high} y2={low} className={green ? "wick up-wick" : "wick down-wick"}/><rect x={x - 7} y={Math.min(open, close)} width="14" height={Math.max(5, Math.abs(close - open))} rx="1" className={green ? "green-candle" : "red-candle"}/></g>; })}<line x1="0" x2="600" y1="55" y2="55" className="last-price-line"/><rect x="550" y="43" width="50" height="22" rx="2" className="price-tag"/><text x="554" y="58" className="price-text">148.64</text></svg><div className="chart-time"><span>07:00</span><span>09:00</span><span>11:00</span><span>13:00</span><span>15:00</span></div></div>;
}

export function TradingChart() {
  const [timeframe, setTimeframe] = useState("1H");
  return <section className="chart-panel panel"><div className="panel-heading"><div><strong>SOL / USD</strong><span className="live-dot">LIVE</span></div><div className="chart-actions">{["1H", "4H", "1D", "1W"].map(range => <button key={range} onClick={() => setTimeframe(range)} className={timeframe === range ? "selected" : ""}>{range}</button>)}</div></div><div className="chart-meta"><span>O <b>144.28</b></span><span>H <b>151.23</b></span><span>L <b>143.90</b></span><span>C <b className="positive">148.64</b></span><small>{timeframe} view</small></div><CandlestickChart /></section>;
}
