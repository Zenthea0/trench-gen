/** Exporte le SVG de la carte en image PNG (partage natif si disponible, sinon téléchargement). */
export async function exporterPng(svg: SVGSVGElement, nomFichier: string): Promise<'partage' | 'telechargement'> {
  const vb = svg.viewBox.baseVal;
  const largeurPx = 1800;
  const hauteurPx = Math.round((largeurPx * vb.height) / vb.width);

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('width', String(largeurPx));
  clone.setAttribute('height', String(hauteurPx));
  clone.removeAttribute('style');
  // Zones tactiles, sélection, cadenas et cadres de conflit n'ont rien à faire dans l'image.
  clone.querySelectorAll('[data-ui]').forEach((n) => n.remove());

  const source = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((ok, ko) => {
      img.onload = () => ok();
      img.onerror = () => ko(new Error("Impossible de dessiner l'image."));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = largeurPx;
    canvas.height = hauteurPx;
    canvas.getContext('2d')!.drawImage(img, 0, 0, largeurPx, hauteurPx);
    const png = await new Promise<Blob>((ok, ko) =>
      canvas.toBlob((b) => (b ? ok(b) : ko(new Error("Export PNG impossible."))), 'image/png'),
    );
    const fichier = new File([png], nomFichier, { type: 'image/png' });
    if (navigator.canShare?.({ files: [fichier] })) {
      try {
        await navigator.share({ files: [fichier], title: 'Réseau de tranchées' });
        return 'partage';
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return 'partage';
        /* sinon : repli sur le téléchargement */
      }
    }
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(png);
    lien.download = nomFichier;
    lien.click();
    setTimeout(() => URL.revokeObjectURL(lien.href), 5000);
    return 'telechargement';
  } finally {
    URL.revokeObjectURL(url);
  }
}
