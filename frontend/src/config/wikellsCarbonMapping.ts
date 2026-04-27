/**
 * Carbon footprint mapping between Wikells assemblies and Boverket materials.
 * 
 * Methodology:
 * - Maps Wikells construction assemblies to base materials in Boverket database
 * - Provides estimated carbon footprint (kg CO₂e/m²) for assemblies
 * - Values are approximations based on typical material quantities
 */

export interface CarbonData {
  kgCO2ePerM2: number;
  confidence: 'high' | 'medium' | 'low';  // Mapping confidence
  primaryMaterial: string;                  // Main Boverket material matched
  notes?: string;
}

/**
 * Mapping from Wikells code to carbon footprint data.
 * 
 * Carbon values estimated from:
 * - Boverket Klimatdatabas materials (timber, concrete, steel, insulation)
 * - Typical quantities in assemblies
 * - Industry averages for composite materials
 */
export const WIKELLS_CARBON_MAP: Record<string, CarbonData> = {
  // ─── Ch7: Exterior Walls - Timber Stud ───
  "7.001": { kgCO2ePerM2: 12, confidence: 'high', primaryMaterial: 'Sawn timber + Plywood' },
  "7.002": { kgCO2ePerM2: 14, confidence: 'high', primaryMaterial: 'Sawn timber + Log panel' },
  "7.003": { kgCO2ePerM2: 15, confidence: 'high', primaryMaterial: 'Sawn timber + Batten panel' },
  "7.004": { kgCO2ePerM2: 35, confidence: 'medium', primaryMaterial: 'Timber + Mineral wool insulation' },
  "7.005": { kgCO2ePerM2: 45, confidence: 'medium', primaryMaterial: 'Timber + Fiber cement' },
  "7.006": { kgCO2ePerM2: 18, confidence: 'high', primaryMaterial: 'Timber + Steel sheet' },
  "7.007": { kgCO2ePerM2: 42, confidence: 'medium', primaryMaterial: 'Timber + Heavy insulation' },
  "7.008": { kgCO2ePerM2: 38, confidence: 'medium', primaryMaterial: 'Double timber frame' },
  "7.009": { kgCO2ePerM2: 55, confidence: 'medium', primaryMaterial: 'Heavy timber + insulation' },
  
  // ─── Ch7: Exterior Walls - CLT ───
  "7.063": { kgCO2ePerM2: 85, confidence: 'high', primaryMaterial: 'Cross-laminated timber' },
  "7.064": { kgCO2ePerM2: 92, confidence: 'high', primaryMaterial: 'CLT + cladding' },
  "7.065": { kgCO2ePerM2: 88, confidence: 'high', primaryMaterial: 'CLT panel' },
  
  // ─── Ch8: Interior Walls - Timber ───
  "8.001": { kgCO2ePerM2: 8, confidence: 'high', primaryMaterial: 'Timber stud + Gypsum' },
  "8.002": { kgCO2ePerM2: 10, confidence: 'high', primaryMaterial: 'Timber stud + Gypsum board' },
  "8.003": { kgCO2ePerM2: 12, confidence: 'high', primaryMaterial: 'Timber + 2× Gypsum' },
  
  // ─── Ch8: Interior Walls - Concrete ───
  "8.097": { kgCO2ePerM2: 180, confidence: 'high', primaryMaterial: 'Concrete 150mm' },
  "8.098": { kgCO2ePerM2: 220, confidence: 'high', primaryMaterial: 'Concrete 180mm' },
  "8.099": { kgCO2ePerM2: 280, confidence: 'high', primaryMaterial: 'Concrete 200mm' },
  
  // ─── Ch8: Interior Walls - Brick ───
  "8.106": { kgCO2ePerM2: 95, confidence: 'high', primaryMaterial: 'Clay bricks' },
  "8.107": { kgCO2ePerM2: 120, confidence: 'high', primaryMaterial: 'Brick wall 150mm' },
  
  // ─── Ch9: Floor Assemblies - Intermediate ───
  "9.001": { kgCO2ePerM2: 28, confidence: 'medium', primaryMaterial: 'Timber joists + boards' },
  "9.002": { kgCO2ePerM2: 32, confidence: 'medium', primaryMaterial: 'Timber floor assembly' },
  "9.003": { kgCO2ePerM2: 165, confidence: 'high', primaryMaterial: 'Concrete slab 180mm' },
  "9.004": { kgCO2ePerM2: 190, confidence: 'high', primaryMaterial: 'Concrete slab 200mm' },
  
  // ─── Ch10: Stairs ───
  "10.001": { kgCO2ePerM2: 45, confidence: 'medium', primaryMaterial: 'Timber stair assembly', notes: 'Per piece' },
  "10.005": { kgCO2ePerM2: 280, confidence: 'medium', primaryMaterial: 'Steel stair frame', notes: 'Per piece' },
  "10.009": { kgCO2ePerM2: 420, confidence: 'high', primaryMaterial: 'Concrete stair', notes: 'Per piece' },
  
  // ─── Ch11: Exterior Roofs ───
  "11.001": { kgCO2ePerM2: 22, confidence: 'medium', primaryMaterial: 'Timber + Felt roofing' },
  "11.002": { kgCO2ePerM2: 18, confidence: 'medium', primaryMaterial: 'Timber + Plastic membrane' },
  "11.003": { kgCO2ePerM2: 35, confidence: 'high', primaryMaterial: 'Timber + Metal roofing' },
  "11.004": { kgCO2ePerM2: 15, confidence: 'medium', primaryMaterial: 'Timber + TRP' },
  "11.005": { kgCO2ePerM2: 95, confidence: 'high', primaryMaterial: 'Timber + Concrete tiles' },
  "11.006": { kgCO2ePerM2: 88, confidence: 'high', primaryMaterial: 'Timber + Clay tiles' },
  "11.007": { kgCO2ePerM2: 24, confidence: 'medium', primaryMaterial: 'Timber truss + felt' },
  "11.008": { kgCO2ePerM2: 22, confidence: 'medium', primaryMaterial: 'Timber truss + felt' },
  "11.009": { kgCO2ePerM2: 20, confidence: 'medium', primaryMaterial: 'Timber truss + membrane' },
  "11.011": { kgCO2ePerM2: 28, confidence: 'high', primaryMaterial: 'Timber + Metal roof' },
  "11.012": { kgCO2ePerM2: 42, confidence: 'high', primaryMaterial: 'Timber + Fiber cement' },
  "11.030": { kgCO2ePerM2: 98, confidence: 'high', primaryMaterial: 'Prefab truss + concrete tiles' },
  "11.031": { kgCO2ePerM2: 92, confidence: 'high', primaryMaterial: 'Prefab truss + clay tiles' },
  "11.033": { kgCO2ePerM2: 105, confidence: 'medium', primaryMaterial: 'Tiles + Insulation 315mm' },
  "11.048": { kgCO2ePerM2: 20, confidence: 'medium', primaryMaterial: 'Timber joists + felt' },
  "11.049": { kgCO2ePerM2: 32, confidence: 'medium', primaryMaterial: 'Timber + mineral wool 170mm' },
  "11.050": { kgCO2ePerM2: 38, confidence: 'medium', primaryMaterial: 'Timber + mineral wool 220mm' },
  "11.051": { kgCO2ePerM2: 45, confidence: 'medium', primaryMaterial: 'Kerto beams + mineral wool 365mm' },
  "11.052": { kgCO2ePerM2: 12, confidence: 'medium', primaryMaterial: 'TRP uninsulated' },
  "11.053": { kgCO2ePerM2: 25, confidence: 'medium', primaryMaterial: 'TRP + mineral wool 195mm' },
  "11.054": { kgCO2ePerM2: 18, confidence: 'medium', primaryMaterial: 'TRP + sedum' },
  "11.055": { kgCO2ePerM2: 28, confidence: 'medium', primaryMaterial: 'TRP + felt + 120mm insulation' },
  "11.056": { kgCO2ePerM2: 32, confidence: 'medium', primaryMaterial: 'TRP + felt + 180mm insulation' },
  "11.057": { kgCO2ePerM2: 30, confidence: 'medium', primaryMaterial: 'TRP + Derbigum + 190mm' },
  "11.062": { kgCO2ePerM2: 38, confidence: 'medium', primaryMaterial: 'TRP + felt + 280mm insulation' },
  "11.063": { kgCO2ePerM2: 42, confidence: 'medium', primaryMaterial: 'TRP + felt + 330mm insulation' },
  "11.064": { kgCO2ePerM2: 40, confidence: 'medium', primaryMaterial: 'TRP + Derbigum + 340mm' },
  "11.065": { kgCO2ePerM2: 35, confidence: 'medium', primaryMaterial: 'Double-metal + 260mm insulation' },
  
  // ─── Ch14: Painting ───
  // NOTE: Painting items use "SEK/st" (per piece) units, not SEK/m²
  // Carbon values would need to be per piece, which varies by project area
  // Omitted from carbon mapping due to incompatible units
  
  // ─── Ch15: Flooring ───
  "15.003": { kgCO2ePerM2: 85, confidence: 'high', primaryMaterial: 'Limestone tiles' },
  "15.004": { kgCO2ePerM2: 68, confidence: 'high', primaryMaterial: 'Clinker tiles' },
  "15.005": { kgCO2ePerM2: 12, confidence: 'high', primaryMaterial: 'Oak parquet' },
  "15.007": { kgCO2ePerM2: 8, confidence: 'high', primaryMaterial: 'Laminate flooring' },
  "15.009": { kgCO2ePerM2: 5, confidence: 'high', primaryMaterial: 'Linoleum' },
  
  // ─── Ch16: Windows ───
  "16.001": { kgCO2ePerM2: 180, confidence: 'high', primaryMaterial: 'Wood window, triple-glazed', notes: 'Per unit' },
  "16.008": { kgCO2ePerM2: 195, confidence: 'high', primaryMaterial: 'Alu-clad wood window', notes: 'Per unit' },
};

/**
 * Get carbon footprint category based on kg CO₂e/m²
 */
export function getCarbonCategory(kgCO2e: number): {
  label: string;
  color: string;
  description: string;
} {
  if (kgCO2e < 15) {
    return { 
      label: 'Very Low', 
      color: 'emerald',
      description: 'Excellent environmental choice'
    };
  }
  if (kgCO2e < 50) {
    return { 
      label: 'Low', 
      color: 'teal',
      description: 'Good environmental impact'
    };
  }
  if (kgCO2e < 100) {
    return { 
      label: 'Moderate', 
      color: 'amber',
      description: 'Moderate carbon footprint'
    };
  }
  if (kgCO2e < 200) {
    return { 
      label: 'High', 
      color: 'orange',
      description: 'Higher carbon impact'
    };
  }
  return { 
    label: 'Very High', 
    color: 'rose',
    description: 'Significant carbon footprint'
  };
}

/**
 * Calculate cost-carbon ratio (SEK per kg CO₂e)
 * Lower values indicate better value (less cost per unit carbon)
 */
export function getCostCarbonRatio(costSEK: number, kgCO2e: number): number {
  if (kgCO2e === 0) return Infinity;
  return costSEK / kgCO2e;
}
