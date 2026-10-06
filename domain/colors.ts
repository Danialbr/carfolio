/**
 * PAINT COLOURS
 *
 * Cosmetic only — never part of any money calculation. The id is what is
 * stored; the hex paints the chip in Carfolio and the car in Arizona; the
 * filter recolours the blue holographic photo on the garage card (the photo's
 * own hue sits around 205°).
 */

export interface PaintColor {
  id: string;
  label: string;
  hex: string;
  filter: string;
}

export const PAINT_COLORS: readonly PaintColor[] = [
  { id: 'white', label: 'Blanco', hex: '#EEF1F5', filter: 'grayscale(1) brightness(1.6) contrast(1.1)' },
  { id: 'silver', label: 'Plata', hex: '#B9C0CA', filter: 'grayscale(1) brightness(1.25)' },
  { id: 'gray', label: 'Gris', hex: '#6B7280', filter: 'grayscale(1) brightness(.9)' },
  { id: 'black', label: 'Negro', hex: '#1A1C22', filter: 'grayscale(1) brightness(.55) contrast(1.3)' },
  { id: 'red', label: 'Rojo', hex: '#D3302F', filter: 'hue-rotate(152deg) saturate(1.7)' },
  { id: 'wine', label: 'Vino', hex: '#7A1F2B', filter: 'hue-rotate(140deg) saturate(1.5) brightness(.7)' },
  { id: 'orange', label: 'Naranja', hex: '#E8732C', filter: 'hue-rotate(180deg) saturate(1.7)' },
  { id: 'yellow', label: 'Amarillo', hex: '#E8C547', filter: 'hue-rotate(212deg) saturate(1.8) brightness(1.1)' },
  { id: 'green', label: 'Verde', hex: '#2E8B57', filter: 'hue-rotate(280deg) saturate(1.3)' },
  { id: 'blue', label: 'Azul', hex: '#2F6BD8', filter: 'hue-rotate(5deg) saturate(1.3)' },
  { id: 'navy', label: 'Azul marino', hex: '#1F2E5A', filter: 'hue-rotate(20deg) saturate(1.3) brightness(.65)' },
  { id: 'brown', label: 'Café', hex: '#7A4E2D', filter: 'sepia(1) saturate(1.6) brightness(.75)' },
  { id: 'beige', label: 'Beige', hex: '#D8C3A0', filter: 'sepia(.8) brightness(1.3)' },
];

export function paintColor(id: string | null | undefined): PaintColor | null {
  return PAINT_COLORS.find((c) => c.id === id) ?? null;
}
