import type { MachineConfig } from "@/machines/machine.interface";
import { apple2e } from "./apple2/apple.machine";
import { klausTest } from "./klaus-test-suite/klaus.machine";

export const availableMachines: MachineConfig[] = [apple2e, klausTest];
