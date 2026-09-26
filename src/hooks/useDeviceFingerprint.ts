import { useState, useEffect } from 'react';

interface DeviceInfo {
  fingerprint: string;
  deviceName: string;
  deviceType: 'desktop' | 'mobile' | 'tablet';
  browser: string;
  os: string;
}

/**
 * Hook para gerar e gerenciar fingerprint único do dispositivo
 * Combina características do navegador para criar identificador persistente
 */
export function useDeviceFingerprint() {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const generateFingerprint = async () => {
      try {
        // Coletar características do dispositivo
        const userAgent = navigator.userAgent;
        const language = navigator.language;
        const platform = navigator.platform;
        const screenWidth = window.screen.width;
        const screenHeight = window.screen.height;
        const colorDepth = window.screen.colorDepth;
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const hardwareConcurrency = navigator.hardwareConcurrency || 0;
        const deviceMemory = (navigator as any).deviceMemory || 0;
        
        // Criar string base para fingerprint
        const baseString = [
          userAgent,
          language,
          platform,
          `${screenWidth}x${screenHeight}`,
          colorDepth.toString(),
          timezone,
          hardwareConcurrency.toString(),
          deviceMemory.toString(),
        ].join('|');

        // Gerar hash simples do fingerprint
        let hash = 0;
        for (let i = 0; i < baseString.length; i++) {
          const char = baseString.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        const fingerprint = Math.abs(hash).toString(36) + Date.now().toString(36).slice(-4);

        // Verificar se já existe fingerprint salvo
        const savedFingerprint = localStorage.getItem('device_fingerprint');
        const finalFingerprint = savedFingerprint || fingerprint;
        
        if (!savedFingerprint) {
          localStorage.setItem('device_fingerprint', finalFingerprint);
        }

        // Detectar tipo de dispositivo
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
        const isTablet = /iPad|Android(?!.*Mobile)/i.test(userAgent);
        const deviceType: 'desktop' | 'mobile' | 'tablet' = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';

        // Detectar navegador
        let browser = 'Unknown';
        if (userAgent.includes('Firefox')) browser = 'Firefox';
        else if (userAgent.includes('Chrome')) browser = 'Chrome';
        else if (userAgent.includes('Safari')) browser = 'Safari';
        else if (userAgent.includes('Edge')) browser = 'Edge';
        else if (userAgent.includes('Opera')) browser = 'Opera';

        // Detectar OS
        let os = 'Unknown';
        if (userAgent.includes('Windows')) os = 'Windows';
        else if (userAgent.includes('Mac')) os = 'macOS';
        else if (userAgent.includes('Linux')) os = 'Linux';
        else if (userAgent.includes('Android')) os = 'Android';
        else if (userAgent.includes('iOS') || userAgent.includes('iPhone')) os = 'iOS';

        // Nome amigável do dispositivo
        const deviceName = `${browser} - ${os} (${screenWidth}x${screenHeight})`;

        setDeviceInfo({
          fingerprint: finalFingerprint,
          deviceName,
          deviceType,
          browser,
          os
        });
      } catch (error) {
        console.error('Erro ao gerar fingerprint:', error);
        // Fallback para fingerprint básico
        const fallbackFp = 'fb_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('device_fingerprint', fallbackFp);
        setDeviceInfo({
          fingerprint: fallbackFp,
          deviceName: 'Dispositivo Desconhecido',
          deviceType: 'desktop',
          browser: 'Unknown',
          os: 'Unknown'
        });
      } finally {
        setIsLoading(false);
      }
    };

    generateFingerprint();
  }, []);

  return { deviceInfo, isLoading };
}
