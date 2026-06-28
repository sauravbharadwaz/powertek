import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Activity, Zap, AlertTriangle, MapPin, ChevronRight, Download, MoreHorizontal,
  Eye, Layers, Ruler, Crosshair, Orbit, RotateCw, Power, Cpu, Boxes, Maximize2,
  UploadCloud, FileUp, Trash2, X, Settings, Box, Mountain, Palette, Gauge, Grid3x3,
  Globe2, Navigation, ExternalLink,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RTooltip, Cell,
} from "recharts";

import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import LidarScene from "@/components/LidarScene";
import ErrorBoundary from "@/components/ErrorBoundary";
import LocationMap from "@/components/LocationMap";
import { CRS_OPTIONS, suggestEpsg, surveyGeo, fmtLatLng } from "@/lib/geo";
import {
  loadPointCloud, demoDataset, availableModes, histogram,
  fmtInt, fmtBytes, fmtNum, CLASSES, TARGET_POINTS,
} from "@/lib/pointcloud";

const C = { cyan: "#22d3ee", crit: "#f43f5e", major: "#f59e0b", ok: "#34d399", grid: "rgba(148,163,184,0.10)" };
const MODE_LABEL = { rgb: "True colour", classification: "Classification", intensity: "Intensity", elevation: "Elevation" };
const MODE_ICON = { rgb: Palette, classification: Layers, intensity: Activity, elevation: Mountain };
const ACCEPT = ".las,.laz,.ply,.xyz,.pts,.csv,.txt,.asc";

function Dot({ color, pulse }) {
  return <span className="inline-block size-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}`, animation: pulse ? "ptk-pulse 1.6s ease-in-out infinite" : "none" }} />;
}

