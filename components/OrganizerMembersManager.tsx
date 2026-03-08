import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Trash2, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export function OrganizerMembersManager() {
    const [open, setOpen] = useState(false);
    const [email, setEmail] = useState("");
    const [permissions, setPermissions] = useState({
        events: false,
        registrations: false,
        finance: false,
        store: false,
    });

    const utils = trpc.useUtils();
    const { data: members, isLoading } = trpc.organizerMembers.list.useQuery(undefined, { enabled: open });

    const inviteMutation = trpc.organizerMembers.invite.useMutation({
        onSuccess: () => {
            toast.success("Organizador convidado com sucesso!");
            setEmail("");
            setPermissions({ events: false, registrations: false, finance: false, store: false });
            utils.organizerMembers.list.invalidate();
        },
        onError: (err) => {
            toast.error(err.message || "Erro ao convidar organizador");
        }
    });

    const removeMutation = trpc.organizerMembers.remove.useMutation({
        onSuccess: () => {
            toast.success("Acesso removido com sucesso!");
            utils.organizerMembers.list.invalidate();
        },
        onError: (err) => {
            toast.error(err.message || "Erro ao remover acesso");
        }
    });

    const handleInvite = () => {
        if (!email) {
            toast.error("Preencha o email do organizador");
            return;
        }

        const selectedPermissions = Object.entries(permissions)
            .filter(([_, isSelected]) => isSelected)
            .map(([key]) => key);

        inviteMutation.mutate({
            email,
            permissions: selectedPermissions,
        });
    };

    const getPermissionLabel = (perm: string) => {
        switch (perm) {
            case 'events': return 'Eventos';
            case 'registrations': return 'Inscritos';
            case 'finance': return 'Financeiro';
            case 'store': return 'Loja';
            default: return perm;
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                    <Users className="h-4 w-4" />
                    Convidar Organizador
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Gerenciar Equipe</DialogTitle>
                    <DialogDescription>
                        Convide usuários cadastrados para gerenciar partes exclusivas do seu painel e eventos.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    <div className="bg-slate-50 dark:bg-slate-900 border p-4 rounded-lg space-y-4">
                        <h3 className="font-semibold px-1">Novo Convite</h3>
                        <div className="space-y-2">
                            <Label>Email do Usuário (deve estar cadastrado na plataforma)</Label>
                            <Input
                                placeholder="Ex: socia@amigoracing.com.br"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        <div className="space-y-3 pt-2">
                            <Label>Permissões (Módulos Liberados)</Label>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex items-center space-x-2 border p-3 rounded-md">
                                    <Switch
                                        id="perm-events"
                                        checked={permissions.events}
                                        onCheckedChange={(c) => setPermissions({ ...permissions, events: c })}
                                    />
                                    <Label htmlFor="perm-events" className="cursor-pointer">Editar Eventos</Label>
                                </div>
                                <div className="flex items-center space-x-2 border p-3 rounded-md">
                                    <Switch
                                        id="perm-regs"
                                        checked={permissions.registrations}
                                        onCheckedChange={(c) => setPermissions({ ...permissions, registrations: c })}
                                    />
                                    <Label htmlFor="perm-regs" className="cursor-pointer">Gerenciar Inscritos</Label>
                                </div>
                                <div className="flex items-center space-x-2 border p-3 rounded-md">
                                    <Switch
                                        id="perm-fin"
                                        checked={permissions.finance}
                                        onCheckedChange={(c) => setPermissions({ ...permissions, finance: c })}
                                    />
                                    <Label htmlFor="perm-fin" className="cursor-pointer">Financeiro</Label>
                                </div>
                                <div className="flex items-center space-x-2 border p-3 rounded-md">
                                    <Switch
                                        id="perm-store"
                                        checked={permissions.store}
                                        onCheckedChange={(c) => setPermissions({ ...permissions, store: c })}
                                    />
                                    <Label htmlFor="perm-store" className="cursor-pointer">Loja / Standalone</Label>
                                </div>
                            </div>
                        </div>

                        <Button
                            className="w-full mt-2"
                            onClick={handleInvite}
                            disabled={inviteMutation.isPending}
                        >
                            {inviteMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            Convidar
                        </Button>
                    </div>

                    <div className="pt-4 border-t">
                        <h3 className="font-semibold mb-4">Organizadores Secundários ({members?.length || 0})</h3>

                        {isLoading ? (
                            <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                        ) : members?.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">Nenhum membro convidado ainda.</p>
                        ) : (
                            <div className="space-y-3">
                                {members?.map((member) => {
                                    let parsedPerms: string[] = [];
                                    try {
                                        parsedPerms = typeof member.permissions === 'string' ? JSON.parse(member.permissions) : member.permissions;
                                    } catch { }

                                    return (
                                        <div key={member.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-lg gap-4">
                                            <div>
                                                <p className="font-medium text-sm">{member.memberEmail}</p>
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {parsedPerms.length === 0 && <Badge variant="secondary" className="text-[10px]">Acesso de Leitura Apenas</Badge>}
                                                    {parsedPerms.map(p => (
                                                        <Badge key={p} variant="secondary" className="bg-primary/10 text-primary text-[10px]">
                                                            {getPermissionLabel(p)}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-destructive hover:bg-destructive/10 shrink-0 self-end sm:self-auto"
                                                onClick={() => {
                                                    if (window.confirm("Remover o acesso deste organizador?")) {
                                                        removeMutation.mutate({ id: member.id });
                                                    }
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
