// Een eigen luie ingang voor DekkingKort in de klas: zonder dit bestand zet Rollup de dekkingsberekening in het chunk van
// RichtingenPage, en dan laadt de klas die hele pagina mee (§ 22.7).
export { DekkingKort as default, DekkingKort } from './DekkingKort';