function StatTile({ icon: Icon, label, value, unit, sub, accent }) {
  return (
    <Card className="relative overflow-hidden border-border/60 bg-card/70">
      <div className="pointer-events-none absolute inset-0 opacity-[0.16]" style={{ background: `radial-gradient(120% 80% at 100% 0%, ${accent}33, transparent 60%)` }} />
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
          <span className="flex size-7 items-center justify-center rounded-md border border-border/60" style={{ color: accent }}><Icon className="size-3.5" /></span>
        </div>
        <div className="mt-2 flex items-end gap-1.5">
          <span className="font-mono text-2xl font-semibold leading-none tracking-tight">{value}</span>
          {unit && <span className="mb-0.5 font-mono text-xs text-muted-foreground">{unit}</span>}
        </div>
        {sub && <div className="mt-1.5 font-mono text-[11px] text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

/* colour legend for the active mode */
function Legend({ dataset, mode }) {
  let items = [];
  if (mode === "classification" && dataset.classHist) {
    items = dataset.classHist.slice(0, 8).map((c) => [c.name, c.color, "rect"]);
  } else if (mode === "rgb") {
    items = [["True colour (RGB)", C.cyan, "dot"]];
  } else if (mode === "intensity") {
    items = [["Low return", "#10202c", "rect"], ["High return", "#dff6ff", "rect"]];
  } else {
    items = [["Low", "#1c3aa8", "rect"], ["Mid", C.cyan, "rect"], ["High", "#eafaff", "rect"]];
  }
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-card/70 p-2.5 backdrop-blur-md">
      {items.map(([k, c]) => (
        <span key={k} className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
          <span className="size-2 rounded-sm" style={{ background: c }} /> {k}
        </span>
      ))}
    </div>
  );
}

/* viewer control bar (shared by inline + fullscreen) */
function Controls({ ds, mode, setMode, scan, setScan, autoRotate, setAutoRotate, pointSize, setPointSize, onReset }) {
  const modes = availableModes(ds);
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border/60 bg-card/80 px-2.5 py-2 backdrop-blur-md">
      <span className="px-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">colour</span>
      {modes.map((m) => {
        const Ic = MODE_ICON[m];
        const on = mode === m;
        return (
          <Button key={m} onClick={() => setMode(m)} variant={on ? "default" : "secondary"} size="sm" className="h-7 gap-1 px-2 font-mono text-[10px]" style={on ? { background: C.cyan, color: "#06141c" } : undefined}>
            <Ic className="size-3" /> {MODE_LABEL[m]}
          </Button>
        );
      })}
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Button onClick={() => setScan((s) => !s)} variant={scan ? "default" : "secondary"} size="sm" className="h-7 gap-1 px-2 font-mono text-[10px]" style={scan ? { background: C.cyan, color: "#06141c" } : undefined}><Crosshair className="size-3" /> scan</Button>
      <Button onClick={() => setAutoRotate((a) => !a)} variant={autoRotate ? "default" : "secondary"} size="sm" className="h-7 gap-1 px-2 font-mono text-[10px]" style={autoRotate ? { background: C.cyan, color: "#06141c" } : undefined}><Orbit className="size-3" /> orbit</Button>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <span className="px-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">size</span>
      <input type="range" min={4} max={60} value={pointSize * 100} onChange={(e) => setPointSize(e.target.value / 100)} className="h-1 w-20 cursor-pointer" style={{ accentColor: C.cyan }} />
      <Separator orientation="vertical" className="mx-1 h-5" />
      <Button onClick={onReset} variant="secondary" size="sm" className="h-7 gap-1 px-2 font-mono text-[10px]"><RotateCw className="size-3" /> reset</Button>
    </div>
  );
}

export default function App() {
  const demo = useMemo(() => demoDataset(), []);
  const [datasets, setDatasets] = useState([demo]);
  const [activeId, setActiveId] = useState(demo.id);
  const [loading, setLoading] = useState(null);   // { name, pct }
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("classification");
  const [scan, setScan] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [pointSize, setPointSize] = useState(0.22);
  const [fullOpen, setFullOpen] = useState(false);
  const [viewKey, setViewKey] = useState(0);
  const [now, setNow] = useState(new Date());
  const [toast, setToast] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [epsg, setEpsg] = useState(0);          // active CRS for geolocation
  const [pin, setPin] = useState(null);         // manual [lat,lng] fallback
  const fileRef = useRef(null);

  const ds = datasets.find((d) => d.id === activeId) || demo;

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  // pick sensible defaults whenever the active dataset changes
  useEffect(() => {
    setMode(ds.hasRGB ? "rgb" : ds.hasClass ? "classification" : "elevation");
    setEpsg(ds.ext === "demo" ? 0 : suggestEpsg(ds.bounds).epsg);
    setPin(null);
  }, [activeId]);

  const suggestion = useMemo(
    () => (ds.ext === "demo" ? { epsg: 0, note: "sample data — drop a pin to preview a location" } : suggestEpsg(ds.bounds)),
    [ds]
  );
  const geo = useMemo(() => {
    if (epsg > 0) return surveyGeo(ds.bounds, epsg);
    if (pin) return { center: pin, corners: null };
    return null;
  }, [ds, epsg, pin]);

  function flashToast(m) { setToast(m); setTimeout(() => setToast(null), 2800); }

  async function ingest(files) {
    const list = Array.from(files || []);
    for (const file of list) {
      setError(null);
      setLoading({ name: file.name, pct: 0 });
      try {
        const cloud = await loadPointCloud(file, { onProgress: (p) => setLoading({ name: file.name, pct: Math.round(p * 100) }) });
        setDatasets((d) => [...d, cloud]);
        setActiveId(cloud.id);
        flashToast(`Loaded ${file.name} · ${fmtInt(cloud.total)} pts`);
      } catch (e) {
        console.error(e);
        setError(`${file.name}: ${e.message || e}`);
        flashToast(`Failed to load ${file.name}`);
      } finally {
        setLoading(null);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  // window-wide drag & drop
  useEffect(() => {
    const over = (e) => { e.preventDefault(); setDragging(true); };
    const leave = (e) => { if (e.relatedTarget === null) setDragging(false); };
    const drop = (e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer?.files?.length) ingest(e.dataTransfer.files); };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragover", over); window.removeEventListener("dragleave", leave); window.removeEventListener("drop", drop); };
  }, []);

  function removeDataset(id) {
    setDatasets((d) => {
      const next = d.filter((x) => x.id !== id);
      if (activeId === id) setActiveId(next[next.length - 1]?.id || demo.id);
      return next.length ? next : [demo];
    });
  }

  // derived details
  const [Lx, Ly, Lz] = ds.bounds.size;            // file units (≈ m), Lz = height
  const areaM2 = Math.max(1e-6, Lx * Ly);
  const density = ds.total / areaM2;
  const downsampled = ds.count < ds.total;

  const elevHist = useMemo(() => histogram(ds.elevation, ds.count, 24, ds.bounds.min[2], ds.bounds.max[2]), [ds]);
  const intensHist = useMemo(
    () => (ds.hasIntensity ? histogram(ds.intensity, ds.count, 24, ds.intensityRange[0], ds.intensityRange[1]) : null),
    [ds]
  );

  function exportReport() {
    const report = {
      file: ds.name, format: ds.ext, sizeBytes: ds.sizeBytes,
      totalPoints: ds.total, renderedPoints: ds.count, downsampled,
      bounds: ds.bounds, units: "file units (assumed metres)",
      dimensions: { length: Lx, width: Ly, height: Lz },
      horizontalAreaM2: areaM2, densityPtsPerM2: density,
      attributes: { rgb: ds.hasRGB, intensity: ds.hasIntensity, classification: ds.hasClass },
      intensityRange: ds.intensityRange, classification: ds.classHist,
      generated: now.toISOString(),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${ds.name}.report.json`; a.click(); URL.revokeObjectURL(a.href);
    flashToast("Details report exported (JSON)");
  }

  function exportXyz() {
    const cap = Math.min(ds.count, 300_000);
    const { scale } = ds, cx = ds.bounds.center[0], cy = ds.bounds.center[1], minZ = ds.bounds.min[2];
    const lines = [];
    for (let i = 0; i < cap; i++) {
      const x = ds.positions[i * 3] / scale + cx;
      const z = ds.positions[i * 3 + 1] / scale + minZ;   // height
      const y = ds.positions[i * 3 + 2] / scale + cy;
      const cls = ds.classification ? ` ${ds.classification[i]}` : "";
      lines.push(`${x.toFixed(3)} ${y.toFixed(3)} ${z.toFixed(3)}${cls}`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${ds.name}.downsampled.xyz`; a.click(); URL.revokeObjectURL(a.href);
    flashToast(`Exported ${fmtInt(cap)} points (XYZ${ds.classification ? "+class" : ""})`);
  }

  return (
    <TooltipProvider delayDuration={120}>
      <style>{`
        @keyframes ptk-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(.7)} }
        @keyframes ptk-rise { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      <input ref={fileRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={(e) => ingest(e.target.files)} />

      <div
        className="dark min-h-screen w-full bg-background text-foreground"
        style={{ backgroundImage: `radial-gradient(80% 50% at 100% 0%, rgba(34,211,238,0.06), transparent 60%), linear-gradient(rgba(148,163,184,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.035) 1px, transparent 1px)`, backgroundSize: "auto, 44px 44px, 44px 44px" }}
      >
        <div className="mx-auto flex min-h-screen w-full" style={{ maxWidth: 1500 }}>
          {/* ───────── sidebar ───────── */}
          <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/60 bg-card/40 px-3 py-4 lg:flex">
            <div className="flex items-center gap-2.5 px-2 pb-4">
              <div className="flex size-9 items-center justify-center rounded-lg" style={{ background: `linear-gradient(135deg, ${C.cyan}, #0e7490)`, boxShadow: `0 0 22px ${C.cyan}55` }}>
                <Power className="size-4 text-slate-950" />
              </div>
              <div className="leading-tight">
                <div className="font-mono text-sm font-bold tracking-tight">POWERTEK</div>
                <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">lidar portal</div>
              </div>
            </div>

            <Button onClick={() => fileRef.current?.click()} className="mb-3 h-9 w-full gap-1.5 font-mono text-xs" style={{ background: C.cyan, color: "#06141c" }}>
              <UploadCloud className="size-4" /> Upload survey file
            </Button>

            <div className="px-1 pb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">datasets · {datasets.length}</div>
            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
              {datasets.map((d) => {
                const on = d.id === activeId;
                return (
                  <button key={d.id} onClick={() => setActiveId(d.id)} className={`group flex items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${on ? "border-cyan-500/40 bg-primary/10" : "border-transparent hover:bg-muted/50"}`}>
                    <Box className="size-4 shrink-0" style={{ color: on ? C.cyan : undefined }} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate font-mono text-xs">{d.name}</span>
                      <span className="block truncate font-mono text-[10px] text-muted-foreground">{d.ext === "demo" ? "sample" : `.${d.ext}`} · {fmtInt(d.total)} pts</span>
                    </span>
                    {d.id !== "demo" && (
                      <span onClick={(e) => { e.stopPropagation(); removeDataset(d.id); }} className="hidden rounded p-0.5 text-muted-foreground hover:text-foreground group-hover:block"><Trash2 className="size-3.5" /></span>
                    )}
                  </button>
                );
              })}
            </div>

            {loading && (
              <Card className="mt-3 border-border/60 bg-muted/30">
                <CardContent className="flex flex-col gap-2 p-3">
                  <div className="flex items-center gap-2"><Cpu className="size-3.5" style={{ color: C.cyan }} /><span className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">parsing {loading.name}</span></div>
                  <Progress value={loading.pct} className="h-1.5" />
                  <span className="font-mono text-[10px] text-muted-foreground">{loading.pct}% · down-sampling to {fmtInt(TARGET_POINTS)} pts</span>
                </CardContent>
              </Card>
            )}

            <Separator className="my-3" />
            <div className="flex items-center gap-2.5 rounded-md px-2 py-1">
              <Avatar className="size-8"><AvatarFallback className="bg-primary/15 font-mono text-[11px]" style={{ color: C.cyan }}>SK</AvatarFallback></Avatar>
              <div className="leading-tight"><div className="text-xs font-medium">Saurav K.</div><div className="font-mono text-[10px] text-muted-foreground">LiDAR Ops</div></div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="ml-auto size-7"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end"><DropdownMenuLabel>Account</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem><Settings className="size-4" /> Settings</DropdownMenuItem><DropdownMenuItem><Eye className="size-4" /> Audit log</DropdownMenuItem></DropdownMenuContent>
              </DropdownMenu>
            </div>
          </aside>

          {/* ───────── main ───────── */}
          <main className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border/60 bg-background/80 px-5 py-3 backdrop-blur-md">
              <div className="flex min-w-0 items-center gap-2">
                <Boxes className="size-4 shrink-0" style={{ color: C.cyan }} />
                <span className="truncate font-mono text-sm">{ds.name}</span>
                <Badge variant="outline" className="font-mono text-[10px]">{ds.ext === "demo" ? "sample" : `.${ds.ext}`}</Badge>
                {downsampled && <Badge variant="outline" className="font-mono text-[10px]" style={{ borderColor: C.major, color: C.major }}>down-sampled</Badge>}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <div className="hidden items-center gap-2 rounded-md border border-border/60 px-2.5 py-1.5 sm:flex"><Dot color={C.ok} pulse /><span className="font-mono text-[11px] text-muted-foreground">{now.toLocaleTimeString("en-GB")}</span></div>
                <Tooltip><TooltipTrigger asChild><Button onClick={() => setFullOpen(true)} variant="outline" size="icon" className="size-9"><Maximize2 className="size-4" /></Button></TooltipTrigger><TooltipContent className="font-mono text-xs">Full-screen viewer</TooltipContent></Tooltip>
                <Button onClick={() => fileRef.current?.click()} className="h-9 gap-1.5 font-mono text-xs" style={{ background: C.cyan, color: "#06141c" }}><FileUp className="size-3.5" /> Upload</Button>
              </div>
            </header>

            <div className="flex flex-col gap-4 p-5">
              {error && (
                <div className="flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 font-mono text-xs text-rose-300">
                  <AlertTriangle className="size-4" /> {error}
                </div>
              )}

              {/* hero viewer */}
              <Card className="border-border/60 bg-card/70" style={{ animation: "ptk-rise .5s both" }}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-1.5 text-base"><Boxes className="size-4" style={{ color: C.cyan }} /> LiDAR point cloud</CardTitle>
                      <CardDescription className="font-mono text-[11px]">drag to orbit · scroll to zoom · {fmtInt(ds.count)} of {fmtInt(ds.total)} points shown</CardDescription>
                    </div>
                    <Tooltip><TooltipTrigger asChild><Button onClick={() => setFullOpen(true)} variant="outline" size="icon" className="size-7"><Maximize2 className="size-3.5" /></Button></TooltipTrigger><TooltipContent className="font-mono text-xs">Expand</TooltipContent></Tooltip>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="relative overflow-hidden rounded-md border border-border/60" style={{ height: 520, background: "#070b11" }}>
                    <ErrorBoundary onReset={() => setViewKey((k) => k + 1)}>
                      <LidarScene key={`${ds.id}-${viewKey}`} dataset={ds} mode={mode} scan={scan} autoRotate={autoRotate} pointSize={pointSize} accent={C.cyan} />
                    </ErrorBoundary>
                    <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2"><Dot color={C.cyan} pulse /><span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{MODE_LABEL[mode]}</span></div>
                    <div className="absolute right-3 top-3"><Legend dataset={ds} mode={mode} /></div>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                      <Controls ds={ds} mode={mode} setMode={setMode} scan={scan} setScan={setScan} autoRotate={autoRotate} setAutoRotate={setAutoRotate} pointSize={pointSize} setPointSize={setPointSize} onReset={() => setViewKey((k) => k + 1)} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* stat row */}
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatTile icon={Grid3x3} label="Total points" value={fmtInt(ds.total)} sub={downsampled ? `${fmtInt(ds.count)} rendered` : "all rendered"} accent={C.cyan} />
                <StatTile icon={Ruler} label="Extent (L × W)" value={`${fmtNum(Lx)} × ${fmtNum(Ly)}`} unit="m" sub={`height ${fmtNum(Lz)} m`} accent={C.ok} />
                <StatTile icon={Gauge} label="Point density" value={fmtNum(density)} unit="pts/m²" sub={`area ${fmtNum(areaM2, 0)} m²`} accent={C.major} />
                <StatTile icon={Layers} label="Attributes" value={[ds.hasRGB && "RGB", ds.hasIntensity && "Int.", ds.hasClass && "Class"].filter(Boolean).join(" · ") || "XYZ"} sub={`${availableModes(ds).length} colour modes`} accent={C.cyan} />
              </div>

              {/* geographic location */}
              <Card className="border-border/60 bg-card/70">
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle className="flex items-center gap-1.5 text-base"><Globe2 className="size-4" style={{ color: C.cyan }} /> Geographic location</CardTitle>
                      <CardDescription className="font-mono text-[11px]">real-world position on satellite imagery · free basemap, no key</CardDescription>
                    </div>
                    {geo && (
                      <div className="flex items-center gap-2">
                        <a href={`https://earth.google.com/web/@${geo.center[0]},${geo.center[1]},0a,1200d,35y,0h,0t,0r`} target="_blank" rel="noreferrer">
                          <Button variant="outline" size="sm" className="h-8 gap-1.5 font-mono text-[11px]"><Globe2 className="size-3.5" /> Google Earth <ExternalLink className="size-3" /></Button>
                        </a>
                        <a href={`https://www.google.com/maps/search/?api=1&query=${geo.center[0]},${geo.center[1]}`} target="_blank" rel="noreferrer">
                          <Button variant="outline" size="sm" className="h-8 gap-1.5 font-mono text-[11px]"><MapPin className="size-3.5" /> Maps <ExternalLink className="size-3" /></Button>
                        </a>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                      <div className="h-80 overflow-hidden rounded-md border border-border/60">
                        <LocationMap center={geo?.center || null} corners={geo?.corners || null} accent={C.cyan} onPick={(ll) => { setEpsg(0); setPin(ll); }} />
                      </div>
                      <div className="mt-1.5 font-mono text-[10px] text-muted-foreground">{epsg > 0 ? "footprint reprojected from the file's coordinates" : "click the map to drop a pin for this survey"}</div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <div>
                        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">coordinate system (CRS)</div>
                        <select value={epsg} onChange={(e) => { setEpsg(+e.target.value); setPin(null); }} className="h-9 w-full rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                          {CRS_OPTIONS.map((o) => <option key={o.epsg} value={o.epsg}>{o.label}</option>)}
                        </select>
                        <div className="mt-1.5 flex items-start gap-1.5 font-mono text-[10px] text-muted-foreground"><Navigation className="mt-0.5 size-3 shrink-0" style={{ color: C.major }} /> {suggestion.note}</div>
                      </div>
                      <Separator />
                      <div className="flex flex-col gap-2 font-mono text-[11px]">
                        <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Centre</span><span className="truncate text-right">{geo ? fmtLatLng(geo.center) : "—"}</span></div>
                        <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Source</span><span className="text-right">{epsg > 0 ? `EPSG:${epsg}` : pin ? "manual pin" : "not set"}</span></div>
                        <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Footprint</span><span className="text-right">{epsg > 0 ? `${fmtNum(Lx)} × ${fmtNum(Ly)} m` : "—"}</span></div>
                      </div>
                      {!geo && (
                        <div className="rounded-md border border-border/60 bg-muted/30 p-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
                          No real-world location yet. If the file is projected (e.g. UTM), pick its zone above; otherwise click the map to place it manually.
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* details + charts */}
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                {/* details */}
                <Card className="border-border/60 bg-card/70">
                  <CardHeader className="pb-2"><CardTitle className="text-base">Dataset details</CardTitle><CardDescription className="font-mono text-[11px]">computed from the uploaded cloud</CardDescription></CardHeader>
                  <CardContent className="flex flex-col gap-2 font-mono text-[11px]">
                    {[
                      ["File", `${ds.name}`],
                      ["Size", fmtBytes(ds.sizeBytes)],
                      ["X range", `${fmtNum(ds.bounds.min[0])} → ${fmtNum(ds.bounds.max[0])}`],
                      ["Y range", `${fmtNum(ds.bounds.min[1])} → ${fmtNum(ds.bounds.max[1])}`],
                      ["Z range (elev.)", `${fmtNum(ds.bounds.min[2])} → ${fmtNum(ds.bounds.max[2])} m`],
                      ["Centre", `${fmtNum(ds.bounds.center[0])}, ${fmtNum(ds.bounds.center[1])}`],
                      ds.hasIntensity && ["Intensity", `${fmtInt(ds.intensityRange[0])} – ${fmtInt(ds.intensityRange[1])}`],
                    ].filter(Boolean).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-3 border-b border-border/40 pb-1.5">
                        <span className="text-muted-foreground">{k}</span><span className="truncate text-right">{v}</span>
                      </div>
                    ))}
                  </CardContent>
                  <CardFooter className="flex gap-2 pt-0">
                    <Button onClick={exportReport} variant="outline" size="sm" className="flex-1 gap-1.5 font-mono text-[11px]"><Download className="size-3.5" /> Report</Button>
                    <Button onClick={exportXyz} variant="outline" size="sm" className="flex-1 gap-1.5 font-mono text-[11px]"><Download className="size-3.5" /> XYZ</Button>
                  </CardFooter>
                </Card>

                {/* classification distribution */}
                <Card className="border-border/60 bg-card/70 xl:col-span-2">
                  <CardHeader className="pb-2"><CardTitle className="text-base">{ds.hasClass ? "Classification distribution" : "Elevation distribution"}</CardTitle><CardDescription className="font-mono text-[11px]">{ds.hasClass ? "ASPRS classes present in the cloud" : "point count by height band (m)"}</CardDescription></CardHeader>
                  <CardContent>
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        {ds.hasClass ? (
                          <BarChart layout="vertical" data={ds.classHist.slice(0, 9)} margin={{ top: 4, right: 16, left: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="2 4" stroke={C.grid} horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10, fontFamily: "monospace", fill: "#64748b" }} tickLine={false} axisLine={false} />
                            <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fontFamily: "monospace", fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                            <RTooltip cursor={{ fill: "rgba(148,163,184,0.06)" }} contentStyle={{ background: "#0b1220", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 8, fontFamily: "monospace", fontSize: 11 }} formatter={(v) => [fmtInt(v), "points"]} />
                            <Bar dataKey="count" radius={[0, 3, 3, 0]}>{ds.classHist.slice(0, 9).map((c, i) => <Cell key={i} fill={c.color} />)}</Bar>
                          </BarChart>
                        ) : (
                          <BarChart data={elevHist} margin={{ top: 4, right: 6, left: -16, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="2 4" stroke={C.grid} vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 9, fontFamily: "monospace", fill: "#64748b" }} tickLine={false} axisLine={false} interval={3} />
                            <YAxis tick={{ fontSize: 10, fontFamily: "monospace", fill: "#64748b" }} tickLine={false} axisLine={false} width={40} />
                            <RTooltip cursor={{ fill: "rgba(148,163,184,0.06)" }} contentStyle={{ background: "#0b1220", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 8, fontFamily: "monospace", fontSize: 11 }} formatter={(v) => [fmtInt(v), "points"]} />
                            <Bar dataKey="count" fill={C.cyan} radius={[3, 3, 0, 0]} />
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* histograms */}
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Card className="border-border/60 bg-card/70">
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-1.5 text-base"><Mountain className="size-4" style={{ color: C.cyan }} /> Elevation histogram</CardTitle><CardDescription className="font-mono text-[11px]">points by height band (m above lowest return)</CardDescription></CardHeader>
                  <CardContent>
                    <div className="h-44 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={elevHist} margin={{ top: 4, right: 6, left: -16, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="2 4" stroke={C.grid} vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 9, fontFamily: "monospace", fill: "#64748b" }} tickLine={false} axisLine={false} interval={3} />
                          <YAxis tick={{ fontSize: 10, fontFamily: "monospace", fill: "#64748b" }} tickLine={false} axisLine={false} width={40} />
                          <RTooltip cursor={{ fill: "rgba(148,163,184,0.06)" }} contentStyle={{ background: "#0b1220", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 8, fontFamily: "monospace", fontSize: 11 }} formatter={(v) => [fmtInt(v), "points"]} />
                          <Bar dataKey="count" fill={C.cyan} radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-card/70">
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-1.5 text-base"><Activity className="size-4" style={{ color: C.cyan }} /> Intensity histogram</CardTitle><CardDescription className="font-mono text-[11px]">{ds.hasIntensity ? "return strength distribution" : "no intensity attribute in this file"}</CardDescription></CardHeader>
                  <CardContent>
                    <div className="flex h-44 w-full items-center justify-center">
                      {intensHist ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={intensHist} margin={{ top: 4, right: 6, left: -16, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="2 4" stroke={C.grid} vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 9, fontFamily: "monospace", fill: "#64748b" }} tickLine={false} axisLine={false} interval={3} />
                            <YAxis tick={{ fontSize: 10, fontFamily: "monospace", fill: "#64748b" }} tickLine={false} axisLine={false} width={40} />
                            <RTooltip cursor={{ fill: "rgba(148,163,184,0.06)" }} contentStyle={{ background: "#0b1220", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 8, fontFamily: "monospace", fontSize: 11 }} formatter={(v) => [fmtInt(v), "points"]} />
                            <Bar dataKey="count" fill={C.major} radius={[3, 3, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">— not available —</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex items-center justify-center gap-1.5 pb-2 font-mono text-[10px] text-muted-foreground">
                <Cpu className="size-3" /> parsed in-browser · LAS/LAZ · PLY · XYZ/PTS/CSV · POWERTEK LiDAR portal
              </div>
            </div>
          </main>
        </div>

        {/* fullscreen viewer */}
        <Dialog open={fullOpen} onOpenChange={setFullOpen}>
          <DialogContent className="h-[90vh] max-w-[96vw] overflow-hidden border-border/60 bg-[#070b11] p-0">
            <div className="relative h-full w-full">
              <ErrorBoundary onReset={() => setViewKey((k) => k + 1)}>
                <LidarScene key={`full-${ds.id}-${viewKey}`} dataset={ds} mode={mode} scan={scan} autoRotate={autoRotate} pointSize={pointSize} accent={C.cyan} />
              </ErrorBoundary>
              <div className="pointer-events-none absolute left-4 top-4">
                <DialogTitle className="flex items-center gap-2 font-mono text-sm text-foreground"><Boxes className="size-4" style={{ color: C.cyan }} /> {ds.name}</DialogTitle>
                <DialogDescription className="font-mono text-[11px]">{fmtInt(ds.count)} / {fmtInt(ds.total)} points · {MODE_LABEL[mode]}</DialogDescription>
              </div>
              <div className="absolute right-12 top-4"><Legend dataset={ds} mode={mode} /></div>
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2">
                <Controls ds={ds} mode={mode} setMode={setMode} scan={scan} setScan={setScan} autoRotate={autoRotate} setAutoRotate={setAutoRotate} pointSize={pointSize} setPointSize={setPointSize} onReset={() => setViewKey((k) => k + 1)} />
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* drag overlay */}
        {dragging && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-cyan-500/60 bg-card/80 px-16 py-12">
              <UploadCloud className="size-10" style={{ color: C.cyan }} />
              <span className="font-mono text-sm">Drop survey file to load</span>
              <span className="font-mono text-[11px] text-muted-foreground">LAS · LAZ · PLY · XYZ · PTS · CSV</span>
            </div>
          </div>
        )}

        {/* toast */}
        {toast && (
          <div className="fixed bottom-5 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border/60 bg-card/90 px-4 py-2.5 shadow-xl backdrop-blur-md" style={{ animation: "ptk-rise .3s both" }}>
            <span className="flex size-5 items-center justify-center rounded-full" style={{ background: C.ok, color: "#06141c" }}><svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg></span>
            <span className="font-mono text-xs text-foreground">{toast}</span>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
