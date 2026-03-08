// TODO: Implementar EventMembersManager quando as funções de event members forem criadas
// import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trash2, UserPlus, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface EventMembersManagerProps {
  eventId: number;
}

/*
export function EventMembersManager({ eventId }: EventMembersManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'coordinator' | 'viewer'>('editor');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const { data: members, isLoading, refetch } = trpc.eventMembers.getMembers.useQuery({ eventId });
  const inviteMutation = trpc.eventMembers.inviteMember.useMutation();
  const updateRoleMutation = trpc.eventMembers.updateMemberRole.useMutation();
  const removeMutation = trpc.eventMembers.removeMember.useMutation();

  const handleInvite = async () => {
    if (!inviteEmail) {
      toast.error('Por favor, insira um email');
      return;
    }

    try {
      await inviteMutation.mutateAsync({
        eventId,
        email: inviteEmail,
        role: inviteRole,
      });
      toast.success('Convite enviado com sucesso!');
      setInviteEmail('');
      setInviteRole('editor');
      setIsOpen(false);
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao enviar convite');
    }
  };

  const handleUpdateRole = async (userId: number, newRole: string) => {
    try {
      await updateRoleMutation.mutateAsync({
        eventId,
        userId,
        role: newRole as 'editor' | 'coordinator' | 'viewer',
      });
      toast.success('Permissão atualizada');
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao atualizar permissão');
    }
  };

  const handleRemove = async (userId: number) => {
    if (!confirm('Tem certeza que deseja remover este membro?')) return;

    try {
      await removeMutation.mutateAsync({ eventId, userId });
      toast.success('Membro removido');
      refetch();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao remover membro');
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'master':
        return 'bg-red-100 text-red-800';
      case 'editor':
        return 'bg-blue-100 text-blue-800';
      case 'coordinator':
        return 'bg-green-100 text-green-800';
      case 'viewer':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      master: 'Criador',
      editor: 'Editor',
      coordinator: 'Coordenador',
      viewer: 'Visualizador',
    };
    return labels[role] || role;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Membros do Evento</CardTitle>
            <CardDescription>Gerencie quem pode acessar e editar este evento</CardDescription>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger>
              <Button size="sm" className="gap-2">
                <UserPlus className="w-4 h-4" />
                Adicionar Membro
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Convidar Membro</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    type="email"
                    placeholder="email@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Função</label>
                  <Select value={inviteRole} onValueChange={(v: any) => setInviteRole(v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="editor">Editor - Edita evento e categorias</SelectItem>
                      <SelectItem value="coordinator">Coordenador - Gerencia inscrições</SelectItem>
                      <SelectItem value="viewer">Visualizador - Apenas leitura</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleInvite} disabled={inviteMutation.isPending} className="w-full">
                  {inviteMutation.isPending ? 'Enviando...' : 'Enviar Convite'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando membros...</div>
        ) : !members || members.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">Nenhum membro adicionado ainda</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Função</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member: any) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.userName}</TableCell>
                    <TableCell className="text-sm">{member.userEmail}</TableCell>
                    <TableCell>
                      {member.role === 'master' ? (
                        <Badge className={getRoleBadgeColor(member.role)}>
                          {getRoleLabel(member.role)}
                        </Badge>
                      ) : (
                        <Select
                          value={member.role}
                          onValueChange={(newRole) => handleUpdateRole(member.userId, newRole)}
                        >
                          <SelectTrigger className="w-[150px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="coordinator">Coordenador</SelectItem>
                            <SelectItem value="viewer">Visualizador</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={member.inviteStatus === 'accepted' ? 'default' : 'secondary'}>
                        {member.inviteStatus === 'accepted' ? 'Aceito' : 'Pendente'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {member.inviteToken && member.inviteStatus === 'pending' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(member.inviteToken);
                            setCopiedToken(member.inviteToken);
                            setTimeout(() => setCopiedToken(null), 2000);
                            toast.success('Token copiado!');
                          }}
                        >
                          {copiedToken === member.inviteToken ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                      {member.role !== 'master' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemove(member.userId)}
                          disabled={removeMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
*/

export function EventMembersManager({ eventId }: EventMembersManagerProps) {
  return null; // TODO: Implementar quando as funções de event members forem criadas
}
