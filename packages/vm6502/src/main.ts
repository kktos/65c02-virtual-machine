import { createApp } from "vue";
import "./style.css";
import App from "./app/App.vue";
import { startMcp } from "./lib/mcp";
import { routeHypercallLogs } from "./virtualmachine/hypercall";

createApp(App).mount("#app");

routeHypercallLogs();

startMcp();
