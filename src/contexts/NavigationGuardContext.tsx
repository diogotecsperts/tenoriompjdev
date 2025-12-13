import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface NavigationGuardContextType {
  isGuarded: boolean;
  setGuarded: (guarded: boolean) => void;
  pendingDestination: string | null;
  requestNavigation: (destination: string) => boolean;
  confirmNavigation: () => void;
  cancelNavigation: () => void;
  onNavigationRequest: ((destination: string) => void) | null;
  setOnNavigationRequest: (handler: ((destination: string) => void) | null) => void;
}

const NavigationGuardContext = createContext<NavigationGuardContextType | undefined>(undefined);

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const [isGuarded, setGuarded] = useState(false);
  const [pendingDestination, setPendingDestination] = useState<string | null>(null);
  const [onNavigationRequest, setOnNavigationRequest] = useState<((destination: string) => void) | null>(null);

  const requestNavigation = useCallback((destination: string): boolean => {
    if (isGuarded && onNavigationRequest) {
      onNavigationRequest(destination);
      return false; // Navigation blocked
    }
    return true; // Navigation allowed
  }, [isGuarded, onNavigationRequest]);

  const confirmNavigation = useCallback(() => {
    setPendingDestination(null);
  }, []);

  const cancelNavigation = useCallback(() => {
    setPendingDestination(null);
  }, []);

  return (
    <NavigationGuardContext.Provider
      value={{
        isGuarded,
        setGuarded,
        pendingDestination,
        requestNavigation,
        confirmNavigation,
        cancelNavigation,
        onNavigationRequest,
        setOnNavigationRequest,
      }}
    >
      {children}
    </NavigationGuardContext.Provider>
  );
}

export function useNavigationGuardContext() {
  const context = useContext(NavigationGuardContext);
  if (!context) {
    throw new Error("useNavigationGuardContext must be used within NavigationGuardProvider");
  }
  return context;
}
