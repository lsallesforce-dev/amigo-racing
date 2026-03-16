import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MessageSquare, Send, Loader2, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function WhatsAppManager() {
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const { data: events, isLoading: eventsLoading } = trpc.events.myEvents.useQuery();
  
  const sendMutation = trpc.whatsapp.sendNotification.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setMessage("");
      setIsSending(false);
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao iniciar disparos.");
      setIsSending(false);
    }
  });

  const handleSend = () => {
    if (!selectedEventId) {
      toast.error("Selecione um evento primeiro.");
      return;
    }
    if (!message.trim()) {
      toast.error("Digite uma mensagem para os participantes.");
      return;
    }

    const event = events?.find(e => e.id.toString() === selectedEventId);
    if (!event) return;

    if (confirm(`Deseja enviar esta mensagem para TODOS os inscritos com pagamento confirmado no evento "${event.name}"?`)) {
      setIsSending(true);
      sendMutation.mutate({
        eventId: parseInt(selectedEventId),
        message: message.trim()
      });
    }
  };

  if (eventsLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <CardTitle>Avisos via WhatsApp</CardTitle>
          </div>
          <CardDescription>
            Envie comunicados rápidos para todos os pilotos e navegadores inscritos (pagos) no seu evento.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="event-select">Selecione o Evento</Label>
            <Select value={selectedEventId} onValueChange={setSelectedEventId}>
              <SelectTrigger id="event-select" className="w-full md:w-[400px]">
                <SelectValue placeholder="Selecione um evento..." />
              </SelectTrigger>
              <SelectContent>
                {events?.filter(e => !e.isExternal).map((event) => (
                  <SelectItem key={event.id} value={event.id.toString()}>
                    {event.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="whatsapp-message">Mensagem</Label>
            <div className="relative">
              <Textarea
                id="whatsapp-message"
                placeholder="Ex e: Não se esqueça da vistoria técnica amanhã às 08:00..."
                className="min-h-[150px] resize-none pb-12"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={isSending}
              />
              <div className="absolute left-3 bottom-3 text-xs text-muted-foreground bg-background/80 px-1 rounded">
                A mensagem começará com: <strong>[Nome do Evento]</strong>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Dica: Use * para negrito (ex: *texto*) e _ para itálico (ex: _texto_).
            </p>
          </div>

          <Alert variant="default" className="bg-blue-500/10 border-blue-500/20">
            <Info className="h-4 w-4 text-blue-500" />
            <AlertTitle className="text-blue-500">Importante: Sistema Anti-Ban</AlertTitle>
            <AlertDescription className="text-blue-400">
              As mensagens são enviadas em lotes com um intervalo de 3 segundos entre cada contato para proteger o número da Amigo Racing contra bloqueios.
            </AlertDescription>
          </Alert>

          <Button 
            className="w-full md:w-auto gap-2" 
            onClick={handleSend}
            disabled={isSending || !selectedEventId || !message.trim()}
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Iniciando Processo...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Enviar para Todos os Inscritos
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Instruções e Regras</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <ul className="list-disc pl-4 space-y-1">
            <li>As mensagens são enviadas apenas para inscritos com status <strong>PAGO</strong>.</li>
            <li>O número oficial de disparo é o da Amigo Racing.</li>
            <li>Não utilize este sistema para fins não relacionados ao evento.</li>
            <li>Se houver muitos contatos, o processo pode levar alguns minutos para concluir.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
