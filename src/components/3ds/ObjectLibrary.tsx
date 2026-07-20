import { useEffect, useMemo, useState } from 'react';
import {
  Package, User, Car, Bird, Building2, Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLibraryThumbnail } from './utils/thumbnailRenderer';

/**
 * Small thumbnail that lazily renders the GLB into a PNG data URL.
 * Falls back to the category icon while loading or on error.
 */
const LibraryThumb = ({
  id, url, fallback, bg,
}: { id: string; url: string; fallback: React.ReactNode; bg: string }) => {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLibraryThumbnail(id, url)
      .then((dataUrl) => { if (!cancelled) setSrc(dataUrl); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [id, url]);

  return (
    <div
      className="w-full aspect-square bevel-inset flex items-center justify-center overflow-hidden"
      style={{ background: bg }}
    >
      {src && !failed ? (
        <img src={src} alt="" className="w-full h-full object-contain" draggable={false} />
      ) : (
        fallback
      )}
    </div>
  );
};

/**
 * Object Library — curated set of ready-to-use 3D models pulled from the
 * official three.js examples repo (threejs.org hosts them with permissive
 * CORS). Users drag an item over the viewport to import it into the scene.
 *
 * All entries are self-contained .glb files so no extra texture/bin fetches
 * are required.
 */

export interface LibraryItem {
  id: string;
  name: string;
  category: LibraryCategory;
  url: string;      // absolute URL that will be fetched at drop time
  filename: string; // preserves extension so the importer picks the right loader
}

export type LibraryCategory =
  | 'all'
  | 'characters'
  | 'animals'
  | 'vehicles'
  | 'architecture'
  | 'props'
  | 'reference';

const THREE_BASE = 'https://threejs.org/examples/models/';

export const LIBRARY_ITEMS: LibraryItem[] = [
  // Characters
  { id: 'soldier',   name: 'Soldier',         category: 'characters', url: `${THREE_BASE}gltf/Soldier.glb`,                             filename: 'Soldier.glb' },
  { id: 'xbot',      name: 'X Bot',           category: 'characters', url: `${THREE_BASE}gltf/Xbot.glb`,                                filename: 'Xbot.glb' },
  { id: 'michelle',  name: 'Michelle',        category: 'characters', url: `${THREE_BASE}gltf/Michelle.glb`,                            filename: 'Michelle.glb' },
  { id: 'robot',     name: 'Robot Expressive',category: 'characters', url: `${THREE_BASE}gltf/RobotExpressive/RobotExpressive.glb`,     filename: 'RobotExpressive.glb' },
  { id: 'facecap',   name: 'Face Cap',        category: 'characters', url: `${THREE_BASE}gltf/facecap.glb`,                             filename: 'facecap.glb' },

  // Animals
  { id: 'flamingo',  name: 'Flamingo',        category: 'animals',    url: `${THREE_BASE}gltf/Flamingo.glb`,                            filename: 'Flamingo.glb' },
  { id: 'parrot',    name: 'Parrot',          category: 'animals',    url: `${THREE_BASE}gltf/Parrot.glb`,                              filename: 'Parrot.glb' },
  { id: 'stork',     name: 'Stork',           category: 'animals',    url: `${THREE_BASE}gltf/Stork.glb`,                               filename: 'Stork.glb' },
  { id: 'horse',     name: 'Horse',           category: 'animals',    url: `${THREE_BASE}gltf/Horse.glb`,                               filename: 'Horse.glb' },

  // Vehicles
  { id: 'ferrari',   name: 'Ferrari',         category: 'vehicles',   url: `${THREE_BASE}gltf/ferrari.glb`,                             filename: 'ferrari.glb' },

  // Architecture / environments
  { id: 'tokyo',     name: 'Littlest Tokyo',  category: 'architecture', url: `${THREE_BASE}gltf/LittlestTokyo.glb`,                     filename: 'LittlestTokyo.glb' },
  { id: 'collision', name: 'Collision World', category: 'architecture', url: `${THREE_BASE}gltf/collision-world.glb`,                   filename: 'collision-world.glb' },

  // Props
  { id: 'boombox',   name: 'BoomBox',         category: 'props',      url: `${THREE_BASE}gltf/BoomBox.glb`,                             filename: 'BoomBox.glb' },
];

const CATEGORY_META: Record<Exclude<LibraryCategory, 'all'>, { label: string; icon: any; color: string }> = {
  characters:   { label: 'Characters',   icon: User,       color: '#a3d977' },
  animals:      { label: 'Animals',      icon: Bird,       color: '#f4b942' },
  vehicles:     { label: 'Vehicles',     icon: Car,        color: '#7ec9e8' },
  architecture: { label: 'Architecture', icon: Building2,  color: '#c8a2e0' },
  props:        { label: 'Props',        icon: Package,    color: '#e88a8a' },
};

export const DND_MIME = 'application/x-3dsled-model';

interface Props {
  onImportUrl?: (url: string, filename: string) => void;
}

export const ObjectLibrary = ({ onImportUrl }: Props) => {
  const [cat, setCat] = useState<LibraryCategory>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LIBRARY_ITEMS.filter((it) => {
      if (cat !== 'all' && it.category !== cat) return false;
      if (q && !it.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [cat, query]);

  const categories: LibraryCategory[] = ['all', 'characters', 'animals', 'vehicles', 'architecture', 'props'];

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-1 py-1 bevel-raised bg-win-face shrink-0">
        <div className="flex items-center gap-1 bevel-inset bg-white px-1" style={{ height: 18 }}>
          <Search size={11} className="text-win-shadow" />
          <input
            className="flex-1 text-[11px] outline-none bg-transparent"
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex flex-wrap gap-[2px] p-1 bevel-raised bg-win-face shrink-0">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={cn(
              'text-[10px] px-1.5 py-[2px] bg-win-face text-win-text',
              cat === c ? 'bevel-inset' : 'bevel-raised hover:brightness-105'
            )}
          >
            {c === 'all' ? 'All' : CATEGORY_META[c].label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 min-h-0 overflow-y-auto panel-scroll p-1 bevel-inset bg-panel">
        {filtered.length === 0 ? (
          <div className="text-center text-[11px] text-win-shadow py-4">No items</div>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            {filtered.map((it) => {
              const meta = CATEGORY_META[it.category as Exclude<LibraryCategory, 'all'>];
              const Icon = meta?.icon || Package;
              return (
                <div
                  key={it.id}
                  draggable
                  onDragStart={(e) => {
                    const payload = JSON.stringify({ url: it.url, filename: it.filename, name: it.name });
                    e.dataTransfer.setData(DND_MIME, payload);
                    e.dataTransfer.setData('text/plain', payload);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  onDoubleClick={() => onImportUrl?.(it.url, it.filename)}
                  className="bevel-raised bg-win-face hover:brightness-105 active:bevel-inset cursor-grab active:cursor-grabbing select-none flex flex-col items-center p-1"
                  title={`Drag to viewport or double-click to import\n${it.filename}`}
                >
                  <LibraryThumb
                    id={it.id}
                    url={it.url}
                    bg={meta?.color || '#c0c0c0'}
                    fallback={<Icon size={24} className="text-white drop-shadow" strokeWidth={2} />}
                  />

                  <div className="text-[10px] text-win-text mt-0.5 truncate w-full text-center leading-tight">
                    {it.name}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-[10px] text-win-shadow px-1 py-0.5 bevel-raised bg-win-face shrink-0">
        {filtered.length} model{filtered.length === 1 ? '' : 's'} • drag to viewport
      </div>
    </div>
  );
};
