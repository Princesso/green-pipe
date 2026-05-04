import { CarbonEstimate } from './types';

// Source: The Shift Project, IEA — average CO2e per GB transferred
const CO2_PER_GB_GRAMS = 0.6;

// Real-world equivalence values
const CO2_PER_SMARTPHONE_CHARGE_GRAMS = 8.22;
const CO2_PER_KM_DRIVING_GRAMS = 120;

export function estimateCarbon(bytesSaved: number, monthlyViews: number): CarbonEstimate {
  const gbSaved = bytesSaved / 1e9;
  const annualCO2Grams = gbSaved * CO2_PER_GB_GRAMS * monthlyViews * 12;

  return {
    annualCO2Grams,
    smartphoneCharges: annualCO2Grams / CO2_PER_SMARTPHONE_CHARGE_GRAMS,
    drivingKm: annualCO2Grams / CO2_PER_KM_DRIVING_GRAMS,
    monthlyViews,
    bytesSaved,
    monthlyBandwidthSavedMB: (bytesSaved / 1024 / 1024) * monthlyViews,
  };
}
