export {
  fitDampedHolt,
  forecastAt,
  dampedHoltForecast,
  DEFAULT_PARAMS,
  Z_80,
} from './dampedHolt';
export type { DampedHoltParams, HoltFit, ForecastBand } from './dampedHolt';

export { forecastFromSpot } from './fromSpot';
export type { ForecastPointBand, ForecastFromSpotOptions } from './fromSpot';
