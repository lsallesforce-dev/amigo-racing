import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useLocation } from "wouter";

export default function MockLogin() {
    const [_, setLocation] = useLocation();

    // O mock OAuth redirectUrl and State vem da query string
    const urlParams = new URLSearchParams(window.location.search);
    const redirectUri = urlParams.get('redirect_uri');
    const state = urlParams.get('state');

    const handleLogin = (role: 'admin' | 'user') => {
        if (!redirectUri || !state) {
            alert("Missing redirect_uri or state parameters. Please initiate login from Home.");
            return;
        }

        // Role passed along via URL to mock server (if we expand it) or just default code
        const mockCode = role === 'admin' ? 'mock_admin_code' : 'mock_user_code';
        window.location.href = `${redirectUri}?code=${mockCode}&state=${state}`;
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl font-bold">Amigo Racing Auth</CardTitle>
                    <CardDescription>
                        (Ambiente de Desenvolvimento) Selecione um perfil para simular o login
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Button
                        className="w-full h-12 text-lg"
                        onClick={() => handleLogin('admin')}
                    >
                        Logar como Administrador
                    </Button>
                    <Button
                        className="w-full h-12 text-lg"
                        variant="outline"
                        onClick={() => handleLogin('user')}
                    >
                        Logar como Participante Padrão
                    </Button>
                </CardContent>
                <CardFooter className="justify-center">
                    <Button variant="ghost" onClick={() => setLocation('/')}>Voltar para a Home</Button>
                </CardFooter>
            </Card>
        </div>
    );
}
