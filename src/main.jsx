import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";
import "./styles.css";

const sizes = Array.from({ length: 20 }, (_, i) => i + 1);

function CircleSelect({ disabled, values, onChange }) {
  return <Popover.Root><Popover.Trigger asChild><button className="control" disabled={disabled}>{values.length ? values.map(v => `${v}″`).join(", ") : "Circles"}<ChevronDown size={14}/></button></Popover.Trigger><Popover.Portal><Popover.Content className="menu" align="end"><button className="option clear" onClick={() => onChange([])}>Clear</button>{sizes.map(size => <button className="option" key={size} onClick={() => onChange(values.includes(size) ? values.filter(v => v !== size) : [...values, size])}>{size}″ {values.includes(size) && <Check size={14}/>}</button>)}</Popover.Content></Popover.Portal></Popover.Root>;
}

function App() {
  const [models, setModels] = useState([]), [selected, setSelected] = useState(null), [circles, setCircles] = useState({}), socket = useRef();
  useEffect(() => { const room = new URL(location).searchParams.get("room"); const ws = socket.current = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/socket${room ? `?room=${room}` : ""}`); ws.onmessage = ({data}) => { const msg = JSON.parse(data); if (msg.models) setModels(msg.models); if (msg.roomId) history.replaceState({}, "", `?room=${msg.roomId}`); }; return () => ws.close(); }, []);
  const model = models.find(m => m.id === selected); const values = model ? circles[model.id] || [] : [];
  return <main><header><div><p>SHARED ONLINE TABLETOP</p><h1>Mistboard</h1></div><div>● Live board</div></header><section className="table"><div className="tools"><button className="control">−</button><button className="control">+</button><button className="control">Reset view</button><button className="control">Measure</button><CircleSelect disabled={!model} values={values} onChange={v => setCircles({...circles,[model.id]:v})}/></div><div className="board">{Object.entries(circles).flatMap(([id, vals]) => { const m=models.find(x=>x.id===id); return m ? vals.map(v=><div className="circle" style={{left:`${m.x}%`,top:`${m.y}%`,width:`${v*2/36*100}%`,height:`${v*2/36*100}%`}} key={`${id}-${v}`}/>) : []; })}{models.map(m=><button className={`model ${selected===m.id?"selected":""}`} onClick={()=>setSelected(m.id)} style={{left:`${m.x}%`,top:`${m.y}%`,background:m.color}} key={m.id}>{m.name[0]}</button>)}</div></section><footer>{model ? `Selected: ${model.name}` : "Select a model"}<span>36″ × 36″</span></footer></main>;
}
createRoot(document.getElementById("root")).render(<App/>);
