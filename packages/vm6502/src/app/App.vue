<template>
	<Toaster rich-colors position="top-right" />
	<LogWindow v-for="win in logWindows.values()" :key="win.id" :window-state="win" />
	<RoutineEditor />
	<DiskEditor />
	<!-- Mounted here, not in the disassembly view: they must stay open when switching to the memory viewer tab -->
	<template v-if="vm">
		<SymbolManager @goto-address="gotoDisassembly" />
		<FormattingManager @goto-address="gotoDisassembly" />
	</template>
	<CmdConsole />
	<AppLayout v-if="vm" class="bg-gray-900 text-white" :aspect="vm.videoAspect.value">
		<!-- Toolbar: its width drives the @container breakpoints used inside the controls -->
		<!-- The row only wraps below 26rem, where the separators are hidden, so a separator never ends a wrapped row -->
		<!-- (a container query can't target the @container element itself, hence the inner flex row) -->
		<template #video-header>
			<div class="@container p-1 bg-gray-800 border-b border-gray-700">
				<div class="flex flex-wrap @[26rem]:flex-nowrap items-center gap-1">
					<MachineSelector
						class="flex-1 basis-0 min-w-17"
						:machines="availableMachines"
						:selected-machine="selectedMachine"
						@machine-selected="handleMachineSelected"
						@power-cycle="handlePowerCycle"
					/>
					<div class="hidden @[26rem]:block toolbar-sep"></div>
					<div class="flex items-center gap-0.5">
						<VideoControl />
						<SoundControl />
						<GamepadControl v-if="hasGamepad" />
						<MouseControl v-if="hasMouse" />
						<DiskDriveControl v-if="hasDisk" />
						<SlotsControl />
					</div>
					<div class="hidden @[26rem]:block toolbar-sep"></div>
					<SpeedControl />
				</div>
			</div>
		</template>

		<template #video>
			<!-- VideoOutput sizes it to 100% x 100%, aspect ratio kept (object-fit) -->
			<canvas ref="videoCanvas" class="absolute inset-0"></canvas>
		</template>

		<template #state>
			<div class="flex h-full flex-col">
				<!-- Floating layout: in the top bar, beside the machine toolbar (moved, not remounted) -->
				<Teleport defer :to="`#${LAYOUT_TOOLBAR_ID}`" :disabled="!floating">
					<DebuggerControls :isRunning="isRunning" />
				</Teleport>

				<!--
					The panel width drives the layout (container query):
					- narrow: the registers across the top, Stack | Trace below
					- wide (>= 54rem): 3 columns, Registers | Stack | Trace
					- floating: the registers alone, the stack and the trace have panels of their own
					Breakpoints live in a floating window opened from the debugger toolbar.
				-->
				<!--
					Floating, no @container: its inline-size containment would give it no width of its own,
					and the panel's width fits the registers. A stable gutter: the scrollbar doesn't eat into them.
				-->
				<div
					class="min-h-0 flex-1 p-2"
					:class="floating ? 'overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]' : '@container'"
				>
					<div :class="!floating && DOCKED_STATE_GRID">
						<!-- Registers, with the status flags beside P (the flags are part of it) -->
						<RegistersView
							class="[grid-area:cpu] min-w-0"
							:registers="registers"
							:virtual-registers="virtualRegisters"
						/>

						<!-- Floating: moved to their own panels (not remounted: the trace and the scroll are kept) -->
						<Teleport defer :to="`#${STACK_PANEL_ID}`" :disabled="!floating">
							<StackView class="[grid-area:stack] min-h-0" :registers="registers" />
						</Teleport>
						<Teleport defer :to="`#${TRACE_PANEL_ID}`" :disabled="!floating">
							<TraceView class="[grid-area:trace] min-h-0 min-w-0" />
						</Teleport>
					</div>
				</div>
			</div>
		</template>

		<!-- Floating: the disassembly and the memory viewer each get a panel; docked: tabs (or split) -->
		<template #code>
			<DisassemblyView v-if="floating" :address="registers.PC" :memory="vm.sharedMemory" :registers="registers" />
			<TogglableDisplay v-else id="disasm-mem-view" v-model:activeTab="debuggerTab">
				<template #tab1-title> Disassembly </template>
				<template #tab2-title> Memory Viewer </template>
				<template #tab1-content>
					<DisassemblyView :address="registers.PC" :memory="vm.sharedMemory" :registers="registers" />
				</template>
				<template #tab2-content>
					<MultiMemoryViewer />
				</template>
			</TogglableDisplay>
		</template>

		<template #memory>
			<MultiMemoryViewer />
		</template>
	</AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, watch } from "vue";
