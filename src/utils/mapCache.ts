/**
 * Кэш тайлов карты (Cache Storage) + предзагрузка области.
 * Дублирует клиентский слой к SW (`startavto-maps-v1`): подходит для явного сохранения тайлов.
 */

const MAP_TILE_CACHE = "startavto-maps-v1";

function tileKey(x: number, y: number, z: number): string {
  return `${z}/${x}/${y}`;
}

/** Сохранить тайл (обычно ArrayBuffer + тип image/jpeg). */
export async function cacheMapTile(
  x: number,
  y: number,
  z: number,
  data: ArrayBuffer,
  contentType = "image/jpeg"
): Promise<void> {
  if (typeof caches === "undefined") return;
  const cache = await caches.open(MAP_TILE_CACHE);
  const req = new Request(`https://local-tile/${tileKey(x, y, z)}`);
  await cache.put(
    req,
    new Response(data, {
      headers: { "Content-Type": contentType, "X-Tile-Z": String(z) },
    })
  );
}

export async function getMapTile(x: number, y: number, z: number): Promise<ArrayBuffer | null> {
  if (typeof caches === "undefined") return null;
  const cache = await caches.open(MAP_TILE_CACHE);
  const res = await cache.match(`https://local-tile/${tileKey(x, y, z)}`);
  if (!res) return null;
  return res.arrayBuffer();
}

/**
 * Перевод lat/lng в номер тайла XYZ (Web Mercator), как у большинства картографических сервисов.
 */
function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}

/**
 * Предзагрузка прямоугольной области (bounds: [[southLat, westLng], [northLat, eastLng]]).
 * Использует растровый слой Яндекса (приблизительный URL; при 404 тайл пропускается).
 */
export async function precacheMapArea(
  bounds: [[number, number], [number, number]],
  zoomLevel: number,
  onProgress?: (done: number, total: number) => void
): Promise<{ fetched: number; skipped: number }> {
  const [[sLat, wLng], [nLat, eLng]] = bounds;
  const z = Math.max(0, Math.min(19, Math.round(zoomLevel)));

  const minTile = latLngToTile(sLat, wLng, z);
  const maxTile = latLngToTile(nLat, eLng, z);
  const x0 = Math.min(minTile.x, maxTile.x);
  const x1 = Math.max(minTile.x, maxTile.x);
  const y0 = Math.min(minTile.y, maxTile.y);
  const y1 = Math.max(minTile.y, maxTile.y);

  const n = 2 ** z;
  const tiles: { x: number; y: number }[] = [];
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (x >= 0 && x < n && y >= 0 && y < n) tiles.push({ x, y });
    }
  }

  let done = 0;
  let fetched = 0;
  let skipped = 0;
  const total = tiles.length;

  for (const { x, y } of tiles) {
    const url = `https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x=${x}&y=${y}&z=${z}&scale=1&lang=ru_RU`;
    try {
      const res = await fetch(url, { mode: "cors", cache: "default" });
      if (!res.ok) {
        skipped++;
      } else {
        const buf = await res.arrayBuffer();
        await cacheMapTile(x, y, z, buf, res.headers.get("content-type") ?? "image/jpeg");
        fetched++;
      }
    } catch {
      skipped++;
    }
    done++;
    onProgress?.(done, total);
  }

  return { fetched, skipped };
}
