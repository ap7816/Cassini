import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppRouter } from "./app/AppRouter";
import { AppSettingsProvider } from "./features/settings/context/AppSettingsContext";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppSettingsProvider>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </AppSettingsProvider>
  </React.StrictMode>
);
