import { useCallback, useEffect, useState } from "react";
import type { Car } from "@/types/car";
import { getCars, subscribeCars } from "@/services/carService";

export function useCars() {
  const [cars, setCars] = useState<Car[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    return subscribeCars(
      (list) => {
        setCars(list);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      }
    );
  }, []);

  const refresh = useCallback(() => {
    return getCars().then(setCars).catch(() => {});
  }, []);

  return { cars, loading, error, refresh };
}
