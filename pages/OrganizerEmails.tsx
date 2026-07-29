import { useState, useRef, useMemo } from "react";
import { useParams, Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    ArrowLeft, Mail, Send, Users, Eye, Loader2, AlertTriangle,
    CheckCircle2, XCircle, Clock, History, Bell,
} from "lucide-react";
import { toast } from "sonner";
import { formatarBrasilia } from "@/shared/horarioBrasilia";

export default function OrganizerEmails() {
    const { isAuthenticated } = useAuth();
    const params = useParams() as { id?: string };
    const eventId = params.id ? parseInt(params.id, 10) : 0;
    const utils = trpc.useUtils();

    // ---- filtros de quem recebe
    const [status, setStatus] = useState<"paid" | "pending" | "all">("all");
    const [categoryIds, setCategoryIds] = useState<number[]>([]);
    const [incluirNavegador, setIncluirNavegador] = useState(true);
    const [incluirCompradoresLoja, setIncluirCompradoresLoja] = useState(false);

    // ---- conteúdo
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const bodyRef = useRef<HTMLTextAreaElement>(null);

    // ---- envio em andamento
    const [progresso, setProgresso] = useState<{ total: number; sent: number; failed: number } | null>(null);
    const [enviando, setEnviando] = useState(false);
    const [previewAberto, setPreviewAberto] = useState(false);
    const [detalheId, setDetalheId] = useState<string | null>(null);

    const filtros = { eventId, status, categoryIds, incluirNavegador, incluirCompradoresLoja };
    const habilitado = isAuthenticated && eventId > 0;

    const { data: evento } = trpc.events.get.useQuery({ id: eventId }, { enabled: habilitado });
    const { data: categorias = [] } = trpc.categories.listByEvent.useQuery({ eventId }, { enabled: habilitado });
    const { data: variaveis = [] } = trpc.emails.variaveis.useQuery(undefined, { enabled: habilitado });
    const { data: audiencia, isLoading: carregandoAudiencia } =
        trpc.emails.previewDestinatarios.useQuery(filtros, { enabled: habilitado });
    const { data: historico = [] } = trpc.emails.historico.useQuery({ eventId }, { enabled: habilitado });
    const { data: detalhes } = trpc.emails.detalhes.useQuery(
        { emailId: detalheId! }, { enabled: !!detalheId }
    );
    const { data: previewEmail, isFetching: carregandoPreview } = trpc.emails.preview.useQuery(
        { ...filtros, subject, body },
        { enabled: habilitado && previewAberto && !!body }
    );

    const subcategorias = useMemo(
        () => (categorias as any[]).filter(c => c.parentId !== null),
        [categorias]
    );

    const nomeCategoria = (cat: any) => {
        const pai = (categorias as any[]).find(p => p.id === cat.parentId);
        return pai ? `${pai.name} - ${cat.name}` : cat.name;
    };

    // Insere {{variavel}} na posição do cursor, sem perder o que já foi escrito.
    const inserirVariavel = (chave: string) => {
        const el = bodyRef.current;
        const token = `{{${chave}}}`;
        if (!el) { setBody(b => b + token); return; }
        const ini = el.selectionStart ?? body.length;
        const fim = el.selectionEnd ?? body.length;
        setBody(body.slice(0, ini) + token + body.slice(fim));
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(ini + token.length, ini + token.length);
        });
    };

    const testeMutation = trpc.emails.enviarTeste.useMutation({
        onSuccess: (r) => toast.success(`Teste enviado para ${r.para}`),
        onError: (e) => toast.error(e.message || "Falha ao enviar o teste"),
    });
    const criarDisparo = trpc.emails.criarDisparo.useMutation();
    const processarLote = trpc.emails.processarLote.useMutation();

    /**
     * Cria o disparo e chama o lote em laço até zerar os pendentes.
     * O envio é em lotes porque SMTP é sequencial e lento — mandar tudo numa
     * requisição só estoura o tempo da função na Vercel.
     */
    const handleEnviar = async () => {
        if (!subject.trim() || !body.trim()) {
            toast.error("Preencha o assunto e a mensagem");
            return;
        }
        const total = audiencia?.total || 0;
        if (total === 0) {
            toast.error("Nenhum destinatário com os filtros escolhidos");
            return;
        }
        if (!window.confirm(`Enviar este e-mail para ${total} destinatário(s)? Não dá pra cancelar depois que começa.`)) {
            return;
        }

        setEnviando(true);
        setProgresso({ total, sent: 0, failed: 0 });
        try {
            const { emailId } = await criarDisparo.mutateAsync({ ...filtros, subject, body });

            let restam = 1;
            while (restam > 0) {
                const r = await processarLote.mutateAsync({ emailId });
                setProgresso({ total: r.total, sent: r.sent, failed: r.failed });
                restam = r.pendentes;
            }

            toast.success("Envio concluído");
            setSubject("");
            setBody("");
            utils.emails.historico.invalidate({ eventId });
        } catch (err: any) {
            toast.error(err?.message || "Erro no envio. O que faltou fica pendente e pode ser retomado.");
        } finally {
            setEnviando(false);
        }
    };

    // ---- cobrança automática
    const { data: cobranca } = trpc.emails.configCobranca.useQuery({ eventId }, { enabled: habilitado });
    const [cobrancaForm, setCobrancaForm] = useState<{ enabled: boolean; subject: string; body: string } | null>(null);
    const form = cobrancaForm ?? cobranca ?? { enabled: false, subject: "", body: "" };

    const salvarCobranca = trpc.emails.salvarConfigCobranca.useMutation({
        onSuccess: () => {
            toast.success("Cobrança automática atualizada");
            utils.emails.configCobranca.invalidate({ eventId });
            setCobrancaForm(null);
        },
        onError: (e) => toast.error(e.message || "Erro ao salvar"),
    });

    if (!habilitado) {
        return (
            <div className="min-h-screen bg-background">
                <Navbar />
                <div className="container py-8">
                    <p className="text-muted-foreground">Selecione um evento para enviar e-mails.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <Navbar />
            <div className="container py-8">
                <div className="mb-6">
                    <Link href="/organizer">
                        <Button variant="ghost" size="sm" className="gap-2">
                            <ArrowLeft className="h-4 w-4" /> Voltar ao Painel
                        </Button>
                    </Link>
                </div>

                <div className="mb-6">
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Mail className="h-6 w-6 text-primary" /> E-mails do evento
                    </h1>
                    <p className="text-muted-foreground text-sm">{(evento as any)?.name || `Evento #${eventId}`}</p>
                </div>

                <Tabs defaultValue="escrever">
                    <TabsList>
                        <TabsTrigger value="escrever" className="gap-2"><Send className="h-4 w-4" /> Escrever</TabsTrigger>
                        <TabsTrigger value="cobranca" className="gap-2"><Bell className="h-4 w-4" /> Cobrança automática</TabsTrigger>
                        <TabsTrigger value="historico" className="gap-2"><History className="h-4 w-4" /> Histórico</TabsTrigger>
                    </TabsList>

                    {/* ================= ESCREVER ================= */}
                    <TabsContent value="escrever" className="mt-4 grid gap-6 lg:grid-cols-[1fr_320px]">
                        <div className="space-y-4">
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base">Mensagem</CardTitle>
                                    <CardDescription>
                                        Clique numa variável para inserir. Cada pessoa recebe com os dados dela.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="assunto">Assunto *</Label>
                                        <Input
                                            id="assunto"
                                            value={subject}
                                            onChange={e => setSubject(e.target.value)}
                                            placeholder="Ex: Convocação de largada — {{evento}}"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label htmlFor="corpo">Mensagem *</Label>
                                        <div className="flex flex-wrap gap-1 mb-1.5">
                                            {(variaveis as any[]).map(v => (
                                                <button
                                                    key={v.chave}
                                                    type="button"
                                                    title={v.descricao}
                                                    onClick={() => inserirVariavel(v.chave)}
                                                    className="px-1.5 py-0.5 rounded border text-[10px] font-mono bg-muted/40 hover:bg-primary/10 hover:border-primary/40 transition-colors"
                                                >
                                                    {`{{${v.chave}}}`}
                                                </button>
                                            ))}
                                        </div>
                                        <Textarea
                                            id="corpo"
                                            ref={bodyRef}
                                            rows={12}
                                            value={body}
                                            onChange={e => setBody(e.target.value)}
                                            placeholder={"Olá {{piloto}},\n\nVocê é o número {{numero}} e larga às {{horario_largada}}.\n\nNos vemos lá!"}
                                        />
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        <Button
                                            variant="outline"
                                            className="gap-2"
                                            onClick={() => setPreviewAberto(true)}
                                            disabled={!body.trim()}
                                        >
                                            <Eye className="h-4 w-4" /> Pré-visualizar
                                        </Button>
                                        <Button
                                            variant="outline"
                                            className="gap-2"
                                            disabled={!subject.trim() || !body.trim() || testeMutation.isPending}
                                            onClick={() => testeMutation.mutate({ eventId, subject, body })}
                                        >
                                            {testeMutation.isPending
                                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                                : <Mail className="h-4 w-4" />}
                                            Enviar teste pra mim
                                        </Button>
                                        <Button
                                            className="gap-2 ml-auto"
                                            onClick={handleEnviar}
                                            disabled={enviando || !subject.trim() || !body.trim() || (audiencia?.total || 0) === 0}
                                        >
                                            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                            Enviar para {audiencia?.total || 0}
                                        </Button>
                                    </div>

                                    {progresso && (
                                        <div className="rounded-lg border p-3 bg-muted/20">
                                            <div className="flex justify-between text-xs mb-1.5">
                                                <span>{progresso.sent + progresso.failed} de {progresso.total}</span>
                                                <span className="text-muted-foreground">
                                                    {progresso.failed > 0 && `${progresso.failed} falha(s) · `}
                                                    {enviando ? "enviando..." : "concluído"}
                                                </span>
                                            </div>
                                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                                                <div
                                                    className="h-full bg-primary transition-all"
                                                    style={{ width: `${progresso.total ? ((progresso.sent + progresso.failed) / progresso.total) * 100 : 0}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* -------- destinatários -------- */}
                        <Card className="h-fit">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Users className="h-4 w-4 text-primary" /> Destinatários
                                </CardTitle>
                                <CardDescription>
                                    {carregandoAudiencia
                                        ? "contando..."
                                        : `${audiencia?.total || 0} e-mail(s), sem repetir`}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Situação da inscrição</Label>
                                    <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                                        <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all" className="text-xs">Todos (pagos e pendentes)</SelectItem>
                                            <SelectItem value="paid" className="text-xs">Só confirmados</SelectItem>
                                            <SelectItem value="pending" className="text-xs">Só pendentes</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs">Categorias</Label>
                                    <div className="flex flex-wrap gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setCategoryIds([])}
                                            className={`px-2 py-0.5 rounded border text-[10px] ${categoryIds.length === 0 ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}
                                        >
                                            Todas
                                        </button>
                                        {subcategorias.map((cat: any) => {
                                            const ativo = categoryIds.includes(cat.id);
                                            return (
                                                <button
                                                    key={cat.id}
                                                    type="button"
                                                    onClick={() => setCategoryIds(prev =>
                                                        ativo ? prev.filter(c => c !== cat.id) : [...prev, cat.id]
                                                    )}
                                                    className={`px-2 py-0.5 rounded border text-[10px] ${ativo ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-muted'}`}
                                                >
                                                    {nomeCategoria(cat)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                    <input type="checkbox" checked={incluirNavegador} onChange={e => setIncluirNavegador(e.target.checked)} />
                                    Incluir navegadores
                                </label>
                                <label className="flex items-center gap-2 text-xs cursor-pointer">
                                    <input type="checkbox" checked={incluirCompradoresLoja} onChange={e => setIncluirCompradoresLoja(e.target.checked)} />
                                    Incluir compradores da loja
                                </label>

                                <div className="max-h-64 overflow-y-auto rounded border divide-y">
                                    {(audiencia?.destinatarios || []).map((d: any) => (
                                        <div key={d.email} className="px-2 py-1.5 text-[11px] flex justify-between gap-2">
                                            <span className="truncate" title={d.email}>
                                                <span className="font-medium">{d.name}</span>
                                                <span className="text-muted-foreground block truncate">{d.email}</span>
                                            </span>
                                            {d.status && (
                                                <Badge variant="outline" className={`h-4 text-[9px] shrink-0 ${d.status === 'paid' ? 'text-green-600 border-green-300' : 'text-amber-600 border-amber-300'}`}>
                                                    {d.status === 'paid' ? 'pago' : 'pendente'}
                                                </Badge>
                                            )}
                                        </div>
                                    ))}
                                    {(audiencia?.total || 0) === 0 && !carregandoAudiencia && (
                                        <p className="p-3 text-[11px] text-muted-foreground italic text-center">
                                            Nenhum destinatário com esses filtros.
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ================= COBRANÇA AUTOMÁTICA ================= */}
                    <TabsContent value="cobranca" className="mt-4">
                        <Card className="max-w-3xl">
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Bell className="h-4 w-4 text-primary" /> Lembrete de quem não pagou
                                </CardTitle>
                                <CardDescription>
                                    Envia sozinho <strong>1 dia</strong> depois da inscrição, <strong>3 dias</strong> depois e na{" "}
                                    <strong>véspera</strong> do evento. Para na hora que a pessoa paga ou cancela, e o mesmo
                                    lembrete nunca vai duas vezes.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={form.enabled}
                                        onChange={e => setCobrancaForm({ ...form, enabled: e.target.checked })}
                                    />
                                    <span className="font-medium">Cobrar automaticamente neste evento</span>
                                </label>

                                <div className="space-y-1.5">
                                    <Label htmlFor="cob-assunto">Assunto</Label>
                                    <Input
                                        id="cob-assunto"
                                        value={form.subject}
                                        onChange={e => setCobrancaForm({ ...form, subject: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="cob-corpo">Mensagem</Label>
                                    <Textarea
                                        id="cob-corpo"
                                        rows={12}
                                        value={form.body}
                                        onChange={e => setCobrancaForm({ ...form, body: e.target.value })}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Aceita as mesmas variáveis. O botão "Concluir pagamento" entra sozinho no fim.
                                    </p>
                                </div>

                                <Button
                                    onClick={() => salvarCobranca.mutate({ eventId, ...form })}
                                    disabled={salvarCobranca.isPending}
                                    className="gap-2"
                                >
                                    {salvarCobranca.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                                    Salvar
                                </Button>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ================= HISTÓRICO ================= */}
                    <TabsContent value="historico" className="mt-4">
                        <Card>
                            <CardContent className="p-0 divide-y">
                                {(historico as any[]).length === 0 && (
                                    <p className="p-6 text-sm text-muted-foreground italic text-center">
                                        Nenhum e-mail enviado ainda.
                                    </p>
                                )}
                                {(historico as any[]).map(h => (
                                    <button
                                        key={h.id}
                                        onClick={() => setDetalheId(h.id)}
                                        className="w-full text-left p-4 hover:bg-muted/40 transition-colors flex flex-wrap items-center justify-between gap-2"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium truncate">{h.subject}</p>
                                            <p className="text-[11px] text-muted-foreground">
                                                {formatarBrasilia(new Date(h.createdAt).toISOString())}
                                                {h.kind === 'auto_pendente' && ' · cobrança automática'}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2 text-[11px] shrink-0">
                                            <span className="flex items-center gap-1 text-green-600">
                                                <CheckCircle2 className="h-3 w-3" /> {h.sentCount}
                                            </span>
                                            {h.failedCount > 0 && (
                                                <span className="flex items-center gap-1 text-red-600">
                                                    <XCircle className="h-3 w-3" /> {h.failedCount}
                                                </span>
                                            )}
                                            {h.status === 'sending' && (
                                                <span className="flex items-center gap-1 text-amber-600">
                                                    <Clock className="h-3 w-3" /> em andamento
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Pré-visualização */}
            <Dialog open={previewAberto} onOpenChange={setPreviewAberto}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Como vai chegar</DialogTitle>
                    </DialogHeader>
                    {carregandoPreview ? (
                        <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
                    ) : (
                        <div className="space-y-3">
                            {(previewEmail?.variaveisDesconhecidas?.length ?? 0) > 0 && (
                                <div className="flex gap-2 p-2 rounded border border-amber-300 bg-amber-50 dark:bg-amber-900/20 text-xs">
                                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                                    <span>
                                        Variável que não existe (vai sair em branco):{" "}
                                        <strong>{previewEmail!.variaveisDesconhecidas.map(v => `{{${v}}}`).join(", ")}</strong>
                                    </span>
                                </div>
                            )}
                            <p className="text-xs text-muted-foreground">
                                Exemplo com os dados de <strong>{previewEmail?.para || "—"}</strong>
                            </p>
                            <p className="text-sm font-semibold border rounded p-2 bg-muted/30">
                                {previewEmail?.assunto}
                            </p>
                            <iframe
                                title="Pré-visualização do e-mail"
                                srcDoc={previewEmail?.html || ""}
                                className="w-full h-[420px] rounded border bg-white"
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Detalhe de um disparo */}
            <Dialog open={!!detalheId} onOpenChange={(o) => !o && setDetalheId(null)}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="truncate">{detalhes?.disparo?.subject || "Disparo"}</DialogTitle>
                    </DialogHeader>
                    <div className="max-h-[60vh] overflow-y-auto divide-y text-xs">
                        {(detalhes?.destinatarios || []).map((d: any) => (
                            <div key={d.id} className="py-2 flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-medium truncate">{d.name}</p>
                                    <p className="text-muted-foreground truncate">{d.email}</p>
                                    {d.error && <p className="text-red-600 mt-0.5">{d.error}</p>}
                                </div>
                                <Badge
                                    variant="outline"
                                    className={`shrink-0 h-5 text-[10px] ${d.status === 'sent' ? 'text-green-600 border-green-300'
                                        : d.status === 'failed' ? 'text-red-600 border-red-300'
                                            : 'text-amber-600 border-amber-300'}`}
                                >
                                    {d.status === 'sent' ? 'enviado' : d.status === 'failed' ? 'falhou' : 'pendente'}
                                </Badge>
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
