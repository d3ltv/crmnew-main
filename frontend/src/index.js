import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";

// Suppress the benign "ResizeObserver loop" browser warning — it's a known
// false-positive triggered by modals/popovers resizing during a render cycle
// and does not affect functionality.
const isResizeObserverError = (msg) =>
    typeof msg === "string" && msg.includes("ResizeObserver loop");

// 1. Block the error event before CRA's overlay listener fires
window.addEventListener("error", (e) => {
    if (isResizeObserverError(e.message)) {
        e.stopImmediatePropagation();
        e.preventDefault();
    }
}, true /* capture phase — fires before CRA overlay */);

// 2. Also silence window.onerror fallback
const _origError = window.onerror;
window.onerror = (message, ...args) => {
    if (isResizeObserverError(message)) return true;
    return _origError ? _origError(message, ...args) : false;
};

// 3. Silence console.error too
const _origConsoleError = console.error.bind(console);
console.error = (...args) => {
    if (isResizeObserverError(args[0])) return;
    _origConsoleError(...args);
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
