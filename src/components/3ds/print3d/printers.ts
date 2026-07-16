// Printer profiles for the Print3D toolkit.
// Volume is in millimetres (X × Y × Z) with Z as the vertical build height.

export interface PrinterProfile {
  id: string;
  name: string;
  /** Build volume in millimetres — [X (width), Y (depth), Z (height)]. */
  size: [number, number, number];
  tech: 'resin' | 'fdm';
}

const BUILTIN: PrinterProfile[] = [
  { id: 'elegoo-mars-2-pro', name: 'Elegoo Mars 2 Pro', size: [129, 80, 160], tech: 'resin' },
  { id: 'elegoo-saturn-4-ultra', name: 'Elegoo Saturn 4 Ultra', size: [218, 123, 220], tech: 'resin' },
];

let userPrinters: PrinterProfile[] = [];

export const listPrinters = (): PrinterProfile[] => [...BUILTIN, ...userPrinters];
export const getPrinter = (id: string): PrinterProfile | undefined =>
  listPrinters().find((p) => p.id === id);
export const addPrinter = (p: PrinterProfile) => { userPrinters = [...userPrinters, p]; };
export const DEFAULT_PRINTER_ID = 'elegoo-mars-2-pro';