import { Toaster } from "vue-sonner";
import "vue-sonner/style.css";
import TogglableDisplay from "../components/TogglableDisplay.vue";
import { useMachine } from "../composables/useMachine";
import AppLayout from "./layout/AppLayout.vue";
import { LAYOUT_TOOLBAR_ID, STACK_PANEL_ID, TRACE_PANEL_ID } from "./layout/layoutTargets";
import { useAppLayout } from "@/composables/useAppLayout";
import { useDebuggerNav } from "../composables/useDebuggerNav";
import { availableMachines } from "../machines";
import type { MachineConfig } from "../types/machine.interface";
import DebuggerControls from "./debugger/DebuggerControls.vue";
import DisassemblyView from "./debugger/disassembly/DisassemblyView.vue";
import MultiMemoryViewer from "./debugger/memoryview/MultiMemoryViewer.vue";
import RegistersView from "./debugger/RegistersView.vue";
import StackView from "./debugger/StackView.vue";
import TraceView from "./debugger/TraceView.vue";
import DiskDriveControl from "./machine/diskdrivecontrol/DiskDriveControl.vue";
import GamepadControl from "./machine/GamepadControl.vue";
import MachineSelector from "./machine/MachineSelector.vue";
import MouseControl from "./machine/MouseControl.vue";
import SoundControl from "./machine/SoundControl.vue";
import SlotsControl from "./machine/SlotsControl.vue";
import SpeedControl from "./machine/SpeedControl.vue";
import VideoControl from "./machine/VideoControl.vue";
import CmdConsole from "./debugger/CmdConsole.vue";
import { useCmdConsole } from "@/composables/useCmdConsole";
import { useLogWindows } from "@/composables/useLogWindows";
import LogWindow from "@/components/LogWindow.vue";
import RoutineEditor from "@/app/debugger/RoutineEditor.vue";
import DiskEditor from "@/app/diskeditor/DiskEditor.vue";
import FormattingManager from "@/app/debugger/FormattingManager/FormattingManager.vue";
import SymbolManager from "@/app/debugger/SymbolManager/SymbolManager.vue";
import { useDisassembly } from "@/composables/useDisassembly";

const { vm, registers, selectedMachine, isRunning, videoCanvas, loadMachine, virtualRegisters } = useMachine();
const { showConsole } = useCmdConsole();
const { logWindows } = useLogWindows();
const { kind } = useAppLayout();
const floating = computed(() => kind.value === "floating");
/** The state panel's grid when docked: see the template */
const DOCKED_STATE_GRID =
	"grid h-full gap-2 grid-cols-[16rem_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] [grid-template-areas:'cpu_cpu'_'stack_trace'] @[54rem]:grid-cols-[minmax(13rem,300px)_16rem_minmax(0,1fr)] @[54rem]:grid-rows-[minmax(0,1fr)] @[54rem]:[grid-template-areas:'cpu_stack_trace']";

const hasGamepad = computed(
	() => selectedMachine.value.inputs?.some((d) => d.type === "joystick" || d.type === "gamepad") ?? false,
);
const hasMouse = computed(() => selectedMachine.value.inputs?.some((d) => d.type === "mouse") ?? false);
const hasDisk = computed(() => selectedMachine.value.disk?.enabled);

const handleGlobalKeydown = (e: KeyboardEvent) => {
	// console.log("keydown", e.key, "ctrl", e.ctrlKey, "shift", e.shiftKey, "alt", e.altKey, "meta", e.metaKey);
	if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
		e.preventDefault();
		showConsole();
	}
};

onMounted(() => window.addEventListener("keydown", handleGlobalKeydown));
onUnmounted(() => window.removeEventListener("keydown", handleGlobalKeydown));

const { activeTab: activeDebuggerTab, setActiveTab } = useDebuggerNav();
/** The debugger tabs component only knows "tab1" (disassembly) and "tab2" (memory) */
const debuggerTab = computed({
	get: () => (activeDebuggerTab.value === "memory" ? "tab2" : "tab1"),
	set: (tab: "tab1" | "tab2") => setActiveTab(tab === "tab2" ? "memory" : "disassembly"),
});

const { requestJump } = useDisassembly();
const gotoDisassembly = (address: number) => {
	setActiveTab("disassembly");
	requestJump(address);
};

provide("vm", vm);

onMounted(() => {
	loadMachine(selectedMachine.value);
});

// Wait for the canvas to be mounted by the AppLayout before setting it on the VM
watch(
	videoCanvas,
	(newCanvasEl) => {
		if (newCanvasEl && vm.value) vm.value.initVideo(newCanvasEl);
	},
	{ once: true },
);

onUnmounted(() => {
	vm.value?.terminate();
});

const handleMachineSelected = (newMachine: MachineConfig) => {
	if (newMachine && newMachine.name !== vm.value?.machineConfig.name) loadMachine(newMachine);
};

const handlePowerCycle = () => {
	if (selectedMachine.value) loadMachine(selectedMachine.value);
};
</script>
