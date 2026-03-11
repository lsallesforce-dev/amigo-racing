import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export default function ResetPassword() {
    const [_, setLocation] = useLocation();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
    const [message, setMessage] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setStatus("idle");
        setMessage("");

        try {
            const res = await fetch("/api/auth/request-reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to request password reset");
            }

            setStatus("success");
            setMessage("Se o e-mail existir em nossa base, um link de recuperação foi enviado.");

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
                            RecuperarSenha
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
                            <Label htmlFor="email">E-mail</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="nome@exemplo.com"
                                required
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                disabled={loading || status === "success"}
                            />
                        </div>

                        <Button type="submit" className="w-full h-11 text-base mt-2" disabled={loading || status === "success"}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Enviar Link
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
