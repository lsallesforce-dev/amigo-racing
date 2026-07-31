// Leitor de QR da secretaria: lê a etiqueta do kit (ou o passaporte do
// competidor), mostra quem é e deixa marcar kit entregue / check-in na hora.
//
// Antes esta tela só dava um toast com o texto lido — o QR não ligava em nada.
// O QR da etiqueta carrega a URL do passaporte; aqui a gente aceita tanto a URL
// quanto o hash cru, porque etiqueta velha (e o passaporte do competidor) ainda
// trazem só o hash.
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, Package, ScanLine, AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { normalizeShirtSize } from "@/shared/shirtSizes";

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Aceita a URL do passaporte, o link inteiro colado ou o hash sozinho. */
export function extrairHash(texto: string): string | null {
  const m = String(texto || "").match(UUID_RE);
  return m ? m[0].toLowerCase() : null;
}

export default function CheckIn() {
  const qrCodeRegionId = "html5qr-code-full-region";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scanning, setScanning] = useState(false);
  const [hash, setHash] = useState<string | null>(null);
  const [erroCamera, setErroCamera] = useState<string | null>(null);
  const [codigoManual, setCodigoManual] = useState("");

  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.participants.getPassportByHash.useQuery(
    { accessHash: hash || "" },
    { enabled: !!hash, retry: false }
  );

  const toggle = trpc.registrations.toggleCheckinStatus.useMutation({
    onSuccess: () => {
      utils.participants.getPassportByHash.invalidate({ accessHash: hash || "" });
    },
    onError: (e) => toast.error(e.message || "Não foi possível salvar"),
  });

  const pararCamera = async () => {
    if (scannerRef.current && scanning) {
      await scannerRef.current.stop().catch(() => { });
      setScanning(false);
    }
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current && scanning) scannerRef.current.stop().catch(() => { });
    };
  }, [scanning]);

  const aoLer = async (decodedText: string) => {
    const lido = extrairHash(decodedText);
    if (!lido) {
      toast.error("Esse QR não é de uma inscrição.");
      return;
    }
    // Para a câmera antes de mostrar o resultado: senão continua lendo o mesmo
    // código dezenas de vezes por segundo.
    await pararCamera();
    setHash(lido);
  };

  // A caixa de mira precisa caber no vídeo. Fixa em 250px ela estourava a
  // largura em tela de celular, e o leitor abria preto.
  const miraQueCabe = (larguraVideo: number, alturaVideo: number) => {
    const lado = Math.floor(Math.min(larguraVideo, alturaVideo) * 0.75);
    return { width: Math.max(120, lado), height: Math.max(120, lado) };
  };

  const startScanner = async () => {
    setHash(null);
    setErroCamera(null);
    // O estado sobe ANTES do start: o <video> é injetado dentro do container, e
    // se o React re-renderizar aquele nó depois (era o caso — tinha um ícone lá
    // dentro que sumia ao escanear) ele leva o vídeo junto, e a câmera liga com
    // a tela preta.
    setScanning(true);
    try {
      if (!scannerRef.current) scannerRef.current = new Html5Qrcode(qrCodeRegionId);
      const config = {
        fps: 10,
        qrbox: miraQueCabe,
        // O leitor nativo do Android é bem mais rápido e estável que o fallback
        // em JS, quando o navegador tem suporte.
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      };
      try {
        await scannerRef.current.start({ facingMode: "environment" }, config, aoLer, () => { });
      } catch (semTraseira) {
        // Aparelho sem câmera traseira (ou que recusa a restrição): tenta a
        // primeira câmera que existir em vez de morrer aqui.
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras?.length) throw semTraseira;
        await scannerRef.current.start(cameras[0].id, config, aoLer, () => { });
      }
    } catch (err: any) {
      setScanning(false);
      // A mensagem crua ajuda muito mais que "verifique as permissões": diz se
      // foi permissão negada, câmera ocupada por outro app ou falta de HTTPS.
      const detalhe = String(err?.message || err || "erro desconhecido");
      setErroCamera(detalhe);
      toast.error(`Não foi possível abrir a câmera: ${detalhe}`);
    }
  };

  const buscarManual = () => {
    const lido = extrairHash(codigoManual);
    if (!lido) {
      toast.error("Não achei um código de inscrição nesse texto.");
      return;
    }
    setHash(lido);
    setCodigoManual("");
  };

  const reg = data?.registration;
  const sec = data?.secretariat;
  // O status vem do pagamento quando existe ('confirmed') e cai pro da inscrição
  // ('paid') quando não existe — os dois valem, como no Passport.
  const pago = data?.financial?.status === "confirmed" || (data?.financial?.status as string) === "paid";
  const camisas = [
    reg?.pilotShirtSize ? `PILOTO ${normalizeShirtSize(reg.pilotShirtSize)}` : "",
    reg?.navigatorShirtSize ? `NAV ${normalizeShirtSize(reg.navigatorShirtSize)}` : "",
  ].filter(Boolean).join("   ·   ");

  const marcar = (campo: "kitDelivered" | "isCheckedIn", valor: boolean) => {
    if (!reg?.id) return;
    toggle.mutate({ registrationId: reg.id, [campo]: valor } as any);
  };

  return (
    <div className="container py-8 max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Check-In de Pilotos</CardTitle>
          <CardDescription>
            Aponte a câmera para o QR da etiqueta do kit ou do passaporte do competidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* O container do leitor fica FORA do controle do React: a biblioteca
              injeta o <video> aqui dentro, e qualquer filho que o React
              adicione ou remova depois leva o vídeo junto. Placeholder e
              moldura ficam na div de fora. */}
          <div className={`w-full rounded-md border bg-muted overflow-hidden relative ${scanning ? "min-h-[300px]" : "min-h-[120px]"}`}>
            {!scanning && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <ScanLine className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
            <div id={qrCodeRegionId} className="w-full" />
          </div>

          <div className="flex justify-center gap-4">
            {!scanning ? (
              <Button onClick={startScanner}>{hash ? "Ler outro" : "Iniciar Câmera"}</Button>
            ) : (
              <Button variant="destructive" onClick={pararCamera}>Parar Câmera</Button>
            )}
          </div>

          {erroCamera && (
            <p className="text-xs text-destructive text-center break-words">
              Erro da câmera: {erroCamera}
            </p>
          )}

          {/* Sem câmera o balcão não pode parar: dá pra colar o link do QR (ou o
              código da inscrição) e seguir na mão. */}
          <div className="pt-2 border-t space-y-2">
            <p className="text-xs text-muted-foreground">
              Câmera não abriu? Cole aqui o link do QR ou o código da inscrição.
            </p>
            <div className="flex gap-2">
              <Input
                value={codigoManual}
                onChange={(e) => setCodigoManual(e.target.value)}
                placeholder="amigo-racing.vercel.app/passport/..."
                onKeyDown={(e) => { if (e.key === "Enter") buscarManual(); }}
              />
              <Button variant="outline" onClick={buscarManual} disabled={!codigoManual.trim()}>
                Buscar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && hash && (
        <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin" /></div>
      )}

      {error && hash && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">
            {error.message || "Inscrição não encontrada."}
          </CardContent>
        </Card>
      )}

      {reg && (
        <Card className={sec?.isCheckedIn ? "border-green-500/60" : ""}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="text-xl leading-tight flex items-center gap-2">
                  {reg.pilotName}
                  {sec?.isCheckedIn && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                </CardTitle>
                {reg.navigatorName && (
                  <p className="text-sm text-muted-foreground mt-1">Nav: {reg.navigatorName}</p>
                )}
              </div>
              <Badge variant="secondary">{reg.categoryName}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {camisas && (
              <div className="rounded-lg bg-muted/60 p-3 text-center text-lg font-bold tracking-wide">
                {camisas}
              </div>
            )}

            {!pago && (
              <div className="flex items-center gap-2 rounded border border-red-200 bg-red-50 p-2 text-sm font-semibold text-red-600 dark:border-red-900 dark:bg-red-950/30">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Pagamento pendente — confira antes de entregar o kit.
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={sec?.kitDelivered ? "default" : "outline"}
                className={sec?.kitDelivered ? "bg-green-600 hover:bg-green-700" : ""}
                disabled={toggle.isPending}
                onClick={() => marcar("kitDelivered", !sec?.kitDelivered)}
              >
                <Package className="mr-2 h-4 w-4" />
                {sec?.kitDelivered ? "Kit entregue" : "Marcar kit"}
              </Button>
              <Button
                variant={sec?.isCheckedIn ? "default" : "outline"}
                className={sec?.isCheckedIn ? "bg-green-600 hover:bg-green-700" : ""}
                disabled={toggle.isPending}
                onClick={() => marcar("isCheckedIn", !sec?.isCheckedIn)}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {sec?.isCheckedIn ? "Check-in feito" : "Fazer check-in"}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Inscrição #{reg.id}{reg.startNumber ? ` · nº ${reg.startNumber}` : ""}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
