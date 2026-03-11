import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export default function UpdatePassword() {
    const [_, setLocation] = useLocation();
    const [loading, setLoading] = useState(false);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
    const [message, setMessage] = useState("");
    const [token, setToken] = useState("");

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        if (urlToken) {
            setToken(urlToken);
        } else {
            setStatus("error");
            setMessage("Link de recuperação inválido ou expirado.");
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (password !== confirmPassword) {
            setStatus("error");
            setMessage("As senhas não coincidem.");
            return;
        }

        if (password.length < 6) {
             setStatus("error");
             setMessage("A senha deve ter pelo menos 6 caracteres.");
             return;
        }

        setLoading(true);
        setStatus("idle");
        setMessage("");

        try {
            const res = await fetch("/api/auth/update-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Falha ao definir nova senha");
            }

            setStatus("success");
            setMessage("Senha atualizada com sucesso! Você já pode fazer login.");

            // Redireciona para o login após 3 segundos
            setTimeout(() => {
                setLocation('/login');
            }, 3000);

        } catch (error: any) {
             setStatus("error");
             setMessage(error.message || "Ocorreu um erro ao processar sua solicitação.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
            <Card className="w-full max-w-md">
                <form onSubmit={handleSubmit}>
                    <CardHeader className="space-y-1 text-center">
                        <CardTitle className="text-2xl font-bold">Amigo Racing</CardTitle>
                        <CardDescription>
                            Definir Nova Senha
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {status === "success" && (
                            <div className="bg-green-50 text-green-700 p-3 rounded-md flex items-start gap-2 text-sm">
                                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                                <p>{message}</p>
                            </div>
                        )}
                        {status === "error" && (
                            <div className="bg-red-50 text-red-700 p-3 rounded-md flex items-start gap-2 text-sm">
                                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                                <p>{message}</p>
                            </div>
                        )}
                        
                        <div className="space-y-2">
                            <Label htmlFor="password">Nova Senha</Label>
                            <Input
                                id="password"
                                type="password"
                                required
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                disabled={loading || status === "success" || !token}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                required
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                disabled={loading || status === "success" || !token}
                            />
                        </div>

                        <Button type="submit" className="w-full h-11 text-base mt-2" disabled={loading || status === "success" || !token}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Atualizar Senha
                        </Button>
                    </CardContent>

                    <CardFooter className="flex flex-col space-y-2 text-sm text-center">
                        <Button
                            variant="ghost"
                            type="button"
                            onClick={() => setLocation('/login')}
                            className="text-xs"
                        >
                            Voltar para o Login
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
