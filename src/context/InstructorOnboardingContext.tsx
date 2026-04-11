import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type InstructorOnboardingContextValue = {
  /** Запустить ознакомительный тур с первого шага */
  startTour: () => void;
  /** Меняется при каждом вызове startTour — слушает InstructorOnboardingTour */
  tourRequestId: number;
};

const InstructorOnboardingContext = createContext<InstructorOnboardingContextValue | null>(
  null
);

export function InstructorOnboardingProvider({ children }: { children: ReactNode }) {
  const [tourRequestId, setTourRequestId] = useState(0);

  const startTour = useCallback(() => {
    setTourRequestId((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({ startTour, tourRequestId }),
    [startTour, tourRequestId]
  );

  return (
    <InstructorOnboardingContext.Provider value={value}>
      {children}
    </InstructorOnboardingContext.Provider>
  );
}

/** Только в ветке инструктора с Provider; иначе null */
export function useInstructorOnboarding(): InstructorOnboardingContextValue | null {
  return useContext(InstructorOnboardingContext);
}
