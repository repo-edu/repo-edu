import React, { createContext, useContext, ReactNode } from "react";
import type { BackendAPI } from "@repo-edu/backend-interface";

const BackendContext = createContext<BackendAPI | null>(null);

export interface BackendProviderProps {
  backend: BackendAPI;
  children: ReactNode;
}

export const BackendProvider: React.FC<BackendProviderProps> = ({ backend, children }) => {
  return (
    <BackendContext.Provider value={backend}>
      {children}
    </BackendContext.Provider>
  );
};

export const useBackend = (): BackendAPI => {
  const context = useContext(BackendContext);
  if (!context) {
    throw new Error("useBackend must be used within a BackendProvider");
  }
  return context;
};
