import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CheckIn() {
  const qrCodeRegionId = "html5qr-code-full-region";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    // Cleanup ao desmontar
    return () => {
      if (scannerRef.current && scanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [scanning]);

  const startScanner = async () => {
    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(qrCodeRegionId);
      }
      await scannerRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          console.log(`Scan successful: ${decodedText}`);
          toast.success(`Check-in lido: ${decodedText}`);
          // Aqui integraremos a chamada TRPC depois
        },
        (errorMessage) => {
          // ignora erros de scan frame
        }
      );
      setScanning(true);
    } catch (err) {
      toast.error("Erro ao iniciar câmera. Verifique as permissões.");
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && scanning) {
      await scannerRef.current.stop();
      setScanning(false);
    }
  };

  return (
    <div className="container py-12 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Check-In de Pilotos</CardTitle>
          <CardDescription>
            Aponte a câmera para o QR Code da inscrição.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div id={qrCodeRegionId} className="w-full bg-muted min-h-[300px] flex items-center justify-center rounded-md border" />

          <div className="flex justify-center gap-4">
            {!scanning ? (
              <Button onClick={startScanner}>Iniciar Câmera</Button>
            ) : (
              <Button variant="destructive" onClick={stopScanner}>Parar Câmera</Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
