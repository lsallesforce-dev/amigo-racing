import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

export default function Login() {
    const [_, setLocation] = useLocation();

    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");

    const urlParams = new URLSearchParams(window.location.search);
    const redirectUri = urlParams.get('redirectUri') || '/';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const endpoint = isLogin ? "/api/auth/login" : "/api/auth/register";
            const payload = isLogin ? { email, password } : { email, password, name };

            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Authentication failed");
            }

            const data = await res.json();
            if (data.token) {
                localStorage.setItem("app_session_id", data.token);
            }

            // Refresh to apply context auth state and let user go to intented URL
            window.location.href = redirectUri;

        } catch (error: any) {
            alert("Error: " + error.message);
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
                            {isLogin ? "Entre com seu e-mail e senha" : "Crie sua conta para participar"}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {!isLogin && (
                            <div className="space-y-2">
                                <Label htmlFor="name">Nome Completo</Label>
                                <Input
                                    id="name"
                                    placeholder="Seu nome"
                                    required
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    disabled={loading}
                                />
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="email">E-mail</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="nome@exemplo.com"
                                required
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                disabled={loading}
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password">Senha</Label>
                                {isLogin && (
                                    <Button
                                        variant="link"
                                        type="button"
                                        onClick={() => setLocation('/auth/reset-password')}
                                        className="px-0 py-0 h-auto text-xs text-muted-foreground hover:text-primary"
                                    >
                                        Esqueci minha senha
                                    </Button>
                                )}
                            </div>
                            <Input
                                id="password"
                                type="password"
                                required
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                disabled={loading}
                            />
                        </div>

                        <Button type="submit" className="w-full h-11 text-base mt-2" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isLogin ? "Entrar" : "Criar Conta"}
                        </Button>
                    </CardContent>

                    <CardFooter className="flex flex-col space-y-2 text-sm text-center">
                        <Button
                            variant="link"
                            type="button"
                            onClick={() => setIsLogin(!isLogin)}
                            className="text-muted-foreground hover:text-primary"
                        >
                            {isLogin ? "Não tem uma conta? Cadastre-se" : "Já tem conta? Faça login"}
                        </Button>
                        <Button
                            variant="ghost"
                            type="button"
                            onClick={() => setLocation('/')}
                            className="text-xs"
                        >
                            Voltar para a Home
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
