import { useCallback, useEffect, useState } from "react";
import type { ErrorTemplate } from "@/types/errorTemplate";
import {
  createTemplate as createTemplateApi,
  deleteTemplate as deleteTemplateApi,
  subscribeTemplates,
  updateTemplate as updateTemplateApi,
  type ErrorTemplateCreateInput,
  type ErrorTemplateUpdateInput,
} from "@/services/errorTemplateService";

/**
 * Шаблоны ошибок инструктора: системные + свои, с подпиской на Firestore.
 */
export function useErrorTemplates(instructorId: string | undefined) {
  const [templates, setTemplates] = useState<ErrorTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = instructorId?.trim();
    if (!uid) {
      setTemplates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeTemplates(
      uid,
      (list) => {
        setTemplates(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [instructorId]);

  const addTemplate = useCallback(
    async (data: ErrorTemplateCreateInput) => {
      const uid = instructorId?.trim();
      if (!uid) throw new Error("Не выполнен вход");
      await createTemplateApi(uid, data);
    },
    [instructorId]
  );

  const updateTemplate = useCallback(
    async (id: string, data: ErrorTemplateUpdateInput) => {
      const uid = instructorId?.trim();
      if (!uid) throw new Error("Не выполнен вход");
      await updateTemplateApi(uid, id, data);
    },
    [instructorId]
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      const uid = instructorId?.trim();
      if (!uid) throw new Error("Не выполнен вход");
      await deleteTemplateApi(uid, id);
    },
    [instructorId]
  );

  return {
    templates,
    loading,
    addTemplate,
    updateTemplate,
    deleteTemplate,
  };
}
