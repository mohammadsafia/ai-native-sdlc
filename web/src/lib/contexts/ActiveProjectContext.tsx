import { createContext, type ReactNode, useContext, useState } from 'react';
import { PROJECTS } from '@api/mock';

type ActiveProjectState = {
  activeId: string;
  setActiveId: (id: string) => void;
};

const initialState: ActiveProjectState = {
  activeId: PROJECTS[0]?.id ?? '',
  setActiveId: () => null,
};

const ActiveProjectContext = createContext<ActiveProjectState>(initialState);

type ActiveProjectProviderProps = {
  children: ReactNode;
};

export function ActiveProjectProvider({ children }: ActiveProjectProviderProps) {
  const [activeId, setActiveId] = useState<string>(PROJECTS[0]?.id ?? '');

  const contextValue: ActiveProjectState = {
    activeId,
    setActiveId,
  };

  return <ActiveProjectContext.Provider value={contextValue}>{children}</ActiveProjectContext.Provider>;
}

export const useActiveProject = () => {
  const context = useContext(ActiveProjectContext);

  if (context === undefined) throw new Error('useActiveProject must be used within an ActiveProjectProvider');

  return context;
};
