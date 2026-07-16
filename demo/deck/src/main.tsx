import { createRoot } from "react-dom/client";
import "reveal.js/reveal.css";
import "reveal.js/theme/black.css";
import "@diascope/react/styles.css";
import "./deck.css";
import { App } from "./App.js";

createRoot(document.getElementById("root")!).render(<App />);
