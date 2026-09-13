import type { CSSProperties } from 'react';

export interface ElectronRegionStyle extends CSSProperties {
  WebkitAppRegion?: 'drag' | 'no-drag';
}

export const dragRegion: ElectronRegionStyle = { WebkitAppRegion: 'drag' };
export const noDragRegion: ElectronRegionStyle = { WebkitAppRegion: 'no-drag' };
