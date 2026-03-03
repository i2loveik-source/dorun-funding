import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n"; // i18n 다국어 초기화

createRoot(document.getElementById("root")!).render(<App />);
