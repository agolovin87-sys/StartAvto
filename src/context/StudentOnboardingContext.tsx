import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type StudentOnboardingContextValue = {
  startTour: () => void;
  tourRequestId: number;
};

const StudentOnboardingContext = createContext<StudentOnboardingContextValue | null>(
  null
);

export function StudentOnboardingProvider({ children }: { children: ReactNode }) {
  const [tourRequestId, setTourRequestId] = useState(0);

  const startTour = useCallback(() => {
    setTourRequestId((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({ startTour, tourRequestId }),
    [startTour, tourRequestId]
  );

  return (
    <StudentOnboardingContext.Provider value={value}>
      {children}
    </StudentOnboardingContext.Provider>
  );
}

export function useStudentOnboarding(): StudentOnboardingContextValue | null {
  return useContext(StudentOnboardingContext);
}
