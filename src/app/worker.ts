/// <reference lib="webworker" />
import type { BlocDef } from '../types.js';
import { generer, type Options } from '../generateur.js';

/** Le calcul tourne dans un worker pour que l'interface reste fluide, même sur grande table. */
self.onmessage = (e: MessageEvent<{ blocs: BlocDef[]; options: Partial<Options> }>) => {
  const { blocs, options } = e.data;
  (self as unknown as Worker).postMessage(generer(blocs, options));
};
