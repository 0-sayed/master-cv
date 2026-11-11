import { followReducedMotion } from "./libs/motion";
import { startApplication } from "./startup";
import "./index.css";

const rootElement = document.getElementById("app");
if (!rootElement) throw new Error("Root element not found");
followReducedMotion();
await startApplication(rootElement);
