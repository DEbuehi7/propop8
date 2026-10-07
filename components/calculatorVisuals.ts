import type { ComponentType } from "react";
import VendorMoneyPitVisual from "./VendorMoneyPitVisual";
import CallbackNightmareVisual from "./CallbackNightmareVisual";
import DeadlineGraveyardVisual from "./DeadlineGraveyardVisual";
import AssetHealthNightmareVisual from "./AssetHealthNightmareVisual";
import UtilityEnergyBleedVisual from "./UtilityEnergyBleedVisual";
import OperationsChaosIndexVisual from "./OperationsChaosIndexVisual";
import AutomationGraveyardVisual from "./AutomationGraveyardVisual";

/**
 * slug -> visual. Props come from the registry entry's visualProps(), so
 * adding a calculator is one registry entry plus one line here -- no switch
 * in the client component.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CALCULATOR_VISUALS: Record<string, ComponentType<any>> = {
  "vendor-money-pit": VendorMoneyPitVisual,
  "callback-nightmare": CallbackNightmareVisual,
  "deadline-graveyard": DeadlineGraveyardVisual,
  "asset-health-nightmare": AssetHealthNightmareVisual,
  "utility-energy-bleed": UtilityEnergyBleedVisual,
  "operations-chaos-index": OperationsChaosIndexVisual,
  "automation-graveyard": AutomationGraveyardVisual,
};
