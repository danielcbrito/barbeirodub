import { useEffect, useState, useCallback } from "react";

/**
 * Hook para gerenciar permissão de notificações do navegador.
 * Usa Service Worker quando disponível para notificações em background.
 */
export function useNotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    setPermission(Notification.permission);
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return "denied" as NotificationPermission;

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      return result;
    } catch {
      return "denied" as NotificationPermission;
    }
  }, []);

  /** Logo do app para exibir nas notificações */
  const APP_ICON = "https://storage.googleapis.com/gpt-engineer-file-uploads/TqLHS6yMmlcD49zJhHO58WgMv8Z2/uploads/1764889000501-pixelcut-export (1).png";

  /** Envia notificação via Service Worker (funciona em background) ou fallback nativo */
  const sendBrowserNotification = useCallback(
    async (title: string, options?: NotificationOptions & { data?: Record<string, unknown> }) => {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") {
        return;
      }

      try {
        const notificationOptions: NotificationOptions = {
          icon: APP_ICON,
          badge: APP_ICON,
          requireInteraction: true,
          ...options,
        };

        // Usa qualquer SW já ativo (normalmente o Firebase Messaging) sem depender do antigo /sw.js.
        const registration = await Promise.race([
          navigator.serviceWorker?.ready,
          new Promise<undefined>((resolve) => window.setTimeout(resolve, 1200)),
        ]);

        if (registration) {
          await registration.showNotification(title, notificationOptions);
          return;
        }

        // Fallback: Notification API direta (com persistência)
        new Notification(title, notificationOptions);
      } catch (error) {
        console.warn("Erro ao enviar notificação:", error);
      }
    },
    []
  );

  return { permission, requestPermission, sendBrowserNotification };
}
