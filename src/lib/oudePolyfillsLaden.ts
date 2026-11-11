// Zet de terugvallen van oudePolyfills.ts meteen aan bij het inladen. Apart bestand, zodat de oude pdf-worker ze als
// eerste import kan laden: imports lopen op volgorde, en pdf.js leest die functies al bij het opstarten.
import { vulPolyfillsAan } from './oudePolyfills';

vulPolyfillsAan();
