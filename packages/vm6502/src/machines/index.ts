import type { MachineConfig } from "@/types/machine.interface";
import { apple2e } from "./apple2/apple.machine";
import { klausTest } from "./klaus-test-suite/klaus.machine";
import { pet3032 } from "./pet/pet.machine";

export const availableMachines: MachineConfig[] = [klausTest, apple2e, pet3032];
