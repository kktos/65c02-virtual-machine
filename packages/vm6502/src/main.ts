import { createApp } from "vue";
import "./style.css";
import App from "./app/App.vue";
import { startMcp } from "./lib/mcp";

createApp(App).mount("#app");

startMcp();
