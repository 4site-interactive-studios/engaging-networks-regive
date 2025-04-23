import "./style.scss";
import { Regive } from "./lib/regive";

// Make sure we only run after the page load, checking if the page is fully loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", Regive.init);
} else {
  // Document is already loaded (interactive or complete)
  Regive.init();
}
