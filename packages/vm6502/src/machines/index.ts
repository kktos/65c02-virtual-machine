import type { MachineConfig } from "@/types/machine.interface";
import { apple2e } from "./apple2/machine.conf";
import { klausTest } from "./klaus-test-suite/machine.conf";

export const availableMachines: MachineConfig[] = [apple2e, klausTest];
