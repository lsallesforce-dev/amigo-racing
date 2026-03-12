import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { Loader2, Eye, EyeOff } from "lucide-react";

export default function Login() {
    const [_, setLocation] = useLocation();

    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [showPassword, setShowPassword] = useState(false);

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
            let errorMsg = error.message;
            if (isLogin && (errorMsg.includes("not found") || errorMsg.includes("credentials") || errorMsg.includes("failed"))) {
                setAuthError("E-mail não encontrado ou senha incorreta. Você já criou sua conta na nova plataforma?");
            } else {
                setAuthError(errorMsg);
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
            <Card className="w-full max-w-md">
                <form onSubmit={handleSubmit}>
                    <CardHeader className="space-y-1 text-center pb-2">
                        {isLogin && (
                            <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3 mb-4 text-sm text-orange-800 dark:text-orange-400 font-medium">
                                🏁 Primeira vez aqui? Clique em <strong>Cadastre-se</strong> abaixo.
                            </div>
                        )}
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
                            <div className="relative">
                                <Input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    required
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    disabled={loading}
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                                    tabIndex={-1}
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-4 w-4" />
                                    ) : (
                                        <Eye className="h-4 w-4" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {authError && (
                            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">
                                {authError}
                                {isLogin && (
                                    <button 
                                        type="button"
                                        onClick={() => { setIsLogin(false); setAuthError(null); }}
                                        className="block mt-2 font-bold underline hover:text-red-700"
                                    >
                                        Clique aqui para se cadastrar
                                    </button>
                                )}
                            </div>
                        )}

                        <Button type="submit" className="w-full h-11 text-base mt-2 bg-orange-600 hover:bg-orange-700 text-white" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isLogin ? "Entrar" : "Criar Conta"}
                        </Button>

                        {isLogin && (
                            <Button 
                                type="button" 
                                variant="outline" 
                                className="w-full h-11 text-base border-orange-600 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                                onClick={() => { setIsLogin(false); setAuthError(null); }}
                                disabled={loading}
                            >
                                Cadastre-se
                            </Button>
                        )}
                    </CardContent>

                    <CardFooter className="flex flex-col space-y-2 text-sm text-center pt-2">
                        {!isLogin && (
                            <Button
                                variant="link"
                                type="button"
                                onClick={() => { setIsLogin(true); setAuthError(null); }}
                                className="text-muted-foreground hover:text-primary"
                            >
                                Já tem conta? Faça login
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            type="button"
                            onClick={() => setLocation('/')}
                            className="text-xs text-muted-foreground"
                        >
                            Voltar para a Home
                        </Button>
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}
