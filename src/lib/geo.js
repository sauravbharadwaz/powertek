/* ─────────────────────────────────────────────────────────────────────────
   Geo-referencing helpers: turn a point cloud's projected coordinates into
   real-world lat/long so the survey can be placed on a map / 3D globe.

   We can't always read the CRS from the file, so the CRS is user-selectable
   (with a best-effort suggestion), and reprojection is done with proj4.
   ──────────────────────────────────────────────────────────────────────── */
import proj4 from "proj4";

const WGS84 = "+proj=longlat +datum=WGS84 +no_defs";

/* EPSG → proj4 definition */
export function crsDef(epsg) {
  if (epsg === 4326) return WGS84;
  if (epsg === 3857) return "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs";
  // UTM north 326xx / south 327xx
  if (epsg >= 32601 && epsg <= 32660) return `+proj=utm +zone=${epsg - 32600} +datum=WGS84 +units=m +no_defs`;
  if (epsg >= 32701 && epsg <= 32760) return `+proj=utm +zone=${epsg - 32700} +south +datum=WGS84 +units=m +no_defs`;
  return null;
}

/* selectable CRS list for the UI */
export const CRS_OPTIONS = (() => {
  const opts = [
    { epsg: 0, label: "Not georeferenced (drop a pin)" },
    { epsg: 4326, label: "WGS84 lat/long (EPSG:4326)" },
    { epsg: 3857, label: "Web Mercator (EPSG:3857)" },
  ];
  for (let z = 1; z <= 60; z++) opts.push({ epsg: 32600 + z, label: `UTM ${z}N (EPSG:${32600 + z})` });
  for (let z = 1; z <= 60; z++) opts.push({ epsg: 32700 + z, label: `UTM ${z}S (EPSG:${32700 + z})` });
  return opts;
})();

/* best-effort guess of the CRS family from coordinate magnitude */
export function suggestEpsg(bounds) {
  const [minX, minY] = bounds.min, [maxX, maxY] = bounds.max;
  const ax = Math.max(Math.abs(minX), Math.abs(maxX));
  const ay = Math.max(Math.abs(minY), Math.abs(maxY));
  const spanX = maxX - minX, spanY = maxY - minY;
  // a real survey in lat/long covers only a fraction of a degree
  if (ax <= 180 && ay <= 90 && spanX < 3 && spanY < 3) return { epsg: 4326, note: "coordinates look like lat/long" };
  if (ax >= 100000 && ax <= 900000 && ay <= 10000000) {
    // UTM easting/northing — zone can't be inferred from X/Y alone
    return { epsg: 0, note: "looks like UTM (projected) — pick the zone, or drop a pin" };
  }
  return { epsg: 0, note: "coordinates look local/relative — drop a pin to place the survey" };
}

/* reproject a single (x, y) in `epsg` to [lat, lng] */
export function toLatLng(epsg, x, y) {
  const def = crsDef(epsg);
  if (!def) return null;
  try {
    const [lng, lat] = proj4(def, WGS84, [x, y]);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return [lat, lng];
  } catch {
    return null;
  }
}

/* survey footprint + centre in lat/long, or null if it can't be projected */
export function surveyGeo(bounds, epsg) {
  if (!epsg) return null;
  const [minX, minY] = bounds.min, [maxX, maxY] = bounds.max;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const center = toLatLng(epsg, cx, cy);
  if (!center) return null;
  const corners = [
    toLatLng(epsg, minX, minY),
    toLatLng(epsg, maxX, minY),
    toLatLng(epsg, maxX, maxY),
    toLatLng(epsg, minX, maxY),
  ];
  if (corners.some((c) => !c)) return null;
  return { center, corners };
}

export const fmtLatLng = ([lat, lng]) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
